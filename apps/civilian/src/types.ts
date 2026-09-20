export const HAZARDS = [
  'immediate_danger',
  'cardiac_arrest',
  'severe_bleeding',
  'unsafe_water',
  'evacuation',
  'shelter',
  'power_outage',
  'medication',
  'accessibility',
  'children',
  'pets',
  'reunification',
  'earthquake',
  'flood',
  'wildfire_smoke',
] as const;

export type Hazard = (typeof HAZARDS)[number];

export const NEEDS = [
  'children',
  'older_adults',
  'pets',
  'mobility',
  'medication',
] as const;

export type Need = (typeof NEEDS)[number];

export const GUIDE_IDS = [
  'immediate-danger',
  'adult-cpr',
  'severe-bleeding',
  'unsafe-water',
  'evacuate',
  'shelter-in-place',
  'power-outage',
  'medication-continuity',
  'dependent-support',
  'pets',
  'family-reunification',
  'medical-boundary',
  'earthquake-safety',
  'flood-safety',
  'wildfire-smoke',
] as const;

export type GuideId = (typeof GUIDE_IDS)[number];
export type Priority = 'immediate' | 'next' | 'prepare';
export type FollowUpKey = 'describe_hazard' | 'location_safety' | 'injuries' | 'official_order';
export type ConversationIntent = 'needs_guidance' | 'all_clear' | 'unclear';

export type Household = {
  children: boolean;
  olderAdults: boolean;
  pets: boolean;
  mobilityNeeds: boolean;
  medicationNeeds: boolean;
};

export type PlanRequest = {
  situation: string;
  household: Household;
};

export type ModelAnalysis = {
  hazards: Hazard[];
  needs: Need[];
  immediateDanger: boolean;
  guideIds: GuideId[];
  confidence: number;
  followUpKey: FollowUpKey | null;
  intent: ConversationIntent;
};

export type EngineHealth = {
  status: 'loading' | 'ready' | 'error';
  engine: 'ollama' | 'scripted';
  model: string;
  local: true;
  warmupMs: number;
  error?: string;
};

export type PlanItem = {
  guideId: GuideId;
  title: string;
  priority: Priority;
  reason: string;
  steps: string[];
  warnings: string[];
  sourceName: string;
  sourceUrl: string;
  reviewedAt: string;
};

export type PlanResponse = {
  analysis: Pick<ModelAnalysis, 'hazards' | 'immediateDanger' | 'confidence'>;
  plan: PlanItem[];
  followUpQuestion: string | null;
  notice?: string;
  runtime: {
    requestId: string;
    engine: 'ollama' | 'scripted';
    model: string;
    local: true;
    cloudCalls: 0;
  };
};

export type GuideCard = {
  id: GuideId;
  title: string;
  hazardTags: Hazard[];
  appliesTo: Need[];
  urgency: Priority;
  steps: string[];
  warnings: string[];
  sourceName: string;
  sourceUrl: string;
  reviewedAt: string;
};
