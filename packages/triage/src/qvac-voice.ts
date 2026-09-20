import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureQvacRuntimeConfig,
  importQvacSdk,
  resolveQvacWhisperSrc,
  type QvacModule,
} from './qvac.ts';
import { decodePcmWave, encodePcm16kWave, inspectPcmWave } from './pcm-wav.ts';
import type { VoiceHealth, VoiceTranscriber } from './whisper.ts';

export class QvacWhisperTranscriber implements VoiceTranscriber {
  private state: VoiceHealth = { status: 'loading', engine: 'qvac-whisper', local: true };
  private sdk: QvacModule | null = null;
  private modelId: string | null = null;

  health(): VoiceHealth {
    return this.state;
  }

  async warmup(): Promise<void> {
    ensureQvacRuntimeConfig();
    try {
      this.sdk = await importQvacSdk();
      const modelSrc = resolveQvacWhisperSrc(this.sdk);
      if (!modelSrc) {
        throw new Error('QVAC SDK loaded but no Whisper model constant was found');
      }
      if (typeof this.sdk.transcribe !== 'function') {
        throw new Error('QVAC SDK loaded but transcribe() is not available');
      }
      this.modelId = await this.sdk.loadModel({ modelSrc });
      this.state = { status: 'ready', engine: 'qvac-whisper', local: true };
    } catch (error) {
      this.sdk = null;
      this.modelId = null;
      this.state = {
        status: 'error',
        engine: 'qvac-whisper',
        local: true,
        error: error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
  }

  async transcribe(wav: Uint8Array): Promise<string> {
    if (!this.sdk?.transcribe || !this.modelId) {
      throw new Error('QvacWhisperTranscriber.warmup() must run before transcribe()');
    }
    const incoming = inspectPcmWave(wav);
    const pcm16k = decodePcmWave(wav);
    const wav16k = encodePcm16kWave(pcm16k);
    const normalized = inspectPcmWave(wav16k);
    console.log(
      `QVAC STT incoming ${JSON.stringify(incoming)} -> filePath wav ${JSON.stringify(normalized)}`,
    );
    const path = join(tmpdir(), `fieldlink-voice-${Date.now()}.wav`);
    writeFileSync(path, wav16k);
    // QVAC only runs ffmpeg decode/resample for filePath .wav. A Buffer/base64
    // payload is treated as raw 16 kHz PCM, so browser 48 kHz WAVs hallucinate.
    const raw = await this.sdk.transcribe({
      modelId: this.modelId,
      audioChunk: path,
    });
    return raw.trim().replace(/\s+/g, ' ').slice(0, 2_000);
  }
}
