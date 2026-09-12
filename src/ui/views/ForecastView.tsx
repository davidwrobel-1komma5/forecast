import { useMemo, useState } from "react";
import { directLeaves, type WeekResult } from "../../domain/forecast";
import type { AssumptionOverrides, Unit, UnitId, WeekInput } from "../../domain/types";
import { useStore } from "../../data/store";
import { count, euro, percent, signedEuro } from "../format";
import { Card, Explain, NumberCell, PercentCell, StatusPill, ValueCell } from "../components/primitives";

interface Props {
  unit: Unit;
  weeks: WeekResult[];
  onSelectUnit: (unitId: UnitId) => void;
}

/**
 * Operative Kernansicht: eine Zeile je Kalenderwoche, Struktur und Reihenfolge
 * bewusst nah an der bisherigen Forecastliste.
 */
export function ForecastView({ unit, weeks, onSelectUnit }: Props) {
  const { state, updateInput, upsertUnit, currentWeekId } = useStore();
  const [showExtra, setShowExtra] = useState(false);
  const editable = unit.entryMode === "direct";
  const leaves = useMemo(() => directLeaves(state.units, unit.id), [state.units, unit.id]);

  const inputFor = useMemo(() => {
    const map = new Map<string, WeekInput>();
    for (const input of state.inputs.filter((i) => i.unitId === unit.id)) map.set(input.weekId, input);
    return map;
  }, [state.inputs, unit.id]);

  const totals = useMemo(() => {
    const sum = (pick: (w: WeekResult) => number) => weeks.reduce((acc, w) => acc + pick(w), 0);
    const effective = sum((w) => w.effective);
    const target = sum((w) => w.target);
    return {
      offersCount: sum((w) => w.offersCount),
      offersVolume: sum((w) => w.offersVolume),
      forecastNet: sum((w) => w.forecastNet),
      actualGross: sum((w) => w.actualGrossVolume),
      storno: sum((w) => w.actualStorno),
      effective,
      target,
      delta: effective - target
    };
  }, [weeks]);

  const extraColumns = showExtra ? 4 : 0;

  return (
    <>
      {!editable && (
        <div className="callout watch">
          <div>
            <strong>Diese Ansicht summiert nur auf</strong>
            <p>
              „{unit.name}“ ist als Rollup gesetzt und zeigt die Summe der untergeordneten Einheiten. Erfasse die
              Werte entweder direkt in einer Einheit darunter – oder stelle „{unit.name}“ auf direkte Erfassung um.
              Bereits erfasste Werte der Untereinheiten bleiben dabei gespeichert, zählen dann aber nicht mehr in
              diese Ansicht hinein.
            </p>
            <div className="row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn primary"
                onClick={() => upsertUnit({ ...unit, entryMode: "direct" })}
              >
                Werte hier direkt erfassen
              </button>
              {leaves.map((leaf) => (
                <button key={leaf.id} type="button" className="btn" onClick={() => onSelectUnit(leaf.id)}>
                  {leaf.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <Card
        title={`Wochenforecast – ${unit.name}`}
        subtitle={
          editable
            ? "Alle hellen Felder sind Eingaben – Angebote, Pipeline, Conversion Rate, Ist-Werte und Ziel. Alles Übrige wird daraus berechnet."
            : `Aufsummiert aus ${leaves.length} Einheiten – hier nicht direkt bearbeitbar.`
        }
        bodyClass="table-scroll"
        actions={
          <div className="row">
            <button type="button" className="btn" onClick={() => setShowExtra((v) => !v)}>
              {showExtra ? "Weniger Spalten" : "Mehr Spalten"}
            </button>
            {editable && unit.kind !== "person" && leaves.length === 1 && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => upsertUnit({ ...unit, entryMode: "rollup" })}
              >
                Wieder aufsummieren
              </button>
            )}
          </div>
        }
      >
        <table className="data">
          <thead>
            <tr>
              <th className="left sticky-col">Woche</th>
              <th>Angebote</th>
              <th>Angebotsvolumen</th>
              <th>
                CR Forecast
                <Explain
                  title="Verwendete Conversion Rate"
                  rows={[
                    ["Quelle", weeks[0]?.crSourceLabel ?? "–"],
                    ["Globale Annahme", percent(state.settings.assumptions.crOfferToOrder)]
                  ]}
                  formula="Je Woche überschreibbar. Angebotsvolumen × CR = AE vor Storno"
                />
              </th>
              <th>CR Ist</th>
              {showExtra && <th>Stornoquote</th>}
              <th>
                Forecast AE
                <Explain
                  title="Erwarteter Auftragseingang"
                  rows={[
                    ["Cycle Time", `${state.settings.assumptions.cycleDays} Tage`],
                    ["Versatz", `${Math.round(state.settings.assumptions.cycleDays / 7)} Wochen`],
                    ["Stornoquote", percent(state.settings.assumptions.stornoRate)]
                  ]}
                  formula="Σ Kohorten, die in dieser Woche landen × (1 − Stornoquote)"
                />
              </th>
              <th>Ist vor Storno</th>
              <th>Storno</th>
              <th>AE netto</th>
              <th>Ziel</th>
              <th>Differenz</th>
              {showExtra && <th>FTE</th>}
              {showExtra && <th>Arbeitstage</th>}
              <th>Status</th>
              {showExtra && <th className="left">Notiz</th>}
              <th>Fertig</th>
            </tr>
          </thead>

          <tbody>
            {weeks.map((week) => {
              const input = inputFor.get(week.weekId);
              const overrides: AssumptionOverrides = input?.overrides ?? {};
              const set = (patch: Partial<WeekInput>) => updateInput(week.weekId, unit.id, patch);
              const setOverride = (patch: AssumptionOverrides) =>
                set({ overrides: { ...overrides, ...patch } });
              const clearOverride = (key: keyof AssumptionOverrides) => {
                const next = { ...overrides };
                delete next[key];
                set({ overrides: next });
              };

              return (
                <tr key={week.weekId} className={week.weekId === currentWeekId ? "is-current" : undefined}>
                  <td className="left sticky-col">
                    <div className="week-label">
                      <strong>{week.meta.label}</strong>
                      <span>{week.meta.rangeLabel}</span>
                    </div>
                  </td>

                  <td>
                    {editable ? (
                      <NumberCell
                        value={week.offersCount}
                        ariaLabel={`Angebote ${week.meta.label}`}
                        onCommit={(value) => set({ offersCount: value })}
                      />
                    ) : (
                      count(week.offersCount)
                    )}
                  </td>

                  <td>
                    {editable ? (
                      <NumberCell
                        value={week.offersVolume}
                        ariaLabel={`Angebotsvolumen ${week.meta.label}`}
                        onCommit={(value) => set({ offersVolume: value })}
                        suffix="€"
                      />
                    ) : (
                      euro(week.offersVolume)
                    )}
                  </td>

                  <td>
                    {editable ? (
                      <PercentCell
                        value={week.crForecast}
                        overridden={overrides.crOfferToOrder !== undefined}
                        ariaLabel={`Conversion Rate ${week.meta.label}`}
                        onCommit={(value) => setOverride({ crOfferToOrder: value })}
                        onReset={() => clearOverride("crOfferToOrder")}
                      />
                    ) : (
                      <span className="tone-muted">{percent(week.crForecast)}</span>
                    )}
                  </td>

                  <td className={week.crActual !== null && week.crActual < week.crForecast ? "tone-risk" : undefined}>
                    {percent(week.crActual)}
                  </td>

                  {showExtra && (
                    <td>
                      {editable ? (
                        <PercentCell
                          value={week.assumptions.stornoRate}
                          overridden={overrides.stornoRate !== undefined}
                          ariaLabel={`Stornoquote ${week.meta.label}`}
                          onCommit={(value) => setOverride({ stornoRate: value })}
                          onReset={() => clearOverride("stornoRate")}
                        />
                      ) : (
                        <span className="tone-muted">{percent(week.assumptions.stornoRate)}</span>
                      )}
                    </td>
                  )}

                  <td>
                    <span className="value-forecast">{euro(week.forecastNet)}</span>
                    <Explain
                      title={`Forecast ${week.meta.label}`}
                      rows={[
                        ["Auslösende Kohorten", euro(week.crForecast > 0 ? week.forecastGross / week.crForecast : 0)],
                        ["Conversion Rate", percent(week.crForecast)],
                        ["AE vor Storno", euro(week.forecastGross)],
                        ["Storno", `− ${euro(week.forecastStorno)}`],
                        ["Forecast netto", euro(week.forecastNet)],
                        ["Eigene Kohorte landet in", `KW ${Number(week.landingWeekId.split("-W")[1])}`]
                      ]}
                      formula="Volumen × CR × (1 − Storno)"
                    />
                  </td>

                  <td>
                    {editable ? (
                      <NumberCell
                        value={week.actualGrossVolume}
                        ariaLabel={`Ist vor Storno ${week.meta.label}`}
                        onCommit={(value) => set({ ordersGrossVolume: value })}
                        suffix="€"
                      />
                    ) : (
                      euro(week.actualGrossVolume)
                    )}
                  </td>

                  <td>
                    {editable ? (
                      <NumberCell
                        value={week.actualStorno}
                        ariaLabel={`Storno ${week.meta.label}`}
                        onCommit={(value) => set({ stornoVolume: value })}
                        suffix="€"
                      />
                    ) : (
                      euro(week.actualStorno)
                    )}
                  </td>

                  <td>
                    <ValueCell value={week.effective} isForecast={week.isForecast} />
                  </td>

                  <td>
                    {editable ? (
                      <NumberCell
                        value={week.target}
                        ariaLabel={`Ziel ${week.meta.label}`}
                        onCommit={(value) => set({ target: value })}
                        suffix="€"
                      />
                    ) : (
                      euro(week.target)
                    )}
                  </td>

                  <td className={week.delta < 0 ? "tone-risk" : "tone-good"}>
                    {week.target > 0 ? signedEuro(week.delta) : "–"}
                  </td>

                  {showExtra && (
                    <td>
                      {editable ? (
                        <NumberCell
                          value={week.fte}
                          ariaLabel={`FTE ${week.meta.label}`}
                          onCommit={(value) => set({ fte: value })}
                        />
                      ) : (
                        count(week.fte)
                      )}
                    </td>
                  )}

                  {showExtra && (
                    <td>
                      {editable ? (
                        <NumberCell
                          value={week.workingDays}
                          ariaLabel={`Arbeitstage ${week.meta.label}`}
                          onCommit={(value) => set({ workingDays: value })}
                        />
                      ) : (
                        count(week.workingDays)
                      )}
                    </td>
                  )}

                  <td>
                    {week.target > 0 ? (
                      <StatusPill status={week.status} />
                    ) : (
                      <span className="pill neutral">Kein Ziel</span>
                    )}
                  </td>

                  {showExtra && (
                    <td className="left">
                      <input
                        className="cell-input text"
                        aria-label={`Notiz ${week.meta.label}`}
                        disabled={!editable}
                        defaultValue={input?.note ?? ""}
                        placeholder="–"
                        onBlur={(event) => set({ note: event.target.value })}
                      />
                    </td>
                  )}

                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(input?.closed)}
                      disabled={!editable}
                      aria-label={`${week.meta.label} abgeschlossen`}
                      onChange={(event) => set({ closed: event.target.checked })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <td className="left sticky-col">Summe</td>
              <td>{count(totals.offersCount)}</td>
              <td>{euro(totals.offersVolume)}</td>
              <td colSpan={showExtra ? 3 : 2} />
              <td>{euro(totals.forecastNet)}</td>
              <td>{euro(totals.actualGross)}</td>
              <td>{euro(totals.storno)}</td>
              <td>{euro(totals.effective)}</td>
              <td>{euro(totals.target)}</td>
              <td className={totals.delta < 0 ? "tone-risk" : "tone-good"}>
                {totals.target > 0 ? signedEuro(totals.delta) : "–"}
              </td>
              <td colSpan={extraColumns > 0 ? 5 : 2} />
            </tr>
          </tfoot>
        </table>
      </Card>
    </>
  );
}
