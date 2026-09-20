import type { LlmEngine } from './engine.ts';
import { ScriptedEngine } from './scripted.ts';

export type EngineKind = 'scripted' | 'qvac';

export function resolveEngineKind(raw = process.env.ENGINE): EngineKind {
  return raw === 'qvac' ? 'qvac' : 'scripted';
}

export function createEngine(kind: EngineKind = resolveEngineKind()): LlmEngine {
  if (kind === 'qvac') {
    throw new Error('QVAC must be loaded with loadEngine() so @qvac/sdk stays optional');
  }
  return new ScriptedEngine();
}

export async function loadEngine(kind: EngineKind = resolveEngineKind()): Promise<LlmEngine> {
  if (kind === 'qvac') {
    const { QvacEngine } = await import('./qvac.ts');
    return new QvacEngine();
  }
  return new ScriptedEngine();
}

/** Warm an engine. QVAC failures fall back to scripted so Send is never stuck. */
export async function loadAndWarmEngine(
  kind: EngineKind = resolveEngineKind(),
): Promise<LlmEngine> {
  if (kind !== 'qvac') {
    const engine = new ScriptedEngine();
    await engine.warmup();
    return engine;
  }

  try {
    const engine = await loadEngine('qvac');
    await engine.warmup();
    return engine;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[fieldlink] QVAC warmup failed; falling back to ScriptedEngine: ${message}`);
    const fallback = new ScriptedEngine();
    await fallback.warmup();
    return fallback;
  }
}
