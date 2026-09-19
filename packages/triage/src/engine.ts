import type { Classification, HealthStatus } from '@fieldlink/contract';

export interface LlmEngine {
  warmup(): Promise<void>;
  classify(text: string): Promise<Classification>;
  health(): HealthStatus;
  tokensPerSec?(): number;
  transcribe?(audio: Uint8Array, mimeType?: string): Promise<string>;
  speak?(text: string): Promise<Uint8Array>;
}

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
