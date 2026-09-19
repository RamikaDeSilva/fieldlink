import type { Protocol, TriageLevel } from '@fieldlink/contract';

export type EvalCase = {
  id: string;
  text: string;
  protocol: Protocol;
  triage_level: TriageLevel;
};

export const HEMORRHAGE_CASES: EvalCase[] = [
  { id: 'hem-01', text: "he's bleeding out", protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-02', text: 'there is blood everywhere', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-03', text: 'massive laceration on his thigh', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-04', text: 'arterial bleed from the left arm', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-05', text: 'blood spurting from the wound', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-06', text: 'need a tourniquet now, gush of blood', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-07', text: 'leg amputation, heavy bleeding', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-08', text: 'junctional wound, blood soaked through the dressing', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-09', text: 'hemorrhage from the femoral artery', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-10', text: "she's bleeding really bad from her arm", protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-11', text: 'haemorrhage not stopping with pressure', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-12', text: 'deep laceration, blood pooling on the ground', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-13', text: 'conscious but bleeding out fast', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-14', text: 'apply tourniquet, arterial spray', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-15', text: 'open wound on the thigh, blood everywhere', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-16', text: 'partially amputated hand, heavy bleed', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-17', text: 'I can see the artery, blood spurting', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-18', text: 'dressing is soaked, still bleeding', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-19', text: 'life threatening hemorrhage on the lower leg', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
  { id: 'hem-20', text: 'gush of blood from a laceration, he is talking', protocol: 'massive_hemorrhage', triage_level: 'Immediate' },
];

export const CPR_CASES: EvalCase[] = [
  { id: 'cpr-01', text: 'victim pulled from water, unresponsive', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-02', text: 'pulled from the water, not breathing', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-03', text: 'unresponsive, no pulse, starting CPR', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-04', text: 'drowning, unresponsive, beginning compressions', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-05', text: 'found underwater, not breathing', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-06', text: 'child pulled from pool, no pulse', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-07', text: 'unconscious after immersion, starting CPR', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-08', text: 'water in the lungs, unresponsive, not breathing', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-09', text: 'no pulse after drowning, continue compressions', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-10', text: 'rescued from water, airway not clear, unresponsive', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-11', text: 'adult drowned, not breathing, I am doing CPR', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-12', text: 'unresponsive swimmer, no pulse', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-13', text: 'starting compressions, victim unresponsive, pulled from water', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-14', text: 'not breathing after water immersion', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-15', text: 'pulse absent, drowned, beginning CPR', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-16', text: 'unconscious in the water, pulled out, not breathing', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-17', text: 'airway issue after drowning, unresponsive', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-18', text: 'I have no pulse, victim pulled from water', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-19', text: 'doing compressions on an unresponsive drowning victim', protocol: 'cpr_drowning', triage_level: 'Immediate' },
  { id: 'cpr-20', text: 'not breathing, starting CPR after water rescue', protocol: 'cpr_drowning', triage_level: 'Immediate' },
];

export const OUT_OF_SCOPE_CASES: EvalCase[] = [
  { id: 'oos-01', text: "what's the weather", protocol: 'out_of_scope', triage_level: 'Unknown' },
  { id: 'oos-02', text: 'how do I treat a snakebite', protocol: 'out_of_scope', triage_level: 'Unknown' },
  { id: 'oos-03', text: 'patient has a mild headache', protocol: 'out_of_scope', triage_level: 'Unknown' },
  { id: 'oos-04', text: 'where is the nearest hospital', protocol: 'out_of_scope', triage_level: 'Unknown' },
  { id: 'oos-05', text: 'how do I splint a possible ankle sprain', protocol: 'out_of_scope', triage_level: 'Unknown' },
  { id: 'oos-06', text: 'what time is it', protocol: 'out_of_scope', triage_level: 'Unknown' },
  { id: 'oos-07', text: 'requesting a sandwich', protocol: 'out_of_scope', triage_level: 'Unknown' },
  { id: 'oos-08', text: 'how do I treat hypothermia', protocol: 'out_of_scope', triage_level: 'Unknown' },
  { id: 'oos-09', text: 'patient is asking for their phone', protocol: 'out_of_scope', triage_level: 'Unknown' },
  { id: 'oos-10', text: 'can you write a poem about rescue', protocol: 'out_of_scope', triage_level: 'Unknown' },
];

export const EVAL_CORPUS: EvalCase[] = [
  ...HEMORRHAGE_CASES,
  ...CPR_CASES,
  ...OUT_OF_SCOPE_CASES,
];
