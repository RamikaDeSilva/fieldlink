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
