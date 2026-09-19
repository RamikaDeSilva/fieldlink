import { CONDITION_TAGS, type ConditionTag } from '@fieldlink/contract';

const TAG_SET = new Set<string>(CONDITION_TAGS);

export function dedupeTags(tags: readonly string[]): ConditionTag[] {
  const out: ConditionTag[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (!TAG_SET.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag as ConditionTag);
    if (out.length >= 4) break;
  }
  return out;
}
