import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { seriesForUnit, directLeaves } from "../domain/forecast";
import { shiftWeek, todayWeekId, weekRange, type WeekId } from "../domain/time";
import {
  EMPTY_INPUT,
  type AppState,
  type Assumptions,
  type CrMode,
  type Settings,
  type Unit,
  type UnitId,
  type WeekInput
} from "../domain/types";
import { localRepository } from "./repository";
import { seedState, slug } from "./seed";

interface StoreValue {
  state: AppState;
  horizon: WeekId[];
  currentWeekId: WeekId;
  updateInput(weekId: WeekId, unitId: UnitId, patch: Partial<WeekInput>): void;
  setAssumptions(patch: Partial<Assumptions>): void;
  setCrMode(mode: CrMode): void;
  setHorizon(patch: Partial<Pick<Settings, "horizonStart" | "horizonEnd">>): void;
  upsertUnit(unit: Unit): void;
  addPerson(name: string, parentId: UnitId): void;
  removeUnit(unitId: UnitId): void;
  takeSnapshot(unitId: UnitId, label?: string): void;
  clearSnapshots(): void;
  exportJson(): string;
  importJson(raw: string): { ok: boolean; message: string };
  loadDemoData(): void;
  resetAll(): void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => localRepository.load());

  useEffect(() => {
    localRepository.save(state);
  }, [state]);

  const horizon = useMemo(
    () => weekRange(state.settings.horizonStart, state.settings.horizonEnd),
    [state.settings.horizonStart, state.settings.horizonEnd]
  );
  const currentWeekId = useMemo(() => todayWeekId(), []);

  const updateInput = useCallback((weekId: WeekId, unitId: UnitId, patch: Partial<WeekInput>) => {
    setState((prev) => {
      const index = prev.inputs.findIndex((i) => i.weekId === weekId && i.unitId === unitId);
      const next = [...prev.inputs];
      if (index === -1) {
        next.push({ ...EMPTY_INPUT(weekId, unitId), ...patch });
      } else {
        next[index] = { ...next[index], ...patch };
      }
      return { ...prev, inputs: next };
    });
  }, []);

  const setAssumptions = useCallback((patch: Partial<Assumptions>) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, assumptions: { ...prev.settings.assumptions, ...patch } }
    }));
  }, []);

  const setCrMode = useCallback((crMode: CrMode) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, crMode } }));
  }, []);

  const setHorizon = useCallback((patch: Partial<Pick<Settings, "horizonStart" | "horizonEnd">>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  }, []);

  const upsertUnit = useCallback((unit: Unit) => {
    setState((prev) => {
      const index = prev.units.findIndex((u) => u.id === unit.id);
      const units = [...prev.units];
      if (index === -1) units.push(unit);
      else units[index] = unit;
      return { ...prev, units };
    });
  }, []);

  const addPerson = useCallback((name: string, parentId: UnitId) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((prev) => {
      let id = slug(trimmed);
      let suffix = 2;
      while (prev.units.some((u) => u.id === id)) id = `${slug(trimmed)}-${suffix++}`;
      return {
        ...prev,
        units: [
          ...prev.units,
          { id, name: trimmed, parentId, kind: "person", entryMode: "direct", active: true }
        ]
      };
    });
  }, []);

  const removeUnit = useCallback((unitId: UnitId) => {
    setState((prev) => ({
      ...prev,
      units: prev.units.filter((u) => u.id !== unitId && u.parentId !== unitId),
      inputs: prev.inputs.filter((i) => i.unitId !== unitId)
    }));
  }, []);

  const takeSnapshot = useCallback(
    (unitId: UnitId, label?: string) => {
      setState((prev) => {
        const weeks = seriesForUnit(prev, unitId, horizon).filter((w) => w.isForecast);
        const createdAt = new Date().toISOString();
        const snapshots = weeks.map((week) => ({
          id: `${unitId}-${week.weekId}-${createdAt}`,
          createdAt,
          unitId,
          weekId: week.weekId,
          forecastNet: week.forecastNet,
          crUsed: week.crForecast,
          label
        }));
        return { ...prev, snapshots: [...prev.snapshots, ...snapshots] };
      });
    },
    [horizon]
  );

  const clearSnapshots = useCallback(() => {
    setState((prev) => ({ ...prev, snapshots: [] }));
  }, []);

  const exportJson = useCallback(() => JSON.stringify(state, null, 2), [state]);

  const importJson = useCallback((raw: string) => {
    try {
      const parsed = JSON.parse(raw) as AppState;
      if (!parsed.units || !parsed.settings || !Array.isArray(parsed.inputs)) {
        return { ok: false, message: "Die Datei enthält keinen gültigen Forecast-Datensatz." };
      }
      setState({ ...seedState(), ...parsed, settings: { ...seedState().settings, ...parsed.settings } });
      return { ok: true, message: "Daten importiert." };
    } catch {
      return { ok: false, message: "Die Datei konnte nicht gelesen werden." };
    }
  }, []);

  const loadDemoData = useCallback(() => {
    setState((prev) => ({ ...prev, inputs: buildDemoInputs(prev, horizon, currentWeekId) }));
  }, [horizon, currentWeekId]);

  const resetAll = useCallback(() => setState(seedState()), []);

  const value: StoreValue = {
    state,
    horizon,
    currentWeekId,
    updateInput,
    setAssumptions,
    setCrMode,
    setHorizon,
    upsertUnit,
    addPerson,
    removeUnit,
    takeSnapshot,
    clearSnapshots,
    exportJson,
    importJson,
    loadDemoData,
    resetAll
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore muss innerhalb von StoreProvider verwendet werden.");
  return value;
}

