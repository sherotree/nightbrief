import Link from "next/link";

type Props = {
  current?: "home" | "studio";
};

export function SiteHeader({ current }: Props) {
  return (
    <header className="nb-header">
      <Link href="/" className="nb-brand">
        <span className="nb-mark" aria-hidden="true" />
        Nightbrief
      </Link>
      <nav className="nb-nav" aria-label="Primary">
        <Link href="/" aria-current={current === "home" ? "page" : undefined}>
          Morning
        </Link>
        <Link
          href="/studio"
          aria-current={current === "studio" ? "page" : undefined}
        >
          Studio
        </Link>
      </nav>
    </header>
  );
}
