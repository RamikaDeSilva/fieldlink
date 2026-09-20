import type { FieldReport, HealthStatus } from '@fieldlink/contract';

export function AirplaneModeBanner() {
  return (
    <div className="banner" data-testid="airplane-banner">
      <div>
        <strong>OFF-GRID</strong>
        <div>Airplane mode. No Wi-Fi. No cellular. Thunderbolt / loopback only.</div>
      </div>
      <div className="dots">
        <span className="dot off">
          <i /> Wi-Fi
        </span>
        <span className="dot off">
          <i /> LTE
        </span>
        <span className="dot on">
          <i /> Local NPU
        </span>
      </div>
    </div>
  );
}

export function TelemetryPanel({ health }: { health: HealthStatus | null }) {
  const ready = health?.status === 'ready';
  return (
    <aside className="panel" data-testid="telemetry">
      <p className="eyebrow">Local inference</p>
      <div className="telemetry">
        <div>
          <span>status</span> <b>{health?.status ?? 'loading'}</b>
        </div>
        <div>
          <span>engine</span> <b>{health?.engine ?? '—'}</b>
        </div>
        <div>
          <span>model</span> <b>{health?.model ?? '—'}</b>
        </div>
        <div>
          <span>load_ms</span> <b>{health?.load_ms ?? 0}</b>
        </div>
        <div>
          <span>warm_ms</span> <b>{health?.warm_ms ?? 0}</b>
        </div>
        <div>
          <span>network</span> <b>{health?.net_profile ?? 'clean'}</b>
        </div>
        <div>
          <span>egress</span> <b>{ready ? '0 cloud calls' : 'warming'}</b>
        </div>
        {health?.error ? (
          <div>
            <span>error</span> <b>{health.error}</b>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export function DirectiveCard({ report }: { report: FieldReport }) {
  const level = report.triage_level.toLowerCase();
  return (
    <section className="card" data-testid="directive">
      <p className="eyebrow">How to proceed</p>
      <div>
        <span className={`tag ${level}`}>{report.triage_level}</span>
        <span className="tag">{report.directive.protocol_id}</span>
        <span className="tag">src:{report.directive.source}</span>
      </div>
      <ol className="steps">
        {report.directive.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}
