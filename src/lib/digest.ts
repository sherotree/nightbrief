import {
  MERGE_SYSTEM_PROMPT,
  SLICE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  buildMergePrompt,
  buildNotesPrompt,
  buildSlicePrompt,
  buildUserPrompt,
} from "./prompt.ts";
import {
  MAX_DUMP_CHARS,
  chunkDump,
  normalizeDump,
  preserveEnds,
} from "./text.ts";

export type DigestKind = "slice" | "merge" | "brief";

export type DigestTurn = {
  system: string;
  user: string;
  kind: DigestKind;
  index: number;
  total: number;
};

export class DigestCancelled extends Error {
  constructor() {
    super("Digest cancelled.");
    this.name = "DigestCancelled";
  }
}

/**
 * Long dumps cannot fit a 2k–4k Gemma window. Keeping the tail drops decisions
 * from earlier in the night, so each section is reduced to notes and only the
 * last pass writes the two-line brief.
 */
export async function runDigestPasses(options: {
  dump: string;
  maxChars?: number;
  complete: (turn: DigestTurn) => Promise<string>;
  shouldStop?: () => boolean;
}): Promise<{ raw: string; sections: number }> {
  const maxChars = Math.max(32, options.maxChars ?? MAX_DUMP_CHARS);
  const normalized = normalizeDump(options.dump);
  if (!normalized) {
    throw new Error(
      "Paste a dump, drop a .txt file, or load the Maple Court sample.",
    );
  }

  const stop = () => {
    if (options.shouldStop?.()) throw new DigestCancelled();
  };

  stop();
  const chunks = chunkDump(normalized, maxChars);
  if (chunks.length <= 1) {
    const raw = await options.complete({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(chunks[0] ?? ""),
      kind: "brief",
      index: 1,
      total: 1,
    });
    return { raw, sections: 1 };
  }

  const notes: string[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    stop();
    const note = await options.complete({
      system: SLICE_SYSTEM_PROMPT,
      user: buildSlicePrompt(chunks[i], i + 1, chunks.length),
      kind: "slice",
      index: i + 1,
      total: chunks.length,
    });
    const body = noteBody(note, chunks[i], maxChars);
    if (body) notes.push(`Section ${i + 1}:\n${body}`);
  }

  const packed = await packNotes(notes, maxChars, options.complete, stop);
  stop();
  const raw = await options.complete({
    system: SYSTEM_PROMPT,
    user: buildNotesPrompt(
      packed || "No facts were extracted from the overnight dump.",
    ),
    kind: "brief",
    index: 1,
    total: 1,
  });
  return { raw, sections: chunks.length };
}

async function packNotes(
  notes: string[],
  maxChars: number,
  complete: (turn: DigestTurn) => Promise<string>,
  stop: () => void,
): Promise<string> {
  let current = notes.filter((note) => note.trim());
  let guard = 0;
  while (joinNotes(current).length > maxChars && current.length > 1 && guard < 6) {
    guard += 1;
    const groups = groupToFit(current, maxChars);
    if (groups.length >= current.length) break;
    const merged: string[] = [];
    for (let i = 0; i < groups.length; i += 1) {
      stop();
      const text = await complete({
        system: MERGE_SYSTEM_PROMPT,
        user: buildMergePrompt(groups[i].join("\n\n"), i + 1, groups.length),
        kind: "merge",
        index: i + 1,
        total: groups.length,
      });
      const body = noteBody(text, groups[i].join("\n\n"), maxChars);
      if (body) merged.push(body);
    }
    if (merged.length === 0) break;
    const next = joinNotes(merged);
    if (next.length >= joinNotes(current).length) break;
    current = merged;
  }
  const joined = joinNotes(current);
  return joined.length <= maxChars ? joined : preserveEnds(joined, maxChars);
}

function groupToFit(notes: string[], maxChars: number): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const note of notes) {
    const piece = note.length > maxChars ? preserveEnds(note, maxChars) : note;
    const addition = piece.length + (current.length > 0 ? 2 : 0);
    if (current.length > 0 && size + addition > maxChars) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(piece);
    size += current.length === 1 ? piece.length : piece.length + 2;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function joinNotes(notes: string[]): string {
  return notes.filter((note) => note.trim()).join("\n\n");
}

function noteBody(raw: string, source: string, maxChars: number): string {
  const text = raw.replace(/\r/g, "").trim();
  const compact = text.replace(/\s+/g, " ");
  if (/^-?\s*\(?nothing to carry forward\)?\.?$/i.test(compact)) return "";
  if (text) return text;
  return clipSection(source, Math.min(600, maxChars));
}

function clipSection(section: string, maxChars: number): string {
  if (section.length <= maxChars) return section;
  const sliced = section.slice(0, maxChars);
  const breakAt = sliced.lastIndexOf("\n");
  if (breakAt > maxChars * 0.6) return sliced.slice(0, breakAt).trimEnd();
  return sliced.trimEnd();
}
