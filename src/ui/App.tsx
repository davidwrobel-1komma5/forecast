import { useEffect, useMemo, useState } from "react";
import { groupByMonth, seriesForUnit } from "../domain/forecast";
import { useStore } from "../data/store";
import { OverviewView } from "./views/OverviewView";
import { ForecastView } from "./views/ForecastView";
import { PipelineView } from "./views/PipelineView";
import { TeamView } from "./views/TeamView";
import { AccuracyView } from "./views/AccuracyView";
import { SettingsView } from "./views/SettingsView";

type ViewKey = "overview" | "forecast" | "pipeline" | "team" | "accuracy" | "settings";

const NAV: Array<{ key: ViewKey; label: string; icon: JSX.Element }> = [
  { key: "overview", label: "Übersicht", icon: icon("M3 10.5 10 4l7 6.5V16a1 1 0 0 1-1 1h-3v-4H7v4H4a1 1 0 0 1-1-1z") },
  { key: "forecast", label: "Forecast", icon: icon("M3 4h14M3 10h14M3 16h14") },
  { key: "pipeline", label: "Pipeline & Conversion", icon: icon("M4 16V9m4 7V5m4 11v-5m4 5V7") },
  { key: "team", label: "Mitarbeiter", icon: icon("M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM2.5 16c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M13.5 9.5a2 2 0 1 0 0-4M14 16c0-2 .6-3.2 1.8-4") },
  { key: "accuracy", label: "Genauigkeit", icon: icon("M10 3a7 7 0 1 0 7 7M10 10 14.5 5.5M10 10h0") },
  { key: "settings", label: "Einstellungen", icon: icon("M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M15.7 4.3l-1.4 1.4M5.7 14.3l-1.4 1.4") }
];

function icon(d: string) {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const VIEW_SUBTITLE: Record<ViewKey, string> = {
  overview: "Wo stehen wir, wo landen wir, wo entsteht Risiko?",
  forecast: "Wochenebene – die operative Arbeitsfläche",
  pipeline: "Wird heute genug Pipeline für die kommenden Wochen gebaut?",
  team: "Wer braucht Pipeline, wer braucht Conversion?",
  accuracy: "Wie belastbar ist der Forecast historisch?",
  settings: "Annahmen, Struktur und Daten"
};

export function App() {
  const { state, horizon, currentWeekId } = useStore();
  const [view, setView] = useState<ViewKey>("overview");
  const [unitId, setUnitId] = useState<string>(state.units[0]?.id ?? "gesamt");
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const unit = state.units.find((u) => u.id === unitId && u.active) ?? state.units[0];

  const weeks = useMemo(() => seriesForUnit(state, unit.id, horizon), [state, unit.id, horizon]);
  const months = useMemo(() => groupByMonth(weeks), [weeks]);

  const activeMonthKey = useMemo(() => {
    if (monthKey && months.some((m) => m.monthKey === monthKey)) return monthKey;
    const current = weeks.find((w) => w.weekId === currentWeekId)?.meta.monthKey;
    return current ?? months[0]?.monthKey ?? null;
  }, [monthKey, months, weeks, currentWeekId]);

  const month = months.find((m) => m.monthKey === activeMonthKey);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <strong>Forecast</strong>
          <span>Vertriebssteuerung Münster</span>
        </div>
        <nav className="nav" aria-label="Hauptnavigation">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-current={view === item.key ? "page" : undefined}
              onClick={() => setView(item.key)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          Aktuelle Woche: {currentWeekId.replace(/^\d{4}-W/, "KW ")}
          <br />
          {horizon.length} Wochen im Horizont
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{NAV.find((item) => item.key === view)?.label}</h1>
            <span>{VIEW_SUBTITLE[view]}</span>
          </div>

          {view !== "settings" && (
            <div className="topbar-controls">
              <label className="sr-only" htmlFor="unit-select">
                Einheit
              </label>
              <select
                id="unit-select"
                className="select"
                value={unit.id}
                onChange={(event) => setUnitId(event.target.value)}
              >
                {state.units
                  .filter((u) => u.active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.kind === "person" ? `   ${u.name}` : u.name}
                    </option>
                  ))}
              </select>

              {(view === "overview" || view === "team") && (
                <>
                  <label className="sr-only" htmlFor="month-select">
                    Monat
                  </label>
                  <select
                    id="month-select"
                    className="select"
                    value={activeMonthKey ?? ""}
                    onChange={(event) => setMonthKey(event.target.value)}
                  >
                    {months.map((m) => (
                      <option key={m.monthKey} value={m.monthKey}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}
        </header>

        <div className="content">
          {view === "overview" && (
            <OverviewView
              unit={unit}
              weeks={weeks}
              months={months}
              month={month}
              assumptions={state.settings.assumptions}
              currentWeekId={currentWeekId}
            />
          )}
          {view === "forecast" && <ForecastView unit={unit} weeks={weeks} onSelectUnit={setUnitId} />}
          {view === "pipeline" && (
            <PipelineView unit={unit} weeks={weeks} assumptions={state.settings.assumptions} />
          )}
          {view === "team" && (
            <TeamView
              unit={unit}
              monthKey={activeMonthKey ?? undefined}
              onSelectUnit={(id) => {
                setUnitId(id);
                setView("forecast");
              }}
            />
          )}
          {view === "accuracy" && <AccuracyView unit={unit} weeks={weeks} />}
          {view === "settings" && <SettingsView onNotify={setToast} />}
        </div>
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
