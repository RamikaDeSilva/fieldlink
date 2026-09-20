import { describe, expect, it } from 'vitest';
import { Classification, fixtures } from '@fieldlink/contract';
import {
  ScriptedEngine,
  assembleReport,
  dedupeTags,
  extractJsonObject,
  loadAndWarmEngine,
  lookupDirective,
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

describe('json slice helper', () => {
  it('pulls an object out of think-tags and stray whitespace', () => {
    const raw = `
<think> The victim is bleeding. </think>
  { "protocol": "massive_hemorrhage", "triage_level": "Immediate", "condition_tags": ["arterial_bleed"] }
`;
    const sliced = extractJsonObject(raw);
    expect(sliced.startsWith('{')).toBe(true);
    expect(sliced.endsWith('}')).toBe(true);
    expect(JSON.parse(sliced).protocol).toBe('massive_hemorrhage');
  });

  it('throws when no object is present', () => {
    expect(() => extractJsonObject('no json here')).toThrow('no_json_object');
  });
});

describe('loadAndWarmEngine', () => {
  it('warms scripted without touching QVAC', async () => {
    const engine = await loadAndWarmEngine('scripted');
    expect(engine.health().engine).toBe('scripted');
    expect(engine.health().status).toBe('ready');
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

  it('escalates when the model and lexicon disagree', () => {
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
    expect(report.protocol).toBe('out_of_scope');
    expect(report.directive.source).toBe('protocol_table');
    expect(report.directive.protocol_id).toBe('out_of_scope');
  });
});
