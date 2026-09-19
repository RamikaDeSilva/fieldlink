import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Inbox } from '@fieldlink/transport';
import { aggregateByTriage, commsReduction } from './stats.ts';

export type HqDeps = {
  inbox?: Inbox;
};

export function createHqApp(deps: HqDeps = {}) {
  const inbox = deps.inbox ?? new Inbox();
  const app = new Hono();
  app.use('*', cors());

  app.get('/api/health', (c) =>
    c.json({
      status: 'ready',
      model: 'hq',
      load_ms: 0,
      warm_ms: 0,
      engine: 'hq',
    }),
  );

  app.post('/api/ingest', async (c) => {
    const body = await c.req.json();
    const result = inbox.ingest(body);
    return c.json({ ok: true, duplicate: result.duplicate, report_id: result.report.report_id }, 202);
  });

  app.get('/api/reports', (c) => c.json({ reports: inbox.list() }));

  app.get('/api/stats', (c) => {
    const reports = inbox.list();
    return c.json({
      triage: aggregateByTriage(reports),
      comms: commsReduction(reports, inbox.bytesIngested()),
    });
  });

  return { app, inbox };
}
