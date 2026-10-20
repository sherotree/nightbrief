import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAMPLE_DUMP } from "./sampleDump.ts";
import {
  MAX_DUMP_CHARS,
  chunkDump,
  dumpCharBudget,
  preserveEnds,
} from "./text.ts";

describe("chunkDump", () => {
  it("keeps a short export in one section", () => {
    assert.deepEqual(chunkDump("hello\r\nthere"), ["hello\nthere"]);
    assert.deepEqual(chunkDump("   \n"), []);
    assert.equal(chunkDump(SAMPLE_DUMP).length, 1);
    assert.ok(SAMPLE_DUMP.length < MAX_DUMP_CHARS);
  });

  it("covers the start, the middle, and the end of a long export", () => {
    const lines = Array.from(
      { length: 40 },
      (_, index) => `line-${String(index).padStart(2, "0")}-xxxx`,
    );
    const chunks = chunkDump(lines.join("\n"), 80);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.length < lines.length);
    assert.ok(chunks.every((chunk) => chunk.length <= 80));
    assert.match(chunks[0], /^line-00/);
    assert.match(chunks.at(-1) ?? "", /line-39/);
    assert.ok(chunks.some((chunk) => chunk.includes("line-20")));
    for (const line of lines) {
      assert.ok(
        chunks.some((chunk) => chunk.includes(line)),
        line,
      );
    }
  });

  it("splits one huge line without dropping its opening", () => {
    const input = `START ${"m".repeat(200)} END`;
    const chunks = chunkDump(input, 50);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.length <= 50));
    assert.match(chunks[0], /^START/);
    assert.match(chunks.at(-1) ?? "", /END$/);
  });
});

describe("dumpCharBudget", () => {
  it("matches the 4k window and shrinks for Gemma 3's 2k window", () => {
    assert.equal(dumpCharBudget(4096), MAX_DUMP_CHARS);
    assert.equal(dumpCharBudget(8192), MAX_DUMP_CHARS);
    assert.equal(dumpCharBudget(2048), 5_000);
    assert.equal(dumpCharBudget(Number.NaN), MAX_DUMP_CHARS);
  });
});

describe("preserveEnds", () => {
  it("keeps the opening and the close when notes still overflow", () => {
    const input = `EARLY_MARKER ${"x".repeat(400)} LATE_MARKER`;
    const fitted = preserveEnds(input, 80);
    assert.ok(fitted.length <= 80);
    assert.match(fitted, /^EARLY_MARKER/);
    assert.match(fitted, /LATE_MARKER$/);
    assert.match(fitted, /later notes/);
  });
});
