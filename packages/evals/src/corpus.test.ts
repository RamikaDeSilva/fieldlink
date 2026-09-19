import { describe, expect, it } from 'vitest';
import { ScriptedEngine, assembleReport } from '@fieldlink/triage';
import { EVAL_CORPUS } from './corpus.ts';

describe('eval corpus against ScriptedEngine', () => {
  const engine = new ScriptedEngine();

  it('covers at least 20 hemorrhage and 20 CPR phrasings', () => {
    const hem = EVAL_CORPUS.filter((c) => c.protocol === 'massive_hemorrhage');
    const cpr = EVAL_CORPUS.filter((c) => c.protocol === 'cpr_drowning');
    const oos = EVAL_CORPUS.filter((c) => c.protocol === 'out_of_scope');
    expect(hem.length).toBeGreaterThanOrEqual(20);
    expect(cpr.length).toBeGreaterThanOrEqual(20);
    expect(oos.length).toBeGreaterThanOrEqual(8);
  });

  it.each(EVAL_CORPUS)('$id → $protocol / $triage_level', async (item) => {
    const classification = await engine.classify(item.text);
    const report = assembleReport({
      text: item.text,
      mode: 'text',
      classification,
      modelMeta: { model: 'scripted', tokens_per_sec: 0, latency_ms: 1 },
    });
    expect(report.protocol).toBe(item.protocol);
    expect(report.triage_level).toBe(item.triage_level);
    expect(report.directive.source).toBe('protocol_table');
    expect(report.directive.protocol_id).toBe(item.protocol);
  });
});
