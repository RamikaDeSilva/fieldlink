import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createCivilianApp } from './src/create-app.ts';
import { honoApiPlugin } from '../vite-hono.ts';

const { app, engine, voiceTranscriber } = createCivilianApp();
void engine.warmup().catch(() => undefined);
void voiceTranscriber.warmup?.().catch(() => undefined);

export default defineConfig({
  plugins: [react(), honoApiPlugin('civilian-api', () => app)],
  root: 'web',
  optimizeDeps: {
    entries: ['main.tsx'],
  },
  server: {
    port: Number(process.env.CIVILIAN_PORT ?? 3002),
    host: '0.0.0.0',
    strictPort: true,
  },
});
