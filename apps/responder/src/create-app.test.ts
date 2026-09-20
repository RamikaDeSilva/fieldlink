import { describe, expect, it } from 'vitest';
import { ScriptedEngine } from '@fieldlink/triage';
import { createResponderApp } from './create-app.ts';

describe('responder API', () => {
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
    expect(body.delivery.status).toBe('delivered');
    expect(body.delivery.report_id).toBe(body.report.report_id);
  });

  it('keeps the original report pending when HQ is unreachable and flushes it later', async () => {
    const engine = new ScriptedEngine();
    await engine.warmup();
    let up = false;
    const received: string[] = [];
    const { app } = createResponderApp({
      engine,
      maxAttempts: 2,
      send: async (envelope) => {
        if (!up) throw new Error('ECONNREFUSED');
        received.push(envelope.report_id);
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
    expect(body.delivery.status).toBe('pending');
    expect(body.delivery.pending_count).toBe(1);

    const queued = await app.request('/api/outbox');
    const snapshot = await queued.json();
    expect(snapshot.pending).toHaveLength(1);
    expect(snapshot.pending[0]?.report_id).toBe(body.report.report_id);

    up = true;
    const flushed = await app.request('/api/outbox/flush', { method: 'POST' });
    const flushBody = await flushed.json();
    expect(flushBody.delivered).toEqual([body.report.report_id]);
    expect(flushBody.pending).toEqual([]);
    expect(received).toEqual([body.report.report_id]);
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
});
