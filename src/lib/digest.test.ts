import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DigestCancelled, runDigestPasses } from "./digest.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";

describe("runDigestPasses", () => {
  it("sends a short dump through one brief pass", async () => {
    const seen: string[] = [];
    const result = await runDigestPasses({
      dump: "hello\r\nthere",
      complete: async (turn) => {
        seen.push(turn.kind);
        assert.equal(turn.system, SYSTEM_PROMPT);
        assert.match(turn.user, /hello\nthere/);
        return "Hot water is off at 9.\nThe rest can wait.";
      },
    });
    assert.deepEqual(seen, ["brief"]);
    assert.equal(result.sections, 1);
    assert.match(result.raw, /Hot water/);
  });

  it("carries an early decision forward before the two-line brief", async () => {
    const early = "EARLY_DECISION super comes at 7am";
    const late = "LATE_DECISION potluck moved to Sunday";
    const dump = `${early}\n${"ok\n".repeat(200)}${late}`;
    const seen: Array<{ kind: string; user: string }> = [];

    const result = await runDigestPasses({
      dump,
      maxChars: 180,
      complete: async (turn) => {
        seen.push({ kind: turn.kind, user: turn.user });
        if (turn.kind === "brief") {
          assert.equal(turn.system, SYSTEM_PROMPT);
          assert.match(turn.user, /Super comes at 7am/);
          assert.match(turn.user, /Potluck moved to Sunday/);
          assert.match(turn.user, /earliest section first/);
          return "The super comes at 7am.\nPotluck moved to Sunday.";
        }
        assert.notEqual(turn.system, SYSTEM_PROMPT);
        if (turn.user.includes("EARLY_DECISION")) return "- Super comes at 7am.";
        if (turn.user.includes("LATE_DECISION")) return "- Potluck moved to Sunday.";
        return "- (nothing to carry forward)";
      },
    });

    const slices = seen.filter((turn) => turn.kind === "slice");
    assert.ok(slices.length >= 2);
    assert.match(slices[0].user, /EARLY_DECISION/);
    assert.match(slices.at(-1)?.user ?? "", /LATE_DECISION/);
    assert.equal(seen.at(-1)?.kind, "brief");
    assert.equal(result.sections, slices.length);
    assert.match(result.raw, /7am/);
  });

  it("keeps the opening when section notes do not shrink", async () => {
    const dump = `EARLY_MARKER\n${"word ".repeat(80)}LATE_MARKER`;
    let brief = "";
    await runDigestPasses({
      dump,
      maxChars: 80,
      complete: async (turn) => {
        if (turn.kind === "brief") {
          brief = turn.user;
          return "One line.\nAnother line.";
        }
        const early = turn.user.includes("EARLY_MARKER") ? "EARLY_MARKER " : "";
        const late = turn.user.includes("LATE_MARKER") ? " LATE_MARKER" : "";
        return `${early}${"fact ".repeat(40)}${late}`;
      },
    });
    assert.match(brief, /EARLY_MARKER/);
    assert.match(brief, /LATE_MARKER/);
  });

  it("stops between sections when the page goes away", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        runDigestPasses({
          dump: `${"a".repeat(30)}\n${"b".repeat(30)}\n${"c".repeat(30)}`,
          maxChars: 40,
          shouldStop: () => calls > 0,
          complete: async () => {
            calls += 1;
            return "- fact";
          },
        }),
      DigestCancelled,
    );
    assert.equal(calls, 1);
  });
});
