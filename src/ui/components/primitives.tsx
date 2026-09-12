import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Status } from "../../domain/forecast";
import { euro, formatInputNumber, formatInputPercent, parseGermanNumber } from "../format";

export function Card({
  title,
  subtitle,
  actions,
  children,
  bodyClass = "card-body"
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  bodyClass?: string;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

const STATUS_LABEL: Record<Status, string> = {
  good: "Im Plan",
  watch: "Beobachten",
  risk: "Risiko"
};

export function StatusPill({ status, label }: { status: Status; label?: string }) {
  return <span className={`pill ${status}`}>{label ?? STATUS_LABEL[status]}</span>;
}

export function KpiCard({
  label,
  value,
  meta,
  delta,
  deltaTone = "muted",
  primary = false,
  explain
}: {
  label: string;
  value: string;
  meta?: string;
  delta?: string;
  deltaTone?: "good" | "risk" | "muted";
  primary?: boolean;
  explain?: ReactNode;
}) {
  return (
    <div className={`card kpi${primary ? " is-primary" : ""}`}>
      <div className="kpi-label">
        {label}
        {explain}
      </div>
      <div className="kpi-value">{value}</div>
      {delta && <div className={`kpi-delta tone-${deltaTone}`}>{delta}</div>}
      {meta && <div className="kpi-meta">{meta}</div>}
    </div>
  );
}

/** Aufklappbare Herleitung – jede berechnete Zahl bleibt nachvollziehbar. */
export function Explain({
  title,
  rows,
  formula
}: {
  title: string;
  rows: Array<[string, string]>;
  formula?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="explain" ref={ref as never}>
      <button
        type="button"
        className="explain-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">Herleitung anzeigen</span>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 7.1v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="5" r="0.85" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="explain-panel" id={panelId} role="dialog" aria-label={title}>
          <strong style={{ display: "block", marginBottom: 8, color: "var(--ink)" }}>{title}</strong>
          <dl>
            {rows.map(([key, val]) => (
              <div key={key} style={{ display: "contents" }}>
                <dt>{key}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
          {formula && <div className="formula">{formula}</div>}
        </div>
      )}
    </span>
  );
}

/**
 * Zelleneingabe mit deutscher Zahlenformatierung. Während der Eingabe bleibt der
 * Rohtext erhalten, erst beim Verlassen wird normalisiert.
 */
export function NumberCell({
  value,
  onCommit,
  disabled,
  ariaLabel,
  suffix
}: {
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  ariaLabel: string;
  suffix?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // blur() feuert synchron, bevor ein zurückgesetzter Entwurf gerendert ist –
  // der Abbruch muss deshalb über eine Ref laufen, nicht über den State.
  const cancelled = useRef(false);
  const shown = draft ?? formatInputNumber(value);

  return (
    <input
      className="cell-input"
      inputMode="decimal"
      aria-label={ariaLabel}
      disabled={disabled}
      value={shown}
      placeholder={suffix ? `0 ${suffix}` : "0"}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => {
        cancelled.current = false;
        event.currentTarget.select();
      }}
      onBlur={() => {
        if (draft !== null && !cancelled.current) onCommit(parseGermanNumber(draft));
        cancelled.current = false;
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * Prozenteingabe je Woche. Ohne eigenen Wert steht hier die berechnete Annahme,
 * beim Tippen wird daraus eine bewusste Übersteuerung für genau diese Woche.
 */
export function PercentCell({
  value,
  overridden,
  onCommit,
  onReset,
  disabled,
  ariaLabel
}: {
  value: number;
  overridden: boolean;
  onCommit: (value: number) => void;
  onReset: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const shown = draft ?? formatInputPercent(value);

  return (
    <span className="cell-with-reset">
      <input
        className={`cell-input${overridden ? " is-overridden" : ""}`}
        inputMode="decimal"
        aria-label={ariaLabel}
        disabled={disabled}
        value={shown}
        placeholder="0"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => {
          cancelled.current = false;
          event.currentTarget.select();
        }}
        onBlur={() => {
          if (draft !== null && !cancelled.current) {
            const parsed = parseGermanNumber(draft) / 100;
            onCommit(Math.max(0, Math.min(1, parsed)));
          }
          cancelled.current = false;
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            cancelled.current = true;
            event.currentTarget.blur();
          }
        }}
      />
      <span aria-hidden="true" className="cell-unit">
        %
      </span>
      {overridden && !disabled && (
        <button type="button" className="cell-reset" title="Auf Annahme zurücksetzen" onClick={onReset}>
          <span className="sr-only">{ariaLabel} auf Annahme zurücksetzen</span>×
        </button>
      )}
    </span>
  );
}

export function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function ValueCell({ value, isForecast }: { value: number; isForecast: boolean }) {
  return <span className={isForecast ? "value-forecast" : "value-actual"}>{euro(value)}</span>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
