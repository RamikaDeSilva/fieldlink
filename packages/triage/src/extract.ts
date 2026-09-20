/** Isolate a JSON object from model output (stray whitespace, think tags, EOS). */
export function extractJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('no_json_object');
  }
  return raw.slice(start, end + 1);
}
