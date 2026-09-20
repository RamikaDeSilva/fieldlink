import { describe, expect, it } from 'vitest';
import { ScriptedEngine } from '@fieldlink/triage';
import { createResponderApp } from './create-app.ts';

describe('responder API', () => {
  it('does not substitute ScriptedEngine when ENGINE=qvac and no engine was injected', () => {
    const previous = process.env.ENGINE;
    process.env.ENGINE = 'qvac';
    try {
      expect(() => createResponderApp({ send: async () => true })).toThrow(/QvacEngine/);
    } finally {
      if (previous === undefined) delete process.env.ENGINE;
      else process.env.ENGINE = previous;
    }
  });

  it('refuses submit until warmup completes', async () => {
    const { app } = createResponderApp({
      engine: new ScriptedEngine(),
      send: async () => true,
    });
    const res = await app.request('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'blood everywhere' }),
    });
    expect(res.status).toBe(503);
  });

  it('returns a protocol-table directive after warmup', async () => {
    const engine = new ScriptedEngine();
    await engine.warmup();
    const sent: unknown[] = [];
    const { app } = createResponderApp({
      engine,
      send: async (envelope) => {
        sent.push(envelope);
        return true;
      },
    });
    const res = await app.request('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Victim pulled from water, unresponsive, not breathing.',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.directive.source).toBe('protocol_table');
    expect(body.report.protocol).toBe('cpr_drowning');
    expect(sent).toHaveLength(1);
  });

  it('returns 501 for voice when the engine has no transcribe hook', async () => {
    const engine = new ScriptedEngine();
    await engine.warmup();
    const { app } = createResponderApp({ engine, send: async () => true });
    const res = await app.request('/api/transcribe', {
      method: 'POST',
      body: new Uint8Array([1, 2, 3]),
    });
    expect(res.status).toBe(501);
  });

  it('sends a voice transcript through the same report pipeline', async () => {
    const engine = new ScriptedEngine();
    await engine.warmup();
    const sent: unknown[] = [];
    const { app } = createResponderApp({
      engine,
      send: async (envelope) => {
        sent.push(envelope);
        return true;
      },
      transcriber: {
        health: () => ({ status: 'ready', engine: 'whisper-tiny.en', local: true }),
        async transcribe() {
          return 'Victim pulled from water, unresponsive, not breathing.';
        },
      },
    });
    const transcribed = await app.request('/api/transcribe', {
      method: 'POST',
      body: new Uint8Array(44),
    });
    expect(transcribed.status).toBe(200);
    const voice = (await transcribed.json()) as { text: string };
    const res = await app.request('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: voice.text, mode: 'voice' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.raw_input.mode).toBe('voice');
    expect(body.report.protocol).toBe('cpr_drowning');
    expect(body.report.directive.source).toBe('protocol_table');
    expect(sent).toHaveLength(1);
  });

  it('returns a clean error when classification throws', async () => {
    const engine = new ScriptedEngine();
    await engine.warmup();
    engine.classify = async () => {
      throw new Error('model crashed');
    };
    const { app } = createResponderApp({ engine, send: async () => true });
    const res = await app.request('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'bleeding out' }),
    });
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: 'classification_failed',
      message: 'model crashed',
    });
  });
});
