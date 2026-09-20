import { GUIDE_BY_ID } from './guides.ts';
import type {
  FollowUpKey,
  GuideId,
  Hazard,
  Household,
  ModelAnalysis,
  PlanItem,
  PlanRequest,
} from './types.ts';

const FOLLOW_UP_QUESTIONS: Record<FollowUpKey, string> = {
  describe_hazard: 'What can you see, hear, or smell, and is anyone injured?',
  location_safety: 'Are you indoors, outdoors, or in a vehicle, and is that location currently safe?',
  injuries: 'Is anyone unresponsive, not breathing normally, or bleeding heavily?',
  official_order: 'Have local officials issued an evacuation or shelter-in-place order?',
};

export type DeterministicResult = {
  forcedGuideIds: GuideId[];
  hazards: Hazard[];
  immediateDanger: boolean;
  medicalAdviceRequest: boolean;
  tooVague: boolean;
};

function matches(text: string, expression: RegExp): boolean {
  return expression.test(text.toLowerCase());
}

export function deterministicChecks(request: PlanRequest): DeterministicResult {
  const text = request.situation.trim();
  const forcedGuideIds: GuideId[] = [];
  const hazards: Hazard[] = [];
  let immediateDanger = false;

  if (matches(text, /unresponsive|not breathing|isn't breathing|no pulse|cardiac arrest/)) {
    forcedGuideIds.push('adult-cpr');
    hazards.push('cardiac_arrest');
    immediateDanger = true;
  }
  if (matches(text, /blood (?:is )?spurting|spurting blood|uncontrolled bleeding|bleeding (?:won't|will not) stop|severe bleeding/)) {
    forcedGuideIds.push('severe-bleeding');
    hazards.push('severe_bleeding');
    immediateDanger = true;
  }
  if (matches(text, /(?:house|building|room|kitchen) (?:is )?on fire|smell(?:s|ing)? (?:of )?gas|building (?:is )?collaps|active flood|rising floodwater/)) {
    forcedGuideIds.push('immediate-danger');
    hazards.push('immediate_danger');
    immediateDanger = true;
  }

  const medicalAdviceRequest = matches(text, /what (?:prescription|medicine|medication|drug|dose)|should i take|diagnose|change my dose|stop taking/);
  if (medicalAdviceRequest) {
    return {
      forcedGuideIds: ['medical-boundary'],
      hazards: ['medication'],
      immediateDanger: false,
      medicalAdviceRequest: true,
      tooVague: false,
    };
  }

  return {
    forcedGuideIds,
    hazards,
    immediateDanger,
    medicalAdviceRequest: false,
    tooVague: text.split(/\s+/).filter(Boolean).length < 5 && forcedGuideIds.length === 0,
  };
}

function householdGuides(household: Household): GuideId[] {
  const ids: GuideId[] = [];
  if (household.medicationNeeds) ids.push('medication-continuity');
  if (household.children || household.olderAdults || household.mobilityNeeds) ids.push('dependent-support');
  if (household.pets) ids.push('pets');
  return ids;
}

function reasonFor(id: GuideId, request: PlanRequest): string {
  const text = request.situation.toLowerCase();
  const reasons: Partial<Record<GuideId, string>> = {
    'immediate-danger': 'You described a hazard that may require moving away immediately.',
    'adult-cpr': 'You reported that someone may be unresponsive or not breathing normally.',
    'severe-bleeding': 'You reported signs of life-threatening external bleeding.',
    'unsafe-water': /smell|odor/.test(text) ? 'You reported an unusual smell or possible contamination in the water.' : 'Your situation may affect the safety of drinking water.',
    evacuate: 'Your situation may require leaving the affected area safely.',
    'shelter-in-place': 'Your situation may require remaining protected inside.',
    'power-outage': 'You reported a loss of electricity or equipment power.',
    'medication-continuity': 'Your household profile or situation includes essential medication needs.',
    'dependent-support': 'Your household includes someone who may need additional support.',
    pets: 'Your household profile includes pets.',
    'family-reunification': 'A shared meeting and contact plan can reduce separation during disruption.',
    'medical-boundary': 'You asked for diagnosis, prescribing, or a medication change that this app cannot safely provide.',
  };
  return reasons[id] ?? 'This guide matches details in the situation you described.';
}

export function assemblePlan(
  request: PlanRequest,
  model: ModelAnalysis,
  deterministic: DeterministicResult,
): { plan: PlanItem[]; hazards: Hazard[]; immediateDanger: boolean; followUpQuestion: string | null } {
  const guideIds = deterministic.medicalAdviceRequest
    ? deterministic.forcedGuideIds
    : [...deterministic.forcedGuideIds, ...model.guideIds, ...householdGuides(request.household)];
  const uniqueIds = [...new Set(guideIds)].slice(0, 5);
  const plan = uniqueIds.flatMap((id) => {
    const guide = GUIDE_BY_ID.get(id);
    if (!guide) return [];
    return [{
      guideId: guide.id,
      title: guide.title,
      priority: guide.urgency,
      reason: reasonFor(guide.id, request),
      steps: [...guide.steps],
      warnings: [...guide.warnings],
      sourceName: guide.sourceName,
      sourceUrl: guide.sourceUrl,
      reviewedAt: guide.reviewedAt,
    }];
  });

  const followUpKey = deterministic.tooVague ? 'describe_hazard' : model.followUpKey;
  return {
    plan,
    hazards: [...new Set([...deterministic.hazards, ...model.hazards])],
    immediateDanger: deterministic.immediateDanger || model.immediateDanger,
    followUpQuestion: plan.length === 0 || deterministic.tooVague
      ? FOLLOW_UP_QUESTIONS[followUpKey ?? 'describe_hazard']
      : null,
  };
}
