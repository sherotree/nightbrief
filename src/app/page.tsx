import Link from "next/link";
import { MorningSlip } from "@/components/MorningSlip";
import { SiteHeader } from "@/components/SiteHeader";
import { WindowLight } from "@/components/WindowLight";

const CHALLENGE = "https://dev.to/challenges/hacktoberfest-week3-2026-10-19";

export default function HomePage() {
  return (
    <>
      <SiteHeader current="home" />
      <main className="nb-home">
        <section className="nb-hero">
          <div>
            <p className="nb-eyebrow">Slow and steady · local Gemma</p>
            <h1 className="nb-title">
              Leave the chat
              <span className="nb-title-em">on the nightstand.</span>
            </h1>
            <p className="nb-lede">
              Nightbrief reads the overnight pile — a group chat, a mailbox
              export, a text file — and leaves two lines for the morning.
              Gemma runs in this browser, on your GPU. The messages do not go
              anywhere.
            </p>
            <div className="nb-actions">
              <Link className="nb-button" href="/studio?sample=1">
                Try the sample dump
              </Link>
              <Link className="nb-button-ghost" href="/studio">
                Open an empty studio
              </Link>
            </div>
          </div>
          <div>
            <WindowLight />
            <MorningSlip
            tilt
            kicker="Example note"
            aside="06:41"
            lines={[
              "The B-side elevator is stuck; the super looks before 10.",
              "Potluck moved to Sunday at 4, and hot water is off Thursday morning.",
            ]}
          />
          </div>
        </section>

        <section className="nb-steps" aria-label="How the morning works">
          <article className="nb-step">
            <span className="nb-step-index">01</span>
            <h2>Paste it before bed</h2>
            <p>
              Drop a .txt or .md export, or paste the thread. Slack and Gmail
              stay where they are — this version wants the text you already
              have.
            </p>
          </article>
          <article className="nb-step">
            <span className="nb-step-index">02</span>
            <h2>Let Gemma read</h2>
            <p>
              WebLLM loads an open Gemma build with WebGPU. The first run
              downloads weights into this browser. Later mornings use the cache.
            </p>
          </article>
          <article className="nb-step">
            <span className="nb-step-index">03</span>
            <h2>Two lines, then coffee</h2>
            <p>
              Decisions and time changes come first. Anything that can wait
              folds into a short list you can ignore.
            </p>
          </article>
        </section>

        <section className="nb-privacy" id="privacy">
          <h2>Nothing phones home with your messages.</h2>
          <ul>
            <li>
              <strong>Open-weight Gemma.</strong> The studio defaults to Gemma
              2 2B, with Gemma 3 1B when you want a lighter load.
            </li>
            <li>
              <strong>Local WebGPU.</strong> Inference stays in the page. There
              is no Nightbrief server and no API key.
            </li>
            <li>
              <strong>Your text stays put.</strong> The paste is not uploaded.
              The only download is the model, from Hugging Face, until the
              browser cache is warm.
            </li>
            <li>
              <strong>A week for slow tools.</strong> Built during Hacktoberfest
              Week 3, October 19–25, 2026.{" "}
              <a href={CHALLENGE} target="_blank" rel="noreferrer">
                Read the challenge.
              </a>
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}
