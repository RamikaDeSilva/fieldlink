import { serve } from '@hono/node-server';
import { createHqApp } from './create-app.ts';

export function startHq(port = Number(process.env.HQ_PORT ?? 3001)) {
  const { app, inbox } = createHqApp();
  const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
  return { server, app, inbox, port };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = startHq();
  console.log(`HQ listening on http://127.0.0.1:${port}`);
}
