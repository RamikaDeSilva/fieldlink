import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { loadCivilianEngine, type CivilianEngine } from './engine.ts';
import { assemblePlan, deterministicChecks } from './planner.ts';
import { civilianLog, errorLogFields, promptLogFields } from './logger.ts';
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
  let recovery: Promise<void> | null = null;
  app.use('*', cors());

  app.get('/api/health', (c) => {
    const health = engine.health();
    if (health.status === 'error' && recovery === null) {
      civilianLog('engine.recovery.scheduled', { engine: health.engine, error: health.error }, 'warn');
      recovery = engine.warmup().catch((error) => {
        civilianLog('engine.recovery.failed', errorLogFields(error), 'error');
      }).finally(() => {
        recovery = null;
      });
    }
    return c.json(health);
  });

  app.post('/api/plan', async (c) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const started = performance.now();
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
    if (situation.length < 1 || situation.length > 2_000) {
      return c.json({ error: 'situation_must_be_1_to_2000_characters' }, 400);
    }

    const request: PlanRequest = {
      situation,
      household: body.household === undefined ? emptyHousehold : parseHousehold(body.household),
    };
    civilianLog('plan.request.received', {
      requestId,
      ...promptLogFields(situation),
      household: request.household,
      engine: engine.health().engine,
    });
    const deterministic = deterministicChecks(request);
    civilianLog('plan.deterministic.completed', {
      requestId,
      forcedGuideIds: deterministic.forcedGuideIds,
      candidateGuideIds: deterministic.candidateGuideIds,
      hazards: deterministic.hazards,
      immediateDanger: deterministic.immediateDanger,
      medicalAdviceRequest: deterministic.medicalAdviceRequest,
      tooVague: deterministic.tooVague,
    });
    let analysis;
    let notice: string | undefined;
    if (deterministic.tooVague || deterministic.medicalAdviceRequest) {
      civilianLog('plan.model.skipped', {
        requestId,
        reason: deterministic.tooVague ? 'vague_input' : 'medical_boundary',
      });
      analysis = {
        hazards: deterministic.hazards,
        needs: [],
        immediateDanger: deterministic.immediateDanger,
        guideIds: deterministic.forcedGuideIds,
        confidence: 1,
        followUpKey: 'describe_hazard' as const,
      };
    } else {
      try {
        analysis = await engine.analyze(request, {
          requestId,
          candidateGuideIds: deterministic.candidateGuideIds,
        });
      } catch (error) {
        civilianLog('plan.model.failed', { requestId, ...errorLogFields(error) }, 'error');
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
    }
    const assembled = assemblePlan(request, analysis, deterministic);
    civilianLog('plan.assembled', {
      requestId,
      modelGuideIds: analysis.guideIds,
      finalGuideIds: assembled.plan.map((item) => item.guideId),
      hazards: assembled.hazards,
      immediateDanger: assembled.immediateDanger,
      followUpQuestion: assembled.followUpQuestion,
      degraded: Boolean(notice),
      latencyMs: Math.round(performance.now() - started),
    });
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
        requestId,
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
