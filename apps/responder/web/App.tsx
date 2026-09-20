import { useEffect, useRef, useState } from 'react';
import type { FieldReport, HealthStatus } from '@fieldlink/contract';
import { encodeBrowserPcmWave } from '../../../packages/triage/src/pcm-wav.ts';
import { AirplaneModeBanner, DirectiveCard, TelemetryPanel } from './components.tsx';

type Recording = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  silentOutput: GainNode;
  chunks: Float32Array[];
  sampleRate: number;
};

export function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [text, setText] = useState('');
  const [report, setReport] = useState<FieldReport | null>(null);
  const [status, setStatus] = useState('Waiting for local engine…');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef<Recording | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/health');
        const json = (await res.json()) as HealthStatus;
        if (!cancelled) {
          setHealth(json);
          if (json.error && json.status !== 'ready') {
            setStatus(`Local model failed: ${json.error}`);
            return;
          }
          setStatus(json.status === 'ready' ? 'Engine warm. Tactical stealth ready.' : 'Loading local model…');
        }
        if (json.status !== 'ready' && !json.error && !cancelled) {
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

  async function submit(mode: 'text' | 'voice' = 'text', sitrep = text) {
    const payload = sitrep.trim();
    if (!payload) {
      setStatus('Empty sitrep. Type or record first.');
      return;
    }
    setBusy(true);
    setStatus('Classifying on-device…');
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: payload, mode }),
      });
      const json = (await res.json()) as { report?: FieldReport; error?: string; message?: string };
      if (!res.ok || !json.report) {
        setStatus(json.message ?? json.error ?? `Submit failed (${res.status})`);
        return;
      }
      setReport(json.report);
      setStatus(
        json.report.protocol === 'out_of_scope'
          ? 'Escalated. Voice channel to HQ is open.'
          : 'Directive from protocol table. Payload queued to HQ.',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  }

  async function startVoice() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Voice capture unavailable. Use tactical stealth text.');
      return;
    }
    setStatus('Listening locally… speak the sitrep.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16_000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const context = new AudioContext({ sampleRate: 16_000 });
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
      setRecording(true);
      recordingTimerRef.current = window.setTimeout(() => void stopVoice(), 6_000);
    } catch (error) {
      setRecording(false);
      setStatus(error instanceof Error ? `Microphone unavailable: ${error.message}` : 'Microphone permission was not granted.');
    }
  }

  async function stopVoice() {
    const current = recordingRef.current;
    if (!current) return;
    recordingRef.current = null;
    if (recordingTimerRef.current !== null) {
      window.clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    current.processor.onaudioprocess = null;
    current.processor.disconnect();
    current.source.disconnect();
    current.silentOutput.disconnect();
    current.stream.getTracks().forEach((track) => track.stop());
    await current.context.close();
    setRecording(false);

    if (current.chunks.length === 0) {
      setStatus('No audio was captured. Try again or type the sitrep.');
      return;
    }

    setBusy(true);
    setStatus('Transcribing locally…');
    try {
      const wav = encodeBrowserPcmWave(current.chunks, current.sampleRate);
      const body = new ArrayBuffer(wav.byteLength);
      new Uint8Array(body).set(wav);
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'content-type': 'audio/wav' },
        body,
      });
      const json = (await res.json()) as { text?: string; error?: string; message?: string };
      if (!res.ok || !json.text) {
        setStatus(json.message ?? json.error ?? 'Voice path offline. Type the sitrep — tactical stealth mode.');
        return;
      }
      setText(json.text);
      setStatus('Transcript ready. Classifying on-device…');
      await submit('voice', json.text);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Voice path offline. Type the sitrep.');
    } finally {
      setBusy(false);
    }
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
            <button className="primary" disabled={!ready || busy || recording || !text.trim()} onClick={() => void submit()}>
              {!ready ? 'Warming model…' : busy ? 'Sending…' : 'Send structured update'}
            </button>
            <button
              className="ghost"
              disabled={!ready || busy}
              onClick={() => void (recording ? stopVoice() : startVoice())}
            >
              {recording ? 'Stop voice' : 'Voice'}
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
