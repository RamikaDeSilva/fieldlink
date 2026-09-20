import { serve } from '@hono/node-server';
import { loadEngine, loadTranscriber } from '@fieldlink/triage';
import { createResponderApp } from './create-app.ts';

export async function startResponder(
  port = Number(process.env.RESPONDER_PORT ?? 3000),
  deps: Parameters<typeof createResponderApp>[0] = {},
) {
  const engine = deps.engine ?? (await loadEngine());
  const transcriber = deps.transcriber ?? (await loadTranscriber());
  const created = createResponderApp({
    ...deps,
    engine,
    transcriber,
  });
  if (created.engine.health().status !== 'ready') {
    await created.engine.warmup().catch((error) => {
      console.error(
        'Responder local AI warmup failed:',
        error instanceof Error ? error.message : error,
      );
    });
  }
  await created.transcriber?.warmup?.().catch((error) => {
    console.warn(
      'Local STT warmup failed; type a sitrep until voice models are prefetched:',
      error instanceof Error ? error.message : error,
    );
  });
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
