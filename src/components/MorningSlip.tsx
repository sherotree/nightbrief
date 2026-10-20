type Props = {
  kicker: string;
  aside?: string;
  lines: readonly [string, string];
  bullets?: string[];
  placeholder?: boolean;
  tilt?: boolean;
  raw?: string;
  progress?: number | null;
  progressLabel?: string;
};

export function MorningSlip({
  kicker,
  aside,
  lines,
  bullets = [],
  placeholder = false,
  tilt = false,
  raw,
  progress = null,
  progressLabel,
}: Props) {
  return (
    <article
      className={`nb-slip${tilt ? " nb-slip-tilt" : ""}${placeholder ? " nb-slip-placeholder" : ""}`}
      aria-live="polite"
      aria-busy={progress !== null}
    >
      <p className="nb-slip-kicker">
        <span>{kicker}</span>
        {aside ? <span>{aside}</span> : null}
      </p>
      <p className="nb-slip-line">{lines[0]}</p>
      <p className="nb-slip-line">{lines[1]}</p>
      {progress !== null ? (
        <div className="nb-progress" aria-hidden="true">
          <span style={{ width: `${Math.max(4, Math.min(100, progress))}%` }} />
        </div>
      ) : null}
      {progressLabel ? <p className="nb-slip-note">{progressLabel}</p> : null}
      {bullets.length > 0 ? (
        <details className="nb-fold">
          <summary>Also in the pile ({bullets.length})</summary>
          <ul className="nb-bullets">
            {bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {raw ? (
        <details className="nb-fold">
          <summary>Model text</summary>
          <pre className="nb-raw">{raw}</pre>
        </details>
      ) : null}
    </article>
  );
}
