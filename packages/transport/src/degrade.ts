import type { NetProfile } from './host.ts';

export type DegradeConfig = {
  profile: NetProfile;
  dropRate: number;
  minDelayMs: number;
  maxDelayMs: number;
};

export function degradeConfig(profile: NetProfile): DegradeConfig {
  switch (profile) {
    case 'hostile':
      return { profile, dropRate: 0.2, minDelayMs: 800, maxDelayMs: 2000 };
    case 'degraded':
      return { profile, dropRate: 0.08, minDelayMs: 400, maxDelayMs: 1200 };
    default:
      return { profile, dropRate: 0, minDelayMs: 0, maxDelayMs: 0 };
  }
}

export async function applyDegrade(
  config: DegradeConfig,
  random: () => number = Math.random,
): Promise<'ok' | 'drop'> {
  if (config.maxDelayMs > 0) {
    const span = config.maxDelayMs - config.minDelayMs;
    const delay = config.minDelayMs + Math.round(random() * span);
    await sleep(delay);
  }
  if (config.dropRate > 0 && random() < config.dropRate) return 'drop';
  return 'ok';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
