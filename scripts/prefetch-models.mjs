#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cache = resolve(process.cwd(), '.qvac');
await mkdir(cache, { recursive: true });
const configPath = resolve(cache, 'runtime-config.json');
await writeFile(
  configPath,
  `${JSON.stringify(
    {
      loggerLevel: 'info',
      loggerConsoleOutput: true,
      cacheDirectory: cache,
      httpDownloadConcurrency: 3,
      httpConnectionTimeoutMs: 10_000,
    },
    null,
    2,
  )}\n`,
);
process.env.QVAC_CONFIG_PATH = configPath;

console.log(`QVAC cache directory: ${cache}`);
console.log(`QVAC_CONFIG_PATH=${process.env.QVAC_CONFIG_PATH}`);
console.log('Prefetching the responder classifier (Qwen 0.6B via @qvac/sdk) into .qvac …');

try {
  const qvac = await import('@qvac/sdk');
  const modelSrc =
    qvac.QWEN3_600M_INST_Q4 ??
    qvac.QWEN3_600M_INST_Q4_0 ??
    qvac.LLAMA_3_2_1B_INST_Q4_0;
  if (!modelSrc) {
    console.log('SDK loaded but no known model constant was exported. Skip prefetch.');
    process.exit(1);
  }
  const modelId = await qvac.loadModel({
    modelSrc,
    modelType: 'llm',
    modelConfig: { ctx_size: 2048 },
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
  console.log('Classifier weights are cached. ENGINE=qvac will run with internet disabled.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Prefetch failed: ${message}`);
  console.error('Install @qvac/sdk, stay online, and rerun. ENGINE=scripted still carries tests.');
  process.exit(1);
}
