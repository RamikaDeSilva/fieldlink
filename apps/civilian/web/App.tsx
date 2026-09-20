import { useEffect, useMemo, useRef, useState } from 'react';
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

type ConversationMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
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
  const [conversationContext, setConversationContext] = useState('');
  const [followUpText, setFollowUpText] = useState('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const conversationEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (messages.length > 0) {
      conversationEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, result]);

  function toggle(key: keyof Household) {
    setHousehold((current) => ({ ...current, [key]: !current[key] }));
  }

  async function submit(nextDetail?: string) {
    const detail = (nextDetail ?? situation).trim();
    if (!detail) return;
    const nextContext = conversationContext
      ? `${conversationContext}\nAdditional detail: ${detail}`
      : detail;
    setBusy(true);
    setError('');
    console.info('[civilian.ui] plan.request', {
      inputChars: nextContext.length,
      followUp: conversationContext.length > 0,
      household,
    });
    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ situation: nextContext, household }),
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
      setConversationContext(nextContext);
      setMessages((current) => [
        ...current,
        { id: Date.now(), role: 'user', text: detail },
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: body.followUpQuestion
            ?? (body.plan.length > 0
              ? `I found ${body.plan.length} relevant offline guide${body.plan.length === 1 ? '' : 's'} and prioritized what to do next.`
              : 'I could not match that to a supported offline guide yet. Add one concrete detail about what you can observe.'),
        },
      ]);
      setFollowUpText('');
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
    setConversationContext('');
    setFollowUpText('');
    setMessages([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function submitFollowUp() {
    if (!busy && followUpText.trim()) void submit(followUpText);
  }

  const composerValue = result ? followUpText : situation;

  function updateComposer(value: string) {
    if (result) setFollowUpText(value);
    else setSituation(value);
  }

  function sendCurrentMessage() {
    if (result) submitFollowUp();
    else if (!busy && situation.trim()) void submit();
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

      <section className="chat-layout" id="top">
        <div className="chat-intro">
          <div>
            <p className="eyebrow">PRIVATE DISASTER GUIDANCE · COMPLETELY LOCAL</p>
            <h1>What’s happening?</h1>
            <p>FieldLink turns a stressful description into clear, vetted next steps—without sending anything to the cloud.</p>
          </div>
          {result ? <button className="reset-button" type="button" onClick={startOver}>← Start over</button> : null}
        </div>

        <div className="chat-panel">
          <div className="chat-telemetry">
            <span><b>Meta Llama 3.2</b> on this laptop</span>
            <span>No cloud</span>
            <span>Cloud calls <b>{result?.runtime.cloudCalls ?? 0}</b></span>
            {result?.runtime.requestId ? <span>Trace <b>{result.runtime.requestId}</b></span> : null}
          </div>

          <div className="conversation" aria-label="Conversation with FieldLink" aria-live="polite">
            <div className="conversation-message assistant opening-message">
              <span>FieldLink</span>
              <p>Tell me what happened. Include what you can see, hear, or smell, whether anyone is injured, and who is with you.</p>
            </div>

            {messages.map((message) => (
              <div className={`conversation-message ${message.role}`} key={message.id}>
                <span>{message.role === 'user' ? 'You' : 'FieldLink'}</span>
                <p>{message.text}</p>
              </div>
            ))}

            {result?.analysis.immediateDanger ? (
              <div className="danger-banner assistant-response"><strong>Immediate danger detected</strong><span>Move to safety and contact emergency services if available.</span></div>
            ) : null}
            {result?.notice ? <div className="notice assistant-response" role="status">{result.notice}</div> : null}

            {result && result.plan.length > 0 ? (
              <div className="assistant-plan">
                <div className="safety-boundary"><b>Vetted offline guidance</b><span>AI prioritized these guides. It did not write the safety steps.</span></div>
                {(['immediate', 'next', 'prepare'] as Priority[]).map((priority) => grouped[priority].length ? (
                  <div className="plan-section" key={priority}>
                    <div className="section-label"><span>{sectionLabels[priority]}</span><i /></div>
                    {grouped[priority].map((item, index) => <PlanCard item={item} index={index} key={item.guideId} />)}
                  </div>
                ) : null)}
              </div>
            ) : null}
            <div ref={conversationEndRef} />
          </div>

          <div className="chat-controls">
            <div className="chat-household">
              <span>Who is with you? <small>Optional</small></span>
              <div>
                {householdOptions.map((option) => (
                  <button
                    type="button"
                    className={household[option.key] ? 'selected' : ''}
                    aria-pressed={household[option.key]}
                    key={option.key}
                    onClick={() => toggle(option.key)}
                  >
                    {household[option.key] ? '✓ ' : '+ '}{option.label}
                  </button>
                ))}
              </div>
            </div>

            {!result ? (
              <div className="examples">
                <span>Try an example</span>
                {examples.map((example, index) => (
                  <button type="button" key={example} onClick={() => setSituation(example)}>Scenario {index + 1}</button>
                ))}
              </div>
            ) : null}

            {health?.status === 'error' ? (
              <div className="setup-error" role="alert">
                <strong>Ollama could not start.</strong>
                <span>{health.error ?? 'Confirm Ollama is running and the model is downloaded.'}</span>
              </div>
            ) : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}

            <div className="chat-composer">
              <label className="sr-only" htmlFor="situation">{result ? 'Add details to the situation' : 'Describe what is happening'}</label>
              <textarea
                id="situation"
                value={composerValue}
                onChange={(event) => updateComposer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendCurrentMessage();
                  }
                }}
                placeholder={result?.followUpQuestion ?? (result ? 'Add an update or answer FieldLink…' : 'Describe what is happening…')}
                maxLength={result ? 800 : 2000}
              />
              <button
                type="button"
                disabled={!ready || busy || !composerValue.trim()}
                onClick={sendCurrentMessage}
              >
                {!ready ? 'Warming local AI…' : busy ? 'Thinking locally…' : result ? 'Send details' : 'Build my offline plan'}
                <b aria-hidden="true">→</b>
              </button>
            </div>
            <p className="composer-note">Enter to send · Shift+Enter for a new line · Educational guidance only</p>
          </div>
        </div>
      </section>

      <footer><span>FieldLink Civilian · HackMIT 2026</span><span>Designed for infrastructure failure</span></footer>
    </main>
  );
}
