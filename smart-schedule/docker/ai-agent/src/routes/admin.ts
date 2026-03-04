import { Router } from 'express';
import type { Request, Response } from 'express';
import { authorise, type JwtUserClaims } from '../security/permissions.js';
import { encrypt, decrypt, maskCredential, rotateEncryption } from '../security/crypto.js';
import { supabaseAdmin, encryptionConfig } from '../server.js';

export const adminRouter = Router();

/** Get site_users.id from JWT (set by custom_access_token_hook). */
function siteUserId(user: JwtUserClaims): string {
  return user.user_id ?? user.sub;
}

/**
 * POST /ai/admin/credentials/set
 * Sets (or replaces) the AI credential for a site.
 * Encrypts the credential, generates a masked hint, and upserts ai_config.
 * Requires: ai.admin.credentials permission.
 *
 * Body: { siteId, keyType, credential }
 * Response: { success: boolean, hint: string, keyVersion: number }
 */
adminRouter.post('/admin/credentials/set', async (req: Request, res: Response) => {
  const user = req.user!;
  const { siteId, keyType, credential } = req.body as {
    siteId: string;
    keyType: string;
    credential: string;
  };

  if (!siteId || !keyType || !credential) {
    res.status(400).json({ error: 'siteId, keyType, and credential are required' });
    return;
  }

  if (!['anthropic_api_key', 'claude_auth_token'].includes(keyType)) {
    res.status(400).json({ error: 'keyType must be anthropic_api_key or claude_auth_token' });
    return;
  }

  const auth = authorise(user, 'ai.admin.credentials', siteId);
  if (!auth.allowed) {
    res.status(403).json({ error: auth.reason });
    return;
  }

  try {
    // Check for existing config to determine key version
    const { data: existing } = await supabaseAdmin
      .from('ai_config')
      .select('key_version')
      .eq('site_id', siteId)
      .maybeSingle();

    const keyVersion = existing ? existing.key_version + 1 : 1;

    // Encrypt the credential
    const payload = encrypt(credential, encryptionConfig.currentKey, keyVersion);
    const hint = maskCredential(credential);

    // Upsert the config row
    const { error: upsertErr } = await supabaseAdmin
      .from('ai_config')
      .upsert(
        {
          site_id: siteId,
          key_type: keyType,
          credential_encrypted: payload.encrypted,
          credential_hint: hint,
          credential_status: 'unknown',
          key_version: keyVersion,
          enabled: true,
          created_by: siteUserId(user),
          updated_by: siteUserId(user),
        },
        { onConflict: 'site_id' },
      );

    if (upsertErr) {
      console.error('[ai-agent] Credential set upsert error:', upsertErr);
      res.status(500).json({ error: 'Failed to save credential' });
      return;
    }

    // Audit log
    await supabaseAdmin.from('audit_log').insert({
      site_id: siteId,
      action: 'ai_credential_set',
      details: { key_type: keyType, key_version: keyVersion },
      performed_by: siteUserId(user),
    });

    res.json({ success: true, hint, keyVersion });
  } catch (err) {
    console.error('[ai-agent] Credential set error:', err);
    res.status(500).json({ error: 'Internal error setting credential' });
  }
});

/**
 * POST /ai/admin/credentials/test
 * Tests the stored AI credential for a site by attempting a lightweight API call.
 * Requires: admin.settings permission.
 *
 * Body: { siteId }
 * Response: { valid: boolean, keyType, hint, message }
 */
adminRouter.post('/admin/credentials/test', async (req: Request, res: Response) => {
  const user = req.user!;
  const { siteId } = req.body as { siteId: string };

  if (!siteId) {
    res.status(400).json({ error: 'siteId is required' });
    return;
  }

  const auth = authorise(user, 'ai.admin.credentials', siteId);
  if (!auth.allowed) {
    res.status(403).json({ error: auth.reason });
    return;
  }

  try {
    // Fetch the config row
    const { data: config, error: fetchErr } = await supabaseAdmin
      .from('ai_config')
      .select('*')
      .eq('site_id', siteId)
      .single();

    if (fetchErr || !config) {
      res.status(404).json({ error: 'No AI configuration found for this site' });
      return;
    }

    // Decrypt the credential server-side only
    let credential: string;
    try {
      credential = decrypt(config.credential_encrypted, encryptionConfig.currentKey);
    } catch {
      // Try previous key if rotation happened
      if (encryptionConfig.previousKey) {
        try {
          credential = decrypt(config.credential_encrypted, encryptionConfig.previousKey);
        } catch {
          await updateCredentialStatus(siteId, 'invalid');
          res.json({
            valid: false,
            keyType: config.key_type,
            hint: config.credential_hint,
            message: 'Failed to decrypt credential. Key rotation may be required.',
          });
          return;
        }
      } else {
        await updateCredentialStatus(siteId, 'invalid');
        res.json({
          valid: false,
          keyType: config.key_type,
          hint: config.credential_hint,
          message: 'Failed to decrypt credential.',
        });
        return;
      }
    }

    // Validate credential by calling Anthropic API.
    const validation = await validateAnthropicCredential(config.key_type, credential);
    const valid = validation.valid;
    const message = validation.message;

    // Update credential status
    const status = valid ? 'valid' : 'invalid';
    await updateCredentialStatus(siteId, status);

    // Never return the decrypted credential
    res.json({
      valid,
      keyType: config.key_type,
      hint: config.credential_hint,
      message,
    });
  } catch (err) {
    console.error('[ai-agent] Credential test error:', err);
    res.status(500).json({ error: 'Internal error testing credential' });
  }
});

