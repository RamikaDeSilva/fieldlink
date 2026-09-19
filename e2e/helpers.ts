import { serve } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import type { Hono } from 'hono';
import { createHqApp } from '../apps/hq/src/create-app.ts';
import { createResponderApp } from '../apps/responder/src/create-app.ts';
import { ScriptedEngine } from '@fieldlink/triage';

type Started = {
  close: () => Promise<void>;
  port: number;
  url: string;
};

function listen(app: Hono): Promise<Started> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
      const port =
        typeof info === 'object' && info && 'port' in info
          ? Number(info.port)
          : (server.address() as AddressInfo).port;
      resolve({
        port,
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
    server.once('error', reject);
  });
}

export async function startPair() {
  const hq = createHqApp();
  const hqStarted = await listen(hq.app);
  const engine = new ScriptedEngine();
  await engine.warmup();
  const responder = createResponderApp({
    engine,
    ingestUrl: `${hqStarted.url}/api/ingest`,
  });
  const responderStarted = await listen(responder.app);
  return {
    hq: { ...hqStarted, inbox: hq.inbox },
    responder: responderStarted,
    async close() {
      await responderStarted.close();
      await hqStarted.close();
    },
  };
}

export async function waitForReady(url: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      const json = (await res.json()) as { status?: string };
      if (json.status === 'ready') return;
    } catch {
      // still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`health never became ready at ${url}`);
}
