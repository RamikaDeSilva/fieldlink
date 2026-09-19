import { describe, expect, it } from 'vitest';
import {
  Classification,
  FieldReport,
  Envelope,
  fixtures,
  classificationJsonSchema,
  assertGbnfLegal,
} from './index.ts';

describe('contract', () => {
  it('validates every fixture as a FieldReport', () => {
    for (const report of fixtures.reports) {
      expect(FieldReport.parse(report).report_id).toBe(report.report_id);
      expect(report.directive.source).toBe('protocol_table');
    }
  });

  it('defaults missing patient_count to 1', () => {
    const parsed = Classification.parse({
      protocol: 'massive_hemorrhage',
      triage_level: 'Immediate',
      condition_tags: ['arterial_bleed'],
    });
    expect(parsed.patient_count).toBe(1);
  });

  it('rejects more than 4 condition tags', () => {
    expect(() =>
      Classification.parse({
        protocol: 'cpr_drowning',
        triage_level: 'Immediate',
        condition_tags: [
          'unresponsive',
          'not_breathing',
          'no_pulse',
          'water_immersion',
          'conscious',
        ],
      }),
    ).toThrow();
  });

  it('rejects extra keys on Classification', () => {
    expect(() =>
      Classification.parse({
        protocol: 'out_of_scope',
        triage_level: 'Unknown',
        condition_tags: [],
        confidence: 0.95,
      }),
    ).toThrow();
  });

  it('emits a GBNF-legal JSON Schema', () => {
    const schema = classificationJsonSchema();
    assertGbnfLegal(schema);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(
      expect.arrayContaining(['protocol', 'triage_level', 'condition_tags']),
    );
    expect(schema.required).not.toContain('patient_count');
    expect(schema.required).not.toContain('confidence');
    expect(JSON.stringify(schema)).not.toContain('"confidence"');

    const tags = (schema.properties as Record<string, { maxItems?: number }>)
      .condition_tags;
    expect(tags?.maxItems).toBe(4);
  });

  it('round-trips an Envelope around a fixture', () => {
    const envelope = Envelope.parse({
      seq: 0,
      report_id: fixtures.cprDrowningReport.report_id,
      sent_at: '2026-09-19T13:45:01Z',
      payload: fixtures.cprDrowningReport,
    });
    expect(envelope.payload.directive.source).toBe('protocol_table');
  });
});
