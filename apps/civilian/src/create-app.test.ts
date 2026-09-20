import { describe, expect, it } from 'vitest';
import { createCivilianApp } from './create-app.ts';
import { ScriptedCivilianEngine, type CivilianEngine } from './engine.ts';
import type { EngineHealth, ModelAnalysis, PlanRequest } from './types.ts';

async function readyScripted() {
  const engine = new ScriptedCivilianEngine();
  await engine.warmup();
  return engine;
}

function post(app: ReturnType<typeof createCivilianApp>['app'], situation: string, household = {}) {
  return app.request('/api/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ situation, household }),
  });
}

describe('civilian API', () => {
  it('refuses requests until warmup completes', async () => {
    const { app } = createCivilianApp({ engine: new ScriptedCivilianEngine() });
    const response = await post(app, 'The power is out after a storm.');
    expect(response.status).toBe(503);
  });

  it('forces severe bleeding guidance even when the model misses it', async () => {
    const engine = await readyScripted();
    const { app } = createCivilianApp({ engine });
    const response = await post(app, 'My neighbor cut their leg and blood is spurting.');
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.analysis.immediateDanger).toBe(true);
    expect(body.plan[0].guideId).toBe('severe-bleeding');
    expect(body.plan[0].steps.join(' ')).not.toContain('blood is spurting');
  });

  it('forces CPR guidance for an unresponsive person who is not breathing', async () => {
    const engine = await readyScripted();
    const { app } = createCivilianApp({ engine });
    const response = await post(app, 'An adult is unresponsive and not breathing normally.');
    const body = await response.json();
    expect(body.plan.some((item: { guideId: string }) => item.guideId === 'adult-cpr')).toBe(true);
  });

  it('asks a focused question instead of guessing from vague input', async () => {
    const engine = await readyScripted();
    const { app } = createCivilianApp({ engine });
    const response = await post(app, 'Something feels wrong outside.');
    const body = await response.json();
    expect(body.plan).toEqual([]);
    expect(body.followUpQuestion).toContain('see, hear, or smell');
  });

  it('accepts a short greeting and asks for useful details', async () => {
    const engine = await readyScripted();
    const { app } = createCivilianApp({ engine });
    const response = await post(app, 'hi');
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.plan).toEqual([]);
    expect(body.analysis.immediateDanger).toBe(false);
    expect(body.analysis.hazards).toEqual([]);
    expect(body.followUpQuestion).toContain('anyone injured');
  });

  it('declines prescription requests without returning model-selected instructions', async () => {
    const engine = await readyScripted();
    const { app } = createCivilianApp({ engine });
    const response = await post(app, 'What prescription should I take for this?');
    const body = await response.json();
    expect(body.plan.map((item: { guideId: string }) => item.guideId)).toEqual(['medical-boundary']);
  });

  it('renders only local guide content, never arbitrary model prose', async () => {
    const maliciousEngine: CivilianEngine = {
      async warmup() {},
      health(): EngineHealth {
        return { status: 'ready', engine: 'scripted', model: 'test', local: true, warmupMs: 0 };
      },
      async analyze(_request: PlanRequest): Promise<ModelAnalysis> {
        return {
          hazards: ['unsafe_water'], needs: [], immediateDanger: false,
          guideIds: ['unsafe-water'], confidence: 0.8, followUpKey: null,
        };
      },
    };
    const { app } = createCivilianApp({ engine: maliciousEngine });
    const response = await post(app, '<img src=x onerror=alert(1)> The tap water is unsafe.');
    const body = await response.json();
    expect(JSON.stringify(body.plan)).not.toContain('<img');
    expect(body.plan[0].sourceName).toBe('CDC');
  });

  it('does not allow the model to introduce unsupported emergency guides', async () => {
    const overSelectingEngine: CivilianEngine = {
      async warmup() {},
      health(): EngineHealth {
        return { status: 'ready', engine: 'ollama', model: 'test', local: true, warmupMs: 0 };
      },
      async analyze(): Promise<ModelAnalysis> {
        return {
          hazards: ['cardiac_arrest', 'severe_bleeding'], needs: [], immediateDanger: true,
          guideIds: ['adult-cpr', 'severe-bleeding', 'unsafe-water'], confidence: 0.5, followUpKey: null,
        };
      },
    };
    const { app } = createCivilianApp({ engine: overSelectingEngine });
    const response = await post(app, 'The tap water smells strange after the earthquake.');
    const body = await response.json();
    expect(body.analysis).toMatchObject({ hazards: ['unsafe_water', 'earthquake'], immediateDanger: false });
    expect(body.plan.map((item: { guideId: string }) => item.guideId)).toEqual([
      'unsafe-water',
      'earthquake-safety',
    ]);
  });

  it.each([
    ['What should I do after an earthquake?', 'earthquake-safety'],
    ['The roads are flooded and we are stuck at home.', 'flood-safety'],
    ['The street is filling with fast-moving water.', 'flood-safety'],
    ['There is heavy smoke outside from a wildfire.', 'wildfire-smoke'],
  ])('routes an ordinary disaster prompt to its offline guide', async (situation, expectedGuide) => {
    const engine = await readyScripted();
    const { app } = createCivilianApp({ engine });
    const response = await post(app, situation);
    const body = await response.json();
    expect(body.plan.some((item: { guideId: string }) => item.guideId === expectedGuide)).toBe(true);
  });
});
