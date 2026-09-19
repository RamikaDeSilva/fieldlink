import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { loadEngine } from '@fieldlink/triage';
import { createResponderApp } from './src/create-app.ts';
import { honoApiPlugin } from '../vite-hono.ts';

const { app, engine } = createResponderApp({
  engine: await loadEngine(),
});

export default defineConfig({
  plugins: [
    react(),
    honoApiPlugin('responder-api', () => app, () => engine.warmup()),
  ],
  root: 'web',
  server: {
    port: Number(process.env.RESPONDER_PORT ?? 3000),
    host: '0.0.0.0',
    strictPort: true,
  },
});
