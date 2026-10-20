/** Character budget that still leaves room for the prompt inside a 4k context. */
export const MAX_DUMP_CHARS = 10_000;

export function fitDump(
  input: string,
  max = MAX_DUMP_CHARS,
): { text: string; trimmed: boolean } {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (normalized.length <= max) {
    return { text: normalized, trimmed: false };
  }
  return { text: normalized.slice(-max).trimStart(), trimmed: true };
}