/**
 * POST /ai/admin/credentials/rotate
 * Rotates the encryption key for a site's AI credential.
 * Re-encrypts the credential with the current encryption key.
 * Requires: admin.settings permission.
 *
 * Body: { siteId }
 * Response: { success: boolean, keyVersion, hint }
 */
adminRouter.post('/admin/credentials/rotate', async (req: Request, res: Response) => {
  const user = req.user!;
  const { siteId } = req.body as { siteId: string };

  if (!siteId) {
    res.status(400).json({ error: 'siteId is required' });
    return;
  }

  const auth = authorise(user, 'ai.admin.credentials', siteId);
  if (!auth.allowed) {
    res.status(403).json({ error: auth.reason });
    return;
  }

  if (!encryptionConfig.previousKey) {
    res.status(400).json({
      error: 'Key rotation requires AI_ENCRYPTION_KEY_PREVIOUS to be configured',
    });
    return;
  }

  try {
    // Fetch current config
    const { data: config, error: fetchErr } = await supabaseAdmin
      .from('ai_config')
      .select('*')
      .eq('site_id', siteId)
      .single();

    if (fetchErr || !config) {
      res.status(404).json({ error: 'No AI configuration found for this site' });
      return;
    }

    // Try to decrypt with the previous key first (rotation scenario),
    // then re-encrypt with the current key
    const newKeyVersion = config.key_version + 1;
    let rotated;

    try {
      rotated = rotateEncryption(
        config.credential_encrypted,
        encryptionConfig.previousKey,
        encryptionConfig.currentKey,
        newKeyVersion
      );
    } catch {
      // If previous key fails, try current key (already on current key)
      try {
        const plaintext = decrypt(config.credential_encrypted, encryptionConfig.currentKey);
        rotated = encrypt(plaintext, encryptionConfig.currentKey, newKeyVersion);
      } catch {
        res.status(500).json({
          error: 'Unable to decrypt credential with any known key. Manual re-entry required.',
        });
        return;
      }
    }

    // Decrypt to get the hint
    const plaintext = decrypt(rotated.encrypted, encryptionConfig.currentKey);
    const hint = maskCredential(plaintext);

    // Update the config row
    const { error: updateErr } = await supabaseAdmin
      .from('ai_config')
      .update({
        credential_encrypted: rotated.encrypted,
        credential_hint: hint,
        key_version: newKeyVersion,
        credential_status: 'unknown',
        updated_by: siteUserId(user),
      })
      .eq('site_id', siteId);

    if (updateErr) {
      console.error('[ai-agent] Credential rotate update error:', updateErr);
      res.status(500).json({ error: 'Failed to update rotated credential' });
      return;
    }

    // Audit log
    await supabaseAdmin.from('audit_log').insert({
      site_id: siteId,
      action: 'ai_credential_rotated',
      details: {
        key_version: newKeyVersion,
        key_type: config.key_type,
      },
      performed_by: siteUserId(user),
    });

    res.json({
      success: true,
      keyVersion: newKeyVersion,
      hint,
    });
  } catch (err) {
    console.error('[ai-agent] Credential rotate error:', err);
    res.status(500).json({ error: 'Internal error during key rotation' });
  }
});

async function updateCredentialStatus(
  siteId: string,
  status: 'valid' | 'invalid' | 'expired' | 'unknown'
): Promise<void> {
  await supabaseAdmin
    .from('ai_config')
    .update({
      credential_status: status,
      credential_last_validated_at: new Date().toISOString(),
    })
    .eq('site_id', siteId);
}

async function validateAnthropicCredential(
  keyType: 'anthropic_api_key' | 'claude_auth_token',
  credential: string,
): Promise<{ valid: boolean; message: string }> {
  const headers: Record<string, string> = {
    'anthropic-version': '2023-06-01',
    accept: 'application/json',
  };

  if (keyType === 'anthropic_api_key') {
    headers['x-api-key'] = credential;
  } else {
    headers.authorization = `Bearer ${credential}`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers,
    });

    if (response.ok) {
      return { valid: true, message: 'Credential validated successfully' };
    }

    if (response.status === 401 || response.status === 403) {
      return { valid: false, message: 'Credential rejected by Anthropic API' };
    }

    return {
      valid: false,
      message: `Credential validation failed (${response.status})`,
    };
  } catch {
    return {
      valid: false,
      message: 'Credential validation request failed',
    };
  }
}
