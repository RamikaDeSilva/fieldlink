# FieldLink

Offline-first guidance for responders, HQ, and civilians. Local models classify situations while vetted, stored guidance supplies the actions. The responder product relays compact sitreps to HQ; the separate civilian product builds a private action plan when internet service is unavailable.

## Why this shape

Analog radio is synchronous and expensive. A 2 KB structured update is asynchronous and cheap. Voice stays reserved for true escalations.

The model never authors medical advice. It emits `protocol`, `triage_level`, and `condition_tags`. Directive text always comes from `source: "protocol_table"`. If the model and a protocol lexicon disagree, the system escalates rather than acting.

Demo protocols: drowning/CPR, massive hemorrhage, and an explicit out-of-scope refusal.

## Workspaces

| Package | Owner | Role |
| --- | --- | --- |
| `packages/contract` | shared | Zod schemas, JSON Schema for QVAC, fixtures |
| `packages/triage` | Dev C | `ScriptedEngine`, `QvacEngine`, protocol table, lexicon |
| `packages/transport` | Dev B | Envelope, outbox retry/dedupe, `NET_PROFILE` |
| `packages/evals` | Dev C | Phrase corpus |
| `apps/responder` | Dev A | Field unit UI + API |
| `apps/hq` | Dev A | Command dashboard + ingest |
| `apps/civilian` | standalone | Offline civilian disaster planner + Ollama adapter |

## Commands

```bash
npm install
ENGINE=scripted npm test
ENGINE=scripted npm run gate
ENGINE=scripted npm run dev:responder
npm run dev:hq
npm run dev:civilian   # Meta Llama through local Ollama
npm run models:prefetch   # optional, while online
```

`@qvac/sdk` is optional. Default `ENGINE=scripted` needs no native binaries. To swap in the real local model:

```bash
npm i @qvac/sdk -w @fieldlink/triage
npm run models:prefetch
ENGINE=qvac npm run dev:responder
```

`npm test` is Vitest at the root (`projects`). The slow `evals-qvac` project is opt-in:

```bash
EVAL_ENGINE=qvac npm run test:qvac
```

## Civilian local Meta AI

Install [Ollama](https://ollama.com/download), then download the model while online:

```bash
ollama pull llama3.2:1b-instruct-q4_K_M
```

PowerShell:

```powershell
$env:CIVILIAN_ENGINE="ollama"
npm run dev:civilian
```

macOS/Linux:

```bash
CIVILIAN_ENGINE=ollama npm run dev:civilian
```

Open http://127.0.0.1:3002. Once the status says **Local AI ready**, disconnect Wi-Fi and use the app normally. The browser talks only to the local FieldLink server, which talks to Ollama at `127.0.0.1:11434`.

For a rehearsal without Ollama, use the visible scripted kill switch:

```powershell
$env:CIVILIAN_ENGINE="scripted"
npm run dev:civilian
```

The model returns only validated guide IDs and situation categories. All displayed safety steps are loaded from the civilian app's offline CDC, Ready.gov, FDA, and American Red Cross guide cards.

## Environment

See `.env.example`.

- `ENGINE=scripted|qvac`
- `NET_PROFILE=clean|degraded|hostile`
- `HQ_INGEST_URL=http://127.0.0.1:3001/api/ingest` (Thunderbolt: `http://169.254.x.x:3001/api/ingest`)
- `CIVILIAN_ENGINE=ollama|scripted`
- `OLLAMA_URL=http://127.0.0.1:11434`
- `OLLAMA_MODEL=llama3.2:1b-instruct-q4_K_M`

## Demo

Step-by-step stage notes live in [DEMO.md](DEMO.md).
