import { describe, expect, it } from 'vitest';
import { fixtures } from '@fieldlink/contract';
import { aggregateByTriage, commsReduction, RADIO_SECONDS_PER_SITREP } from './stats.ts';

describe('HQ aggregation', () => {
  it('counts triage levels over fixtures', () => {
    const counts = aggregateByTriage(fixtures.reports);
    expect(counts.Immediate).toBe(2);
    expect(counts.Unknown).toBe(1);
    expect(counts.Delayed).toBe(0);
  });

  it('computes comms reduction against analog radio time', () => {
    const bytes = fixtures.reports.reduce((sum, report) => sum + JSON.stringify(report).length, 0);
    const stats = commsReduction(fixtures.reports, bytes);
    expect(stats.reports).toBe(3);
    expect(stats.radioSecondsSaved).toBe(3 * RADIO_SECONDS_PER_SITREP);
    expect(stats.bytesTransmitted).toBe(bytes);
    expect(stats.compressionRatio).toBeGreaterThan(10);
  });
});
