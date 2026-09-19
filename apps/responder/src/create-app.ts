import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { FieldReport, HealthStatus } from '@fieldlink/contract';
import {
  assembleReport,
  ScriptedEngine,
  type LlmEngine,
} from '@fieldlink/triage';
import { Outbox, resolveNetProfile, type SendFn } from '@fieldlink/transport';

export type ResponderDeps = {
  engine?: LlmEngine;
  send?: SendFn;
  ingestUrl?: string;
};

export function createResponderApp(deps: ResponderDeps = {}) {
  const engine: LlmEngine = deps.engine ?? new ScriptedEngine();
  const outbox = new Outbox({
    send: deps.send,
    ingestUrl: deps.ingestUrl,
  });
  const app = new Hono();
  app.use('*', cors());

  app.get('/api/health', (c) => {
    const health: HealthStatus = {
      ...engine.health(),
      net_profile: resolveNetProfile(),
    };
    return c.json(health);
  });

  app.post('/api/report', async (c) => {
    if (engine.health().status !== 'ready') {
      return c.json({ error: 'engine_not_ready' }, 503);
    }
    const body = (await c.req.json()) as { text?: string; mode?: 'text' | 'voice' };
    const text = body.text?.trim() ?? '';
    if (!text) return c.json({ error: 'empty_input' }, 400);

    const started = performance.now();
    const classification = await engine.classify(text);
    const latency = Math.round(performance.now() - started);
    const report: FieldReport = assembleReport({
      text,
      mode: body.mode === 'voice' ? 'voice' : 'text',
      classification,
      modelMeta: {
        model: engine.health().model,
        tokens_per_sec: engine.tokensPerSec?.() ?? 0,
        latency_ms: latency,
      },
    });
    const envelope = await outbox.dispatch(report);
    return c.json({ report, envelope });
  });

  app.post('/api/transcribe', async (c) => {
    if (!engine.transcribe) {
      return c.json({ error: 'voice_unavailable', text: '' }, 501);
    }
    const audio = new Uint8Array(await c.req.arrayBuffer());
    const text = await engine.transcribe(audio, c.req.header('content-type') ?? undefined);
    return c.json({ text, mode: 'voice' });
  });

  app.post('/api/speak', async (c) => {
    if (!engine.speak) {
      return c.json({ error: 'tts_unavailable' }, 501);
    }
    const body = (await c.req.json()) as { text?: string };
    const audio = await engine.speak(body.text ?? '');
    return c.body(Buffer.from(audio), 200, { 'content-type': 'audio/wav' });
  });

  return { app, engine, outbox };
}
