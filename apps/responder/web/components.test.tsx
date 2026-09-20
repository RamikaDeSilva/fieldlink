import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtures } from '@fieldlink/contract';
import { lookupDirective } from '@fieldlink/triage';
import { App } from './App.tsx';
import { AirplaneModeBanner, DirectiveCard, TelemetryPanel } from './components.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('responder UI', () => {
  it('shows airplane-mode / no-radio chrome', () => {
    render(<AirplaneModeBanner />);
    expect(screen.getByTestId('airplane-banner')).toHaveTextContent('Airplane mode');
    expect(screen.getByText('Wi-Fi')).toBeInTheDocument();
    expect(screen.getByText('LTE')).toBeInTheDocument();
  });

  it('renders protocol table steps verbatim from a fixture', () => {
    render(<DirectiveCard report={fixtures.cprDrowningReport} />);
    const expected = lookupDirective('cpr_drowning').steps;
    for (const step of expected) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getByText('src:protocol_table')).toBeInTheDocument();
  });

  it('surfaces local inference telemetry', () => {
    render(
      <TelemetryPanel
        health={{
          status: 'ready',
          model: 'scripted',
          load_ms: 12,
          warm_ms: 8,
          engine: 'scripted',
          net_profile: 'hostile',
        }}
      />,
    );
    expect(screen.getByTestId('telemetry')).toHaveTextContent('warm_ms');
    expect(screen.getByTestId('telemetry')).toHaveTextContent('8');
    expect(screen.getByTestId('telemetry')).toHaveTextContent('0 cloud calls');
  });

  it('explains warming and sending states in the submit button', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          status: 'ready',
          model: 'scripted',
          load_ms: 1,
          warm_ms: 2,
          engine: 'scripted',
          net_profile: 'clean',
        }),
      })
      .mockImplementationOnce(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    expect(screen.getByRole('button', { name: 'Warming model…' })).toBeDisabled();

    const submit = await screen.findByRole('button', { name: 'Send structured update' });
    fireEvent.change(screen.getByLabelText('Tactical stealth sitrep'), {
      target: { value: 'Victim is unresponsive and not breathing' },
    });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  });
});
