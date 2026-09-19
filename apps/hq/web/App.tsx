import { useEffect, useState } from 'react';
import type { FieldReport } from '@fieldlink/contract';
import { commsReduction, emptyCounts, type CommsReduction, type TriageCounts } from '../src/stats.ts';
import { CommsCounter, ReportList, TriageTiles } from './components.tsx';

export function App() {
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [triage, setTriage] = useState<TriageCounts>(emptyCounts());
  const [comms, setComms] = useState<CommsReduction>(commsReduction([], 0));

  async function refresh() {
    const [reportRes, statsRes] = await Promise.all([fetch('/api/reports'), fetch('/api/stats')]);
    const reportJson = (await reportRes.json()) as { reports: FieldReport[] };
    const statsJson = (await statsRes.json()) as { triage: TriageCounts; comms: CommsReduction };
    setReports(reportJson.reports);
    setTriage(statsJson.triage);
    setComms(statsJson.comms);
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="app">
      <p className="eyebrow">FieldLink · Command</p>
      <h1>HQ dashboard</h1>
      <section className="stats">
        <TriageTiles triage={triage} />
        <CommsCounter comms={comms} />
      </section>
      <ReportList reports={reports} />
    </div>
  );
}
