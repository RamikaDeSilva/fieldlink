import {
  Classification,
  classificationJsonSchema,
  type HealthStatus,
} from '@fieldlink/contract';
import type { LlmEngine } from './engine.ts';
import { parseClassification } from './assemble.ts';

const WARMUP_TEXT = 'victim unresponsive, not breathing';
const SYSTEM_PROMPT = `You are a field triage classifier for two protocols only: CPR/drowning and massive hemorrhage.
Return JSON that matches the schema. Do not give medical advice. Do not invent extra keys.
If the input is not drowning/CPR or life-threatening bleeding, set protocol to out_of_scope and triage_level to Unknown.
Prefer Immediate for unresponsive/not-breathing or arterial bleeding.`;

type QvacModule = {
  loadModel: (opts: { modelSrc: unknown; onProgress?: (p: { percentage: number }) => void }) => Promise<string>;
  completion: (opts: Record<string, unknown>) => {
    final?: Promise<{ content?: string; text?: string }>;
    text?: Promise<string>;
    tokenStream?: AsyncIterable<string>;
  };
  unloadModel?: (opts: { modelId: string }) => Promise<void>;
  getSystemResources?: () => Promise<{ tokensPerSec?: number; ramUsedMb?: number }>;
  transcribe?: (opts: { modelId: string; audio: Uint8Array }) => Promise<string>;
  textToSpeech?: (opts: { modelId: string; text: string }) => { buffer?: Uint8Array };
  QWEN3_600M_INST_Q4?: unknown;
  QWEN3_600M_INST_Q4_0?: unknown;
  LLAMA_3_2_1B_INST_Q4_0?: unknown;
  WHISPER_TINY?: unknown;
};

export class QvacEngine implements LlmEngine {
  private ready = false;
  private loadMs = 0;
  private warmMs = 0;
  private modelId: string | null = null;
  private whisperId: string | null = null;
  private ttsId: string | null = null;
  private sdk: QvacModule | null = null;
  private lastTokS = 0;

  health(): HealthStatus {
    return {
      status: this.ready ? 'ready' : 'loading',
      model: 'qwen3-0.6b-q4',
      load_ms: this.loadMs,
      warm_ms: this.warmMs,
      engine: 'qvac',
    };
  }

  async warmup(): Promise<void> {
    const loadStart = performance.now();
    this.sdk = (await import('@qvac/sdk')) as unknown as QvacModule;
    const modelSrc =
      this.sdk.QWEN3_600M_INST_Q4 ??
      this.sdk.QWEN3_600M_INST_Q4_0 ??
      this.sdk.LLAMA_3_2_1B_INST_Q4_0;
    if (!modelSrc) {
      throw new Error('QVAC SDK loaded but no supported model constant was found');
    }
    this.modelId = await this.sdk.loadModel({ modelSrc });
    this.loadMs = Math.round(performance.now() - loadStart);

    const warmStart = performance.now();
    await this.classify(WARMUP_TEXT);
    this.warmMs = Math.round(performance.now() - warmStart);
    this.ready = true;
  }

  async classify(text: string): Promise<Classification> {
    if (!this.sdk || !this.modelId) {
      throw new Error('QvacEngine.warmup() must run before classify()');
    }

    const attempt = async (): Promise<Classification> => {
      const result = this.sdk!.completion({
        modelId: this.modelId,
        history: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        stream: true,
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'classification',
            schema: classificationJsonSchema(),
          },
        },
        generationParams: { temperature: 0 },
      });

      const content = await readCompletion(result);
      const parsed = JSON.parse(content) as unknown;
      return parseClassification(parsed);
    };

    try {
      const start = performance.now();
      const first = await attempt();
      const elapsed = (performance.now() - start) / 1000;
      this.lastTokS = elapsed > 0 ? Number((32 / elapsed).toFixed(1)) : this.lastTokS;
      return first;
    } catch {
      try {
        return await attempt();
      } catch {
        return Classification.parse({
          protocol: 'out_of_scope',
          triage_level: 'Unknown',
          condition_tags: [],
        });
      }
    }
  }

  tokensPerSec(): number {
    return this.lastTokS;
  }

  async transcribe(audio: Uint8Array): Promise<string> {
    if (!this.sdk) throw new Error('QvacEngine is not warmed up');
    if (!this.sdk.transcribe || !this.sdk.WHISPER_TINY) {
      throw new Error('QVAC transcribe is unavailable in this SDK build');
    }
    if (!this.whisperId) {
      this.whisperId = await this.sdk.loadModel({ modelSrc: this.sdk.WHISPER_TINY });
    }
    return this.sdk.transcribe({ modelId: this.whisperId, audio });
  }

  async speak(text: string): Promise<Uint8Array> {
    if (!this.sdk?.textToSpeech) {
      throw new Error('QVAC textToSpeech is unavailable in this SDK build');
    }
    const result = this.sdk.textToSpeech({ modelId: this.ttsId ?? this.modelId ?? '', text });
    if (!result.buffer) throw new Error('TTS returned no audio buffer');
    return result.buffer;
  }
}

async function readCompletion(result: {
  final?: Promise<{ content?: string; text?: string }>;
  text?: Promise<string>;
  tokenStream?: AsyncIterable<string>;
}): Promise<string> {
  if (result.final) {
    const final = await result.final;
    const value = final.content ?? final.text;
    if (value) return value;
  }
  if (result.text) return result.text;
  if (result.tokenStream) {
    let acc = '';
    for await (const token of result.tokenStream) acc += token;
    return acc;
  }
  throw new Error('QVAC completion returned no text');
}

