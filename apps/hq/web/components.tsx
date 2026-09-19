import type { FieldReport } from '@fieldlink/contract';
import type { CommsReduction, TriageCounts } from '../src/stats.ts';

export function CommsCounter({ comms }: { comms: CommsReduction }) {
  return (
    <article className="tile comms" data-testid="comms-counter">
      <span>Radio-seconds saved</span>
      <b>{comms.radioSecondsSaved}s</b>
      <div>
        {comms.bytesTransmitted} B structured vs {comms.equivalentVoiceBytes} B voice
        {comms.compressionRatio ? ` · ${comms.compressionRatio}×` : ''}
      </div>
    </article>
  );
}

export function TriageTiles({ triage }: { triage: TriageCounts }) {
  return (
    <>
      <article className="tile immediate">
        <span>Immediate</span>
        <b>{triage.Immediate}</b>
      </article>
      <article className="tile">
        <span>Delayed</span>
        <b>{triage.Delayed}</b>
      </article>
      <article className="tile unknown">
        <span>Unknown / escalate</span>
        <b>{triage.Unknown}</b>
      </article>
    </>
  );
}

export function ReportList({ reports }: { reports: FieldReport[] }) {
  if (reports.length === 0) {
    return <p>No field reports yet. Waiting on UNIT-7.</p>;
  }
  return (
    <div className="list" data-testid="report-list">
      {reports.map((report) => (
        <article className="card" key={report.report_id}>
          <h3>
            {report.responder_id} · {report.triage_level} · {report.protocol}
          </h3>
          <div className="meta">
            {report.report_id} · {report.raw_input.mode} · conf {report.confidence.toFixed(2)}
          </div>
          <p>{report.raw_input.text}</p>
          <ol className="steps">
            {report.directive.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>
      ))}
    </div>
  );
}
