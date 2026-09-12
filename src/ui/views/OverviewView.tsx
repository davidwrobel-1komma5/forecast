import { useMemo } from "react";
import type { MonthResult, WeekResult } from "../../domain/forecast";
import { accuracyStats, analyseDrivers, coverage, funnelFor, nextRisk } from "../../domain/insights";
import type { Assumptions, Unit } from "../../domain/types";
import { euro, euroShort, percent, ratio, signedEuro } from "../format";
import { Card, Explain, KpiCard, StatusPill } from "../components/primitives";
import { ColumnChart, FunnelView, TrendChart, type TrendPoint } from "../components/charts";

interface Props {
  unit: Unit;
  weeks: WeekResult[];
  months: MonthResult[];
  month: MonthResult | undefined;
  assumptions: Assumptions;
  currentWeekId: string;
}

export function OverviewView({ unit, weeks, months, month, assumptions, currentWeekId }: Props) {
  const monthWeeks = month?.weeks ?? [];
  const risk = nextRisk(weeks, month);
  const drivers = useMemo(() => analyseDrivers(monthWeeks, assumptions), [monthWeeks, assumptions]);
  const accuracy = useMemo(() => accuracyStats(weeks), [weeks]);
  const cov = useMemo(() => coverage(monthWeeks, assumptions), [monthWeeks, assumptions]);

  const trend: TrendPoint[] = useMemo(() => {
    let actual = 0;
    let projected = 0;
    let target = 0;
    let actualStillValid = true;
    return monthWeeks.map((week) => {
      if (week.isForecast) actualStillValid = false;
      if (actualStillValid) actual += week.actualNet;
      projected += week.effective;
      target += week.target;
      return {
        label: week.meta.label,
        actual: actualStillValid ? actual : null,
        projected,
        target
      };
    });
  }, [monthWeeks]);

  const upcoming = useMemo(() => {
    const index = weeks.findIndex((w) => w.weekId === currentWeekId);
    const from = index === -1 ? 0 : index;
    return weeks.slice(from, from + 4);
  }, [weeks, currentWeekId]);

  const actualToDate = monthWeeks.reduce((acc, w) => acc + (w.isForecast ? 0 : w.actualNet), 0);
  const gap = (month?.effective ?? 0) - (month?.target ?? 0);

  if (!month) {
    return <div className="empty">Für den gewählten Zeitraum liegen keine Wochen im Horizont.</div>;
  }

  return (
    <>
      <div className="grid grid-kpi">
        <KpiCard
          primary
          label="Auftragseingang Ist"
          value={euro(actualToDate)}
          delta={month.target > 0 ? `${percent(actualToDate / month.target)} vom Monatsziel` : undefined}
          meta={`${monthWeeks.length - month.openWeeks} von ${monthWeeks.length} Wochen erfasst`}
        />
        <KpiCard
          label="Aktueller Forecast"
          value={euro(month.effective)}
          delta={`${month.openWeeks} Wochen noch offen`}
          meta="Ist, wo erfasst – sonst Forecast"
          explain={
            <Explain
              title={`Forecast ${month.label}`}
              rows={[
                ["Ist bisher", euro(actualToDate)],
                ["Forecast offene Wochen", euro(month.effective - actualToDate)],
                ["Verwendete CR", percent(assumptions.crOfferToOrder)],
                ["Cycle Time", `${assumptions.cycleDays} Tage`]
              ]}
              formula="Σ Wochen (Ist, sonst Pipeline × CR × (1 − Storno))"
            />
          }
        />
        <KpiCard label="Monatsziel" value={euro(month.target)} meta={month.label} />
        <KpiCard
          label={gap >= 0 ? "Puffer zum Ziel" : "Forecast-Lücke"}
          value={signedEuro(gap)}
          deltaTone={gap >= 0 ? "good" : "risk"}
          delta={month.attainment !== null ? `${percent(month.attainment)} Zielerreichung` : undefined}
          meta={
            gap < 0
              ? `≈ ${euroShort(month.requiredPipeline)} zusätzliches Angebotsvolumen nötig`
              : "Kein zusätzlicher Pipelinebedarf"
          }
        />
      </div>

      <div className={`callout ${risk.tone}`}>
        <div>
          <strong>{risk.title}</strong>
          <p>{risk.body}</p>
        </div>
      </div>

      <div className="grid grid-2">
        <Card title={`Forecast vs. Ist – ${month.label}`} subtitle="Kumuliert über die Wochen des Monats">
          <TrendChart points={trend} caption={`Forecast gegen Ist für ${month.label}`} />
        </Card>

        <Card title="Nächste vier Wochen" subtitle="Erwarteter Auftragseingang gegen Wochenziel">
          <div className="list-rows">
            {upcoming.map((week) => (
              <div className="list-row" key={week.weekId}>
                <div>
                  <strong>
                    {week.meta.label} · {week.meta.rangeLabel}
                  </strong>
                  <div className="sub">
                    {euro(week.effective)} von {euro(week.target)}
                    {week.isForecast ? " · Forecast" : " · Ist"}
                  </div>
                  <div className="bar-mini">
                    <i
                      className={week.status}
                      style={{ width: `${Math.min(100, Math.max(2, (week.attainment ?? 0) * 100))}%` }}
                    />
                  </div>
                </div>
                {week.target > 0 ? <StatusPill status={week.status} /> : <span className="pill neutral">Kein Ziel</span>}
              </div>
            ))}
            {!upcoming.length && <div className="empty">Keine offenen Wochen im Horizont.</div>}
          </div>
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title={`Trichter – ${month.label}`} subtitle="Gefüllte Balken zeigen das Ist, gestrichelte den Forecast">
          <FunnelView stages={funnelFor(monthWeeks, assumptions)} />
        </Card>

        <Card title="Warum weicht der Forecast ab?" subtitle="Zerlegung der Zielabweichung">
          <div className="stack">
            <p style={{ fontSize: 14 }}>{drivers.headline}</p>
            <div className="list-rows">
              <div className="list-row">
                <div>
                  <strong>Pipeline-Effekt</strong>
                  <div className="sub">
                    {euroShort(drivers.drivingOffers)} erstellt gegenüber {euroShort(drivers.neededOffers)} nötig
                  </div>
                </div>
                <span className={drivers.pipelineEffect < 0 ? "tone-risk" : "tone-good"}>
                  {signedEuro(drivers.pipelineEffect)}
                </span>
              </div>
              <div className="list-row">
                <div>
                  <strong>Conversion-Effekt</strong>
                  <div className="sub">
                    CR netto {percent(drivers.actualNetCr)} gegenüber Plan {percent(drivers.planNetCr)}
                  </div>
                </div>
                <span className={drivers.conversionEffect < 0 ? "tone-risk" : "tone-good"}>
                  {signedEuro(drivers.conversionEffect)}
                </span>
              </div>
              <div className="list-row">
                <div>
                  <strong>Abweichung gesamt</strong>
                  <div className="sub">Ist bzw. Forecast gegen Ziel</div>
                </div>
                <span className={drivers.gap < 0 ? "tone-risk" : "tone-good"}>{signedEuro(drivers.gap)}</span>
              </div>
            </div>
            <div className="divider" />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="tone-muted" style={{ fontSize: 13 }}>
                Pipeline Coverage
              </span>
              <strong>{cov === null ? "Ziel erreicht" : ratio(cov)}</strong>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="tone-muted" style={{ fontSize: 13 }}>
                Forecast Accuracy ({accuracy.closedWeeks} abgeschlossene Wochen)
              </span>
              <strong>{accuracy.accuracy === null ? "–" : percent(accuracy.accuracy)}</strong>
            </div>
          </div>
        </Card>
      </div>

      <Card
        title="Erstellte Pipeline je Woche"
        subtitle={`Angebotsvolumen von ${unit.name} über den gesamten Horizont`}
      >
        <ColumnChart
          points={weeks.map((week) => ({
            label: week.meta.label,
            value: week.offersVolume,
            muted: week.isForecast
          }))}
          reference={
            weeks.length
              ? weeks.reduce((acc, w) => acc + w.offersVolume, 0) / weeks.length
              : undefined
          }
          referenceLabel="Ø Horizont"
        />
      </Card>

      <Card title="Monatsübersicht" subtitle="Aus den Wochenwerten aggregiert" bodyClass="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th className="left sticky-col">Monat</th>
              <th>Angebotsvolumen</th>
              <th>Forecast</th>
              <th>Ist</th>
              <th>Erwartung gesamt</th>
              <th>Ziel</th>
              <th>Differenz</th>
              <th>Zielerreichung</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {months.map((entry) => (
              <tr key={entry.monthKey} className={entry.monthKey === month.monthKey ? "is-current" : undefined}>
                <td className="left sticky-col">{entry.label}</td>
                <td>{euro(entry.offersVolume)}</td>
                <td className="value-forecast">{euro(entry.forecastNet)}</td>
                <td>{euro(entry.actualNet)}</td>
                <td>{euro(entry.effective)}</td>
                <td>{euro(entry.target)}</td>
                <td className={entry.delta < 0 ? "tone-risk" : "tone-good"}>
                  {entry.target > 0 ? signedEuro(entry.delta) : "–"}
                </td>
                <td>{percent(entry.attainment)}</td>
                <td>
                  {entry.target > 0 ? <StatusPill status={entry.status} /> : <span className="pill neutral">Kein Ziel</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
