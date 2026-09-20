import type { FieldReport, HealthStatus } from '@fieldlink/contract';

export function AirplaneModeBanner() {
  return (
    <div className="banner" data-testid="airplane-banner">
      <div className="banner-copy">
        <span className="banner-icon" aria-hidden="true">⌁</span>
        <div>
          <strong>OFF-GRID LINK ACTIVE</strong>
          <p>Airplane mode. No Wi-Fi. No cellular. Thunderbolt / loopback only.</p>
        </div>
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
  const usesDemoRules = health?.engine?.toLowerCase().includes('script') || health?.model?.toLowerCase().includes('script');
  const engineLabel = usesDemoRules ? 'local ruleset' : (health?.engine ?? '—');
  const modelLabel = usesDemoRules ? 'field protocols' : (health?.model ?? '—');
  return (
    <aside className="panel telemetry-panel" data-testid="telemetry">
      <div className="panel-heading compact">
        <span className="section-index">02</span>
        <div>
          <p className="eyebrow">System telemetry</p>
          <h2>Local inference</h2>
        </div>
      </div>
      <div className="telemetry">
        <div>
          <span>status</span> <b>{health?.status ?? 'loading'}</b>
        </div>
        <div>
          <span>engine</span> <b>{engineLabel}</b>
        </div>
        <div>
          <span>model</span> <b>{modelLabel}</b>
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
      <div className="directive-heading">
        <div>
          <p className="eyebrow">Protocol match confirmed</p>
          <h2>How to proceed</h2>
        </div>
        <span className="directive-source">Verified offline</span>
      </div>
      <div className="tags">
        <span className={`tag ${level}`}>{report.triage_level}</span>
        <span className="tag">{report.directive.protocol_id}</span>
        <span className="tag">src:{report.directive.source}</span>
      </div>
      <ol className="steps">
        {report.directive.steps.map((step, index) => (
          <li key={step}><span>{String(index + 1).padStart(2, '0')}</span><p>{step}</p></li>
        ))}
      </ol>
    </section>
  );
}