/**
 * Nachvollziehbare Beispieldaten, damit alle Auswertungen ohne Ersterfassung
 * beurteilt werden können. Deterministisch, also bei jedem Laden identisch.
 */
function buildDemoInputs(state: AppState, horizon: WeekId[], currentWeekId: WeekId): WeekInput[] {
  const leaves = directLeaves(state.units, "gesamt");
  const inputs: WeekInput[] = [];
  const currentIndex = horizon.indexOf(currentWeekId);
  const { crOfferToOrder, stornoRate, aov } = state.settings.assumptions;

  leaves.forEach((leaf, leafIndex) => {
    const strength = 0.75 + ((leafIndex * 37) % 60) / 100; // 0,75 – 1,34
    horizon.forEach((weekId, weekIndex) => {
      const wave = 1 + 0.18 * Math.sin((weekIndex + leafIndex) / 2.4);
      const offersVolume = Math.round((240_000 * strength * wave) / 1000) * 1000;
      const target = Math.round((offersVolume * crOfferToOrder * (1 - stornoRate)) / 1000) * 1000;
      const isPast = currentIndex >= 0 && weekIndex < currentIndex;

      // Ist-Werte nur für abgeschlossene Wochen; der Kohortenversatz liegt bei zwei Wochen.
      const cohortIndex = weekIndex - 2;
      const cohortVolume =
        cohortIndex >= 0 ? Math.round((240_000 * strength * (1 + 0.18 * Math.sin((cohortIndex + leafIndex) / 2.4))) / 1000) * 1000 : 0;
      const realisedCr = crOfferToOrder * (0.88 + ((weekIndex * 13 + leafIndex * 7) % 25) / 100);
      const ordersGrossVolume = isPast ? Math.round(cohortVolume * realisedCr) : 0;
      const stornoVolume = isPast ? Math.round(ordersGrossVolume * stornoRate * 0.9) : 0;

      inputs.push({
        weekId,
        unitId: leaf.id,
        offersCount: Math.round(offersVolume / aov),
        offersVolume,
        ordersGrossCount: Math.round(ordersGrossVolume / aov),
        ordersGrossVolume,
        stornoCount: Math.round(stornoVolume / aov),
        stornoVolume,
        target,
        workingDays: 5,
        fte: 1,
        closed: isPast,
        overrides: {}
      });
    });
  });

  return inputs;
}

export const nextWeekId = (id: WeekId) => shiftWeek(id, 1);
