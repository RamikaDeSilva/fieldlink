# FieldLink

Offline-first triage relay for first responders and HQ. A local model **classifies** a sitrep. A hardcoded protocol table **prescribes** the next steps. HQ receives a small JSON envelope instead of a voice channel.

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

## Commands

```bash
npm install
ENGINE=scripted npm test
ENGINE=scripted npm run gate
ENGINE=scripted npm run dev:responder
npm run dev:hq
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

## Environment

See `.env.example`.

- `ENGINE=scripted|qvac`
- `NET_PROFILE=clean|degraded|hostile`
- `HQ_INGEST_URL=http://127.0.0.1:3001/api/ingest` (Thunderbolt: `http://169.254.x.x:3001/api/ingest`)

## Demo

Step-by-step stage notes live in [DEMO.md](DEMO.md).
