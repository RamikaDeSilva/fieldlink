export {
  defaultIngestUrl,
  isAllowedHost,
  assertAllowedUrl,
  resolveNetProfile,
} from './host.ts';
export type { NetProfile } from './host.ts';
export { Outbox, defaultHttpSend } from './outbox.ts';
export type { SendFn, OutboxOptions } from './outbox.ts';
export { Inbox } from './inbox.ts';
export { degradeConfig, applyDegrade, sleep } from './degrade.ts';
export type { DegradeConfig } from './degrade.ts';
export { formatTransportLog, logTransport } from './logger.ts';
