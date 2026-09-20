#!/usr/bin/env node
import { open, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// The bare worker can take well over the SDK's 30s default on a cold start.
process.env.QVAC_RPC_INIT_TIMEOUT_MS ??= '120000';

// QVAC requires an absolute cacheDirectory; the committed config stays relative.
const configPath = resolve(process.cwd(), 'qvac.config.json');
const baseConfig = JSON.parse(await readFile(configPath, 'utf8'));
const cache = resolve(process.cwd(), baseConfig.cacheDirectory ?? '.qvac');
await mkdir(cache, { recursive: true });

const runtimeConfigPath = join(cache, 'qvac.runtime.json');
await writeFile(
  runtimeConfigPath,
  JSON.stringify({ ...baseConfig, cacheDirectory: cache }, null, 2),
);
process.env.QVAC_CONFIG_PATH = runtimeConfigPath;

console.log(`QVAC cache directory: ${cache}`);
console.log(`QVAC_CONFIG_PATH=${process.env.QVAC_CONFIG_PATH}`);

// The p2p registry is unreachable on some networks; allow a plain HTTP mirror.
const fallbackSrc =
  process.env.QVAC_MODEL_FALLBACK_SRC ??
  'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_0.gguf';
const modelFileName = fallbackSrc.split('/').pop();

// A cancelled download leaves a truncated file under the same name, so check
// the magic bytes before deciding the model is already here.
const named = (await readdir(cache).catch(() => [])).filter(
  (entry) => entry === modelFileName || entry.endsWith(`_${modelFileName}`),
);
let existing;
for (const entry of named) {
  const path = join(cache, entry);
  const handle = await open(path, 'r').catch(() => null);
  if (!handle) continue;
  const header = Buffer.alloc(4);
  await handle.read(header, 0, 4, 0).catch(() => undefined);
  await handle.close();
  if (header.toString('ascii') === 'GGUF') {
    existing = path;
    break;
  }
  console.log(`Ignoring incomplete download: ${path}`);
}
if (existing) {
  console.log(`Already cached: ${existing}`);
  console.log('Nothing to download. ENGINE=qvac will load this file directly.');
  process.exit(0);
}

try {
  const qvac = await import('@qvac/sdk');
  const modelSrc =
    qvac.QWEN3_600M_INST_Q4 ??
    qvac.QWEN3_600M_INST_Q4_0 ??
    qvac.LLAMA_3_2_1B_INST_Q4_0;
  if (!modelSrc) {
    console.log('SDK loaded but no known model constant was exported. Skip prefetch.');
    process.exit(0);
  }
  console.log('Prefetching model into .qvac …');
  const modelId = await qvac.loadModel({
    modelSrc,
    fallbackSrc,
    onProgress: (p) => {
      if (typeof p?.percentage === 'number') {
        process.stdout.write(`\rdownload ${p.percentage.toFixed(0)}%   `);
      }
    },
  });
  process.stdout.write('\n');
  console.log(`warm model id: ${modelId}`);
  if (typeof qvac.unloadModel === 'function') {
    await qvac.unloadModel({ modelId });
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`Prefetch skipped: ${message}`);
  console.log('ENGINE=scripted still carries the demo. Install @qvac/sdk and rerun while online.');
}
