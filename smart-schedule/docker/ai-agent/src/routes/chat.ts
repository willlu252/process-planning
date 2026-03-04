import { Router } from 'express';
import type { Request, Response } from 'express';
import { authorise, type JwtUserClaims } from '../security/permissions.js';
import { supabaseAdmin, encryptionConfig, runtimeConfig } from '../server.js';
import { SessionManager } from '../claude/session-manager.js';
import { getDefaultSystemPrompt, spawnClaudeAgentStreaming } from '../claude/spawner.js';
import { resolveSiteCredential } from '../claude/scan-runner.js';

export const chatRouter = Router();

/** Get site_users.id from JWT (set by custom_access_token_hook). */
function siteUserId(user: JwtUserClaims): string {
  return user.user_id ?? user.sub;
}

/**
 * POST /ai/chat
 * SSE streaming chat endpoint.
 * Requires: planning.ai permission.
 *
 * Body: { siteId, sessionId?, message }
 * Response: Server-Sent Events stream.
 */
chatRouter.post('/chat', async (req: Request, res: Response) => {
  const user = req.user!;
  const { siteId, sessionId, message } = req.body as {
    siteId: string;
    sessionId?: string;
    message: string;
  };

  if (!siteId || !message) {
    res.status(400).json({ error: 'siteId and message are required' });
    return;
  }

  const auth = authorise(user, 'ai.chat', siteId);
  if (!auth.allowed) {
    res.status(403).json({ error: auth.reason });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sessionManager = new SessionManager(supabaseAdmin);

  try {
    const credential = await resolveSiteCredential({
      supabase: supabaseAdmin,
      siteId,
      currentKey: encryptionConfig.currentKey,
      previousKey: encryptionConfig.previousKey,
    });

    const chatSession = await sessionManager.getOrCreate(
      siteId,
      siteUserId(user),
      sessionId,
      message.substring(0, 100),
    );

    sendSSE(res, 'session', { sessionId: chatSession.id });

    await sessionManager.addMessage(chatSession.id, siteId, 'user', message, {});

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    let resumeId = chatSession.sessionResumeId ?? undefined;
    let assistantText = '';

    for await (const chunk of spawnClaudeAgentStreaming({
      apiKey: credential.credential,
      supabaseUrl: runtimeConfig.supabaseUrl,
      supabaseServiceKey: runtimeConfig.supabaseServiceKey,
      siteId,
      prompt: message,
      sessionResumeId: resumeId,
      systemPrompt: getDefaultSystemPrompt(siteId),
      maxTurns: 10,
      signal: abortController.signal,
    })) {
      if (chunk.type === 'text' && chunk.content) {
        assistantText += chunk.content;
        sendSSE(res, 'message', {
          role: 'assistant',
          content: chunk.content,
          sessionId: chatSession.id,
        });
      } else if (chunk.type === 'tool_use') {
        sendSSE(res, 'status', {
          status: 'tool_use',
          content: chunk.content,
          sessionId: chatSession.id,
        });
      } else if (chunk.type === 'error') {
        sendSSE(res, 'error', { error: chunk.content, sessionId: chatSession.id });
      }

      const streamedSessionId = chunk.metadata?.sessionId;
      if (typeof streamedSessionId === 'string' && streamedSessionId) {
        resumeId = streamedSessionId;
      }
    }

    if (assistantText.trim()) {
      await sessionManager.addMessage(chatSession.id, siteId, 'assistant', assistantText, {});
    }

    if (resumeId && resumeId !== chatSession.sessionResumeId) {
      await sessionManager.updateResumeId(chatSession.id, resumeId);
    }

    sendSSE(res, 'done', { sessionId: chatSession.id });
  } catch (err) {
    console.error('[ai-agent] Chat error:', err);
    sendSSE(res, 'error', {
      error: err instanceof Error ? err.message : 'Internal error during chat processing',
    });
  } finally {
    res.end();
  }
});

function sendSSE(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
