import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaEngine, parseModelAnalysis } from './engine.ts';

afterEach(() => vi.unstubAllGlobals());

const validAnalysis = {
  hazards: ['power_outage', 'unsafe_water'],
  needs: ['older_adults'],
  immediateDanger: false,
  guideIds: ['power-outage', 'unsafe-water'],
  confidence: 0.91,
  followUpKey: null,
  intent: 'needs_guidance',
};

describe('civilian Ollama engine', () => {
  it('stays loading until a real warmup inference completes', async () => {
    let resolveChat: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 'test' }), { status: 200 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveChat = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const engine = new OllamaEngine('http://127.0.0.1:11434', 'test-model');

    const warming = engine.warmup();
    await Promise.resolve();
    expect(engine.health().status).toBe('loading');
    resolveChat?.(new Response(JSON.stringify({ message: { content: JSON.stringify(validAnalysis) } }), { status: 200 }));
    await warming;
    expect(engine.health().status).toBe('ready');
  });

  it('sends the selected model, JSON schema, and deterministic options', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { content: JSON.stringify(validAnalysis) } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const engine = new OllamaEngine('http://localhost:11434', 'meta-test');
    await engine.analyze({
      situation: 'Power is out and water may be unsafe.',
      household: { children: false, olderAdults: true, pets: false, mobilityNeeds: false, medicationNeeds: false },
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sent.model).toBe('meta-test');
    expect(sent.stream).toBe(false);
    expect(sent.format).toMatchObject({ type: 'object' });
    expect(sent.format).toMatchObject({ required: expect.arrayContaining(['intent']) });
    expect(sent.options).toEqual({ temperature: 0, num_ctx: 2048, num_predict: 128 });
    expect(sent.keep_alive).toBe('30m');
  });

  it('retries malformed output once and then fails safely', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { content: 'not json' } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const engine = new OllamaEngine();
    await expect(engine.analyze({
      situation: 'There is an emergency nearby.',
      household: { children: false, olderAdults: false, pets: false, mobilityNeeds: false, medicationNeeds: false },
    })).rejects.toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('discards unknown guide IDs and clamps untrusted values', () => {
    const parsed = parseModelAnalysis({
      ...validAnalysis,
      guideIds: ['unsafe-water', '<script>alert(1)</script>', 'unsafe-water'],
      hazards: ['unsafe_water', 'made_up'],
      confidence: 4,
    });
    expect(parsed.guideIds).toEqual(['unsafe-water']);
    expect(parsed.hazards).toEqual(['unsafe_water']);
    expect(parsed.confidence).toBe(1);
  });

  it('reports an understandable startup error when Ollama is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    const engine = new OllamaEngine();
    await expect(engine.warmup()).rejects.toThrow('connection refused');
    expect(engine.health()).toMatchObject({ status: 'error', error: 'connection refused' });
  });
});
