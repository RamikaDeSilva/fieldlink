import {
  Classification,
  classificationJsonSchema,
  type HealthStatus,
} from '@fieldlink/contract';
import type { LlmEngine } from './engine.ts';
import { parseClassification } from './assemble.ts';
import { extractJsonObject } from './extract.ts';
import { ensureQvacConfig, findCachedModel } from './qvac-config.ts';

const WARMUP_TEXT = 'victim unresponsive, not breathing';
/** The p2p registry is unreachable on some networks; allow a plain HTTP mirror. */
const MODEL_FALLBACK_SRC =
  process.env.QVAC_MODEL_FALLBACK_SRC ??
  'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_0.gguf';
const MODEL_FILE_NAME = MODEL_FALLBACK_SRC.split('/').pop() ?? 'Qwen3-0.6B-Q4_0.gguf';
/** A bare path carries no type hint, so the SDK needs it spelled out. */
const MODEL_TYPE = 'llamacpp-completion';
const SYSTEM_PROMPT = `/no_think
You are a field triage classifier. Pick exactly one protocol from the schema.

massive_hemorrhage — any heavy or uncontrolled blood loss: bleeding out, blood everywhere,
spurting or arterial bleed, gushing, soaked dressing, laceration, amputation, tourniquet needed.
cpr_drowning — unresponsive, not breathing, no pulse, cardiac arrest, pulled from water, drowning.
out_of_scope — everything else: questions, logistics, minor or non-bleeding injuries, illness.

triage_level: Immediate for uncontrolled bleeding or unresponsive/not breathing.
Use Unknown only when protocol is out_of_scope.

Report only what the text states. Give no medical advice and add no keys.

Examples:
"blood will not stop from the shrapnel wound" -> {"protocol":"massive_hemorrhage","triage_level":"Immediate","condition_tags":["arterial_bleed","extremity_wound"],"patient_count":1}
"he collapsed on the dock and is not breathing" -> {"protocol":"cpr_drowning","triage_level":"Immediate","condition_tags":["unresponsive","not_breathing"],"patient_count":1}
"radio base for a supply drop" -> {"protocol":"out_of_scope","triage_level":"Unknown","condition_tags":[],"patient_count":1}`;

type CompletionFinal = {
  contentText?: string;
  content?: string;
  text?: string;
  thinkingText?: string;
  stats?: { tokensPerSecond?: number };
};

type CompletionRun = {
  final?: Promise<CompletionFinal>;
  text?: Promise<string>;
  tokenStream?: AsyncIterable<string>;
};

type QvacModule = {
  loadModel: (opts: {
    modelSrc: unknown;
    modelType?: string;
    fallbackSrc?: string;
    onProgress?: (p: { percentage: number }) => void;
  }) => Promise<string>;
  completion: (opts: Record<string, unknown>) => CompletionRun;
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
    if (this.ready) return;

    const loadStart = performance.now();
    ensureQvacConfig();
    const specifier: string = '@qvac/sdk';
    this.sdk = (await import(specifier)) as unknown as QvacModule;
    this.modelId = await this.loadWeights();
    this.loadMs = Math.round(performance.now() - loadStart);

    const warmStart = performance.now();
    await this.classify(WARMUP_TEXT);
    this.warmMs = Math.round(performance.now() - warmStart);
    this.ready = true;
  }

  /**
   * Prefer the prefetched GGUF. The registry constant is a `registry://` source
   * that is always tried first and only falls back to `fallbackSrc` after it
   * fails, so it is reserved for the cold cache that has to download anyway.
   */
  private async loadWeights(): Promise<string> {
    const cached = findCachedModel(MODEL_FILE_NAME);
    if (cached) {
      return this.sdk!.loadModel({ modelSrc: cached, modelType: MODEL_TYPE });
    }

    const modelSrc =
      this.sdk!.QWEN3_600M_INST_Q4 ??
      this.sdk!.QWEN3_600M_INST_Q4_0 ??
      this.sdk!.LLAMA_3_2_1B_INST_Q4_0;
    if (!modelSrc) {
      throw new Error('QVAC SDK loaded but no supported model constant was found');
    }
    return this.sdk!.loadModel({ modelSrc, fallbackSrc: MODEL_FALLBACK_SRC });
  }

  async classify(text: string): Promise<Classification> {
    if (!this.sdk || !this.modelId) {
      throw new Error('QvacEngine.warmup() must run before classify()');
    }

    const attempt = async (temp: number): Promise<Classification> => {
      const result = this.sdk!.completion({
        modelId: this.modelId,
        history: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        stream: true,
        captureThinking: false,
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'classification',
            schema: classificationJsonSchema(),
          },
        },
        generationParams: { temp },
      });

      const { content, tokensPerSec } = await readCompletion(result);
      if (tokensPerSec > 0) this.lastTokS = tokensPerSec;
      const parsed = JSON.parse(extractJsonObject(content)) as unknown;
      return parseClassification(parsed);
    };

    try {
      const start = performance.now();
      const first = await attempt(0);
      if (this.lastTokS === 0) {
        const elapsed = (performance.now() - start) / 1000;
        this.lastTokS = elapsed > 0 ? Number((32 / elapsed).toFixed(1)) : this.lastTokS;
      }
      return first;
    } catch {
      try {
        return await attempt(0.2);
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

async function readCompletion(result: CompletionRun): Promise<{ content: string; tokensPerSec: number }> {
  let tokensPerSec = 0;
  if (result.final) {
    const final = await result.final;
    if (typeof final.stats?.tokensPerSecond === 'number' && Number.isFinite(final.stats.tokensPerSecond)) {
      tokensPerSec = Number(final.stats.tokensPerSecond.toFixed(1));
    }
    const value = final.contentText ?? final.content ?? final.text;
    if (value) return { content: value, tokensPerSec };
  }
  if (result.text) {
    const content = await result.text;
    if (content) return { content, tokensPerSec };
  }
  if (result.tokenStream) {
    let acc = '';
    for await (const token of result.tokenStream) acc += token;
    if (acc) return { content: acc, tokensPerSec };
  }
  throw new Error('QVAC completion returned no text');
}
