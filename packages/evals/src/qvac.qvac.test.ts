import { describe, expect, it } from 'vitest';
import { loadEngine } from '@fieldlink/triage';
import { EVAL_CORPUS } from './corpus.ts';
import { assembleReport } from '@fieldlink/triage';

const enabled = process.env.EVAL_ENGINE === 'qvac';

describe.skipIf(!enabled)('eval corpus against QvacEngine', () => {
  it('classifies the first hemorrhage, CPR, and out-of-scope probes', async () => {
    const engine = await loadEngine('qvac');
    await engine.warmup();
    const sample = [
      EVAL_CORPUS.find((c) => c.id === 'hem-01')!,
      EVAL_CORPUS.find((c) => c.id === 'cpr-01')!,
      EVAL_CORPUS.find((c) => c.id === 'oos-01')!,
    ];
    for (const item of sample) {
      const classification = await engine.classify(item.text);
      const report = assembleReport({
        text: item.text,
        mode: 'text',
        classification,
        modelMeta: { model: 'qvac', tokens_per_sec: 0, latency_ms: 1 },
      });
      expect(report.protocol).toBe(item.protocol);
    }
  });
});
