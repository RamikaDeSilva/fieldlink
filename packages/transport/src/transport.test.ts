import { describe, expect, it } from 'vitest';
import { Envelope, fixtures } from '@fieldlink/contract';
import {
  Inbox,
  Outbox,
  assertAllowedUrl,
  formatTransportLog,
  isAllowedHost,
} from './index.ts';

describe('offline guard', () => {
  it('allows loopback and Thunderbolt link-local only', () => {
    expect(isAllowedHost('http://127.0.0.1:3001/api/ingest')).toBe(true);
    expect(isAllowedHost('http://localhost:3001/api/ingest')).toBe(true);
    expect(isAllowedHost('http://169.254.1.5:3001/api/ingest')).toBe(true);
    expect(isAllowedHost('https://api.openai.com/v1')).toBe(false);
    expect(isAllowedHost('http://8.8.8.8/api')).toBe(false);
    expect(() => assertAllowedUrl('https://example.com')).toThrow(/offline guard/);
  });
});

describe('outbox', () => {
  it('assigns increasing seq and preserves payload integrity', async () => {
    const sent: Envelope[] = [];
    const outbox = new Outbox({
      degrade: { profile: 'clean', dropRate: 0, minDelayMs: 0, maxDelayMs: 0 },
      send: async (envelope) => {
        sent.push(envelope);
        return true;
      },
    });

    await outbox.dispatch(fixtures.cprDrowningReport);
    await outbox.dispatch(fixtures.hemorrhageReport);

    expect(sent).toHaveLength(2);
    expect(sent[0]?.seq).toBe(0);
    expect(sent[1]?.seq).toBe(1);
    expect(sent[0]?.payload).toEqual(fixtures.cprDrowningReport);
    expect(sent[1]?.report_id).toBe(fixtures.hemorrhageReport.report_id);
  });

  it('dedupes by report_id and does not resend', async () => {
    let calls = 0;
    const outbox = new Outbox({
      degrade: { profile: 'clean', dropRate: 0, minDelayMs: 0, maxDelayMs: 0 },
      send: async () => {
        calls += 1;
        return true;
      },
    });
    await outbox.dispatch(fixtures.cprDrowningReport);
    await outbox.dispatch(fixtures.cprDrowningReport);
    expect(calls).toBe(1);
    expect(outbox.alreadySent(fixtures.cprDrowningReport.report_id)).toBe(true);
  });

  it('delivers exactly once under a hostile drop profile', async () => {
    const received: string[] = [];
    let rolls = 0;
    const random = () => {
      rolls += 1;
      return rolls === 1 ? 0.01 : 0.9;
    };

    const outbox = new Outbox({
      degrade: { profile: 'hostile', dropRate: 0.2, minDelayMs: 0, maxDelayMs: 0 },
      send: async (envelope) => {
        received.push(envelope.report_id);
        return true;
      },
    });

    const originalRandom = Math.random;
    Math.random = random;
    try {
      await outbox.dispatch(fixtures.hemorrhageReport);
    } finally {
      Math.random = originalRandom;
    }

    expect(received).toEqual([fixtures.hemorrhageReport.report_id]);
  });
});

describe('inbox', () => {
  it('keeps insertion order and ignores duplicate report_id', () => {
    const inbox = new Inbox();
    const first = inbox.ingest({
      seq: 0,
      report_id: fixtures.cprDrowningReport.report_id,
      sent_at: '2026-09-19T13:45:01Z',
      payload: fixtures.cprDrowningReport,
    });
    const again = inbox.ingest({
      seq: 1,
      report_id: fixtures.cprDrowningReport.report_id,
      sent_at: '2026-09-19T13:45:02Z',
      payload: fixtures.cprDrowningReport,
    });
    expect(first.duplicate).toBe(false);
    expect(again.duplicate).toBe(true);
    expect(inbox.list()).toHaveLength(1);
  });
});

describe('audience logs', () => {
  it('formats drop and ack lines for a ten-foot terminal', () => {
    expect(formatTransportLog({ event: 'drop', seq: 4, attempt: 1, max: 3 })).toBe(
      'drop seq=4 -> retry 1/3',
    );
    expect(formatTransportLog({ event: 'dedupe', seq: 4 })).toBe('ack seq=4 dedupe=hit');
  });
});
