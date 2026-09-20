import { useEffect, useMemo, useState } from 'react';
import type { EngineHealth, Household, PlanItem, PlanResponse, Priority } from '../src/types.ts';

const initialHousehold: Household = {
  children: false,
  olderAdults: false,
  pets: false,
  mobilityNeeds: false,
  medicationNeeds: false,
};

const examples = [
  'An earthquake knocked out power. The tap water smells strange. I am with my grandmother who needs insulin and our dog.',
  'My neighbor cut their leg and blood is spurting.',
  'Officials told our neighborhood to evacuate, and I have two children with me.',
];

const householdOptions: { key: keyof Household; label: string; detail: string }[] = [
  { key: 'children', label: 'Children', detail: 'Age-appropriate support' },
  { key: 'olderAdults', label: 'Older adults', detail: 'Extra time and care' },
  { key: 'pets', label: 'Pets', detail: 'Carriers and supplies' },
  { key: 'mobilityNeeds', label: 'Mobility needs', detail: 'Assistive equipment' },
  { key: 'medicationNeeds', label: 'Medication needs', detail: 'Storage and continuity' },
];

const sectionLabels: Record<Priority, string> = {
  immediate: 'Do now',
  next: 'Do next',
  prepare: 'Prepare',
};

function PlanCard({ item, index }: { item: PlanItem; index: number }) {
  return (
    <article className={`guide-card priority-${item.priority}`}>
      <div className="guide-heading">
        <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
        <div>
          <p className="guide-reason">{item.reason}</p>
          <h3>{item.title}</h3>
        </div>
      </div>
      <ol className="guide-steps">
        {item.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      {item.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}
      <div className="source-row">
        <span>Stored offline</span>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer">Source: {item.sourceName}</a>
      </div>
    </article>
  );
}

export function App() {
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [situation, setSituation] = useState('');
  const [household, setHousehold] = useState<Household>(initialHousehold);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch('/api/health');
        const next = await response.json() as EngineHealth;
        if (cancelled) return;
        console.info('[civilian.ui] health', next);
        setHealth(next);
        if (next.status !== 'ready') {
          timer = window.setTimeout(() => void poll(), next.status === 'error' ? 2_000 : 500);
        }
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void poll(), 900);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  const grouped = useMemo(() => {
    const groups: Record<Priority, PlanItem[]> = { immediate: [], next: [], prepare: [] };
    for (const item of result?.plan ?? []) groups[item.priority].push(item);
    return groups;
  }, [result]);

  const ready = health?.status === 'ready';

  function toggle(key: keyof Household) {
    setHousehold((current) => ({ ...current, [key]: !current[key] }));
  }

  async function submit() {
    setBusy(true);
    setError('');
    console.info('[civilian.ui] plan.request', {
      inputChars: situation.trim().length,
      household,
    });
    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ situation, household }),
      });
      const body = await response.json() as PlanResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
      console.info('[civilian.ui] plan.response', {
        requestId: body.runtime.requestId,
        engine: body.runtime.engine,
        hazards: body.analysis.hazards,
        guideIds: body.plan.map((item) => item.guideId),
        followUpQuestion: body.followUpQuestion,
        notice: body.notice,
      });
      setResult(body);
    } catch (caught) {
      console.error('[civilian.ui] plan.failed', caught);
      setError(caught instanceof Error ? caught.message : 'Unable to build a plan');
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setResult(null);
    setSituation('');
    setHousehold(initialHousehold);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <a className="brand" href="#top" aria-label="FieldLink Civilian home">
          <span className="brand-mark">FL</span>
          <span>FieldLink <b>Civilian</b></span>
        </a>
        <div className={`model-pill ${health?.status ?? 'loading'}`} data-testid="model-status">
          <i />
          <span>{health?.status === 'ready' ? 'Local AI ready' : health?.status === 'error' ? 'Local AI unavailable' : 'Warming local AI'}</span>
        </div>
      </header>

      {!result ? (
        <>
          <section className="hero" id="top">
            <div className="hero-copy">
              <p className="eyebrow">PRIVATE · OFFLINE · LOCAL</p>
              <h1>Know what to do<br />when networks go dark.</h1>
              <p className="lede">Describe what is happening. A small Meta Llama model running on this laptop will prioritize vetted disaster guides for the people with you.</p>
              <div className="trust-row">
                <span>Meta Llama 3.2</span><span>Runs on this laptop</span><span>No cloud</span>
              </div>
            </div>
            <div className="signal-art" aria-hidden="true">
              <div className="signal-ring ring-one" />
              <div className="signal-ring ring-two" />
              <div className="signal-core">OFF<br />LINE</div>
            </div>
          </section>

          <section className="planner-panel">
            <div className="field-header">
              <div><span className="field-index">01</span><h2>Describe the situation</h2></div>
              <span className="privacy-note">Processed locally</span>
            </div>
            <label className="sr-only" htmlFor="situation">Describe what is happening</label>
            <textarea
              id="situation"
              value={situation}
              onChange={(event) => setSituation(event.target.value)}
              placeholder="What happened? What can you see, hear, or smell? Is anyone injured?"
              maxLength={2000}
            />
            <div className="examples">
              <span>Try an example</span>
              {examples.map((example, index) => (
                <button type="button" key={example} onClick={() => setSituation(example)}>Scenario {index + 1}</button>
              ))}
            </div>

            <div className="field-header household-header">
              <div><span className="field-index">02</span><h2>Who is with you?</h2></div>
              <span className="optional">Optional</span>
            </div>
            <div className="household-grid">
              {householdOptions.map((option) => (
                <button
                  type="button"
                  className={`household-option ${household[option.key] ? 'selected' : ''}`}
                  aria-pressed={household[option.key]}
                  key={option.key}
                  onClick={() => toggle(option.key)}
                >
                  <i>{household[option.key] ? '✓' : '+'}</i>
                  <span><b>{option.label}</b><small>{option.detail}</small></span>
                </button>
              ))}
            </div>

            {health?.status === 'error' ? (
              <div className="setup-error" role="alert">
                <strong>Ollama could not start.</strong>
                <span>{health.error ?? 'Confirm Ollama is running and the model is downloaded.'}</span>
              </div>
            ) : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="submit-button" type="button" disabled={!ready || busy || situation.trim().length < 1} onClick={() => void submit()}>
              <span>{!ready ? 'Warming local AI…' : busy ? 'Building your plan…' : 'Build my offline plan'}</span>
              <b aria-hidden="true">→</b>
            </button>
            <p className="disclaimer">Educational emergency guidance only. Call emergency services when available. This app cannot diagnose or prescribe treatment.</p>
          </section>
        </>
      ) : (
        <section className="results">
          <div className="results-topline">
            <div>
              <p className="eyebrow">YOUR OFFLINE ACTION PLAN</p>
              <h1>Priorities for right now.</h1>
            </div>
            <button className="reset-button" type="button" onClick={startOver}>← Start over</button>
          </div>

          {result.analysis.immediateDanger ? (
            <div className="danger-banner"><strong>Immediate danger detected</strong><span>Move to safety and contact emergency services if available.</span></div>
          ) : null}
          {result.notice ? <div className="notice" role="status">{result.notice}</div> : null}
          {result.followUpQuestion ? (
            <div className="follow-up"><span>One detail would help</span><strong>{result.followUpQuestion}</strong><button type="button" onClick={startOver}>Add details</button></div>
          ) : null}

          {(['immediate', 'next', 'prepare'] as Priority[]).map((priority) => grouped[priority].length ? (
            <div className="plan-section" key={priority}>
              <div className="section-label"><span>{sectionLabels[priority]}</span><i /></div>
              {grouped[priority].map((item, index) => <PlanCard item={item} index={index} key={item.guideId} />)}
            </div>
          ) : null)}

          <div className="ai-explainer">
            <span className="explainer-mark">AI</span>
            <div><strong>AI prioritized these guides. It did not write the safety steps.</strong><p>Every instruction above was loaded from vetted guidance stored on this laptop.</p></div>
            <dl><div><dt>Engine</dt><dd>{result.runtime.engine}</dd></div><div><dt>Cloud calls</dt><dd>{result.runtime.cloudCalls}</dd></div><div><dt>Trace</dt><dd>{result.runtime.requestId ?? '—'}</dd></div></dl>
          </div>
        </section>
      )}

      <footer><span>FieldLink Civilian · HackMIT 2026</span><span>Designed for infrastructure failure</span></footer>
    </main>
  );
}
