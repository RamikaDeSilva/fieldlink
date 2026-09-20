import { join } from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

const cache = process.env.VOICE_MODEL_CACHE ?? join(process.cwd(), '.cache', 'fieldlink-voice');

try {
  const qvacCache = join(process.cwd(), '.qvac');
  process.env.QVAC_CONFIG_PATH ??= join(qvacCache, 'runtime-config.json');
  const qvac = await import('@qvac/sdk');
  const modelSrc = qvac.WHISPER_EN_TINY_Q8_0 ?? qvac.WHISPER_TINY_Q8_0 ?? qvac.WHISPER_TINY;
  if (!modelSrc) throw new Error('QVAC SDK has no Whisper catalog model');
  console.log('Prefetching QVAC Whisper (whisper.cpp) into .qvac …');
  const modelId = await qvac.loadModel({
    modelSrc,
    onProgress: (p) => {
      if (typeof p?.percentage === 'number') {
        process.stdout.write(`\rwhisper ${p.percentage.toFixed(0)}%   `);
      }
    },
  });
  process.stdout.write('\n');
  console.log(`QVAC Whisper model id: ${modelId}`);
  if (typeof qvac.unloadModel === 'function') {
    await qvac.unloadModel({ modelId });
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`QVAC Whisper prefetch failed: ${message}`);
  process.exit(1);
}

const model = process.env.WHISPER_MODEL ?? 'Xenova/whisper-tiny.en';
env.cacheDir = cache;
env.allowRemoteModels = true;

console.log(`Downloading civilian fallback ${model} to ${env.cacheDir}`);
const seen = new Map();
const transcriber = await pipeline('automatic-speech-recognition', model, {
  progress_callback: (event) => {
    if (event.status !== 'progress' || typeof event.file !== 'string' || typeof event.progress !== 'number') return;
    const rounded = Math.floor(event.progress);
    if (seen.get(event.file) === rounded) return;
    seen.set(event.file, rounded);
    if (rounded % 10 === 0 || rounded === 100) console.log(`${event.file}: ${rounded}%`);
  },
});

console.log('Running a local discard transcription to verify the civilian model...');
await transcriber(new Float32Array(16_000));
console.log('Voice models are cached and ready for offline use.');
