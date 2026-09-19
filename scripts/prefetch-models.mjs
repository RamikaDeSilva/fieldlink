#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const cache = resolve(process.cwd(), '.qvac');
await mkdir(cache, { recursive: true });
process.env.QVAC_CONFIG_PATH ??= resolve(process.cwd(), 'qvac.config.json');

console.log(`QVAC cache directory: ${cache}`);
console.log(`QVAC_CONFIG_PATH=${process.env.QVAC_CONFIG_PATH}`);

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
