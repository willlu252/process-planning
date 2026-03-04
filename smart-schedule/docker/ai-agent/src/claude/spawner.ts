/**
 * Claude Code headless spawner with strict environment isolation.
 *
 * Security architecture:
 * - Claude parent process: receives ONLY allowlisted env vars (API key, PATH, etc.)
 * - MCP child process: receives DB credentials via its own env config
 * - Tool allowlist: only mcp__schedule-db__* tools are permitted
 * - Shell/file/web tools: explicitly denied
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFile, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';

// ─── Env Isolation ──────────────────────────────────────────────────────────

/**
 * Env vars allowed for the Claude Code parent process.
 * DB credentials are NEVER included — they go to the MCP child only.
 */
const CLAUDE_ENV_ALLOWLIST: ReadonlySet<string> = new Set([
  'PATH',
  'HOME',
  'USER',
  'LANG',
  'TERM',
  'NODE_ENV',
  'ANTHROPIC_API_KEY',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
]);

/**
 * Env vars that must NEVER appear in the Claude parent process.
 * Runtime assertions verify this before every spawn.
 */
const CLAUDE_ENV_DENYLIST: ReadonlySet<string> = new Set([
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'JWT_SECRET',
  'AI_ENCRYPTION_KEY_CURRENT',
  'AI_ENCRYPTION_KEY_PREVIOUS',
  'DATABASE_URL',
  'POSTGRES_PASSWORD',
]);

// ─── Tool Restrictions ──────────────────────────────────────────────────────

/**
 * Tools explicitly denied for the Claude Code process.
 * Only MCP schedule-db tools are allowed.
 */
const DENIED_TOOLS: readonly string[] = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'NotebookEdit',
  'Agent',
] as const;

/** Allowed tool pattern — only our MCP server tools. */
const ALLOWED_TOOL_PATTERN = 'mcp__schedule-db__' as const;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SpawnConfig {
  /** Decrypted Anthropic API key or auth token */
  apiKey: string;
  /** Supabase URL for MCP server child process */
  supabaseUrl: string;
  /** Supabase service key for MCP server child process */
  supabaseServiceKey: string;
  /** Site ID scope — all queries restricted to this site */
  siteId: string;
  /** User prompt/message */
  prompt: string;
  /** Session resume ID for continuing previous conversations */
  sessionResumeId?: string;
  /** System prompt override */
  systemPrompt?: string;
  /** Maximum agentic turns before stopping (default: 10) */
  maxTurns?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface SpawnResult {
  /** Claude Code session ID for future resume */
  sessionId: string;
  /** Response messages from Claude */
  messages: ClaudeMessage[];
  /** Whether the conversation completed normally */
  isComplete: boolean;
}

export interface ClaudeMessage {
  type: 'text' | 'tool_use' | 'tool_result' | 'error';
  content: string;
  metadata?: Record<string, unknown>;
}

// ─── Env Building ───────────────────────────────────────────────────────────

/**
 * Build a sanitized environment for the Claude Code parent process.
 * Only allowlisted vars are included. DB credentials are excluded.
 */
export function buildClaudeEnv(apiKey: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (CLAUDE_ENV_ALLOWLIST.has(key) && value !== undefined) {
      env[key] = value;
    }
  }

  // Inject the API key for Claude Code
  env['ANTHROPIC_API_KEY'] = apiKey;

  return env;
}

/**
 * Runtime assertion: verify the Claude env contains no secrets.
 * Throws on violation — this is a hard security boundary.
 */
export function assertNoSecrets(env: Record<string, string>): void {
  const leaked: string[] = [];

  for (const key of CLAUDE_ENV_DENYLIST) {
    if (key in env) {
      leaked.push(key);
    }
  }

  if (leaked.length > 0) {
    throw new Error(
      `[spawner] SECURITY VIOLATION: Claude env contains denied vars: ${leaked.join(', ')}`
    );
  }

  console.log('[spawner] Env isolation verified: no denied vars in Claude process env');
}

// ─── MCP Config ─────────────────────────────────────────────────────────────

/**
 * Build MCP server configuration for Claude Code.
 * DB credentials are ONLY passed to the MCP child process env.
 */
