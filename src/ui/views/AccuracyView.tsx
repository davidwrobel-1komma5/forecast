import { useMemo } from "react";
import type { WeekResult } from "../../domain/forecast";
import { accuracyStats } from "../../domain/insights";
import { useStore } from "../../data/store";
import type { Unit } from "../../domain/types";
import { euro, percent, signedEuro } from "../format";
import { Card, KpiCard } from "../components/primitives";
import { ColumnChart } from "../components/charts";

interface Props {
  unit: Unit;
  weeks: WeekResult[];
}

/**
 * Forecast-Qualität. Ohne diese Sicht bliebe offen, wie belastbar das Modell
 * überhaupt ist – deshalb gehört sie zur ersten Version.
 */
export function AccuracyView({ unit, weeks }: Props) {
  const { state, takeSnapshot, clearSnapshots } = useStore();
  const stats = useMemo(() => accuracyStats(weeks), [weeks]);
  const closed = weeks.filter((w) => w.closed);

  const snapshots = useMemo(
    () =>
      state.snapshots
        .filter((s) => s.unitId === unit.id)
        .sort((a, b) => a.weekId.localeCompare(b.weekId) || a.createdAt.localeCompare(b.createdAt)),
    [state.snapshots, unit.id]
  );

  const snapshotWeeks = useMemo(() => {
    const map = new Map<string, typeof snapshots>();
    for (const snapshot of snapshots) {
      const list = map.get(snapshot.weekId) ?? [];
      list.push(snapshot);
      map.set(snapshot.weekId, list);
    }
    return [...map.entries()].filter(([, list]) => list.length > 0);
  }, [snapshots]);

  return (
    <>
      <div className="grid grid-kpi">
        <KpiCard
          primary
          label="Forecast Accuracy"
          value={stats.accuracy === null ? "–" : percent(stats.accuracy)}
          meta={`Mittel über ${stats.closedWeeks} abgeschlossene Wochen`}
        />
        <KpiCard
          label="Systematischer Bias"
          value={signedEuro(stats.bias)}
          deltaTone={stats.bias >= 0 ? "good" : "risk"}
          delta={stats.bias >= 0 ? "Forecast unterschätzt tendenziell" : "Forecast überschätzt tendenziell"}
          meta="Summe aus Ist minus Forecast"
        />
        <KpiCard
          label="Grösste Einzelabweichung"
          value={stats.worst ? signedEuro(stats.worst.forecastDeviation ?? 0) : "–"}
          meta={stats.worst ? `${stats.worst.meta.label} · ${stats.worst.meta.rangeLabel}` : "Noch keine abgeschlossene Woche"}
        />
        <KpiCard
          label="Gespeicherte Snapshots"
          value={String(snapshots.length)}
          meta={`Für ${unit.name}`}
        />
      </div>

      <Card
        title="Forecast-Abweichung je abgeschlossener Woche"
        subtitle="Positiv bedeutet: der Ist-Auftragseingang lag über dem Forecast"
      >
        {closed.length ? (
          <ColumnChart
            points={closed.map((week) => ({
              label: week.meta.label,
              value: Math.abs(week.forecastDeviation ?? 0),
              status: (week.forecastDeviation ?? 0) < 0 ? "risk" : undefined
            }))}
          />
        ) : (
          <div className="empty">
            Noch keine Woche als abgeschlossen markiert. Setze in der Forecast-Tabelle den Haken „Fertig“.
          </div>
        )}
      </Card>

      <Card title="Abgeschlossene Wochen im Detail" bodyClass="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th className="left sticky-col">Woche</th>
              <th>Forecast</th>
              <th>Ist</th>
              <th>Abweichung</th>
              <th>Abweichung %</th>
              <th>Accuracy</th>
              <th>CR Forecast</th>
              <th>CR Ist</th>
            </tr>
          </thead>
          <tbody>
            {closed.map((week) => (
              <tr key={week.weekId}>
                <td className="left sticky-col">
                  <div className="week-label">
                    <strong>{week.meta.label}</strong>
                    <span>{week.meta.rangeLabel}</span>
                  </div>
                </td>
                <td className="value-forecast">{euro(week.forecastNet)}</td>
                <td className="value-actual">{euro(week.actualNet)}</td>
                <td className={(week.forecastDeviation ?? 0) < 0 ? "tone-risk" : "tone-good"}>
                  {signedEuro(week.forecastDeviation ?? 0)}
                </td>
                <td>{week.forecastNet > 0 ? percent((week.forecastDeviation ?? 0) / week.forecastNet) : "–"}</td>
                <td>{percent(week.accuracy)}</td>
                <td className="tone-muted">{percent(week.crForecast)}</td>
                <td>{percent(week.crActual)}</td>
              </tr>
            ))}
            {!closed.length && (
              <tr>
                <td className="left" colSpan={8}>
                  <div className="empty">Keine abgeschlossenen Wochen im Horizont.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card
        title="Forecast-Snapshots"
        subtitle="Ein Forecast wird nicht überschrieben, sondern als Stand festgehalten"
        actions={
          <div className="row">
            <button type="button" className="btn primary" onClick={() => takeSnapshot(unit.id)}>
              Snapshot speichern
            </button>
            {snapshots.length > 0 && (
              <button type="button" className="btn danger" onClick={clearSnapshots}>
                Alle löschen
              </button>
            )}
          </div>
        }
        bodyClass="table-scroll"
      >
        {snapshotWeeks.length ? (
          <table className="data">
            <thead>
              <tr>
                <th className="left sticky-col">Woche</th>
                <th className="left">Verlauf der Forecast-Stände</th>
                <th>Erster Stand</th>
                <th>Letzter Stand</th>
                <th>Veränderung</th>
              </tr>
            </thead>
            <tbody>
              {snapshotWeeks.map(([weekId, list]) => {
                const first = list[0];
                const last = list[list.length - 1];
                return (
                  <tr key={weekId}>
                    <td className="left sticky-col">KW {Number(weekId.split("-W")[1])}</td>
                    <td className="left tone-muted">
                      {list
                        .map((s) => `${new Date(s.createdAt).toLocaleDateString("de-DE")}: ${euro(s.forecastNet)}`)
                        .join("  →  ")}
                    </td>
                    <td>{euro(first.forecastNet)}</td>
                    <td>{euro(last.forecastNet)}</td>
                    <td className={last.forecastNet - first.forecastNet < 0 ? "tone-risk" : "tone-good"}>
                      {signedEuro(last.forecastNet - first.forecastNet)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            Noch keine Snapshots. Speichere wöchentlich einen Stand, um später zu sehen, wie sich der Forecast mit
            zunehmender Nähe zum Abschluss verändert hat.
          </div>
        )}
      </Card>
    </>
  );
}
