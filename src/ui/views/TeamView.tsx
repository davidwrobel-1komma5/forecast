import { useMemo } from "react";
import { groupByMonth, seriesForUnit, type WeekResult } from "../../domain/forecast";
import { accuracyStats, analyseDrivers } from "../../domain/insights";
import { useStore } from "../../data/store";
import type { Unit } from "../../domain/types";
import { euro, euroShort, percent, signedEuro } from "../format";
import { Card, StatusPill } from "../components/primitives";

interface Props {
  unit: Unit;
  monthKey: string | undefined;
  onSelectUnit: (unitId: string) => void;
}

interface Row {
  unit: Unit;
  weeks: WeekResult[];
  offersVolume: number;
  effective: number;
  target: number;
  attainment: number | null;
  crActual: number | null;
  accuracy: number | null;
  requiredPipeline: number;
  reason: string;
}

/**
 * Mitarbeitervergleich, der nicht nur rankt, sondern die Ursache der
 * Abweichung benennt (Pipeline oder Conversion).
 */
export function TeamView({ unit, monthKey, onSelectUnit }: Props) {
  const { state, horizon } = useStore();
  const assumptions = state.settings.assumptions;

  const members = useMemo(() => {
    const collect = (parentId: string | null): Unit[] =>
      state.units
        .filter((u) => u.parentId === parentId && u.active)
        .flatMap((u) => (u.kind === "person" ? [u] : collect(u.id)));
    const scoped = collect(unit.id);
    return scoped.length ? scoped : state.units.filter((u) => u.kind === "person" && u.active);
  }, [state.units, unit.id]);

  const rows: Row[] = useMemo(
    () =>
      members.map((member) => {
        const all = seriesForUnit(state, member.id, horizon);
        const weeks = monthKey ? all.filter((w) => w.meta.monthKey === monthKey) : all;
        const sum = (pick: (w: WeekResult) => number) => weeks.reduce((acc, w) => acc + pick(w), 0);
        const target = sum((w) => w.target);
        const effective = sum((w) => w.effective);
        const drivers = analyseDrivers(weeks, assumptions);
        const crWeeks = weeks.filter((w) => w.crActual !== null);
        return {
          unit: member,
          weeks,
          offersVolume: sum((w) => w.offersVolume),
          effective,
          target,
          attainment: target > 0 ? effective / target : null,
          crActual: crWeeks.length
            ? crWeeks.reduce((acc, w) => acc + (w.crActual ?? 0), 0) / crWeeks.length
            : null,
          accuracy: accuracyStats(weeks).accuracy,
          requiredPipeline: sum((w) => w.requiredPipeline),
          reason:
            target === 0
              ? "Kein Ziel hinterlegt"
              : drivers.gap >= 0
                ? "Über Ziel"
                : Math.abs(drivers.pipelineEffect) >= Math.abs(drivers.conversionEffect)
                  ? `${euroShort(Math.abs(drivers.pipelineEffect))} durch zu wenig Pipeline`
                  : `${euroShort(Math.abs(drivers.conversionEffect))} durch niedrigere Conversion`
        };
      }),
    [members, state, horizon, monthKey, assumptions]
  );

  const ranked = [...rows].sort((a, b) => b.effective - a.effective);
  const maxEffective = Math.max(...ranked.map((r) => r.effective), 1);
  const totalTarget = ranked.reduce((acc, r) => acc + r.target, 0);
  const totalEffective = ranked.reduce((acc, r) => acc + r.effective, 0);

  const monthLabel = monthKey
    ? groupByMonth(rows[0]?.weeks ?? []).find((m) => m.monthKey === monthKey)?.label ?? monthKey
    : "gesamter Horizont";

  if (!members.length) {
    return <div className="empty">Unter {unit.name} sind keine Mitarbeiter angelegt.</div>;
  }

  return (
    <>
      <Card
        title={`Mitarbeitervergleich – ${monthLabel}`}
        subtitle="Sortiert nach erwartetem Auftragseingang"
        bodyClass="table-scroll"
        actions={
          <span className="pill neutral">
            Team {euro(totalEffective)} von {euro(totalTarget)}
          </span>
        }
      >
        <table className="data">
          <thead>
            <tr>
              <th className="left sticky-col">Mitarbeiter</th>
              <th>Pipeline erstellt</th>
              <th>CR Ist</th>
              <th>Erwarteter AE</th>
              <th>Ziel</th>
              <th>Differenz</th>
              <th>Zielerreichung</th>
              <th>Accuracy</th>
              <th className="left">Hauptursache</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => (
              <tr key={row.unit.id}>
                <td className="left sticky-col">
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ padding: "2px 6px" }}
                    onClick={() => onSelectUnit(row.unit.id)}
                  >
                    {row.unit.name}
                  </button>
                </td>
                <td>{euro(row.offersVolume)}</td>
                <td className={row.crActual !== null && row.crActual < assumptions.crOfferToOrder ? "tone-risk" : undefined}>
                  {percent(row.crActual)}
                </td>
                <td>
                  {euro(row.effective)}
                  <div className="bar-mini">
                    <i style={{ width: `${Math.max(2, (row.effective / maxEffective) * 100)}%` }} />
                  </div>
                </td>
                <td>{euro(row.target)}</td>
                <td className={row.effective - row.target < 0 ? "tone-risk" : "tone-good"}>
                  {row.target > 0 ? signedEuro(row.effective - row.target) : "–"}
                </td>
                <td>{percent(row.attainment)}</td>
                <td>{percent(row.accuracy)}</td>
                <td className="left tone-muted">{row.reason}</td>
                <td>
                  {row.target > 0 ? (
                    <StatusPill status={row.attainment !== null && row.attainment >= 1 ? "good" : row.attainment !== null && row.attainment >= 0.85 ? "watch" : "risk"} />
                  ) : (
                    <span className="pill neutral">Kein Ziel</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Benötigte Zusatzpipeline je Mitarbeiter" subtitle="Damit das Ziel im gewählten Zeitraum erreichbar bleibt">
        <div className="list-rows">
          {ranked
            .filter((row) => row.requiredPipeline > 0)
            .map((row) => (
              <div className="list-row" key={row.unit.id}>
                <div>
                  <strong>{row.unit.name}</strong>
                  <div className="sub">{row.reason}</div>
                </div>
                <span className="tone-risk">{euro(row.requiredPipeline)}</span>
              </div>
            ))}
          {!ranked.some((row) => row.requiredPipeline > 0) && (
            <div className="empty">Alle Mitarbeiter liegen im Plan.</div>
          )}
        </div>
      </Card>
    </>
  );
}
