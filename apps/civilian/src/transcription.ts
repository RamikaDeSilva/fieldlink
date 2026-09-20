import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

export type VoiceHealth = {
  status: 'loading' | 'ready' | 'error';
  engine: string;
  local: true;
  error?: string;
  fallback?: boolean;
  primaryStatus?: 'loading' | 'ready' | 'error';
};

export interface VoiceTranscriber {
  health(): VoiceHealth;
  warmup?(): Promise<void>;
  transcribe(wav: Uint8Array): Promise<string>;
}

function isWaveFile(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 44) return false;
  return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WAVE';
}

function decodePcmWave(bytes: Uint8Array): Float32Array {
  if (!isWaveFile(bytes)) throw new Error('Audio must be a PCM WAV file.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataOffset = 0;
  let dataLength = 0;

  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const bodyOffset = offset + 8;
    if (bodyOffset + size > bytes.byteLength) throw new Error('The WAV file is truncated.');
    if (id === 'fmt ' && size >= 16) {
      audioFormat = view.getUint16(bodyOffset, true);
      channels = view.getUint16(bodyOffset + 2, true);
      sampleRate = view.getUint32(bodyOffset + 4, true);
      bitsPerSample = view.getUint16(bodyOffset + 14, true);
    } else if (id === 'data') {
      dataOffset = bodyOffset;
      dataLength = size;
    }
    offset = bodyOffset + size + (size % 2);
  }

  if (audioFormat !== 1 || bitsPerSample !== 16 || channels < 1 || channels > 2 || !dataOffset || !sampleRate) {
    throw new Error('Voice input requires 16-bit mono or stereo PCM WAV audio.');
  }

  const frameCount = Math.floor(dataLength / (channels * 2));
  const mono = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let value = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      value += view.getInt16(dataOffset + ((frame * channels + channel) * 2), true) / 32768;
    }
    mono[frame] = value / channels;
  }
  if (sampleRate === 16_000) return mono;

  const targetLength = Math.max(1, Math.round(mono.length * 16_000 / sampleRate));
  const resampled = new Float32Array(targetLength);
  const ratio = sampleRate / 16_000;
  for (let index = 0; index < targetLength; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, mono.length - 1);
    const fraction = position - left;
    resampled[index] = (mono[left] ?? 0) * (1 - fraction) + (mono[right] ?? 0) * fraction;
  }
  return resampled;
}

export class WhisperTinyTranscriber implements VoiceTranscriber {
  private readonly model = process.env.WHISPER_MODEL ?? 'Xenova/whisper-tiny.en';
  private state: VoiceHealth = { status: 'loading', engine: 'whisper-tiny.en', local: true };
  private pipelinePromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

  health(): VoiceHealth {
    return this.state;
  }

  private getPipeline(): Promise<AutomaticSpeechRecognitionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        const { env, pipeline } = await import('@huggingface/transformers');
        env.cacheDir = process.env.VOICE_MODEL_CACHE ?? join(process.cwd(), '.cache', 'fieldlink-voice');
        const instance = await pipeline('automatic-speech-recognition', this.model);
        return instance;
      })();
    }
    return this.pipelinePromise;
  }

  async warmup(): Promise<void> {
    try {
      const transcriber = await this.getPipeline();
      await transcriber(new Float32Array(16_000));
      this.state = { status: 'ready', engine: 'whisper-tiny.en', local: true };
    } catch (error) {
      this.state = {
        status: 'error',
        engine: 'whisper-tiny.en',
        local: true,
        error: error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
  }

  async transcribe(wav: Uint8Array): Promise<string> {
    const transcriber = await this.getPipeline();
    const output = await transcriber(decodePcmWave(wav));
    return output.text.trim().replace(/\s+/g, ' ').slice(0, 2_000);
  }
}

export class WindowsVoiceTranscriber implements VoiceTranscriber {
  health(): VoiceHealth {
    return process.platform === 'win32'
      ? { status: 'ready', engine: 'windows-speech-local', local: true }
      : {
          status: 'error',
          engine: 'windows-speech-local',
          local: true,
          error: 'Local voice input currently requires Windows Speech Recognition.',
        };
  }

  async transcribe(wav: Uint8Array): Promise<string> {
    const health = this.health();
    if (health.status !== 'ready') throw new Error(health.error);
    if (!isWaveFile(wav)) throw new Error('Audio must be a PCM WAV file.');

    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'fieldlink-voice-'));
    const audioPath = join(temporaryDirectory, 'recording.wav');
    const scriptPath = fileURLToPath(new URL('./transcribe-windows.ps1', import.meta.url));
    try {
      await writeFile(audioPath, wav);
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        audioPath,
      ], {
        timeout: 45_000,
        windowsHide: true,
        maxBuffer: 64 * 1024,
      });
      return stdout.trim().replace(/\s+/g, ' ').slice(0, 2_000);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

export class FallbackVoiceTranscriber implements VoiceTranscriber {
  constructor(
    private readonly primary: VoiceTranscriber,
    private readonly fallback: VoiceTranscriber,
  ) {}

  health(): VoiceHealth {
    const primaryHealth = this.primary.health();
    if (primaryHealth.status === 'ready') return primaryHealth;
    const fallbackHealth = this.fallback.health();
    return fallbackHealth.status === 'ready'
      ? { ...fallbackHealth, fallback: true, primaryStatus: primaryHealth.status }
      : primaryHealth;
  }

  async warmup(): Promise<void> {
    await this.primary.warmup?.();
  }

  async transcribe(wav: Uint8Array): Promise<string> {
    if (this.primary.health().status === 'ready') return this.primary.transcribe(wav);
    return this.fallback.transcribe(wav);
  }
}

export function loadVoiceTranscriber(): VoiceTranscriber {
  return new FallbackVoiceTranscriber(new WhisperTinyTranscriber(), new WindowsVoiceTranscriber());
}
