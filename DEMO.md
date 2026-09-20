# FieldLink demo runbook

## Civilian Meta-track demo

Download the model before the venue network becomes unreliable:

```bash
ollama pull llama3.2:1b-instruct-q4_K_M
```

PowerShell rehearsal:

```powershell
$env:CIVILIAN_ENGINE="ollama"
npm run dev:civilian
```

Wait for **Local AI ready** at http://127.0.0.1:3002, submit one hidden warmup scenario, and then turn Wi-Fi off.

1. Explain that cloud help may disappear with disaster infrastructure.
2. Show Wi-Fi off and the `Meta Llama 3.2 · Runs on this laptop · No cloud` proof line.
3. Submit something like `An earthquake knocked out power. The tap water smells strange. I am with my grandmother who needs insulin and our dog.` Select older adults, medication needs, and pets.
4. Point out that AI prioritized the guides, while every safety step came from stored, attributed sources.
5. Start over and submit: `My neighbor cut their leg and blood is spurting.` Show the deterministic immediate-danger override.
6. Close with the path from a laptop proof to native mobile inference through ExecuTorch.

Civilian kill switch:

```powershell
$env:CIVILIAN_ENGINE="scripted"
npm run dev:civilian
```

The UI labels scripted mode in its results telemetry; do not represent it as a live Llama run.

The Hour-6 gate is one command:

```bash
ENGINE=scripted npm run gate
```

If that is green, the pipes are clean. Do not load a real model until it is.

## One-laptop rehearsal

Terminal 1:

```bash
ENGINE=scripted NET_PROFILE=hostile npm run dev:responder
```

Terminal 2:

```bash
npm run dev:hq
```

- Responder: http://127.0.0.1:3000
- HQ: http://127.0.0.1:3001

Keep the responder terminal visible. Under `NET_PROFILE=hostile` judges should see lines like:

```
drop seq=4 -> retry 1/3
ack seq=4 dedupe=miss
```

## Kill switch

If QVAC misbehaves on stage:

```bash
ENGINE=scripted npm run dev:responder
```

Same UI, same transport, same protocol table. Only the classifier is replaced.

## Cold start

`warmup()` runs a throwaway classification through the real JSON Schema at boot so the GBNF compile is paid before anyone clicks. `/api/health` reports `status`, `load_ms`, and `warm_ms`. The Send button stays disabled until `ready`.

QVAC is not a default install — native prebuilds are huge. When you are ready to swap engines:

```bash
npm i @qvac/sdk -w @fieldlink/triage
ENGINE=qvac npm run models:prefetch
ENGINE=qvac npm run dev:responder
```

Prefetch weights while wifi still works:

```bash
npm run models:prefetch
```

Cache lives in `.qvac/` (gitignored). `qvac.config.json` pins `cacheDirectory`.

## Thunderbolt (Mac-to-Mac)

1. Connect the cable. Both Macs: System Settings → Network → Thunderbolt Bridge.
2. Note the HQ Mac's self-assigned `169.254.x.x`.
3. On the responder Mac:

```bash
ENGINE=scripted HQ_INGEST_URL=http://169.254.x.x:3001/api/ingest npm run dev:responder
```

4. Enable Airplane Mode. Confirm the banner: no Wi-Fi, no LTE, local NPU on.
5. Submit a sitrep from the field unit. It must appear on HQ.

The outbound URL must stay in `127.0.0.1` or `169.254.0.0/16`. Anything else fails the offline guard.

## Voice (stretch)

Text input is the primary path and is pitched as tactical stealth mode. If QVAC Whisper is loaded, the Voice button posts audio to `/api/transcribe`. Read-back uses `/api/speak`. Scripted engine returns 501 and the UI stays on text.
