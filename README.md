# Nightbrief

Overnight group-chat and email digest. In the morning you get **two lines** about what matters. [Gemma](https://ai.google.dev/gemma) runs **in the browser** through [WebLLM](https://github.com/mlc-ai/web-llm) and WebGPU. There is no Nightbrief server, no API key, and the text you paste is not uploaded.

Built for [Hacktoberfest Open-Source AI Challenge: Week 3](https://dev.to/challenges/hacktoberfest-week3-2026-10-19) — theme **Slow and Steady** — and aimed at the **Best Use of Gemma** category.

The challenge window is **October 19–25, 2026**. This project was started during that week.

## What it is

Paste an export (or drop a `.txt` / `.md` file) before you go to sleep. When you want the brief, Nightbrief loads an open Gemma model on your GPU and writes:

1. Two short lines — the hero output.
2. Up to four optional bullets for things that can wait.

A fictional **Maple Court** sample is built in, so you can try it without using a real inbox. Open the studio with the sample from the landing page, or choose **Load fictional sample**.

Out of scope for this version: Slack or Gmail login, fine-tuning, and accounts.

## Why open weights

The useful part of Nightbrief is a model you can run yourself.

- The messages never need to sit on someone else's chat API.
- After the weights are cached, the digest does not call a model host.
- You can swap Gemma 2 2B, Gemma 3 1B, or the f32 Gemma 2 build in the studio without changing providers or paying per token.

The first run does download weights from Hugging Face. That transfer is the model, not your paste. Nightbrief does not add analytics.

## Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then **Try the sample dump**.

```bash
npm test
npm run typecheck
npm run build
```

Deploy the Next.js app on Vercel as a normal client-rendered project. There are no API routes and no server-side model calls.

## Browser requirements

Inference needs **WebGPU**.

- Current desktop Chrome or Edge is the reliable path (WebGPU enabled by default).
- The default weights need the `shader-f16` GPU feature and about **1.9 GB** of VRAM.
- If `shader-f16` is missing, pick **Gemma 2 2B f32** (about **2.5 GB** VRAM).
- **Gemma 3 1B** is the lighter option at about **0.7 GB** VRAM when you want a smaller download.
- A warm cache still lives in the browser. Clearing site data means the next morning downloads the weights again.

The page says so when WebGPU is missing. Nightbrief cannot produce a real brief in a browser without it.

## Model

Pinned to `@mlc-ai/web-llm` **0.2.86**. IDs below are entries in that release's `prebuiltAppConfig` (the catalog in `src/config.ts`):

| Studio label | WebLLM `model_id` | Notes |
| --- | --- | --- |
| Gemma 2 2B (default) | `gemma-2-2b-it-q4f16_1-MLC` | q4f16, 4096 context, `shader-f16`, ~1895 MB VRAM |
| Gemma 3 1B | `gemma3-1b-it-q4f16_1-MLC` | q4f16, ~711 MB VRAM, needs shader-f16 in practice. The catalog also sets a 4096 context on top of this model's sliding window, which WebLLM rejects, so Nightbrief turns the sliding window off and uses 2048 tokens. |
| Gemma 2 2B f32 | `gemma-2-2b-it-q4f32_1-MLC` | q4f32, 4096 context, no `shader-f16` requirement, ~2509 MB VRAM |

The studio checks that the chosen id is actually in the installed catalog before it loads.

## Privacy

- Open-weight Gemma, executed locally with WebGPU.
- No backend, no API key, no login.
- The overnight dump is only handed to the in-browser engine.
- Model files are fetched from Hugging Face on first use and stored with the browser cache.

## Author

Sherotree · support@sherotree.com

## License

MIT. WebLLM and the Gemma weights have their own licenses; Nightbrief does not redistribute the weights.
