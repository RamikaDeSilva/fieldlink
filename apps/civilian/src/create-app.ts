import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { loadCivilianEngine, type CivilianEngine } from './engine.ts';
import { assemblePlan, deterministicChecks } from './planner.ts';
import { civilianLog, errorLogFields, promptLogFields } from './logger.ts';
import { loadVoiceTranscriber, type VoiceTranscriber } from './transcription.ts';
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

export function createCivilianApp(deps: { engine?: CivilianEngine; voiceTranscriber?: VoiceTranscriber } = {}) {
  const engine = deps.engine ?? loadCivilianEngine();
  const voiceTranscriber = deps.voiceTranscriber ?? loadVoiceTranscriber();
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

  app.get('/api/voice/health', (c) => c.json(voiceTranscriber.health()));

  app.post('/api/transcribe', async (c) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const health = voiceTranscriber.health();
    if (health.status !== 'ready') return c.json({ error: health.error ?? 'voice_unavailable', health }, 503);

    const declaredLength = Number(c.req.header('content-length') ?? 0);
    if (declaredLength > 5_000_000) return c.json({ error: 'audio_too_large' }, 413);

    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength < 44 || bytes.byteLength > 5_000_000) {
      return c.json({ error: 'audio_must_be_a_wav_under_5mb' }, 400);
    }

    civilianLog('voice.transcription.started', { requestId, bytes: bytes.byteLength, engine: health.engine });
    const started = performance.now();
    try {
      const text = await voiceTranscriber.transcribe(bytes);
      civilianLog('voice.transcription.completed', {
        requestId,
        textChars: text.length,
        latencyMs: Math.round(performance.now() - started),
      });
      if (!text) return c.json({ error: 'no_speech_detected' }, 422);
      return c.json({ text, engine: health.engine, local: true, cloudCalls: 0, requestId });
    } catch (error) {
      civilianLog('voice.transcription.failed', { requestId, ...errorLogFields(error) }, 'error');
      return c.json({ error: 'transcription_failed', message: error instanceof Error ? error.message : String(error) }, 500);
    }
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

  return { app, engine, voiceTranscriber };
}
