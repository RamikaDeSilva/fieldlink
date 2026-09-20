import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('civilian UI', () => {
  it('disables submission and explains local AI warmup', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => undefined)));
    render(<App />);
    expect(screen.getByRole('button', { name: /Warming local AI/ })).toBeDisabled();
    expect(screen.getByText('Meta Llama 3.2')).toBeInTheDocument();
    expect(screen.getByText('No cloud')).toBeInTheDocument();
  });

  it('enables the planner when health is ready and sends household context', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ status: 'ready', engine: 'scripted', model: 'test', local: true, warmupMs: 1 }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          analysis: { hazards: ['power_outage'], immediateDanger: false, confidence: .9 },
          plan: [], followUpQuestion: 'What happened?',
          runtime: { engine: 'scripted', model: 'test', local: true, cloudCalls: 0 },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const input = screen.getByLabelText('Describe what is happening');
    fireEvent.change(input, { target: { value: 'The power is out after an earthquake.' } });
    fireEvent.click(screen.getByRole('button', { name: /Older adults/ }));
    const submit = await screen.findByRole('button', { name: /Build my offline plan/ });
    fireEvent.click(submit);
    await screen.findByText('What happened?');
    const sent = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(sent.household.olderAdults).toBe(true);
  });

  it('shows the immediate-danger banner and stored source content', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ status: 'ready', engine: 'ollama', model: 'llama', local: true, warmupMs: 3 }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          analysis: { hazards: ['severe_bleeding'], immediateDanger: true, confidence: .95 },
          plan: [{
            guideId: 'severe-bleeding', title: 'Control life-threatening bleeding', priority: 'immediate',
            reason: 'You reported signs of life-threatening external bleeding.', steps: ['Apply firm pressure.'],
            warnings: ['Use a tourniquet only if trained.'], sourceName: 'American Red Cross',
            sourceUrl: 'https://example.com', reviewedAt: '2026-09-19',
          }],
          followUpQuestion: null,
          runtime: { engine: 'ollama', model: 'llama', local: true, cloudCalls: 0 },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.change(screen.getByLabelText('Describe what is happening'), { target: { value: 'Blood is spurting from a leg wound.' } });
    fireEvent.click(await screen.findByRole('button', { name: /Build my offline plan/ }));
    expect(await screen.findByText('Immediate danger detected')).toBeInTheDocument();
    expect(screen.getByText('Apply firm pressure.')).toBeInTheDocument();
    expect(screen.getByText(/Source: American Red Cross/)).toBeInTheDocument();
    expect(screen.getByText(/It did not write the safety steps/)).toBeInTheDocument();
  });
});
