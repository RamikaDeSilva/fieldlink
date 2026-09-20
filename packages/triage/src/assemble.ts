import {
  Classification,
  FieldReport,
  type InputMode,
  type ModelMeta,
} from '@fieldlink/contract';
import { lookupDirective } from './protocol.ts';
import { scoreAgreement } from './lexicon.ts';
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
  const protocol = input.classification.protocol;
  const triage = input.classification.triage_level;
  const tags = protocol === 'out_of_scope' ? [] : dedupeTags(input.classification.condition_tags, protocol);
  const confidence = scoreAgreement(input.text, protocol);
  const directive = lookupDirective(protocol);

  return FieldReport.parse({
    protocol,
    triage_level: triage,
    condition_tags: tags,
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

export function extractJsonObject(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') throw new Error('malformed_classification');

  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('malformed_classification');
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  } catch {
    throw new Error('malformed_classification');
  }
}

export function parseClassification(raw: unknown): Classification {
  const candidate = extractJsonObject(raw);
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('malformed_classification');
  }
  const record = candidate as Record<string, unknown>;
  const tags = Array.isArray(record.condition_tags)
    ? dedupeTags(record.condition_tags.filter((tag): tag is string => typeof tag === 'string'))
    : [];
  return Classification.parse({
    protocol: record.protocol,
    triage_level: record.triage_level,
    condition_tags: tags,
    ...(typeof record.patient_count === 'number' ? { patient_count: record.patient_count } : {}),
  });
}
