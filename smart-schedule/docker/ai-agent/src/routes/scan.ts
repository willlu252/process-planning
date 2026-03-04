import { Router } from 'express';
import type { Request, Response } from 'express';
import { authorise } from '../security/permissions.js';
import { supabaseAdmin, encryptionConfig, runtimeConfig } from '../server.js';
import { runClaudeScan } from '../claude/scan-runner.js';

export const scanRouter = Router();

/**
 * POST /ai/scan
 * Triggers a manual AI scan and executes Claude headless analysis.
 * Requires: planning.ai permission.
 *
 * Body: { siteId, scanType }
 * Response: { scanId, status }
 */
scanRouter.post('/scan', async (req: Request, res: Response) => {
  const user = req.user!;
  const { siteId, scanType } = req.body as {
    siteId: string;
    scanType: 'schedule_optimization' | 'rule_analysis' | 'capacity_check' | 'full_audit';
  };

  if (!siteId || !scanType) {
    res.status(400).json({ error: 'siteId and scanType are required' });
    return;
  }

  const validTypes = ['schedule_optimization', 'rule_analysis', 'capacity_check', 'full_audit'];
  if (!validTypes.includes(scanType)) {
    res.status(400).json({ error: `Invalid scanType. Must be one of: ${validTypes.join(', ')}` });
    return;
  }

  const auth = authorise(user, 'ai.scan', siteId);
  if (!auth.allowed) {
    res.status(403).json({ error: auth.reason });
    return;
  }

  const result = await runClaudeScan({
    supabase: supabaseAdmin,
    supabaseUrl: runtimeConfig.supabaseUrl,
    supabaseServiceKey: runtimeConfig.supabaseServiceKey,
    siteId,
    scanType,
    triggeredBy: user.sub,
    currentKey: encryptionConfig.currentKey,
    previousKey: encryptionConfig.previousKey,
  });

  if (!result.success) {
    res.status(result.credentialError ? 422 : 500).json({
      error: result.error ?? 'Failed to execute scan',
      scanId: result.scanId,
    });
    return;
  }

  res.status(201).json({
    scanId: result.scanId,
    status: 'completed',
  });
});
