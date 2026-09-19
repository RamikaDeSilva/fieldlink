import type { FieldReport } from './schema.ts';

export const cprDrowningReport: FieldReport = {
  protocol: 'cpr_drowning',
  triage_level: 'Immediate',
  condition_tags: ['unresponsive', 'not_breathing', 'water_immersion'],
  patient_count: 1,
  report_id: 'RPT-CPR-001',
  incident_id: 'INC-DEMO',
  responder_id: 'UNIT-7',
  timestamp: '2026-09-19T13:45:00Z',
  raw_input: {
    mode: 'text',
    text: 'Victim pulled from water, unresponsive, not breathing, starting compressions.',
  },
  confidence: 1,
  directive: {
    protocol_id: 'cpr_drowning',
    steps: [
      'Confirm scene safety. Remove the victim from water. Do not delay compressions to drain water.',
      'Check responsiveness and pulse. If unresponsive and not breathing normally, begin CPR.',
      '30 chest compressions to 2 rescue breaths. Rate 100–120/min, depth 5–6 cm.',
      'If trained and equipped, attach an AED and follow prompts.',
      'Continue until signs of life or HQ directs otherwise.',
    ],
    source: 'protocol_table',
  },
  model_meta: {
    model: 'scripted',
    tokens_per_sec: 0,
    latency_ms: 4,
  },
};

export const hemorrhageReport: FieldReport = {
  protocol: 'massive_hemorrhage',
  triage_level: 'Immediate',
  condition_tags: ['arterial_bleed', 'extremity_wound', 'conscious'],
  patient_count: 1,
  report_id: 'RPT-HEM-001',
  incident_id: 'INC-DEMO',
  responder_id: 'UNIT-7',
  timestamp: '2026-09-19T13:46:00Z',
  raw_input: {
    mode: 'text',
    text: "He's bleeding out from a massive laceration on his thigh.",
  },
  confidence: 1,
  directive: {
    protocol_id: 'massive_hemorrhage',
    steps: [
      'Expose the wound. Identify life-threatening bleeding.',
      'Apply firm direct pressure. Pack the wound if it is junctional.',
      'If an extremity bleed is not controlled, apply a tourniquet 5–8 cm above the wound, not over a joint.',
      'Note the time of application. Do not loosen the tourniquet.',
      'Reassess. Escalate to HQ if bleeding continues.',
    ],
    source: 'protocol_table',
  },
  model_meta: {
    model: 'scripted',
    tokens_per_sec: 0,
    latency_ms: 3,
  },
};

export const outOfScopeReport: FieldReport = {
  protocol: 'out_of_scope',
  triage_level: 'Unknown',
  condition_tags: [],
  patient_count: 1,
  report_id: 'RPT-OOS-001',
  incident_id: 'INC-DEMO',
  responder_id: 'UNIT-7',
  timestamp: '2026-09-19T13:47:00Z',
  raw_input: {
    mode: 'text',
    text: 'How do I treat a snakebite?',
  },
  confidence: 0,
  directive: {
    protocol_id: 'out_of_scope',
    steps: [
      'Do not improvise care outside the loaded protocols.',
      'Escalate to the HQ voice channel now.',
      'Keep the patient still, maintain scene safety, and await directed orders.',
    ],
    source: 'protocol_table',
  },
  model_meta: {
    model: 'scripted',
    tokens_per_sec: 0,
    latency_ms: 2,
  },
};

export const fixtures = {
  reports: [cprDrowningReport, hemorrhageReport, outOfScopeReport],
  cprDrowningReport,
  hemorrhageReport,
  outOfScopeReport,
};
