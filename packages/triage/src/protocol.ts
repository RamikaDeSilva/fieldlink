import type { Protocol } from '@fieldlink/contract';

export type ProtocolEntry = {
  protocol_id: Protocol;
  steps: string[];
};

export const PROTOCOL_TABLE: Record<Protocol, ProtocolEntry> = {
  cpr_drowning: {
    protocol_id: 'cpr_drowning',
    steps: [
      'Confirm scene safety. Remove the victim from water. Do not delay compressions to drain water.',
      'Check responsiveness and pulse. If unresponsive and not breathing normally, begin CPR.',
      '30 chest compressions to 2 rescue breaths. Rate 100–120/min, depth 5–6 cm.',
      'If trained and equipped, attach an AED and follow prompts.',
      'Continue until signs of life or HQ directs otherwise.',
    ],
  },
  massive_hemorrhage: {
    protocol_id: 'massive_hemorrhage',
    steps: [
      'Expose the wound. Identify life-threatening bleeding.',
      'Apply firm direct pressure. Pack the wound if it is junctional.',
      'If an extremity bleed is not controlled, apply a tourniquet 5–8 cm above the wound, not over a joint.',
      'Note the time of application. Do not loosen the tourniquet.',
      'Reassess. Escalate to HQ if bleeding continues.',
    ],
  },
  out_of_scope: {
    protocol_id: 'out_of_scope',
    steps: [
      'Do not improvise care outside the loaded protocols.',
      'Escalate to the HQ voice channel now.',
      'Keep the patient still, maintain scene safety, and await directed orders.',
    ],
  },
};

export function lookupDirective(protocol: Protocol): {
  protocol_id: Protocol;
  steps: string[];
  source: 'protocol_table';
} {
  const entry = PROTOCOL_TABLE[protocol];
  return {
    protocol_id: entry.protocol_id,
    steps: [...entry.steps],
    source: 'protocol_table',
  };
}
