export type TransportLog = {
  event: string;
  seq: number;
  report_id?: string;
  attempt?: number;
  max?: number;
};

export function formatTransportLog(entry: TransportLog): string {
  switch (entry.event) {
    case 'drop':
      return `drop seq=${entry.seq} -> retry ${entry.attempt}/${entry.max}`;
    case 'retry':
      return `retry seq=${entry.seq} attempt=${entry.attempt}/${entry.max}`;
    case 'ack':
      return `ack seq=${entry.seq} dedupe=miss`;
    case 'dedupe':
      return `ack seq=${entry.seq} dedupe=hit`;
    case 'send':
      return `send seq=${entry.seq} report=${entry.report_id ?? '?'}`;
    default:
      return `${entry.event} seq=${entry.seq}`;
  }
}

export function logTransport(entry: TransportLog): void {
  console.log(formatTransportLog(entry));
}
