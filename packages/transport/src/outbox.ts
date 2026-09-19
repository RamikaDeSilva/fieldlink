import { Envelope, type FieldReport } from '@fieldlink/contract';
import { applyDegrade, degradeConfig, sleep, type DegradeConfig } from './degrade.ts';
import { assertAllowedUrl, resolveNetProfile } from './host.ts';
import { logTransport } from './logger.ts';

export type SendFn = (envelope: Envelope) => Promise<boolean>;

export type OutboxOptions = {
  ingestUrl?: string;
  maxAttempts?: number;
  send?: SendFn;
  degrade?: DegradeConfig;
  now?: () => Date;
  log?: typeof logTransport;
};

export class Outbox {
  private seq = 0;
  private readonly seen = new Set<string>();
  private readonly maxAttempts: number;
  private readonly send: SendFn;
  private readonly degrade: DegradeConfig;
  private readonly now: () => Date;
  private readonly log: typeof logTransport;

  constructor(options: OutboxOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.degrade = options.degrade ?? degradeConfig(resolveNetProfile());
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? logTransport;
    this.send = options.send ?? defaultHttpSend(options.ingestUrl);
  }

  nextSeq(): number {
    const current = this.seq;
    this.seq += 1;
    return current;
  }

  alreadySent(reportId: string): boolean {
    return this.seen.has(reportId);
  }

  wrap(report: FieldReport, seq = this.nextSeq()): Envelope {
    return Envelope.parse({
      seq,
      report_id: report.report_id,
      sent_at: this.now().toISOString(),
      payload: report,
    });
  }

  async dispatch(report: FieldReport): Promise<Envelope> {
    if (this.seen.has(report.report_id)) {
      const replay = this.wrap(report, this.seq);
      this.log({ event: 'dedupe', seq: replay.seq, report_id: report.report_id });
      return replay;
    }

    const envelope = this.wrap(report);
    this.log({ event: 'send', seq: envelope.seq, report_id: report.report_id });

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const path = await applyDegrade(this.degrade);
      if (path === 'drop') {
        this.log({
          event: 'drop',
          seq: envelope.seq,
          attempt,
          max: this.maxAttempts,
        });
        await sleep(50 * attempt);
        continue;
      }

      const ok = await this.send(envelope);
      if (ok) {
        this.seen.add(report.report_id);
        this.log({ event: 'ack', seq: envelope.seq, report_id: report.report_id });
        return envelope;
      }

      this.log({
        event: 'retry',
        seq: envelope.seq,
        attempt,
        max: this.maxAttempts,
      });
      await sleep(50 * attempt);
    }

    throw new Error(`outbox exhausted retries for seq=${envelope.seq}`);
  }
}

export function defaultHttpSend(ingestUrl?: string): SendFn {
  const url = ingestUrl ?? process.env.HQ_INGEST_URL ?? 'http://127.0.0.1:3001/api/ingest';
  assertAllowedUrl(url);
  return async (envelope) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    return response.ok;
  };
}
