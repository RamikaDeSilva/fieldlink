type LogFields = Record<string, unknown>;

const debugEnabled = process.env.CIVILIAN_DEBUG === '1';

function serializeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export function civilianLog(event: string, fields: LogFields = {}, level: 'info' | 'warn' | 'error' = 'info') {
  if (process.env.NODE_ENV === 'test' && !debugEnabled) return;
  const entry = JSON.stringify({
    time: new Date().toISOString(),
    service: 'fieldlink-civilian',
    level,
    event,
    ...fields,
  });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

export function promptLogFields(situation: string): LogFields {
  return {
    inputChars: situation.length,
    inputWords: situation.trim().split(/\s+/).filter(Boolean).length,
    ...(debugEnabled ? { input: situation } : {}),
  };
}

export function errorLogFields(error: unknown): LogFields {
  return { error: serializeError(error) };
}
