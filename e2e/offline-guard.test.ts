import { describe, expect, it } from 'vitest';
import { assertAllowedUrl, defaultHttpSend, isAllowedHost } from '@fieldlink/transport';

describe('offline network guard', () => {
  it('refuses any ingest URL that is not loopback or 169.254.0.0/16', () => {
    expect(isAllowedHost('http://127.0.0.1:3001/api/ingest')).toBe(true);
    expect(isAllowedHost('http://169.254.12.9:3001/api/ingest')).toBe(true);
    expect(() => defaultHttpSend('https://api.openai.com/v1/chat')).toThrow(/offline guard/);
    expect(() => assertAllowedUrl('http://10.0.0.5:3001/api/ingest')).toThrow(/offline guard/);
  });
});
