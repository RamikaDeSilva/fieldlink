import { afterEach, describe, expect, it, vi } from 'vitest';

const loadModel = vi.fn(async () => 'model-1');
const completion = vi.fn();
const transcribe = vi.fn(async () => '');

vi.mock('@qvac/sdk', () => ({
  loadModel,
  completion,
  transcribe,
  QWEN3_600M_INST_Q4: { id: 'qwen3-0.6b' },
  WHISPER_EN_TINY_Q8_0: { id: 'whisper-tiny' },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('QvacEngine', () => {
  it('invokes the local QVAC completion API and parses JSON', async () => {
    completion.mockReturnValue({
      final: Promise.resolve({
        contentText: '{"protocol":"cpr_drowning","triage_level":"Immediate","condition_tags":["unresponsive"]}',
        stats: { tokensPerSecond: 12 },
      }),
    });
    const { QvacEngine } = await import('./qvac.ts');
    const engine = new QvacEngine();
    await engine.warmup();
    expect(loadModel).toHaveBeenCalled();
    expect(completion).toHaveBeenCalled();
    const result = await engine.classify('Victim pulled from water, unresponsive, not breathing.');
    expect(result.protocol).toBe('cpr_drowning');
    expect(engine.health().engine).toBe('qvac');
    expect(engine.health().status).toBe('ready');
  });

  it('falls back to a validated out-of-scope classification after malformed output', async () => {
    completion
      .mockReturnValueOnce({
        final: Promise.resolve({
          contentText: '{"protocol":"cpr_drowning","triage_level":"Immediate","condition_tags":["unresponsive"]}',
        }),
      })
      .mockReturnValue({
        final: Promise.resolve({ contentText: 'I refuse to answer' }),
      });
    const { QvacEngine } = await import('./qvac.ts');
    const engine = new QvacEngine();
    await engine.warmup();
    const result = await engine.classify('what is the weather');
    expect(result.protocol).toBe('out_of_scope');
    expect(result.triage_level).toBe('Unknown');
  });
});

describe('QvacWhisperTranscriber', () => {
  it('invokes QVAC transcribe() after loading a catalog Whisper model', async () => {
    transcribe.mockResolvedValue('Victim pulled from water, unresponsive, not breathing.');
    const { QvacWhisperTranscriber, encodePcm16kWave } = await import('./qvac-voice.ts').then(async (voice) => ({
      ...voice,
      encodePcm16kWave: (await import('./pcm-wav.ts')).encodePcm16kWave,
    }));
    const wav = encodePcm16kWave(new Float32Array(1600));
    const transcriber = new QvacWhisperTranscriber();
    await transcriber.warmup();
    expect(loadModel).toHaveBeenCalled();
    const text = await transcriber.transcribe(wav);
    expect(text).toContain('unresponsive');
    expect(transcriber.health()).toMatchObject({ status: 'ready', engine: 'qvac-whisper', local: true });
  });
});
