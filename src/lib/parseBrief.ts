export type MorningBrief = {
  lines: [string, string];
  bullets: string[];
  raw: string;
};

const BULLET = /^(?:[-*•]|\d+[.)])\s+/;
const LINE_LABEL = /^(?:line\s*)?[12]\s*[:.)-]\s+/i;
const PREAMBLE =
  /^(sure|okay|ok|certainly|of course|here(?:'s| is)|morning brief|summary)\b/i;

function cleanLine(line: string): string {
  return line
    .replace(LINE_LABEL, "")
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(line: string): string[] {
  return line
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Turn a small model's free-form reply into the two-line morning note.
 * Extra sentences and list items fold into at most four bullets.
 */
export function parseBrief(raw: string): MorningBrief {
  const rows = raw
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const prose: string[] = [];
  const bullets: string[] = [];

  for (const row of rows) {
    if (BULLET.test(row)) {
      const text = cleanLine(row.replace(BULLET, ""));
      if (text) bullets.push(text);
      continue;
    }
    const text = cleanLine(row);
    if (text) prose.push(text);
  }

  while (prose.length > 1 && PREAMBLE.test(prose[0]) && prose[0].length < 90) {
    prose.shift();
  }

  let lines = prose;
  if (lines.length === 0 && bullets.length > 0) {
    lines = bullets.splice(0, 2);
  }
  if (lines.length === 1) {
    const parts = splitSentences(lines[0]);
    if (parts.length >= 2) lines = parts;
  }

  const first = lines[0] || "Nothing in that dump needed you.";
  const second = lines[1] || "The rest can wait until you are actually awake.";
  const folded = [...lines.slice(2), ...bullets].filter(Boolean).slice(0, 4);

  return {
    lines: [first, second],
    bullets: folded,
    raw: raw.trim(),
  };
}
