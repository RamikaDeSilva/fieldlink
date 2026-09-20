import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

const minimumNode = [22, 17, 0];
const model = process.env.OLLAMA_MODEL ?? 'llama3.2:1b-instruct-q4_K_M';
const whisperModel = process.env.WHISPER_MODEL ?? 'Xenova/whisper-tiny.en';
const ollamaUrl = (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
const voiceCache = process.env.VOICE_MODEL_CACHE ?? join(process.cwd(), '.cache', 'fieldlink-voice');
const voiceModelCache = join(voiceCache, ...whisperModel.split('/'));
let failed = false;

function result(ok, label, help) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok && help) console.log(`      ${help}`);
  if (!ok) failed = true;
}

function versionAtLeast(actual, required) {
  for (let index = 0; index < required.length; index += 1) {
    if ((actual[index] ?? 0) > required[index]) return true;
    if ((actual[index] ?? 0) < required[index]) return false;
  }
  return true;
}

console.log(`FieldLink Civilian setup check (${process.platform} ${process.arch})`);

const nodeVersion = process.versions.node.split('.').map(Number);
result(
  versionAtLeast(nodeVersion, minimumNode),
  `Node ${process.versions.node} (requires 22.17 or newer)`,
  'Install a current Node 22 LTS release, then reopen the terminal.',
);

result(
  process.platform !== 'darwin' || ['arm64', 'x64'].includes(process.arch),
  `Supported CPU architecture: ${process.arch}`,
  'The local Whisper runtime supports Apple Silicon (arm64) and Intel (x64) Macs.',
);

try {
  const manifest = JSON.parse(await readFile(join(process.cwd(), 'apps', 'civilian', 'package.json'), 'utf8'));
  const lock = await readFile(join(process.cwd(), 'package-lock.json'), 'utf8');
  const expected = manifest.dependencies?.['@huggingface/transformers'];
  result(
    expected === '4.3.0' && lock.includes('node_modules/@huggingface/transformers'),
    'Whisper dependency and package lock are synchronized',
    'Run npm install from the repository root and commit package-lock.json.',
  );
} catch (error) {
  result(false, 'Repository dependency files are readable', String(error));
}

const voiceFiles = [
  'config.json',
  join('onnx', 'encoder_model.onnx'),
  join('onnx', 'decoder_model_merged.onnx'),
];
const voiceChecks = await Promise.all(voiceFiles.map(async (file) => {
  try {
    await access(join(voiceModelCache, file), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}));
result(
  voiceChecks.every(Boolean),
  `Whisper Tiny is cached at ${voiceModelCache}`,
  'Run npm run voice:prefetch while internet access is available.',
);

try {
  const response = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(4_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  const installed = Array.isArray(body.models)
    && body.models.some((entry) => entry.name === model || entry.model === model);
  result(
    installed,
    `Ollama model ${model} is installed`,
    `Start Ollama, then run: ollama pull ${model}`,
  );
} catch (error) {
  result(
    false,
    `Ollama is reachable at ${ollamaUrl}`,
    `Start the Ollama app and run: ollama pull ${model} (${error instanceof Error ? error.message : error})`,
  );
}

if (failed) {
  console.error('\nSetup is incomplete. Resolve the FAIL items, then run npm run doctor:civilian again.');
  process.exitCode = 1;
} else {
  console.log('\nReady. Start with: CIVILIAN_ENGINE=ollama npm run dev:civilian');
}
