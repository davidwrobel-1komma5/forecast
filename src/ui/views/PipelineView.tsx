import { useMemo } from "react";
import type { WeekResult } from "../../domain/forecast";
import { coverage } from "../../domain/insights";
import type { Assumptions, Unit } from "../../domain/types";
import { euro, euroShort, percent, ratio } from "../format";
import { Card, KpiCard, StatusPill } from "../components/primitives";
import { ColumnChart } from "../components/charts";

interface Props {
  unit: Unit;
  weeks: WeekResult[];
  assumptions: Assumptions;
}

/**
 * Pipeline- und Conversion-Analyse: macht Probleme sichtbar, bevor sie im
 * Auftragseingang ankommen.
 */
export function PipelineView({ unit, weeks, assumptions }: Props) {
  const open = weeks.filter((w) => w.isForecast);
  const closed = weeks.filter((w) => w.closed);

  const pipelineTarget = useMemo(() => {
    const netCr = assumptions.crOfferToOrder * (1 - assumptions.stornoRate);
    if (netCr <= 0) return 0;
    const weeklyTarget = weeks.reduce((acc, w) => acc + w.target, 0) / Math.max(1, weeks.length);
    return weeklyTarget / netCr;
  }, [weeks, assumptions]);

  const avgOffers = weeks.length ? weeks.reduce((acc, w) => acc + w.offersVolume, 0) / weeks.length : 0;
  const cov = coverage(open, assumptions);
  const crPoints = closed.filter((w) => w.crActual !== null);
  const avgCrActual = crPoints.length
    ? crPoints.reduce((acc, w) => acc + (w.crActual ?? 0), 0) / crPoints.length
    : null;

  return (
    <>
      <div className="grid grid-kpi">
        <KpiCard
          primary
          label="Pipeline offene Wochen"
          value={euro(open.reduce((acc, w) => acc + w.offersVolume, 0))}
          meta={`${open.length} Wochen im Forecast-Horizont`}
        />
        <KpiCard
          label="Ø Pipeline je Woche"
          value={euro(avgOffers)}
          delta={pipelineTarget > 0 ? `Bedarf ${euroShort(pipelineTarget)}` : undefined}
          deltaTone={avgOffers >= pipelineTarget ? "good" : "risk"}
          meta="Nötig, um das Wochenziel zu tragen"
        />
        <KpiCard
          label="Pipeline Coverage"
          value={cov === null ? "Ziel gedeckt" : ratio(cov)}
          meta="Relevante Pipeline / noch benötigter Auftragseingang"
        />
        <KpiCard
          label="Zusätzlich nötige Pipeline"
          value={euro(open.reduce((acc, w) => acc + w.requiredPipeline, 0))}
          deltaTone="risk"
          meta="Summe über alle offenen Wochen unter Ziel"
        />
      </div>

      <Card
        title="Pipeline-Erstellung gegen Bedarf"
        subtitle={`Angebotsvolumen je Woche – ${unit.name}`}
      >
        <ColumnChart
          points={weeks.map((week) => ({
            label: week.meta.label,
            value: week.offersVolume,
            muted: week.isForecast,
            status: pipelineTarget > 0 && week.offersVolume < pipelineTarget * 0.85 ? "risk" : undefined
          }))}
          reference={pipelineTarget}
          referenceLabel="Pipelinebedarf"
        />
      </Card>

      <div className="grid grid-2">
        <Card
          title="Conversion Rate im Zeitverlauf"
          subtitle={
            avgCrActual !== null
              ? `Ø Ist ${percent(avgCrActual)} gegenüber Annahme ${percent(assumptions.crOfferToOrder)}`
              : "Noch keine abgeschlossene Woche mit auslösender Kohorte"
          }
        >
          <ColumnChart
            points={crPoints.map((week) => ({
              label: week.meta.label,
              value: week.crActual ?? 0,
              status: (week.crActual ?? 0) < assumptions.crOfferToOrder * 0.9 ? "risk" : undefined
            }))}
            reference={assumptions.crOfferToOrder}
            referenceLabel="Annahme"
            valueFormat={(value) => percent(value)}
          />
          {crPoints.length > 0 && crPoints.length < 4 && (
            <p className="field-hint" style={{ marginTop: 12 }}>
              Hinweis: {crPoints.length} Datenpunkt(e) – zu wenig für belastbare Schlüsse.
            </p>
          )}
        </Card>

        <Card title="Pipeline-Kohorten" subtitle="Wann wird die erstellte Pipeline zu Auftragseingang?" bodyClass="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th className="left sticky-col">Kohorte</th>
                <th>Erstellt</th>
                <th>CR</th>
                <th>Erwarteter AE</th>
                <th className="left">Landet in</th>
              </tr>
            </thead>
            <tbody>
              {weeks
                .filter((w) => w.offersVolume > 0)
                .slice(-12)
                .map((week) => (
                  <tr key={week.weekId}>
                    <td className="left sticky-col">
                      <div className="week-label">
                        <strong>{week.meta.label}</strong>
                        <span>{week.meta.rangeLabel}</span>
                      </div>
                    </td>
                    <td>{euro(week.offersVolume)}</td>
                    <td className="tone-muted">{percent(week.crForecast)}</td>
                    <td className="value-forecast">{euro(week.cohortExpectedGross)}</td>
                    <td className="left">KW {Number(week.landingWeekId.split("-W")[1])}</td>
                  </tr>
                ))}
              {!weeks.some((w) => w.offersVolume > 0) && (
                <tr>
                  <td className="left" colSpan={5}>
                    <div className="empty">Noch kein Angebotsvolumen erfasst.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Gefährdete Wochen" subtitle="Offene Wochen, deren Forecast unter Ziel liegt" bodyClass="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th className="left sticky-col">Woche</th>
              <th>Forecast</th>
              <th>Ziel</th>
              <th>Lücke</th>
              <th>Nötige Zusatzpipeline</th>
              <th>Spätester Erstellzeitpunkt</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {open
              .filter((w) => w.target > 0 && w.status !== "good")
              .map((week) => {
                const offset = Math.round(week.assumptions.cycleDays / 7);
                const index = weeks.findIndex((w) => w.weekId === week.weekId);
                const source = weeks[index - offset];
                return (
                  <tr key={week.weekId}>
                    <td className="left sticky-col">{week.meta.label}</td>
                    <td className="value-forecast">{euro(week.forecastNet)}</td>
                    <td>{euro(week.target)}</td>
                    <td className="tone-risk">{euro(week.target - week.effective)}</td>
                    <td>{euro(week.requiredPipeline)}</td>
                    <td>{source ? `${source.meta.label} · ${source.meta.rangeLabel}` : `${offset} Wochen vorher`}</td>
                    <td>
                      <StatusPill status={week.status} />
                    </td>
                  </tr>
                );
              })}
            {!open.some((w) => w.target > 0 && w.status !== "good") && (
              <tr>
                <td className="left" colSpan={7}>
                  <div className="empty">Keine offene Woche liegt unter Ziel.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
