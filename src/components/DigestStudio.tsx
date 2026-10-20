"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MorningSlip } from "@/components/MorningSlip";
import { probeGpu, type GpuProbe } from "@/lib/gpu";
import {
  chatOptionsFor,
  findModel,
  GEMMA_MODELS,
  pickDefaultModel,
} from "@/lib/models";
import { DigestCancelled, runDigestPasses, type DigestTurn } from "@/lib/digest";
import {
  createEngineSession,
  disposeEngine,
  loadEngine,
  type EngineLike,
} from "@/lib/engineSession";
import { parseBrief, type MorningBrief } from "@/lib/parseBrief";
import { SAMPLE_DUMP } from "@/lib/sampleDump";
import { chunkDump, dumpCharBudget } from "@/lib/text";

type Phase = "idle" | "loading" | "writing" | "done" | "error";

type LocalEngine = EngineLike & {
  reload: (
    model: string,
    chatOpts?: { context_window_size: number; sliding_window_size: number },
  ) => Promise<void>;
  resetChat: () => Promise<void> | void;
  chat: {
    completions: {
      create: (args: {
        messages: { role: "system" | "user"; content: string }[];
        temperature?: number;
        max_tokens?: number;
        top_p?: number;
        stream?: boolean;
        seed?: number;
      }) => Promise<unknown>;
    };
  };
};

type ProgressReport = { progress: number; text: string };

type StreamChunk = {
  choices?: Array<{ delta?: { content?: string | null } }>;
};

type FinalReply = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

const PLACEHOLDER: [string, string] = [
  "The night is still folded.",
  "Two lines will land here.",
];

function isAsyncIterable(value: unknown): value is AsyncIterable<StreamChunk> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value
  );
}

function explainFailure(cause: unknown): string {
  const message =
    cause instanceof Error ? cause.message : "Gemma stopped before the brief.";
  if (/shader-f16|enable f16|extension 'f16'/i.test(message)) {
    return "This Gemma build needs shader-f16, and this GPU does not have it. Choose Gemma 2 2B f32.";
  }
  if (/context_window_size and sliding_window_size/i.test(message)) {
    return "This model’s context settings conflict. Try Gemma 2 2B.";
  }
  if (/Out of memory|Device was lost|device was lost/i.test(message)) {
    return "The GPU ran out of memory. Try Gemma 3 1B if shader-f16 is available, or a shorter dump.";
  }
  return message.length > 320 ? `${message.slice(0, 320)}…` : message;
}

function percent(progress: number): number {
  const value = progress > 1 ? progress : progress * 100;
  return Math.round(Math.max(0, Math.min(100, value)));
}

async function readCompletion(
  engine: LocalEngine,
  turn: DigestTurn,
  onDelta: ((text: string) => void) | null,
  shouldStop: () => boolean,
): Promise<string> {
  if (shouldStop()) throw new DigestCancelled();
  // Each pass starts from an empty chat so earlier sections do not pile into the window.
  await engine.resetChat();
  const result = await engine.chat.completions.create({
    messages: [
      { role: "system", content: turn.system },
      { role: "user", content: turn.user },
    ],
    temperature: turn.kind === "brief" ? 0.2 : 0.1,
    top_p: 0.9,
    max_tokens: turn.kind === "brief" ? 220 : 160,
    seed: 7,
    stream: true,
  });

  let raw = "";
  if (isAsyncIterable(result)) {
    for await (const chunk of result) {
      if (shouldStop()) throw new DigestCancelled();
      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      if (!delta) continue;
      raw += delta;
      onDelta?.(raw);
    }
    return raw;
  }
  raw = (result as FinalReply).choices?.[0]?.message?.content ?? "";
  onDelta?.(raw);
  return raw;
}

async function readDumpFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const textLike =
    file.type.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    file.type === "";
  if (!textLike) {
    throw new Error("Nightbrief reads text exports (.txt or .md).");
  }
  if (file.size > 1_000_000) {
    throw new Error("That file is over 1 MB. Paste a shorter slice of the night.");
  }
  return file.text();
}

