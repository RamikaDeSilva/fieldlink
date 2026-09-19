import type { Protocol } from '@fieldlink/contract';

export const PROTOCOL_LEXICON: Record<Exclude<Protocol, 'out_of_scope'>, string[]> = {
  cpr_drowning: [
    'unresponsive',
    'not breathing',
    'no pulse',
    'drowning',
    'drowned',
    'water',
    'cpr',
    'compressions',
    'underwater',
    'pulled from',
    'lungs',
    'airway',
    'pulse',
    'breathing',
    'unconscious',
    'immersion',
  ],
  massive_hemorrhage: [
    'bleeding',
    'bleeding out',
    'blood',
    'hemorrhage',
    'haemorrhage',
    'laceration',
    'tourniquet',
    'spurting',
    'gush',
    'wound',
    'artery',
    'arterial',
    'amputation',
    'amputated',
    'bleed',
    'soaked',
  ],
};

export const CONFIDENCE_THRESHOLD = 0.34;

export function lexiconHits(text: string, protocol: Exclude<Protocol, 'out_of_scope'>): string[] {
  const lower = text.toLowerCase();
  return PROTOCOL_LEXICON[protocol].filter((term) => matchesTerm(lower, term));
}

function matchesTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(haystack);
}

/** Deterministic cross-check: how strongly the transcript matches the chosen protocol. */
export function scoreAgreement(text: string, protocol: Protocol): number {
  if (protocol === 'out_of_scope') return 0;
  const hits = lexiconHits(text, protocol);
  return Math.min(1, hits.length / 3);
}

export function shouldEscalate(text: string, protocol: Protocol): boolean {
  if (protocol === 'out_of_scope') return false;
  return lexiconHits(text, protocol).length === 0;
}
