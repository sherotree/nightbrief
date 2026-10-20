import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Nightbrief",
    template: "%s · Nightbrief",
  },
  description:
    "An overnight digest that stays on your device. Paste the group chat or mailbox export, and open-weight Gemma writes two lines before coffee.",
};

export const viewport: Viewport = {
  themeColor: "#14110e",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <div className="nb-atmosphere" aria-hidden="true" />
        {children}
        <footer className="nb-footer">
          <p>
            Hacktoberfest 2026, Week 3 · Slow and Steady. Aimed at Best Use of
            Gemma.
          </p>
          <a
            href="https://dev.to/challenges/hacktoberfest-week3-2026-10-19"
            target="_blank"
            rel="noreferrer"
          >
            Challenge brief
          </a>
        </footer>
      </body>
    </html>
  );
}
