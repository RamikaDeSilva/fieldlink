import { describe, expect, it } from 'vitest';
import { startPair, waitForReady } from './helpers.ts';

describe('hour-6 contract verification', () => {
  it('moves a mocked sitrep from responder to HQ with a table-sourced directive', async () => {
    const pair = await startPair();
    try {
      await waitForReady(pair.responder.url);
      const res = await fetch(`${pair.responder.url}/api/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Victim pulled from water, unresponsive, not breathing, starting compressions.',
          mode: 'text',
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        report: { protocol: string; directive: { source: string; steps: string[] } };
      };
      expect(body.report.protocol).toBe('cpr_drowning');
      expect(body.report.directive.source).toBe('protocol_table');

      const hq = await fetch(`${pair.hq.url}/api/reports`);
      const hqBody = (await hq.json()) as {
        reports: Array<{ report_id: string; directive: { source: string } }>;
      };
      expect(hqBody.reports).toHaveLength(1);
      expect(hqBody.reports[0]?.directive.source).toBe('protocol_table');
    } finally {
      await pair.close();
    }
  });

  it('moves a voiced sitrep through transcribe, FieldReport, transport, and HQ', async () => {
    const pair = await startPair({
      transcriber: {
        health: () => ({ status: 'ready', engine: 'whisper-tiny.en', local: true }),
        async transcribe() {
          return 'Victim pulled from water, unresponsive, not breathing.';
        },
      },
    });
    try {
      await waitForReady(pair.responder.url);
      const transcribed = await fetch(`${pair.responder.url}/api/transcribe`, {
        method: 'POST',
        headers: { 'content-type': 'audio/wav' },
        body: new Uint8Array(44),
      });
      expect(transcribed.status).toBe(200);
      const voice = (await transcribed.json()) as { text: string };
      const res = await fetch(`${pair.responder.url}/api/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: voice.text, mode: 'voice' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        report: { protocol: string; raw_input: { mode: string } };
      };
      expect(body.report.protocol).toBe('cpr_drowning');
      expect(body.report.raw_input.mode).toBe('voice');

      const hq = await fetch(`${pair.hq.url}/api/reports`);
      const hqBody = (await hq.json()) as {
        reports: Array<{ raw_input: { mode: string } }>;
      };
      expect(hqBody.reports).toHaveLength(1);
      expect(hqBody.reports[0]?.raw_input.mode).toBe('voice');
    } finally {
      await pair.close();
    }
  });
});
