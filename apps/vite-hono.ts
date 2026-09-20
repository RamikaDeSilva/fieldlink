import type { Plugin, ViteDevServer } from 'vite';
import { getRequestListener } from '@hono/node-server';
import type { Hono } from 'hono';

function whenHttpServerListening(server: ViteDevServer, onListen: () => void) {
  const attach = () => {
    const httpServer = server.httpServer;
    if (!httpServer) {
      setTimeout(attach, 10);
      return;
    }
    if (httpServer.listening) {
      onListen();
      return;
    }
    httpServer.once('listening', onListen);
  };
  attach();
}

export function honoApiPlugin(
  name: string,
  getApp: () => Hono,
  onReady?: () => Promise<void>,
): Plugin {
  return {
    name,
    configureServer(server) {
      const app = getApp();
      let ready: Promise<void> | undefined;
      const ensureReady = () => {
        ready ??= onReady ? onReady() : Promise.resolve();
        return ready;
      };

      // Vite's configLoader runner tears down the config module after
      // configureServer. Starting native warmup here races that teardown
      // (`Vite module runner has been closed`). Wait until the HTTP server
      // is actually listening, and also lazy-start on the first /api hit.
      whenHttpServerListening(server, () => {
        void ensureReady();
      });

      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api')) {
          next();
          return;
        }
        void ensureReady()
          .then(() => getRequestListener(app.fetch)(req, res))
          .catch(next);
      });
    },
  };
}
