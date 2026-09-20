import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { loadEngine, loadTranscriber } from '@fieldlink/triage';
import { createResponderApp } from './src/create-app.ts';
import { honoApiPlugin } from '../vite-hono.ts';

const engine = await loadEngine();
const transcriber = await loadTranscriber();
const { app } = createResponderApp({ engine, transcriber });

async function warmup(): Promise<void> {
  await engine.warmup().catch((error) => {
    console.error('Responder local AI warmup failed:', error instanceof Error ? error.message : error);
  });
  await transcriber?.warmup?.().catch((error) => {
    console.warn(
      'Local STT warmup failed; type a sitrep until voice models are prefetched:',
      error instanceof Error ? error.message : error,
    );
  });
}

export default defineConfig({
  plugins: [react(), honoApiPlugin('responder-api', () => app, () => warmup())],
  root: 'web',
  server: {
    port: Number(process.env.RESPONDER_PORT ?? 3000),
    host: '0.0.0.0',
    strictPort: true,
    watch: {
      ignored: ['**/.qvac/**', '**/.cache/**'],
    },
  },
});
