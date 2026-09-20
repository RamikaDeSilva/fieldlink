import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  Classification,
  classificationJsonSchema,
  type HealthStatus,
} from '@fieldlink/contract';
import type { LlmEngine } from './engine.ts';
import { parseClassification } from './assemble.ts';

const WARMUP_TEXT = 'victim unresponsive, not breathing';
const SYSTEM_PROMPT = `/no_think
Classify each field sitrep into exactly one existing protocol. Do not treat patients. Do not invent protocols.

cpr_drowning: drowning or water immersion, unresponsive and not breathing, cardiac or respiratory arrest, or CPR already underway.
massive_hemorrhage: life-threatening bleeding, arterial spray, major wounds or amputations with heavy blood loss.
out_of_scope: questions, advice requests, and any injury that is not drowning/arrest and not life-threatening bleeding.

Use Immediate for cpr_drowning and massive_hemorrhage. Use Unknown and no tags for out_of_scope.
condition_tags: up to 4 of unresponsive, not_breathing, no_pulse, water_immersion, arterial_bleed, extremity_wound, conscious, airway_obstructed.
Reply with one JSON object only. Judge by meaning, including informal spelling.`;

const FALLBACK = Classification.parse({
  protocol: 'out_of_scope',
  triage_level: 'Unknown',
  condition_tags: [],
});

export type QvacModule = {
  loadModel: (opts: {
    modelSrc: unknown;
    modelType?: string;
    modelConfig?: Record<string, unknown>;
    onProgress?: (p: { percentage: number }) => void;
  }) => Promise<string>;
  completion: (opts: Record<string, unknown>) => {
    final?: Promise<{
      content?: string;
      text?: string;
      contentText?: string;
      stats?: { tokensPerSecond?: number };
    }>;
    text?: Promise<string>;
    tokenStream?: AsyncIterable<string>;
  };
  transcribe?: (opts: { modelId: string; audioChunk: Buffer | string; prompt?: string }) => Promise<string>;
  unloadModel?: (opts: { modelId: string }) => Promise<void>;
  QWEN3_600M_INST_Q4?: unknown;
  QWEN3_600M_INST_Q4_0?: unknown;
  LLAMA_3_2_1B_INST_Q4_0?: unknown;
  WHISPER_EN_TINY_Q8_0?: unknown;
  WHISPER_TINY_Q8_0?: unknown;
  WHISPER_TINY?: unknown;
};

const nodeRequire = createRequire(import.meta.url);
const nativeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<QvacModule & { default?: QvacModule }>;

function isViteRunnerClosed(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Vite module runner has been closed');
}

function unwrapSdk(imported: QvacModule & { default?: QvacModule }): QvacModule | null {
  const sdk = typeof imported.loadModel === 'function' ? imported : (imported.default ?? imported);
  return typeof sdk.loadModel === 'function' ? sdk : null;
}

export async function importQvacSdk(): Promise<QvacModule> {
  try {
    const imported = (await import('@qvac/sdk')) as unknown as QvacModule & { default?: QvacModule };
    const sdk = unwrapSdk(imported);
    if (sdk) return sdk;
  } catch (error) {
    if (!isViteRunnerClosed(error)) throw error;
  }

  const resolved = nodeRequire.resolve('@qvac/sdk');
  const imported = await nativeImport(pathToFileURL(resolved).href);
  const sdk = unwrapSdk(imported);
  if (!sdk) throw new Error('QVAC SDK loaded but loadModel() was missing');
  return sdk;
}

