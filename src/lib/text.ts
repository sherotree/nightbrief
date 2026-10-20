/** Character budget that still leaves room for the prompt inside a 4k context. */
export const MAX_DUMP_CHARS = 10_000;

export function normalizeDump(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/**
 * Clamp one model window to the most recent characters.
 * A full overnight dump does not stop here: `chunkDump` splits it so earlier
 * sections are still read, and only a single window uses this clamp.
 */
export function fitDump(
  input: string,
  max = MAX_DUMP_CHARS,
): { text: string; trimmed: boolean } {
  const normalized = normalizeDump(input);
  if (normalized.length <= max) {
    return { text: normalized, trimmed: false };
  }
  return { text: normalized.slice(-max).trimStart(), trimmed: true };
}

/** Scale the 4k-window budget down for a shorter Gemma context. */
export function dumpCharBudget(contextTokens: number): number {
  if (!Number.isFinite(contextTokens) || contextTokens >= 4096) {
    return MAX_DUMP_CHARS;
  }
  const scaled = Math.floor((MAX_DUMP_CHARS * contextTokens) / 4096);
  return Math.max(2_000, scaled);
}

/**
 * Split a dump into chronological windows that each fit in one context.
 * Windows overlap a little so a decision on a boundary is not stranded.
 */
export function chunkDump(input: string, maxChars = MAX_DUMP_CHARS): string[] {
  const max = Math.max(32, maxChars);
  const normalized = normalizeDump(input);
  if (!normalized) return [];
  if (normalized.length <= max) return [normalized];

  const units = splitUnits(normalized, max);
  const overlapBudget = Math.min(400, Math.floor(max / 5));
  const chunks: string[] = [];
  let index = 0;

  while (index < units.length) {
    let end = index;
    let size = 0;
    while (end < units.length) {
      const extra = units[end].length + (size > 0 ? 1 : 0);
      if (size > 0 && size + extra > max) break;
      size += extra;
      end += 1;
    }

    if (end === index) {
      chunks.push(units[index].slice(0, max));
      index += 1;
      continue;
    }

    chunks.push(units.slice(index, end).join("\n"));
    if (end >= units.length) break;

    let overlapUnits = 0;
    let overlapSize = 0;
    for (let cursor = end - 1; cursor > index; cursor -= 1) {
      const extra = units[cursor].length + (overlapUnits > 0 ? 1 : 0);
      if (overlapSize + extra > overlapBudget) break;
      overlapSize += extra;
      overlapUnits += 1;
    }
    const next = end - overlapUnits;
    index = next > index ? next : end;
  }

  return chunks;
}

/**
 * Keep the opening and the close of a note that still does not fit.
 * Used only after section passes fail to shrink; the opening stays visible.
 */
export function preserveEnds(input: string, maxChars: number): string {
  const text = input.trim();
  const max = Math.max(1, maxChars);
  if (text.length <= max) return text;
  const marker = "\n\n[later notes]\n";
  if (max <= marker.length + 2) return text.slice(0, max);
  const budget = max - marker.length;
  const headLen = Math.ceil(budget / 2);
  const tailLen = Math.floor(budget / 2);
  const head = text.slice(0, headLen).trimEnd();
  const tail = text.slice(text.length - tailLen).trimStart();
  return `${head}${marker}${tail}`;
}

function splitUnits(normalized: string, maxChars: number): string[] {
  const units: string[] = [];
  for (const line of normalized.split("\n")) {
    if (line.length <= maxChars) {
      units.push(line);
      continue;
    }
    for (let offset = 0; offset < line.length; offset += maxChars) {
      units.push(line.slice(offset, offset + maxChars));
    }
  }
  return units;
}
