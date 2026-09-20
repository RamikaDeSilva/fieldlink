import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { FieldReport, HealthStatus } from '@fieldlink/contract';
import {
  assembleReport,
  ScriptedEngine,
  resolveEngineKind,
  type LlmEngine,
  type VoiceTranscriber,
} from '@fieldlink/triage';
import { Outbox, resolveNetProfile, type SendFn } from '@fieldlink/transport';

export type ResponderDeps = {
  engine?: LlmEngine;
  transcriber?: VoiceTranscriber;
  send?: SendFn;
  ingestUrl?: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createResponderApp(deps: ResponderDeps = {}) {
  if (!deps.engine && resolveEngineKind() === 'qvac') {
    throw new Error('ENGINE=qvac requires loadEngine() to inject QvacEngine; ScriptedEngine will not be substituted');
  }
  const engine: LlmEngine = deps.engine ?? new ScriptedEngine();
  const transcriber = deps.transcriber;
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

  app.get('/api/voice/health', (c) => {
    if (!transcriber && !engine.transcribe) {
      return c.json({ status: 'error', engine: 'none', local: true, error: 'voice_unavailable' });
    }
    return c.json(transcriber?.health() ?? { status: 'ready', engine: 'engine', local: true });
  });

  app.post('/api/report', async (c) => {
    if (engine.health().status !== 'ready') {
      return c.json({ error: 'engine_not_ready', health: engine.health() }, 503);
    }
    let body: { text?: string; mode?: 'text' | 'voice' };
    try {
      body = (await c.req.json()) as { text?: string; mode?: 'text' | 'voice' };
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const text = body.text?.trim() ?? '';
    if (!text) return c.json({ error: 'empty_input' }, 400);

    const started = performance.now();
    let classification;
    try {
      classification = await engine.classify(text);
    } catch (error) {
      return c.json({ error: 'classification_failed', message: errorMessage(error) }, 500);
    }
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
    const transcribe = transcriber
      ? (audio: Uint8Array, mimeType?: string) => transcriber.transcribe(audio, mimeType)
      : engine.transcribe?.bind(engine);
    if (!transcribe) {
      return c.json({ error: 'voice_unavailable', text: '' }, 501);
    }
    if (transcriber && transcriber.health().status !== 'ready') {
      return c.json(
        { error: transcriber.health().error ?? 'voice_unavailable', health: transcriber.health() },
        503,
      );
    }
    const audio = new Uint8Array(await c.req.arrayBuffer());
    try {
      const text = await transcribe(audio, c.req.header('content-type') ?? undefined);
      if (!text) return c.json({ error: 'no_speech_detected', text: '' }, 422);
      return c.json({
        text,
        mode: 'voice',
        engine: transcriber?.health().engine ?? engine.health().engine,
        local: true,
        cloudCalls: 0,
      });
    } catch (error) {
      return c.json({ error: 'transcription_failed', message: errorMessage(error) }, 500);
    }
  });

  app.post('/api/speak', async (c) => {
    if (!engine.speak) {
      return c.json({ error: 'tts_unavailable' }, 501);
    }
    const body = (await c.req.json()) as { text?: string };
    try {
      const audio = await engine.speak(body.text ?? '');
      return c.body(Buffer.from(audio), 200, { 'content-type': 'audio/wav' });
    } catch (error) {
      return c.json({ error: 'tts_failed', message: errorMessage(error) }, 500);
    }
  });

  return { app, engine, outbox, transcriber };
}
