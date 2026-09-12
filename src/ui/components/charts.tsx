import { euroShort, euro, percent } from "../format";
import type { FunnelStage } from "../../domain/insights";
import type { Status } from "../../domain/forecast";

const W = 760;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 30, left: 62 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function niceTicks(max: number, steps = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / steps;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(value);
  return ticks;
}

export interface TrendPoint {
  label: string;
  /** Kumulierter Ist-Wert; `null`, sobald die Woche noch offen ist. */
  actual: number | null;
  /** Kumulierter Erwartungswert (Ist, wo vorhanden, sonst Forecast). */
  projected: number;
  target: number;
}

/** Forecast-vs.-Ist-Verlauf. Ist durchgezogen, Forecast gestrichelt. */
export function TrendChart({ points, caption }: { points: TrendPoint[]; caption?: string }) {
  if (points.length < 2) return <div className="empty">Zu wenige Wochen im Horizont für einen Verlauf.</div>;

  const max = Math.max(...points.flatMap((p) => [p.actual ?? 0, p.projected, p.target]), 1);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];

  const x = (index: number) => PAD.left + (index / (points.length - 1)) * PLOT_W;
  const y = (value: number) => PAD.top + PLOT_H - (value / top) * PLOT_H;

  const path = (pick: (p: TrendPoint) => number | null) =>
    points
      .map((point, index) => {
        const value = pick(point);
        if (value === null) return null;
        return `${index === 0 || pick(points[index - 1]) === null ? "M" : "L"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(" ");

  const labelEvery = Math.ceil(points.length / 9);

  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={caption ?? "Forecast gegen Ist"}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.left - 10} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)">
              {euroShort(tick)}
            </text>
          </g>
        ))}

        <path d={path((p) => p.target)} fill="none" stroke="var(--ink-muted)" strokeWidth="1.5" strokeDasharray="2 4" />
        <path d={path((p) => p.projected)} fill="none" stroke="var(--accent-line)" strokeWidth="2.5" strokeDasharray="6 4" />
        <path d={path((p) => p.actual)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />

        {points.map((point, index) =>
          point.actual !== null ? (
            <circle key={point.label} cx={x(index)} cy={y(point.actual)} r="3" fill="var(--accent)" />
          ) : null
        )}

        {points.map((point, index) =>
          index % labelEvery === 0 || index === points.length - 1 ? (
            <text key={point.label} x={x(index)} y={H - 9} textAnchor="middle" fontSize="11" fill="var(--ink-muted)">
              {point.label}
            </text>
          ) : null
        )}
      </svg>
      <div className="chart-legend">
        <span className="swatch-actual">
          <i /> Ist (kumuliert)
        </span>
        <span className="swatch-forecast">
          <i /> Erwartung inkl. Forecast
        </span>
        <span className="swatch-target">
          <i /> Ziel
        </span>
      </div>
    </figure>
  );
}

export interface ColumnPoint {
  label: string;
  value: number;
  muted?: boolean;
  status?: Status;
}

/** Balken je Woche, z. B. erstellte Pipeline oder Auftragseingang. */
export function ColumnChart({
  points,
  reference,
  referenceLabel,
  valueFormat = euroShort
}: {
  points: ColumnPoint[];
  reference?: number;
  referenceLabel?: string;
  valueFormat?: (value: number) => string;
}) {
  if (!points.length) return <div className="empty">Keine Daten im gewählten Zeitraum.</div>;

  // Kein fester Mindestwert – sonst würde eine Prozentachse bis 100 % skalieren.
  const rawMax = Math.max(...points.map((p) => p.value), reference ?? 0);
  const max = rawMax > 0 ? rawMax : 1;
  const ticks = niceTicks(max, 3);
  const top = ticks[ticks.length - 1];
  const slot = PLOT_W / points.length;
  const barW = Math.min(34, slot * 0.62);
  const y = (value: number) => PAD.top + PLOT_H - (value / top) * PLOT_H;
  const labelEvery = Math.ceil(points.length / 10);

  const fillOf = (point: ColumnPoint) => {
    if (point.status === "risk") return "var(--risk)";
    if (point.status === "watch") return "var(--watch)";
    if (point.muted) return "var(--accent-line)";
    return "var(--accent)";
  };

  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Werte je Woche">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--line)" />
            <text x={PAD.left - 10} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)">
              {valueFormat(tick)}
            </text>
          </g>
        ))}

        {points.map((point, index) => {
          const cx = PAD.left + slot * index + slot / 2;
          const height = Math.max(1, PAD.top + PLOT_H - y(point.value));
          return (
            <rect
              key={point.label}
              x={cx - barW / 2}
              y={y(point.value)}
              width={barW}
              height={height}
              rx="3"
              fill={fillOf(point)}
              opacity={point.muted ? 0.75 : 1}
            >
              <title>{`${point.label}: ${euro(point.value)}`}</title>
            </rect>
          );
        })}

        {reference !== undefined && reference > 0 && (
          <>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(reference)}
              y2={y(reference)}
              stroke="var(--ink-soft)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            {referenceLabel && (
              <text x={W - PAD.right} y={y(reference) - 6} textAnchor="end" fontSize="11" fill="var(--ink-soft)">
                {referenceLabel}
              </text>
            )}
          </>
        )}

        {points.map((point, index) =>
          index % labelEvery === 0 || index === points.length - 1 ? (
            <text
              key={point.label}
              x={PAD.left + slot * index + slot / 2}
              y={H - 9}
              textAnchor="middle"
              fontSize="11"
              fill="var(--ink-muted)"
            >
              {point.label}
            </text>
          ) : null
        )}
      </svg>
    </figure>
  );
}

/** Trichterdarstellung analog der Zeilenstruktur der Excel. */
export function FunnelView({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(...stages.map((s) => Math.max(s.forecast, s.actual ?? 0)), 1);

  return (
    <div className="funnel">
      {stages.map((stage) => {
        const forecastWidth = Math.max(1.5, (stage.forecast / max) * 100);
        const actualWidth = stage.actual !== null ? Math.max(1.5, (stage.actual / max) * 100) : null;
        return (
          <div className="funnel-row" key={stage.key}>
            <div className="funnel-meta">
              <strong>{stage.label}</strong>
              <span>
                {stage.hint}
                {stage.conversion !== null ? ` · ${percent(stage.conversion)}` : ""}
              </span>
            </div>
            <div className="funnel-track">
              <div className="funnel-bar" style={{ width: `${forecastWidth}%` }} />
              {actualWidth !== null && <div className="funnel-bar actual" style={{ width: `${actualWidth}%` }} />}
            </div>
            <div className="funnel-value">
              {euro(stage.actual ?? stage.forecast)}
              <span>
                {stage.actual !== null ? `Forecast ${euroShort(stage.forecast)}` : "Forecast"}
                {stage.count !== null ? ` · ${stage.count} Stück` : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
