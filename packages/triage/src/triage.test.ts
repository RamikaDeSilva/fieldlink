import { describe, expect, it } from 'vitest';
import { Classification, fixtures } from '@fieldlink/contract';
import {
  ScriptedEngine,
  assembleReport,
  decodePcmWave,
  encodeBrowserPcmWave,
  inspectPcmWave,
  dedupeTags,
  lookupDirective,
  parseClassification,
  scoreAgreement,
  shouldEscalate,
  transcribeWithEngine,
  type LlmEngine,
} from './index.ts';

describe('protocol table', () => {
  it('matches fixture directive text byte-for-byte', () => {
    for (const report of fixtures.reports) {
      expect(lookupDirective(report.protocol).steps).toEqual(report.directive.steps);
      expect(lookupDirective(report.protocol).source).toBe('protocol_table');
    }
  });
});

describe('scripted engine', () => {
  it('classifies drowning language as Immediate CPR', async () => {
    const engine = new ScriptedEngine();
    const result = await engine.classify(
      'Victim pulled from water, unresponsive, not breathing, starting compressions.',
    );
    expect(result.protocol).toBe('cpr_drowning');
    expect(result.triage_level).toBe('Immediate');
  });

  it('classifies hemorrhage language as Immediate', async () => {
    const engine = new ScriptedEngine();
    const result = await engine.classify(
      "He's bleeding out from a massive laceration on his thigh.",
    );
    expect(result.protocol).toBe('massive_hemorrhage');
    expect(result.triage_level).toBe('Immediate');
  });

  it('defaults patient_count to 1 when the model stays silent', async () => {
    const engine = new ScriptedEngine();
    const result = await engine.classify('there is blood everywhere');
    expect(result.patient_count).toBe(1);
  });

  it('warms up and reports ready', async () => {
    const engine = new ScriptedEngine();
    expect(engine.health().status).toBe('loading');
    await engine.warmup();
    expect(engine.health().status).toBe('ready');
    expect(engine.health().warm_ms).toBeGreaterThan(0);
  });
});

describe('voice stretch', () => {
  it('keeps scripted mode on text — no transcribe hook', async () => {
    const engine: LlmEngine = new ScriptedEngine();
    expect(engine.transcribe).toBeUndefined();
    await expect(transcribeWithEngine(engine, new Uint8Array([0]))).rejects.toThrow(
      'voice_unavailable',
    );
  });
});

describe('classification parse hardening', () => {
  it('extracts JSON from fenced model output and drops extra keys', () => {
    const parsed = parseClassification(`
thinking...
\`\`\`json
{"protocol":"massive_hemorrhage","triage_level":"Immediate","condition_tags":["arterial_bleed","not_a_tag"],"advice":"nope"}
\`\`\`
`);
    expect(parsed.protocol).toBe('massive_hemorrhage');
    expect(parsed.condition_tags).toEqual(['arterial_bleed']);
    expect(parsed.patient_count).toBe(1);
  });

  it('rejects malformed model output', () => {
    expect(() => parseClassification('not json at all')).toThrow('malformed_classification');
  });

  it('decodes a 16-bit PCM WAV for local voice', () => {
    const samples = new Int16Array([0, 16384, -16384]);
    const bytes = new Uint8Array(44 + samples.byteLength);
    const view = new DataView(bytes.buffer);
    const write = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
    };
    write(0, 'RIFF');
    view.setUint32(4, 36 + samples.byteLength, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16_000, true);
    view.setUint32(28, 32_000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, samples.byteLength, true);
    bytes.set(new Uint8Array(samples.buffer), 44);
    expect(decodePcmWave(bytes)).toHaveLength(3);
  });

  it('resamples browser 48 kHz PCM down to 16 kHz Whisper audio', () => {
    const inputRate = 48_000;
    const samples = new Float32Array(inputRate);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.sin((2 * Math.PI * 440 * i) / inputRate);
    const wav = encodeBrowserPcmWave([samples], inputRate);
    const info = inspectPcmWave(wav);
    expect(info).toMatchObject({
      container: 'wav',
      codec: 'pcm_s16le',
      channels: 1,
      sampleRate: 16_000,
      bitsPerSample: 16,
    });
    expect(decodePcmWave(wav).length).toBe(16_000);
  });
});

describe('schema hardening', () => {
  it('dedupes and caps repeated condition tags at 4', () => {
    const raw = [
      'arterial_bleed',
      'arterial_bleed',
      'arterial_bleed',
      'arterial_bleed',
      'arterial_bleed',
      'arterial_bleed',
      'extremity_wound',
    ];
    expect(dedupeTags(raw)).toEqual(['arterial_bleed', 'extremity_wound']);
  });

  it('keeps the model protocol and looks up the existing protocol table', () => {
    expect(shouldEscalate('victim pulled from water, unresponsive', 'massive_hemorrhage')).toBe(
      true,
    );
    expect(scoreAgreement('victim pulled from water, unresponsive', 'massive_hemorrhage')).toBe(
      0,
    );

    const report = assembleReport({
      text: 'victim pulled from water, unresponsive',
      mode: 'text',
      classification: Classification.parse({
        protocol: 'massive_hemorrhage',
        triage_level: 'Immediate',
        condition_tags: ['arterial_bleed'],
      }),
      modelMeta: { model: 'test', tokens_per_sec: 0, latency_ms: 1 },
    });
    expect(report.protocol).toBe('massive_hemorrhage');
    expect(report.directive.source).toBe('protocol_table');
    expect(report.directive.protocol_id).toBe('massive_hemorrhage');

    const paraphrased = assembleReport({
      text: 'he aint wakin up after we dragged him outta the lake',
      mode: 'text',
      classification: Classification.parse({
        protocol: 'cpr_drowning',
        triage_level: 'Immediate',
        condition_tags: ['unresponsive', 'water_immersion'],
      }),
      modelMeta: { model: 'qwen3-0.6b-q4', tokens_per_sec: 0, latency_ms: 1 },
    });
    expect(paraphrased.protocol).toBe('cpr_drowning');
    expect(paraphrased.directive.protocol_id).toBe('cpr_drowning');
  });
});
