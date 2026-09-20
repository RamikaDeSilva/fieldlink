import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { loadAndWarmEngine } from '@fieldlink/triage';
import { createResponderApp } from './src/create-app.ts';
import { honoApiPlugin } from '../vite-hono.ts';

const engine = await loadAndWarmEngine();
const { app } = createResponderApp({ engine });

export default defineConfig({
  plugins: [
    react(),
    honoApiPlugin('responder-api', () => app, async () => {
      if (engine.health().status !== 'ready') await engine.warmup();
    }),
  ],
  root: 'web',
  server: {
    port: Number(process.env.RESPONDER_PORT ?? 3000),
    host: '0.0.0.0',
    strictPort: true,
  },
});