export function findFieldlinkRoot(start = fileURLToPath(new URL('.', import.meta.url))): string {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    const pkgPath = resolve(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
        if (pkg.name === 'fieldlink') return dir;
      } catch {
        // keep walking
      }
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

export function resolveQvacModelSrc(sdk: QvacModule): unknown {
  return sdk.QWEN3_600M_INST_Q4 ?? sdk.QWEN3_600M_INST_Q4_0 ?? sdk.LLAMA_3_2_1B_INST_Q4_0;
}

export function resolveQvacWhisperSrc(sdk: QvacModule): unknown {
  return sdk.WHISPER_EN_TINY_Q8_0 ?? sdk.WHISPER_TINY_Q8_0 ?? sdk.WHISPER_TINY;
}

export function ensureQvacRuntimeConfig(cwd = findFieldlinkRoot()): string {
  const cacheDirectory = resolve(cwd, '.qvac');
  mkdirSync(cacheDirectory, { recursive: true });
  const configPath = resolve(cacheDirectory, 'runtime-config.json');
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        loggerLevel: 'info',
        loggerConsoleOutput: true,
        cacheDirectory,
        httpDownloadConcurrency: 3,
        httpConnectionTimeoutMs: 10_000,
      },
      null,
      2,
    )}\n`,
  );
  process.env.QVAC_CONFIG_PATH = configPath;
  return configPath;
}

export class QvacEngine implements LlmEngine {
  private ready = false;
  private loadMs = 0;
  private warmMs = 0;
  private modelId: string | null = null;
  private sdk: QvacModule | null = null;
  private lastTokS = 0;
  private lastError: string | undefined;

  health(): HealthStatus {
    return {
      status: this.ready ? 'ready' : 'loading',
      model: 'qwen3-0.6b-q4',
      load_ms: this.loadMs,
      warm_ms: this.warmMs,
      engine: 'qvac',
      ...(this.lastError ? { error: this.lastError } : {}),
    };
  }

  async warmup(): Promise<void> {
    const loadStart = performance.now();
    ensureQvacRuntimeConfig();
    this.lastError = undefined;
    try {
      this.sdk = await importQvacSdk();
      const modelSrc = resolveQvacModelSrc(this.sdk);
      if (!modelSrc) {
        throw new Error('QVAC SDK loaded but no supported model constant was found');
      }
      this.modelId = await this.sdk.loadModel({
        modelSrc,
        modelType: 'llm',
        modelConfig: { ctx_size: 2048 },
      });
      this.loadMs = Math.round(performance.now() - loadStart);

      const warmStart = performance.now();
      await this.classify(WARMUP_TEXT);
      this.warmMs = Math.round(performance.now() - warmStart);
      this.ready = true;
    } catch (error) {
      this.ready = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async classify(text: string): Promise<Classification> {
    if (!this.sdk || !this.modelId) {
      throw new Error('QvacEngine.warmup() must run before classify()');
    }

    const attempt = async (retryHint: boolean): Promise<Classification> => {
      const result = this.sdk!.completion({
        modelId: this.modelId,
        kvCache: false,
        history: [
          {
            role: 'system',
            content: retryHint
              ? `${SYSTEM_PROMPT}\nThe previous reply was invalid. Return one JSON object and nothing else.`
              : SYSTEM_PROMPT,
          },
          { role: 'user', content: `Classify this sitrep:\n${text}` },
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
        generationParams: {
          temp: 0,
          seed: 1,
          predict: 192,
          reasoning_budget: 0,
          remove_thinking_from_context: true,
        },
      });

      const content = await readCompletion(result);
      return parseClassification(content);
    };

    try {
      const start = performance.now();
      const first = await attempt(false);
      const elapsed = (performance.now() - start) / 1000;
      this.lastTokS = elapsed > 0 ? Number((32 / elapsed).toFixed(1)) : this.lastTokS;
      this.lastError = undefined;
      return first;
    } catch (firstError) {
      try {
        return await attempt(true);
      } catch {
        this.lastError = firstError instanceof Error ? firstError.message : 'malformed_classification';
        return FALLBACK;
      }
    }
  }

  tokensPerSec(): number {
    return this.lastTokS;
  }
}

export async function readCompletion(result: {
  final?: Promise<{
    content?: string;
    text?: string;
    contentText?: string;
    stats?: { tokensPerSecond?: number };
  }>;
  text?: Promise<string>;
  tokenStream?: AsyncIterable<string>;
}): Promise<string> {
  if (result.final) {
    const final = await result.final;
    const value = final.contentText ?? final.content ?? final.text;
    if (value) return value;
  }
  if (result.text) return result.text;
  if (result.tokenStream) {
    let acc = '';
    for await (const token of result.tokenStream) acc += token;
    if (acc) return acc;
  }
  throw new Error('QVAC completion returned no text');
}
