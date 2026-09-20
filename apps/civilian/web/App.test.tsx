import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function createFetchMock(health: object, plans: object[]) {
  let planIndex = 0;
  return vi.fn().mockImplementation((input: string) => {
    if (input === '/api/health') return Promise.resolve({ ok: true, json: async () => health });
    if (input === '/api/voice/health') {
      return Promise.resolve({ ok: true, json: async () => ({ status: 'ready', engine: 'whisper-tiny.en', local: true }) });
    }
    if (input === '/api/plan') {
      const body = plans[planIndex];
      planIndex += 1;
      return Promise.resolve({ ok: true, json: async () => body });
    }
    return Promise.reject(new Error(`Unexpected request: ${input}`));
  });
}

describe('civilian UI', () => {
  it('disables submission and explains local AI warmup', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => undefined)));
    render(<App />);
    expect(screen.getByRole('button', { name: /Warming local AI/ })).toBeDisabled();
    expect(screen.getByText('Meta Llama 3.2')).toBeInTheDocument();
    expect(screen.getByText('No cloud')).toBeInTheDocument();
  });

  it('enables the planner when health is ready and sends household context', async () => {
    const fetchMock = createFetchMock(
      { status: 'ready', engine: 'scripted', model: 'test', local: true, warmupMs: 1 },
      [{
          analysis: { hazards: ['power_outage'], immediateDanger: false, confidence: .9 },
          plan: [], followUpQuestion: 'What happened?',
          runtime: { engine: 'scripted', model: 'test', local: true, cloudCalls: 0 },
      }],
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const input = screen.getByLabelText('Describe what is happening');
    fireEvent.change(input, { target: { value: 'The power is out after an earthquake.' } });
    fireEvent.click(screen.getByRole('button', { name: /Older adults/ }));
    const submit = await screen.findByRole('button', { name: /Build my offline plan/ });
    fireEvent.click(submit);
    await screen.findByText('What happened?');
    const planCall = fetchMock.mock.calls.find(([input]) => input === '/api/plan');
    const sent = JSON.parse(planCall?.[1]?.body as string);
    expect(sent.household.olderAdults).toBe(true);
  });

  it('shows the immediate-danger banner and stored source content', async () => {
    const fetchMock = createFetchMock(
      { status: 'ready', engine: 'ollama', model: 'llama', local: true, warmupMs: 3 },
      [{
          analysis: { hazards: ['severe_bleeding'], immediateDanger: true, confidence: .95 },
          plan: [{
            guideId: 'severe-bleeding', title: 'Control life-threatening bleeding', priority: 'immediate',
            reason: 'You reported signs of life-threatening external bleeding.', steps: ['Apply firm pressure.'],
            warnings: ['Use a tourniquet only if trained.'], sourceName: 'American Red Cross',
            sourceUrl: 'https://example.com', reviewedAt: '2026-09-19',
          }],
          followUpQuestion: null,
          runtime: { engine: 'ollama', model: 'llama', local: true, cloudCalls: 0 },
      }],
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.change(screen.getByLabelText('Describe what is happening'), { target: { value: 'Blood is spurting from a leg wound.' } });
    fireEvent.click(await screen.findByRole('button', { name: /Build my offline plan/ }));
    expect(await screen.findByText('Immediate danger detected')).toBeInTheDocument();
    expect(screen.getByText('Apply firm pressure.')).toBeInTheDocument();
    expect(screen.getByText(/Source: American Red Cross/)).toBeInTheDocument();
    expect(screen.getByText(/It did not write the safety steps/)).toBeInTheDocument();
  });

  it('keeps the original situation when answering a follow-up question', async () => {
    const fetchMock = createFetchMock(
      { status: 'ready', engine: 'ollama', model: 'llama', local: true, warmupMs: 3 },
      [{
          analysis: { hazards: [], immediateDanger: false, confidence: .4 },
          plan: [], followUpQuestion: 'What can you see, hear, or smell, and is anyone injured?',
          runtime: { engine: 'ollama', model: 'llama', local: true, cloudCalls: 0 },
      }, {
          analysis: { hazards: ['active_flood'], immediateDanger: true, confidence: .9 },
          plan: [{
            guideId: 'flood-safety', title: 'Move away from floodwater', priority: 'immediate',
            reason: 'You reported rising floodwater.', steps: ['Move to higher ground.'], warnings: [],
            sourceName: 'Ready.gov', sourceUrl: 'https://example.com', reviewedAt: '2026-09-19',
          }],
          followUpQuestion: null,
          runtime: { engine: 'ollama', model: 'llama', local: true, cloudCalls: 0 },
      }],
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    fireEvent.change(screen.getByLabelText('Describe what is happening'), { target: { value: 'Something feels wrong outside.' } });
    fireEvent.click(await screen.findByRole('button', { name: /Build my offline plan/ }));
    expect(await screen.findByText('What can you see, hear, or smell, and is anyone injured?')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Add details to the situation'), { target: { value: 'The street is filling with fast-moving water.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send details' }));
    expect(await screen.findByText('Move to higher ground.')).toBeInTheDocument();

    const planCalls = fetchMock.mock.calls.filter(([input]) => input === '/api/plan');
    const secondPlanRequest = JSON.parse(planCalls[1]?.[1]?.body as string);
    expect(secondPlanRequest.situation).toContain('Something feels wrong outside.');
    expect(secondPlanRequest.situation).toContain('Additional detail: The street is filling with fast-moving water.');
  });
});
