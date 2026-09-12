import type { WeekId } from "./time";

export type UnitId = string;
export type UnitKind = "group" | "location" | "person";

/**
 * Organisationseinheit. Blätter mit `entryMode: "direct"` werden manuell
 * erfasst, alle übrigen Einheiten werden aus ihren Kindern aufsummiert.
 * Das entspricht den Blöcken der Excel (Gesamt / Standort / Mitarbeiter).
 */
export interface Unit {
  id: UnitId;
  name: string;
  parentId: UnitId | null;
  kind: UnitKind;
  entryMode: "direct" | "rollup";
  active: boolean;
}

/** Annahmen der Forecast-Rechnung. Global, pro Einheit und pro Woche überschreibbar. */
export interface Assumptions {
  /** Angebote versendet → Auftragseingang vor Storno. */
  crOfferToOrder: number;
  /** Anteil der Aufträge, der wieder storniert wird. */
  stornoRate: number;
  /** Anteil baubarer Aufträge (Handover-Quote). */
  handoverRate: number;
  /** Durchschnittlicher Auftragswert. */
  aov: number;
  /** Durchschnittliche Cycle Time in Tagen zwischen Angebot und Auftrag. */
  cycleDays: number;
}

export type AssumptionOverrides = Partial<Assumptions>;

/** Quelle der für den Forecast verwendeten Conversion Rate. */
export type CrMode = "manual" | "rolling4" | "rolling8" | "rolling12";

/** Manuell erfasste Wochenwerte einer direkt gepflegten Einheit. */
export interface WeekInput {
  weekId: WeekId;
  unitId: UnitId;
  /** Neu versendete Angebote (Pipeline-Kohorte dieser Woche). */
  offersCount: number;
  offersVolume: number;
  /** Auftragseingang vor Storno, tatsächlich realisiert in dieser Woche. */
  ordersGrossCount: number;
  ordersGrossVolume: number;
  /** In dieser Woche erfasste Stornierungen. */
  stornoCount: number;
  stornoVolume: number;
  /** Auftragseingangsziel der Woche. */
  target: number;
  workingDays: number;
  fte: number;
  /** Woche ist fachlich abgeschlossen – Ist-Werte gelten als final. */
  closed: boolean;
  overrides: AssumptionOverrides;
  note?: string;
}

/** Eingefrorener Forecast-Stand, Basis für die Forecast Accuracy. */
export interface Snapshot {
  id: string;
  createdAt: string;
  unitId: UnitId;
  weekId: WeekId;
  forecastNet: number;
  crUsed: number;
  label?: string;
}

export interface Settings {
  assumptions: Assumptions;
  crMode: CrMode;
  /** Erste Woche, die in Tabellen und Charts angezeigt wird. */
  horizonStart: WeekId;
  /** Letzte Woche des Planungshorizonts. */
  horizonEnd: WeekId;
}

export interface AppState {
  version: number;
  units: Unit[];
  inputs: WeekInput[];
  snapshots: Snapshot[];
  settings: Settings;
}

export const EMPTY_INPUT = (weekId: WeekId, unitId: UnitId): WeekInput => ({
  weekId,
  unitId,
  offersCount: 0,
  offersVolume: 0,
  ordersGrossCount: 0,
  ordersGrossVolume: 0,
  stornoCount: 0,
  stornoVolume: 0,
  target: 0,
  workingDays: 5,
  fte: 1,
  closed: false,
  overrides: {}
});
