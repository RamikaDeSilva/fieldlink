import { z } from 'zod';

export const PROTOCOLS = ['cpr_drowning', 'massive_hemorrhage', 'out_of_scope'] as const;
export const TRIAGE_LEVELS = [
  'Immediate',
  'Delayed',
  'Minimal',
  'Expectant',
  'Unknown',
] as const;
export const CONDITION_TAGS = [
  'unresponsive',
  'not_breathing',
  'no_pulse',
  'water_immersion',
  'arterial_bleed',
  'extremity_wound',
  'conscious',
  'airway_obstructed',
] as const;
export const INPUT_MODES = ['voice', 'text'] as const;

export type Protocol = (typeof PROTOCOLS)[number];
export type TriageLevel = (typeof TRIAGE_LEVELS)[number];
export type ConditionTag = (typeof CONDITION_TAGS)[number];
export type InputMode = (typeof INPUT_MODES)[number];

/** What the model is allowed to emit. Nothing else. */
export const Classification = z
  .object({
    protocol: z.enum(PROTOCOLS),
    triage_level: z.enum(TRIAGE_LEVELS),
    condition_tags: z.array(z.enum(CONDITION_TAGS)).max(4),
    // Optional at the grammar layer; Zod fills 1 when the model stays silent.
    patient_count: z.number().int().min(1).max(20).default(1),
  })
  .strict();

export type Classification = z.infer<typeof Classification>;

export const RawInput = z.object({
  mode: z.enum(INPUT_MODES),
  text: z.string(),
});

export const Directive = z.object({
  protocol_id: z.string(),
  steps: z.array(z.string()),
  source: z.literal('protocol_table'),
});

export const ModelMeta = z.object({
  model: z.string(),
  tokens_per_sec: z.number(),
  latency_ms: z.number(),
});

export type RawInput = z.infer<typeof RawInput>;
export type Directive = z.infer<typeof Directive>;
export type ModelMeta = z.infer<typeof ModelMeta>;

export const FieldReport = Classification.extend({
  report_id: z.string(),
  incident_id: z.string(),
  responder_id: z.string(),
  timestamp: z.string().datetime(),
  raw_input: RawInput,
  confidence: z.number().min(0).max(1),
  directive: Directive,
  model_meta: ModelMeta,
});

export type FieldReport = z.infer<typeof FieldReport>;

export const Envelope = z.object({
  seq: z.number().int().min(0),
  report_id: z.string(),
  sent_at: z.string().datetime(),
  payload: FieldReport,
});

export type Envelope = z.infer<typeof Envelope>;

export const HealthStatus = z.object({
  status: z.enum(['loading', 'ready']),
  model: z.string(),
  load_ms: z.number(),
  warm_ms: z.number(),
  engine: z.string(),
  net_profile: z.string().optional(),
});

export type HealthStatus = z.infer<typeof HealthStatus>;
