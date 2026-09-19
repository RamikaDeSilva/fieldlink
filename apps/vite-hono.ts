import type { Plugin } from 'vite';
import { getRequestListener } from '@hono/node-server';
import type { Hono } from 'hono';

export function honoApiPlugin(
  name: string,
  getApp: () => Hono,
  onReady?: () => Promise<void>,
): Plugin {
  return {
    name,
    configureServer(server) {
      const app = getApp();
      const ready = onReady?.() ?? Promise.resolve();
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api')) {
          next();
          return;
        }
        void ready
          .then(() => getRequestListener(app.fetch)(req, res))
          .catch(next);
      });
    },
  };
}
