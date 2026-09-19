export type NetProfile = 'clean' | 'degraded' | 'hostile';

export function resolveNetProfile(raw = process.env.NET_PROFILE): NetProfile {
  if (raw === 'degraded' || raw === 'hostile') return raw;
  return 'clean';
}

export function defaultIngestUrl(): string {
  return process.env.HQ_INGEST_URL ?? 'http://127.0.0.1:3001/api/ingest';
}

export function isAllowedHost(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname;
  if (host === '127.0.0.1' || host === 'localhost' || host === '::1') return true;
  const parts = host.split('.').map(Number);
  if (parts.length === 4 && parts[0] === 169 && parts[1] === 254) {
    return parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
  }
  return false;
}

export function assertAllowedUrl(url: string): void {
  if (!isAllowedHost(url)) {
    throw new Error(
      `offline guard: ${url} is not loopback or Thunderbolt link-local (169.254.0.0/16)`,
    );
  }
}
