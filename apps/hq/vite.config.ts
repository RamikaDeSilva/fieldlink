import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHqApp } from './src/create-app.ts';
import { honoApiPlugin } from '../vite-hono.ts';

const { app } = createHqApp();

export default defineConfig({
  plugins: [react(), honoApiPlugin('hq-api', () => app)],
  root: 'web',
  server: {
    port: Number(process.env.HQ_PORT ?? 3001),
    host: '0.0.0.0',
    strictPort: true,
  },
});
