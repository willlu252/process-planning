import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '../security/crypto.js';
import { spawnClaudeAgent, getDefaultSystemPrompt, type ClaudeMessage } from './spawner.js';

export interface ResolveCredentialOptions {
  supabase: SupabaseClient;
  siteId: string;
  currentKey: string;
  previousKey?: string | null;
}

export interface ResolvedCredential {
  keyType: 'anthropic_api_key' | 'claude_auth_token';
  credential: string;
}

interface AiConfigRow {
  key_type: 'anthropic_api_key' | 'claude_auth_token';
  credential_encrypted: string;
  credential_status: 'valid' | 'invalid' | 'expired' | 'unknown';
  credential_expires_at: string | null;
  enabled: boolean;
}

export async function resolveSiteCredential(opts: ResolveCredentialOptions): Promise<ResolvedCredential> {
  const { data, error } = await opts.supabase
    .from('ai_config')
    .select('key_type, credential_encrypted, credential_status, credential_expires_at, enabled')
    .eq('site_id', opts.siteId)
    .single<AiConfigRow>();

  if (error || !data) {
    throw new Error('AI configuration not found for this site');
  }

  if (!data.enabled) {
    throw new Error('AI configuration is disabled for this site');
  }

  if (data.credential_status === 'invalid' || data.credential_status === 'expired') {
    throw new Error(`Credential status is ${data.credential_status}`);
  }

  if (data.credential_expires_at && new Date(data.credential_expires_at) <= new Date()) {
    await opts.supabase
      .from('ai_config')
      .update({ credential_status: 'expired', updated_at: new Date().toISOString() })
      .eq('site_id', opts.siteId);
    throw new Error('Credential is expired');
  }

  try {
    return {
      keyType: data.key_type,
      credential: decrypt(data.credential_encrypted, opts.currentKey),
    };
  } catch {
    if (opts.previousKey) {
      try {
        return {
          keyType: data.key_type,
          credential: decrypt(data.credential_encrypted, opts.previousKey),
        };
      } catch {
        // fall through to final error
      }
    }
    throw new Error('Credential decrypt failed');
  }
}

export interface RunClaudeScanOptions {
  supabase: SupabaseClient;
  supabaseUrl: string;
  supabaseServiceKey: string;
  siteId: string;
  scanType: 'schedule_optimization' | 'rule_analysis' | 'capacity_check' | 'full_audit';
  triggeredBy?: string | null;
  scheduledTaskId?: string | null;
  currentKey: string;
  previousKey?: string | null;
}

export interface RunClaudeScanResult {
  success: boolean;
  scanId?: string;
  error?: string;
  credentialError?: boolean;
}

function buildScanPrompt(scanType: RunClaudeScanOptions['scanType']): string {
  const objectiveMap: Record<RunClaudeScanOptions['scanType'], string> = {
    schedule_optimization: 'Find schedule bottlenecks and produce optimization recommendations.',
    rule_analysis: 'Review planning rules and identify conflicts or inefficiencies.',
    capacity_check: 'Check resource capacity constraints and identify overload/underutilization.',
    full_audit: 'Perform a full planning audit and summarize top risks and actions.',
  };

  return [
    `Run scan type: ${scanType}`,
    objectiveMap[scanType],
    'Use MCP tools to inspect current site data.',
    'Return concise findings plus proposed draft actions.',
  ].join('\n');
}

function normalizeMessages(messages: ClaudeMessage[]): Array<Record<string, unknown>> {
  return messages.slice(0, 200).map((m) => ({
    type: m.type,
    content: m.content,
    metadata: m.metadata ?? null,
  }));
}

export async function runClaudeScan(opts: RunClaudeScanOptions): Promise<RunClaudeScanResult> {
  const nowIso = new Date().toISOString();

  const { data: createdScan, error: createErr } = await opts.supabase
    .from('ai_scans')
    .insert({
      site_id: opts.siteId,
      scan_type: opts.scanType,
      status: 'running',
      triggered_by: opts.triggeredBy ?? null,
      scheduled_task_id: opts.scheduledTaskId ?? null,
      report: {},
      started_at: nowIso,
    })
    .select('id')
    .single<{ id: string }>();

  if (createErr || !createdScan) {
    return { success: false, error: `Failed to create scan: ${createErr?.message ?? 'unknown'}` };
  }

  const scanId = createdScan.id;

  try {
    const cred = await resolveSiteCredential({
      supabase: opts.supabase,
      siteId: opts.siteId,
      currentKey: opts.currentKey,
      previousKey: opts.previousKey,
    });

    const spawnResult = await spawnClaudeAgent({
      apiKey: cred.credential,
      supabaseUrl: opts.supabaseUrl,
      supabaseServiceKey: opts.supabaseServiceKey,
      siteId: opts.siteId,
      prompt: buildScanPrompt(opts.scanType),
      systemPrompt: getDefaultSystemPrompt(opts.siteId),
      maxTurns: 8,
    });

    const report = {
      completed: spawnResult.isComplete,
      scan_type: opts.scanType,
      claude_session_id: spawnResult.sessionId || null,
      message_count: spawnResult.messages.length,
      messages: normalizeMessages(spawnResult.messages),
      generated_at: new Date().toISOString(),
    };

    const hasError = spawnResult.messages.some((m) => m.type === 'error');

    await opts.supabase
      .from('ai_scans')
      .update({
        status: hasError ? 'failed' : 'completed',
        report,
        error_message: hasError ? 'Claude execution returned an error message' : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', scanId);

    return {
      success: !hasError,
      scanId,
      error: hasError ? 'Claude execution returned an error message' : undefined,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const credentialError = /credential|api key|auth token|decrypt|expired|disabled/i.test(errorMsg);

    await opts.supabase
      .from('ai_scans')
      .update({
        status: 'failed',
        error_message: errorMsg,
        completed_at: new Date().toISOString(),
      })
      .eq('id', scanId);

    return {
      success: false,
      scanId,
      error: errorMsg,
      credentialError,
    };
  }
}
