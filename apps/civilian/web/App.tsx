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

type VoiceHealth = {
  status: 'loading' | 'ready' | 'error';
  engine: string;
  local: true;
  fallback?: boolean;
  primaryStatus?: 'loading' | 'ready' | 'error';
  error?: string;
};

type RecordingSession = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  silentOutput: GainNode;
  chunks: Float32Array[];
  sampleRate: number;
};

function encodePcmWave(chunks: Float32Array[], sampleRate: number): Blob {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, sampleCount * 2, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 32768 : clamped * 32767, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

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
  const [voiceHealth, setVoiceHealth] = useState<VoiceHealth | null>(null);
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [voiceMessage, setVoiceMessage] = useState('');
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const recordingRef = useRef<RecordingSession | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const pollVoice = async () => {
      try {
        const response = await fetch('/api/voice/health');
        const next = await response.json() as VoiceHealth;
        if (cancelled) return;
        setVoiceHealth(next);
        if (next.primaryStatus === 'loading' || next.status === 'loading') {
          timer = window.setTimeout(() => void pollVoice(), 1_000);
        }
      } catch {
        if (!cancelled) setVoiceHealth({ status: 'error', engine: 'unavailable', local: true, error: 'Voice service is unavailable.' });
      }
    };
    void pollVoice();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => () => {
    if (recordingTimerRef.current !== null) window.clearTimeout(recordingTimerRef.current);
    const recording = recordingRef.current;
    recording?.stream.getTracks().forEach((track) => track.stop());
    recording?.processor.disconnect();
    recording?.source.disconnect();
    void recording?.context.close();
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

  function appendTranscript(text: string) {
    const append = (current: string) => [current.trim(), text.trim()].filter(Boolean).join(' ');
    if (result) setFollowUpText(append);
    else setSituation(append);
  }

  async function startRecording() {
    setVoiceMessage('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceMessage('This browser does not provide microphone access. You can still type.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silentOutput = context.createGain();
      silentOutput.gain.value = 0;
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(silentOutput);
      silentOutput.connect(context.destination);
      recordingRef.current = { stream, context, source, processor, silentOutput, chunks, sampleRate: context.sampleRate };
      setVoiceState('recording');
      setVoiceMessage('Listening locally… Speak for up to 20 seconds.');
      recordingTimerRef.current = window.setTimeout(() => void stopRecording(), 20_000);
    } catch (caught) {
      setVoiceState('idle');
      setVoiceMessage(caught instanceof Error ? `Microphone unavailable: ${caught.message}` : 'Microphone permission was not granted.');
    }
  }

  async function stopRecording() {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    if (recordingTimerRef.current !== null) {
      window.clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    recording.processor.onaudioprocess = null;
    recording.processor.disconnect();
    recording.source.disconnect();
    recording.silentOutput.disconnect();
    recording.stream.getTracks().forEach((track) => track.stop());
    await recording.context.close();

    if (recording.chunks.length === 0) {
      setVoiceState('idle');
      setVoiceMessage('No audio was captured. Try again or type your situation.');
      return;
    }

    setVoiceState('transcribing');
    setVoiceMessage(`Transcribing locally with ${voiceHealth?.engine ?? 'Whisper Tiny'}…`);
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'content-type': 'audio/wav' },
        body: encodePcmWave(recording.chunks, recording.sampleRate),
      });
      const body = await response.json() as { text?: string; error?: string; message?: string; engine?: string };
      if (!response.ok || !body.text) throw new Error(body.message ?? body.error ?? 'No speech was recognized.');
      appendTranscript(body.text);
      setVoiceMessage(`Transcript added using ${body.engine ?? 'local speech recognition'}. Review it, then send.`);
    } catch (caught) {
      setVoiceMessage(caught instanceof Error ? `Could not transcribe: ${caught.message}` : 'Could not transcribe this recording.');
    } finally {
      setVoiceState('idle');
    }
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
          <span className="brand-copy"><strong>FieldLink</strong><small>Civilian safety</small></span>
        </a>
        <div className="masthead-status">
          <span className="offline-label">Private · Offline</span>
          <div className={`model-pill ${health?.status ?? 'loading'}`} data-testid="model-status">
            <i />
            <span>{health?.status === 'ready' ? 'Local AI ready' : health?.status === 'error' ? 'Local AI unavailable' : 'Warming local AI'}</span>
          </div>
        </div>
      </header>

      <section className="chat-layout" id="top">
        <div className="chat-intro">
          <div>
            <p className="eyebrow">PERSONAL SAFETY / PRIVATE DISASTER GUIDANCE</p>
            <h1>Tell us what’s happening.</h1>
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
              <button
                className={`voice-button ${voiceState}`}
                type="button"
                disabled={voiceState === 'transcribing' || voiceHealth?.status === 'error'}
                aria-label={voiceState === 'recording' ? 'Stop voice recording' : 'Record voice input'}
                onClick={() => voiceState === 'recording' ? void stopRecording() : void startRecording()}
              >
                <i aria-hidden="true">{voiceState === 'recording' ? '■' : 'MIC'}</i>
                <span>{voiceState === 'recording' ? 'Stop' : voiceState === 'transcribing' ? 'Working…' : 'Speak'}</span>
              </button>
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
                className="send-button"
                type="button"
                disabled={!ready || busy || !composerValue.trim()}
                onClick={sendCurrentMessage}
              >
                {!ready ? 'Warming local AI…' : busy ? 'Thinking locally…' : result ? 'Send details' : 'Build my offline plan'}
                <b aria-hidden="true">→</b>
              </button>
            </div>
            <div className="composer-meta">
              <p className={`voice-message ${voiceState}`}>{voiceMessage || `${voiceHealth?.engine ?? 'Voice model'} · Audio stays on this laptop`}</p>
              <p className="composer-note">Enter to send · Shift+Enter for a new line · Educational guidance only</p>
            </div>
          </div>
        </div>
      </section>

      <footer><span>FieldLink Civilian · HackMIT 2026</span><span>Designed for infrastructure failure</span></footer>
    </main>
  );
}
