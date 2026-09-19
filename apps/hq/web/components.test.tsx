import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtures } from '@fieldlink/contract';
import { commsReduction } from '../src/stats.ts';
import { CommsCounter, ReportList } from './components.tsx';

describe('HQ UI', () => {
  it('renders comms-reduction math from fixtures', () => {
    const bytes = 2400;
    const comms = commsReduction(fixtures.reports, bytes);
    render(<CommsCounter comms={comms} />);
    expect(screen.getByTestId('comms-counter')).toHaveTextContent(`${comms.radioSecondsSaved}s`);
    expect(screen.getByTestId('comms-counter')).toHaveTextContent(`${bytes} B`);
  });

  it('lists fixture reports with protocol-table steps', () => {
    render(<ReportList reports={[fixtures.hemorrhageReport]} />);
    expect(screen.getByTestId('report-list')).toHaveTextContent(
      fixtures.hemorrhageReport.directive.steps[0]!,
    );
    expect(screen.getByText(/massive_hemorrhage/)).toBeInTheDocument();
  });
});
