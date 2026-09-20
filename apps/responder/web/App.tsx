import { useEffect, useState } from 'react';
import type { FieldReport, HealthStatus } from '@fieldlink/contract';
import { AirplaneModeBanner, DirectiveCard, TelemetryPanel } from './components.tsx';

export function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [text, setText] = useState('');
  const [report, setReport] = useState<FieldReport | null>(null);
  const [status, setStatus] = useState('Waiting for local engine…');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/health');
        const json = (await res.json()) as HealthStatus;
        if (!cancelled) {
          setHealth(json);
          setStatus(json.status === 'ready' ? 'Engine warm. Tactical stealth ready.' : 'Loading local model…');
        }
        if (json.status !== 'ready' && !cancelled) {
          window.setTimeout(() => void poll(), 400);
        }
      } catch {
        if (!cancelled) window.setTimeout(() => void poll(), 800);
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = health?.status === 'ready';

  async function submit(mode: 'text' | 'voice' = 'text') {
    setBusy(true);
    setStatus('Classifying on-device…');
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, mode }),
      });
      if (!res.ok) {
        setStatus(`Submit failed (${res.status})`);
        return;
      }
      const json = (await res.json()) as { report: FieldReport };
      setReport(json.report);
      setStatus(
        json.report.protocol === 'out_of_scope'
          ? 'Escalated. Voice channel to HQ is open.'
          : 'Directive from protocol table. Payload queued to HQ.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function captureVoice() {
    if (!navigator.mediaDevices) {
      setStatus('Voice capture unavailable. Use tactical stealth text.');
      return;
    }
    setStatus('Recording 4s… stay close to the mic.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
    });
    recorder.start();
    await new Promise((resolve) => window.setTimeout(resolve, 4000));
    recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    const blob = await done;
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'content-type': blob.type || 'audio/webm' },
      body: blob,
    });
    if (!res.ok) {
      setStatus('Voice path offline. Type the sitrep — tactical stealth mode.');
      return;
    }
    const json = (await res.json()) as { text: string };
    setText(json.text);
    setStatus('Transcript ready. Review, then send.');
  }

  async function speak() {
    if (!report) return;
    const spoken = report.directive.steps.join('. ');
    const res = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: spoken }),
    });
    if (!res.ok) {
      setStatus('TTS stretch goal offline. Read the steps on-screen.');
      return;
    }
    const audio = await res.blob();
    const url = URL.createObjectURL(audio);
    const player = new Audio(url);
    await player.play();
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">FieldLink · UNIT-7</p>
          <h1>Field unit</h1>
        </div>
      </header>
      <AirplaneModeBanner />
      <div className="grid">
        <section className="panel">
          <label htmlFor="sitrep">Tactical stealth sitrep</label>
          <textarea
            id="sitrep"
            value={text}
            placeholder="Victim pulled from water, unresponsive, not breathing…"
            onChange={(event) => setText(event.target.value)}
          />
          <div className="actions">
            <button className="primary" disabled={!ready || busy || !text.trim()} onClick={() => void submit()}>
              {!ready ? 'Warming model…' : busy ? 'Sending…' : 'Send structured update'}
            </button>
            <button className="ghost" disabled={!ready || busy} onClick={() => void captureVoice()}>
              Voice
            </button>
            <button className="ghost" disabled={!report} onClick={() => void speak()}>
              Read back
            </button>
          </div>
          <p className="status">{status}</p>
        </section>
        <TelemetryPanel health={health} />
      </div>
      {report ? <div style={{ marginTop: 16 }}><DirectiveCard report={report} /></div> : null}
    </div>
  );
}
