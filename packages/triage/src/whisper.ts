import { fileURLToPath } from 'node:url';
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { decodePcmWave } from './pcm-wav.ts';

const defaultVoiceCache = fileURLToPath(new URL('../../../.cache/fieldlink-voice/', import.meta.url));

export type VoiceHealth = {
  status: 'loading' | 'ready' | 'error';
  engine: string;
  local: true;
  error?: string;
};

export interface VoiceTranscriber {
  health(): VoiceHealth;
  warmup?(): Promise<void>;
  transcribe(wav: Uint8Array, mimeType?: string): Promise<string>;
}

export { decodePcmWave, encodeBrowserPcmWave, encodePcm16kWave, inspectPcmWave } from './pcm-wav.ts';

function transcriptText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    return output
      .map((item) => (item && typeof item === 'object' && 'text' in item ? String(item.text ?? '') : ''))
      .join(' ');
  }
  if (output && typeof output === 'object' && 'text' in output) {
    return String((output as { text?: unknown }).text ?? '');
  }
  return '';
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
        env.cacheDir = process.env.VOICE_MODEL_CACHE ?? defaultVoiceCache;
        if ('allowRemoteModels' in env) {
          env.allowRemoteModels = process.env.VOICE_ALLOW_REMOTE === '1';
        }
        return pipeline('automatic-speech-recognition', this.model);
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
      this.pipelinePromise = null;
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
    return transcriptText(output).trim().replace(/\s+/g, ' ').slice(0, 2_000);
  }
}
