import type { LlmEngine } from './engine.ts';

/** Voice is a stretch path. Scripted demos stay on tactical-stealth text. */
export async function transcribeWithEngine(
  engine: LlmEngine,
  audio: Uint8Array,
  mimeType?: string,
): Promise<string> {
  if (!engine.transcribe) {
    throw new Error('voice_unavailable');
  }
  return engine.transcribe(audio, mimeType);
}

export async function speakWithEngine(engine: LlmEngine, text: string): Promise<Uint8Array> {
  if (!engine.speak) {
    throw new Error('tts_unavailable');
  }
  return engine.speak(text);
}
