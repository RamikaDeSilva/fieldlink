import { CONDITION_TAGS, type ConditionTag, type Protocol } from '@fieldlink/contract';

const TAG_SET = new Set<string>(CONDITION_TAGS);

const PROTOCOL_TAGS: Record<Protocol, ReadonlySet<string>> = {
  cpr_drowning: new Set([
    'unresponsive',
    'not_breathing',
    'no_pulse',
    'water_immersion',
    'airway_obstructed',
  ]),
  massive_hemorrhage: new Set(['arterial_bleed', 'extremity_wound', 'conscious', 'unresponsive']),
  out_of_scope: new Set(),
};

export function dedupeTags(tags: readonly string[], protocol?: Protocol): ConditionTag[] {
  const allowed = protocol ? PROTOCOL_TAGS[protocol] : TAG_SET;
  const out: ConditionTag[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (!allowed.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag as ConditionTag);
    if (out.length >= 4) break;
  }
  return out;
}
