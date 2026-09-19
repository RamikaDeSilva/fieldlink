import { describe, expect, it } from 'vitest';
import { fixtures } from '@fieldlink/contract';
import { createHqApp } from './create-app.ts';

describe('HQ ingest', () => {
  it('stores a fixture envelope and aggregates it', async () => {
    const { app, inbox } = createHqApp();
    const res = await app.request('/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        seq: 0,
        report_id: fixtures.cprDrowningReport.report_id,
        sent_at: '2026-09-19T13:45:01Z',
        payload: fixtures.cprDrowningReport,
      }),
    });
    expect(res.status).toBe(202);
    expect(inbox.list()).toHaveLength(1);

    const stats = await app.request('/api/stats');
    const body = await stats.json();
    expect(body.triage.Immediate).toBe(1);
    expect(body.comms.radioSecondsSaved).toBe(45);
  });
});