function buildMcpConfig(
  supabaseUrl: string,
  supabaseServiceKey: string,
  siteId: string,
): Record<string, unknown> {
  return {
    mcpServers: {
      'schedule-db': {
        command: 'node',
        args: [join(__dirname, '..', 'mcp', 'server.js')],
        env: {
          SUPABASE_URL: supabaseUrl,
          SUPABASE_SERVICE_KEY: supabaseServiceKey,
          MCP_SITE_ID: siteId,
        },
      },
    },
  };
}

// ─── Spawn (Batch) ──────────────────────────────────────────────────────────

/**
 * Spawn a Claude Code headless process and wait for completion.
 * Returns the full result after the process exits.
 */
export async function spawnClaudeAgent(config: SpawnConfig): Promise<SpawnResult> {
  const {
    apiKey,
    supabaseUrl,
    supabaseServiceKey,
    siteId,
    prompt,
    sessionResumeId,
    systemPrompt,
    maxTurns = 10,
    signal,
  } = config;

  // Build sanitized env — NO DB creds
  const claudeEnv = buildClaudeEnv(apiKey);
  assertNoSecrets(claudeEnv);

  // MCP config — DB creds only here, in the MCP child env
  const mcpConfig = buildMcpConfig(supabaseUrl, supabaseServiceKey, siteId);

  // Write temporary MCP config
  const tmpDir = await mkdtemp(join(tmpdir(), 'claude-mcp-'));
  const configPath = join(tmpDir, 'mcp-config.json');
  await writeFile(configPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');

  // Build CLI arguments
  const args = buildCliArgs({
    outputFormat: 'json',
    maxTurns,
    configPath,
    sessionResumeId,
    systemPrompt,
    prompt,
  });

  const messages: ClaudeMessage[] = [];
  let sessionId = sessionResumeId ?? '';

  return new Promise<SpawnResult>((resolve, reject) => {
    const child: ChildProcess = spawn('claude', args, {
      env: claudeEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: tmpDir,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    if (signal) {
      const onAbort = (): void => {
        child.kill('SIGTERM');
      };
      signal.addEventListener('abort', onAbort, { once: true });
      child.on('close', () => signal.removeEventListener('abort', onAbort));
    }

    child.on('error', (err) => {
      void cleanupTmp(configPath, tmpDir);
      reject(new Error(`[spawner] Failed to spawn Claude: ${err.message}`));
    });

    child.on('close', (code) => {
      void cleanupTmp(configPath, tmpDir);

      if (code !== 0 && code !== null) {
        const errorMsg = stderr.trim() || `Claude process exited with code ${code}`;
        messages.push({ type: 'error', content: errorMsg });
        resolve({ sessionId, messages, isComplete: false });
        return;
      }

      try {
        const result = JSON.parse(stdout) as Record<string, unknown>;
        sessionId = (result.session_id as string) ?? sessionId;
        parseResultMessages(result, messages);
        resolve({
          sessionId,
          messages,
          isComplete: (result.is_done as boolean) !== false,
        });
      } catch {
        if (stdout.trim()) {
          messages.push({ type: 'text', content: stdout.trim() });
        }
        resolve({ sessionId, messages, isComplete: true });
      }
    });
  });
}

// ─── Spawn (Streaming) ─────────────────────────────────────────────────────

/**
 * Spawn Claude Code with streaming output for SSE.
 * Yields messages incrementally as they arrive from the process.
 */
export async function* spawnClaudeAgentStreaming(
  config: SpawnConfig,
): AsyncGenerator<ClaudeMessage> {
  const {
    apiKey,
    supabaseUrl,
    supabaseServiceKey,
    siteId,
    prompt,
    sessionResumeId,
    systemPrompt,
    maxTurns = 10,
    signal,
  } = config;

  const claudeEnv = buildClaudeEnv(apiKey);
  assertNoSecrets(claudeEnv);

  const mcpConfig = buildMcpConfig(supabaseUrl, supabaseServiceKey, siteId);
  const tmpDir = await mkdtemp(join(tmpdir(), 'claude-mcp-'));
  const configPath = join(tmpDir, 'mcp-config.json');
  await writeFile(configPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');

  const args = buildCliArgs({
    outputFormat: 'stream-json',
    maxTurns,
    configPath,
    sessionResumeId,
    systemPrompt,
    prompt,
  });

  const child: ChildProcess = spawn('claude', args, {
    env: claudeEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: tmpDir,
  });

  if (signal) {
    const onAbort = (): void => {
      child.kill('SIGTERM');
    };
    signal.addEventListener('abort', onAbort, { once: true });
    child.on('close', () => signal.removeEventListener('abort', onAbort));
  }

  let buffer = '';

  try {
    for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const msg = parseStreamLine(line);
        if (msg) yield msg;
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const msg = parseStreamLine(buffer);
      if (msg) yield msg;
    }
  } finally {
    await cleanupTmp(configPath, tmpDir);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface CliArgOpts {
  outputFormat: 'json' | 'stream-json';
  maxTurns: number;
  configPath: string;
  sessionResumeId?: string;
  systemPrompt?: string;
  prompt: string;
}

function buildCliArgs(opts: CliArgOpts): string[] {
  const args: string[] = [
    '--print',
    '--output-format', opts.outputFormat,
    '--max-turns', String(opts.maxTurns),
    '--mcp-config', opts.configPath,
  ];

  // Tool allowlist: only schedule-db MCP tools
  args.push('--allowedTools', `${ALLOWED_TOOL_PATTERN}*`);

  // Explicitly deny dangerous tools
  for (const tool of DENIED_TOOLS) {
    args.push('--disallowedTools', tool);
  }

  if (opts.sessionResumeId) {
    args.push('--resume', opts.sessionResumeId);
  }

  if (opts.systemPrompt) {
    args.push('--system-prompt', opts.systemPrompt);
  }

  // Prompt is the last positional argument
  args.push(opts.prompt);

  return args;
}

function parseResultMessages(
  result: Record<string, unknown>,
  messages: ClaudeMessage[],
): void {
  if (typeof result.result === 'string') {
    messages.push({ type: 'text', content: result.result });
  } else if (result.result != null) {
    messages.push({ type: 'text', content: JSON.stringify(result.result) });
  }

  if (Array.isArray(result.messages)) {
    for (const msg of result.messages as Record<string, unknown>[]) {
      messages.push({
        type: (msg.type as ClaudeMessage['type']) ?? 'text',
        content: (msg.content as string) ?? JSON.stringify(msg),
        metadata: msg.metadata as Record<string, unknown> | undefined,
      });
    }
  }
}

function parseStreamLine(line: string): ClaudeMessage | null {
  if (!line.trim()) return null;

  try {
    const event = JSON.parse(line) as Record<string, unknown>;

    if (event.type === 'assistant') {
      const message = event.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            return { type: 'text', content: block.text as string };
          }
          if (block.type === 'tool_use') {
            return {
              type: 'tool_use',
              content: `Using tool: ${block.name as string}`,
              metadata: { tool: block.name, input: block.input },
            };
          }
        }
      }
    }

    if (event.type === 'result') {
      return {
        type: 'text',
        content: (event.result as string) ?? '',
        metadata: { sessionId: event.session_id },
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function cleanupTmp(configPath: string, tmpDir: string): Promise<void> {
  try {
    await unlink(configPath);
    await rm(tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

// ─── System Prompt ──────────────────────────────────────────────────────────

/**
 * Default system prompt for the Process Planning Agent.
 */
export function getDefaultSystemPrompt(siteId: string): string {
  return [
    'You are the Process Planning Agent for a paint manufacturing facility.',
    'Your role is to analyze production schedules, suggest optimizations, and help with resource planning.',
    '',
    'You have access to schedule-db MCP tools:',
    '- query_batches: Search and filter production batches',
    '- query_resources: List available resources (mixers, equipment)',
    '- query_substitution_rules: View resource substitution rules',
    '- get_schedule_summary: Get aggregate schedule statistics',
    '- create_draft: Create draft proposals for human review',
    '- update_scan_status: Update scan progress and results',
    '',
    'Guidelines:',
    '- All queries are scoped to the current site.',
    '- NEVER propose changes directly — always create draft proposals for human review.',
    '- Explain your reasoning clearly with specific batch IDs and resource names.',
    '- When creating drafts, ensure the payload matches the expected schema.',
    '',
    `Current site ID: ${siteId}`,
  ].join('\n');
}
