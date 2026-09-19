import type { FieldReport, TriageLevel } from '@fieldlink/contract';

export const RADIO_SECONDS_PER_SITREP = 45;
export const ESTIMATED_VOICE_BYTES_PER_SITREP = 64_000;

export type TriageCounts = Record<TriageLevel, number>;

export function emptyCounts(): TriageCounts {
  return {
    Immediate: 0,
    Delayed: 0,
    Minimal: 0,
    Expectant: 0,
    Unknown: 0,
  };
}

export function aggregateByTriage(reports: FieldReport[]): TriageCounts {
  const counts = emptyCounts();
  for (const report of reports) {
    counts[report.triage_level] += 1;
  }
  return counts;
}

export type CommsReduction = {
  reports: number;
  bytesTransmitted: number;
  radioSecondsSaved: number;
  equivalentVoiceBytes: number;
  compressionRatio: number;
};

export function commsReduction(reports: FieldReport[], bytesTransmitted: number): CommsReduction {
  const radioSecondsSaved = reports.length * RADIO_SECONDS_PER_SITREP;
  const equivalentVoiceBytes = reports.length * ESTIMATED_VOICE_BYTES_PER_SITREP;
  return {
    reports: reports.length,
    bytesTransmitted,
    radioSecondsSaved,
    equivalentVoiceBytes,
    compressionRatio:
      bytesTransmitted === 0 ? 0 : Number((equivalentVoiceBytes / bytesTransmitted).toFixed(1)),
  };
}
