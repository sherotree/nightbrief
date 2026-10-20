import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBrief } from "./parseBrief.ts";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt.ts";
import { SAMPLE_DUMP } from "./sampleDump.ts";
import { fitDump, MAX_DUMP_CHARS } from "./text.ts";
import { chatOptionsFor, GEMMA_MODELS, pickDefaultModel } from "./models.ts";

describe("parseBrief", () => {
  it("keeps two sentences and folds bullets", () => {
    const brief = parseBrief(`The B-side elevator is stuck; the super comes before 10.
Potluck moved to Sunday at 4pm.

- Omar takes the Greenleaf package around 8.
- Sign the pet rider before Friday only if you have a pet.
`);

    assert.equal(
      brief.lines[0],
      "The B-side elevator is stuck; the super comes before 10.",
    );
    assert.equal(brief.lines[1], "Potluck moved to Sunday at 4pm.");
    assert.equal(brief.bullets.length, 2);
    assert.match(brief.bullets[0], /Greenleaf/);
  });

  it("drops a short preamble and a line label", () => {
    const brief = parseBrief(`Sure, here is the brief:
1: Hot water is off Thursday 9 to 10 on floors 2-4.
Line 2: The lounge coffee machine is unplugged.
`);

    assert.match(brief.lines[0], /Hot water/);
    assert.match(brief.lines[1], /coffee machine/);
  });

  it("splits one crowded line into two sentences", () => {
    const brief = parseBrief(
      "The elevator is stuck until 10. Potluck is now Sunday at 4pm.",
    );
    assert.match(brief.lines[0], /elevator/i);
    assert.match(brief.lines[1], /Sunday/);
  });

  it("still returns two lines when the model says nothing", () => {
    const brief = parseBrief("   ");
    assert.equal(brief.lines.length, 2);
    assert.ok(brief.lines[0].length > 0);
    assert.ok(brief.lines[1].length > 0);
  });
});

describe("fitDump", () => {
  it("keeps the recent tail when the export is too long", () => {
    const input = `${"a".repeat(50)}ENDNOTE`;
    const fitted = fitDump(input, 7);
    assert.equal(fitted.trimmed, true);
    assert.equal(fitted.text, "ENDNOTE");
  });

  it("normalizes Windows newlines without trimming short notes", () => {
    const fitted = fitDump("hello\r\nthere");
    assert.equal(fitted.trimmed, false);
    assert.equal(fitted.text, "hello\nthere");
  });
});

describe("sample and prompt", () => {
  it("ships a fictional dump that fits the context budget", () => {
    assert.ok(SAMPLE_DUMP.length > 400);
    assert.ok(SAMPLE_DUMP.length < MAX_DUMP_CHARS);
    assert.match(SAMPLE_DUMP, /B-side elevator/);
    assert.match(SAMPLE_DUMP, /Sunday at 4pm/);
    assert.match(SAMPLE_DUMP, /before Friday/);
    assert.match(SAMPLE_DUMP, /Thursday 9am/);
  });

  it("does not bake the sample's facts into the system prompt", () => {
    assert.match(SYSTEM_PROMPT, /two-line/i);
    assert.equal(SYSTEM_PROMPT.includes("Maple Court"), false);
    assert.match(buildUserPrompt("hello"), /hello/);
  });
});

describe("models", () => {
  it("defaults to Gemma 2 2B and falls back when shader-f16 is missing", () => {
    assert.equal(pickDefaultModel(true), "gemma-2-2b-it-q4f16_1-MLC");
    assert.equal(pickDefaultModel(false), "gemma-2-2b-it-q4f32_1-MLC");
    assert.equal(GEMMA_MODELS.some((model) => model.id.startsWith("gemma")), true);
    assert.equal(GEMMA_MODELS[0]?.context, 4096);
    assert.equal(GEMMA_MODELS[1]?.needsShaderF16, true);
    assert.deepEqual(chatOptionsFor("gemma3-1b-it-q4f16_1-MLC"), {
      context_window_size: 2048,
      sliding_window_size: -1,
    });
    assert.equal(chatOptionsFor("gemma-2-2b-it-q4f32_1-MLC"), undefined);
  });
});