export function DigestStudio() {
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState(pickDefaultModel(true));
  const [gpu, setGpu] = useState<GpuProbe | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [live, setLive] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileLabel, setFileLabel] = useState("");

  const sessionRef = useRef<ReturnType<typeof createEngineSession> | null>(null);
  const session =
    sessionRef.current ?? (sessionRef.current = createEngineSession());
  // Own the session before effects so the first click cannot race a late mount.
  session.mount();
  const loadedModel = useRef<string | null>(null);
  const running = useRef(false);
  const userPicked = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sample") === "1") {
      setText(SAMPLE_DUMP.trim());
      setFileLabel("Maple Court sample");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    probeGpu().then((result) => {
      if (!alive) return;
      setGpu(result);
      if (!userPicked.current) {
        setModelId(pickDefaultModel(result.shaderF16));
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    session.mount();
    return () => {
      loadedModel.current = null;
      void disposeEngine(session.unmount());
    };
  }, [session]);

  const applyText = useCallback((value: string, label?: string) => {
    setText(value);
    setFileLabel(label ?? "");
    setError("");
    setCopied(false);
  }, []);

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const contents = await readDumpFile(file);
        applyText(contents, file.name);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not read that file.");
      }
    },
    [applyText],
  );

  const ensureEngine = useCallback(async (id: string) => {
    const webllm = (await import("@mlc-ai/web-llm")) as {
      prebuiltAppConfig: { model_list: Array<{ model_id: string }> };
      MLCEngine: new (config?: {
        initProgressCallback?: (report: ProgressReport) => void;
      }) => LocalEngine;
    };

    const known = webllm.prebuiltAppConfig.model_list.some(
      (model) => model.model_id === id,
    );
    if (!known) {
      throw new Error(`This WebLLM build does not list ${id}.`);
    }

    // `new MLCEngine()` exists before `reload()` finishes. CreateMLCEngine()
    // only returns after that, so a navigate-away mid-load would miss it.
    const engine = await loadEngine({
      session,
      modelId: id,
      loadedModelId: loadedModel.current,
      onReplacing: () => {
        if (session.isMounted()) {
          setProgressText("Setting the previous model aside…");
        }
      },
      create: () =>
        new webllm.MLCEngine({
          initProgressCallback: (report) => {
            if (!session.isMounted()) return;
            setProgress(percent(report.progress));
            setProgressText(report.text);
          },
        }),
      load: (created, modelId) => {
        const chatOpts = chatOptionsFor(modelId);
        return created.reload(modelId, chatOpts);
      },
    });
    if (!engine) return null;
    loadedModel.current = id;
    return engine;
  }, [session]);

  const onDigest = useCallback(async () => {
    if (running.current) return;
    setError("");
    setCopied(false);
    setBrief(null);
    setLive("");

    if (gpu && !gpu.webgpu) {
      setPhase("error");
      setError(
        "This browser has no WebGPU adapter. Nightbrief needs Chrome, Edge, or another browser with WebGPU enabled, on a machine with a GPU.",
      );
      return;
    }

    const context = findModel(modelId)?.context ?? 4096;
    const maxChars = dumpCharBudget(context);
    const sections = chunkDump(text, maxChars);
    if (sections.length === 0) {
      setPhase("error");
      setError("Paste a dump, drop a .txt file, or load the Maple Court sample.");
      return;
    }

    setNotice(
      sections.length > 1
        ? `This night is longer than one context window, so Gemma will read all ${sections.length} sections.`
        : "",
    );

    running.current = true;
    setPhase("loading");
    setProgress(0);
    setProgressText("Waking Gemma…");

    try {
      const engine = await ensureEngine(modelId);
      if (!engine || !session.isMounted()) {
        if (session.isMounted()) {
          setPhase("idle");
          setProgressText("");
        }
        return;
      }

      const outcome = await runDigestPasses({
        dump: text,
        maxChars,
        shouldStop: () => !session.isMounted(),
        complete: async (turn) => {
          if (!session.isMounted()) throw new DigestCancelled();
          if (turn.kind === "brief") {
            setPhase("writing");
            setProgress(100);
            setProgressText(
              sections.length > 1 ? "Writing the two lines…" : "Reading the night…",
            );
          } else if (turn.kind === "slice") {
            setPhase("writing");
            setProgress(Math.round(((turn.index - 1) / turn.total) * 100));
            setProgressText(`Reading section ${turn.index} of ${turn.total}…`);
          } else {
            setPhase("writing");
            setProgressText(`Folding the notes (${turn.index} of ${turn.total})…`);
          }
          return readCompletion(
            engine,
            turn,
            turn.kind === "brief" && session.isMounted() ? setLive : null,
            () => !session.isMounted(),
          );
        },
      });

      if (!session.isMounted()) return;
      const parsed = parseBrief(outcome.raw);
      setBrief(parsed);
      setLive("");
      setPhase("done");
      setProgressText("");
    } catch (cause) {
      if (!session.isMounted() || cause instanceof DigestCancelled) return;
      setPhase("error");
      setError(explainFailure(cause));
    } finally {
      running.current = false;
    }
  }, [ensureEngine, gpu, modelId, session, text]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void onDigest();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDigest]);

  const chosen = findModel(modelId);
  const f16Missing = gpu ? !gpu.shaderF16 : false;
  const showProgress = phase === "loading" || phase === "writing";
  const slipLines: [string, string] = brief
    ? brief.lines
    : live
      ? parseBrief(live).lines
      : phase === "loading"
        ? ["The weights are on their way.", "The note lands when Gemma is ready."]
        : phase === "writing"
          ? ["Reading the night.", "Two lines will replace this."]
          : PLACEHOLDER;

  const gpuLine = !gpu
    ? "Checking WebGPU…"
    : !gpu.webgpu
      ? "No WebGPU adapter in this browser."
      : gpu.shaderF16
        ? "WebGPU ready, including shader-f16."
        : "WebGPU ready, without shader-f16. Use the f32 Gemma build.";

  return (
    <>
      <div className="nb-studio-head">
        <p className="nb-eyebrow">Studio</p>
        <h1>Digest overnight.</h1>
        <p>
          Paste the export, or drop a text file. The first run downloads open
          Gemma weights (often around a gigabyte) and caches them in this
          browser. After that, the brief is computed on your GPU.
        </p>
      </div>

      <div className="nb-studio-grid">
        <section
          className={`nb-panel${dragging ? " nb-panel-drop" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void onFile(event.dataTransfer.files?.[0]);
          }}
        >
          <div className="nb-toolbar">
            <button
              type="button"
              className="nb-chip"
              onClick={() => applyText(SAMPLE_DUMP.trim(), "Maple Court sample")}
            >
              Load fictional sample
            </button>
            <button
              type="button"
              className="nb-chip"
              onClick={() => fileRef.current?.click()}
            >
              Choose a file
            </button>
            <button
              type="button"
              className="nb-chip"
              onClick={() => applyText("")}
              disabled={!text}
            >
              Clear
            </button>
            <span className="nb-count">
              {fileLabel ? `${fileLabel} · ` : ""}
              {text.trim().length.toLocaleString()} characters
            </span>
            <input
              ref={fileRef}
              className="nb-file-input"
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              onChange={(event) => {
                void onFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>

          <label className="nb-field-label" htmlFor="dump">
            Overnight export
          </label>
          <textarea
            id="dump"
            className="nb-textarea"
            value={text}
            spellCheck={false}
            placeholder="Paste the export here. A group chat, a mailbox dump, or notes from the night."
            onChange={(event) => applyText(event.target.value, fileLabel)}
          />

          <div className="nb-models" role="group" aria-label="Gemma model">
            {GEMMA_MODELS.map((model) => {
              const blocked = f16Missing && model.needsShaderF16;
              return (
                <button
                  key={model.id}
                  type="button"
                  className="nb-model"
                  aria-pressed={model.id === modelId}
                  disabled={blocked || phase === "loading" || phase === "writing"}
                  title={blocked ? "This build needs shader-f16." : model.id}
                  onClick={() => {
                    userPicked.current = true;
                    setModelId(model.id);
                  }}
                >
                  <span className="nb-dot" aria-hidden="true" />
                  <strong>
                    {model.label}
                    <span className="nb-count"> · ~{model.vramMb.toLocaleString()} MB VRAM</span>
                  </strong>
                  <small>{model.detail}</small>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="nb-button nb-digest"
            onClick={() => void onDigest()}
            disabled={phase === "loading" || phase === "writing" || gpu?.webgpu === false}
          >
            {phase === "loading"
              ? "Loading Gemma…"
              : phase === "writing"
                ? "Writing the note…"
                : "Digest overnight"}
          </button>
          <p className={error ? "nb-status nb-status-bad" : "nb-status"}>
            {error || notice || `${gpuLine} Shortcut: Ctrl or ⌘ Enter.`}
            {chosen ? ` Model ${chosen.id}.` : ""}
          </p>
        </section>

        <div className="nb-sticky">
          <MorningSlip
            kicker={
              brief
                ? "Morning brief"
                : phase === "writing"
                  ? "Reading"
                  : phase === "loading"
                    ? "Loading"
                    : "Waiting"
            }
            aside={brief ? "two lines" : "local"}
            lines={slipLines}
            bullets={brief?.bullets}
            placeholder={!brief && !live}
            raw={brief?.raw}
            progress={showProgress ? progress : null}
            progressLabel={showProgress ? progressText : undefined}
          />
          {brief ? (
            <div className="nb-actions">
              <button
                type="button"
                className="nb-button-ghost"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(brief.lines.join("\n"))
                    .then(() => setCopied(true))
                    .catch(() => setError("Could not copy. Select the two lines instead."));
                }}
              >
                {copied ? "Copied" : "Copy the two lines"}
              </button>
            </div>
          ) : null}
          <p className="nb-status">
            Open weights, local WebGPU, no account. The paste is not uploaded.
            Weights come from Hugging Face the first time, then sit in the
            browser cache.
          </p>
        </div>
      </div>
    </>
  );
}
