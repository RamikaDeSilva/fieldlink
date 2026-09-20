export type { LlmEngine } from './engine.ts';
export { createId } from './engine.ts';
export { ScriptedEngine } from './scripted.ts';
export { createEngine, loadEngine, loadTranscriber, resolveEngineKind } from './factory.ts';
export type { EngineKind } from './factory.ts';
export { PROTOCOL_TABLE, lookupDirective } from './protocol.ts';
export {
  PROTOCOL_LEXICON,
  CONFIDENCE_THRESHOLD,
  scoreAgreement,
  shouldEscalate,
  lexiconHits,
} from './lexicon.ts';
export { assembleReport, parseClassification, extractJsonObject } from './assemble.ts';
export { dedupeTags } from './tags.ts';
export { transcribeWithEngine, speakWithEngine } from './voice.ts';
export {
  WhisperTinyTranscriber,
  decodePcmWave,
  encodeBrowserPcmWave,
  encodePcm16kWave,
  inspectPcmWave,
} from './whisper.ts';
export type { VoiceTranscriber, VoiceHealth } from './whisper.ts';
export { QvacWhisperTranscriber } from './qvac-voice.ts';
