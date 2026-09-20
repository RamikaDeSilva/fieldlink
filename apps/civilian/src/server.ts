import { serve } from '@hono/node-server';
import { createCivilianApp } from './create-app.ts';

export async function startCivilian(port = Number(process.env.CIVILIAN_PORT ?? 3002)) {
  const created = createCivilianApp();
  void created.engine.warmup().catch((error) => {
    console.error('Civilian local AI warmup failed:', error instanceof Error ? error.message : error);
  });
  void created.voiceTranscriber.warmup?.().catch((error) => {
    console.warn('Whisper warmup failed; local voice fallback remains available:', error instanceof Error ? error.message : error);
  });
  const server = serve({ fetch: created.app.fetch, port, hostname: '0.0.0.0' });
  return { ...created, server, port };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await startCivilian();
  console.log(`FieldLink Civilian listening on http://127.0.0.1:${port}`);
}
