import {
  Classification,
  FieldReport,
  type InputMode,
  type ModelMeta,
} from '@fieldlink/contract';
import { lookupDirective } from './protocol.ts';
import { scoreAgreement, shouldEscalate } from './lexicon.ts';
import { dedupeTags } from './tags.ts';
import { createId } from './engine.ts';

export type AssembleInput = {
  text: string;
  mode: InputMode;
  classification: Classification;
  modelMeta: ModelMeta;
  incidentId?: string;
  responderId?: string;
  reportId?: string;
};

export function assembleReport(input: AssembleInput): FieldReport {
  const tags = dedupeTags(input.classification.condition_tags);
  let protocol = input.classification.protocol;
  let triage = input.classification.triage_level;

  if (shouldEscalate(input.text, protocol)) {
    protocol = 'out_of_scope';
    triage = 'Unknown';
  }

  const confidence = scoreAgreement(input.text, protocol);
  const directive = lookupDirective(protocol);

  return FieldReport.parse({
    protocol,
    triage_level: triage,
    condition_tags: protocol === 'out_of_scope' ? [] : tags,
    patient_count: input.classification.patient_count ?? 1,
    report_id: input.reportId ?? createId('RPT'),
    incident_id: input.incidentId ?? process.env.INCIDENT_ID ?? 'INC-DEMO',
    responder_id: input.responderId ?? process.env.RESPONDER_ID ?? 'UNIT-7',
    timestamp: new Date().toISOString(),
    raw_input: { mode: input.mode, text: input.text },
    confidence,
    directive,
    model_meta: input.modelMeta,
  });
}

export function parseClassification(raw: unknown): Classification {
  const candidate = raw as { condition_tags?: string[] };
  if (candidate && Array.isArray(candidate.condition_tags)) {
    return Classification.parse({
      ...candidate,
      condition_tags: dedupeTags(candidate.condition_tags),
    });
  }
  return Classification.parse(raw);
}
