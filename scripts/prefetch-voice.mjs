import { join } from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

const model = process.env.WHISPER_MODEL ?? 'Xenova/whisper-tiny.en';
env.cacheDir = process.env.VOICE_MODEL_CACHE ?? join(process.cwd(), '.cache', 'fieldlink-voice');

console.log(`Downloading ${model} to ${env.cacheDir}`);
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

console.log('Running a local discard transcription to verify the model...');
await transcriber(new Float32Array(16_000));
console.log('Whisper Tiny is cached and ready for offline use.');
