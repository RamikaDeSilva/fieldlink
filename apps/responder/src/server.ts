import { serve } from '@hono/node-server';
import { loadAndWarmEngine } from '@fieldlink/triage';
import { createResponderApp } from './create-app.ts';

export async function startResponder(
  port = Number(process.env.RESPONDER_PORT ?? 3000),
  deps: Parameters<typeof createResponderApp>[0] = {},
) {
  const created = createResponderApp({
    ...deps,
    engine: deps.engine ?? (await loadAndWarmEngine()),
  });
  if (created.engine.health().status !== 'ready') {
    await created.engine.warmup();
  }
  const server = serve({ fetch: created.app.fetch, port, hostname: '0.0.0.0' });
  return { ...created, server, port };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port, engine } = await startResponder();
  console.log(`Responder listening on http://127.0.0.1:${port}`);
  console.log(
    `engine=${engine.health().engine} load_ms=${engine.health().load_ms} warm_ms=${engine.health().warm_ms}`,
  );
}
