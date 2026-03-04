/**
 * Claude API integration via Anthropic SDK.
 *
 * Calls the Anthropic Messages API directly instead of spawning the CLI.
 * MCP tool integration can be added later as API tool definitions.
 */
import Anthropic from '@anthropic-ai/sdk';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SpawnConfig {
  /** Decrypted Anthropic API key */
  apiKey: string;
  /** Supabase URL (reserved for future tool use) */
  supabaseUrl: string;
  /** Supabase service key (reserved for future tool use) */
  supabaseServiceKey: string;
  /** Site ID scope */
  siteId: string;
  /** User prompt/message */
  prompt: string;
  /** Session resume ID (unused with direct API — kept for interface compat) */
  sessionResumeId?: string;
  /** System prompt override */
  systemPrompt?: string;
  /** Maximum agentic turns (unused with direct API) */
  maxTurns?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface SpawnResult {
  /** Session ID (empty for direct API calls) */
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

const MODEL = 'claude-sonnet-4-20250514';

// ─── Batch Call ─────────────────────────────────────────────────────────────

/**
 * Call Claude API and wait for the full response.
 */
export async function spawnClaudeAgent(config: SpawnConfig): Promise<SpawnResult> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const messages: ClaudeMessage[] = [];

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: config.systemPrompt ?? getDefaultSystemPrompt(config.siteId),
      messages: [{ role: 'user', content: config.prompt }],
    });

    for (const block of response.content) {
      if (block.type === 'text') {
        messages.push({ type: 'text', content: block.text });
      }
    }

    return { sessionId: response.id, messages, isComplete: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown API error';
    console.error('[spawner] Claude API error:', errorMsg);
    messages.push({ type: 'error', content: errorMsg });
    return { sessionId: '', messages, isComplete: false };
  }
}

// ─── Streaming Call ─────────────────────────────────────────────────────────

/**
 * Call Claude API with streaming. Yields text chunks as they arrive.
 */
export async function* spawnClaudeAgentStreaming(
  config: SpawnConfig,
): AsyncGenerator<ClaudeMessage> {
  const client = new Anthropic({ apiKey: config.apiKey });

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: config.systemPrompt ?? getDefaultSystemPrompt(config.siteId),
      messages: [{ role: 'user', content: config.prompt }],
    });

    if (config.signal) {
      const onAbort = (): void => { stream.abort(); };
      config.signal.addEventListener('abort', onAbort, { once: true });
    }

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield {
          type: 'text',
          content: event.delta.text,
        };
      }
    }

    const finalMessage = await stream.finalMessage();
    yield {
      type: 'text',
      content: '',
      metadata: { sessionId: finalMessage.id },
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    const errorMsg = err instanceof Error ? err.message : 'Unknown API error';
    console.error('[spawner] Claude streaming error:', errorMsg);
    yield { type: 'error', content: errorMsg };
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
    'Guidelines:',
    '- Be concise and helpful.',
    '- When discussing schedules, reference specific batch IDs and resource names where possible.',
    '- Explain your reasoning clearly.',
    '',
    `Current site ID: ${siteId}`,
  ].join('\n');
}
