import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { loadCivilianEngine, type CivilianEngine } from './engine.ts';
import { assemblePlan, deterministicChecks } from './planner.ts';
import type { Household, PlanRequest, PlanResponse } from './types.ts';

const emptyHousehold: Household = {
  children: false,
  olderAdults: false,
  pets: false,
  mobilityNeeds: false,
  medicationNeeds: false,
};

function parseHousehold(value: unknown): Household {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    children: candidate.children === true,
    olderAdults: candidate.olderAdults === true,
    pets: candidate.pets === true,
    mobilityNeeds: candidate.mobilityNeeds === true,
    medicationNeeds: candidate.medicationNeeds === true,
  };
}

export function createCivilianApp(deps: { engine?: CivilianEngine } = {}) {
  const engine = deps.engine ?? loadCivilianEngine();
  const app = new Hono();
  app.use('*', cors());

  app.get('/api/health', (c) => c.json(engine.health()));

  app.post('/api/plan', async (c) => {
    if (engine.health().status !== 'ready') {
      return c.json({ error: 'engine_not_ready', health: engine.health() }, 503);
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const situation = typeof body.situation === 'string' ? body.situation.trim() : '';
    if (situation.length < 3 || situation.length > 2_000) {
      return c.json({ error: 'situation_must_be_3_to_2000_characters' }, 400);
    }

    const request: PlanRequest = {
      situation,
      household: body.household === undefined ? emptyHousehold : parseHousehold(body.household),
    };
    const deterministic = deterministicChecks(request);
    let analysis;
    let notice: string | undefined;
    try {
      analysis = await engine.analyze(request);
    } catch {
      analysis = {
        hazards: [],
        needs: [],
        immediateDanger: false,
        guideIds: [],
        confidence: 0,
        followUpKey: 'describe_hazard' as const,
      };
      notice = 'Local AI could not complete this request. Only deterministic safety matches are shown.';
    }
    const assembled = assemblePlan(request, analysis, deterministic);
    const health = engine.health();
    const response: PlanResponse = {
      analysis: {
        hazards: assembled.hazards,
        immediateDanger: assembled.immediateDanger,
        confidence: analysis.confidence,
      },
      plan: assembled.plan,
      followUpQuestion: assembled.followUpQuestion,
      ...(notice ? { notice } : {}),
      runtime: {
        engine: health.engine,
        model: health.model,
        local: true,
        cloudCalls: 0,
      },
    };
    return c.json(response);
  });

  return { app, engine };
}
