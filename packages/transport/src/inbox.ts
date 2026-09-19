import { Envelope, type FieldReport } from '@fieldlink/contract';
import { logTransport } from './logger.ts';

export class Inbox {
  private readonly reports = new Map<string, FieldReport>();
  private readonly order: string[] = [];
  private bytes = 0;

  ingest(raw: unknown): { report: FieldReport; duplicate: boolean } {
    const envelope = Envelope.parse(raw);
    this.bytes += JSON.stringify(envelope).length;
    if (this.reports.has(envelope.report_id)) {
      logTransport({ event: 'dedupe', seq: envelope.seq, report_id: envelope.report_id });
      return { report: this.reports.get(envelope.report_id)!, duplicate: true };
    }
    this.reports.set(envelope.report_id, envelope.payload);
    this.order.push(envelope.report_id);
    logTransport({ event: 'ack', seq: envelope.seq, report_id: envelope.report_id });
    return { report: envelope.payload, duplicate: false };
  }

  list(): FieldReport[] {
    return this.order.map((id) => this.reports.get(id)!);
  }

  bytesIngested(): number {
    return this.bytes;
  }

  clear(): void {
    this.reports.clear();
    this.order.length = 0;
    this.bytes = 0;
  }
}
