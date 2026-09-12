import { shiftWeek, todayWeekId } from "../domain/time";
import type { AppState, Unit } from "../domain/types";

export const STATE_VERSION = 1;

/**
 * Ausgangsstruktur und Ausgangsannahmen entsprechen der bestehenden
 * Forecastliste (Standorte Münster/Möhnesee, Vertriebsteam Münster).
 * Werte werden bewusst nicht vorbelegt – sie werden in der App gepflegt.
 */
const MUENSTER_TEAM = [
  "Linus Heidrich",
  "Dave Mbouna Holl",
  "Mirko Fledder",
  "Nils Henning",
  "Tjark Hartleif",
  "Jannes Petersen",
  "Björn Gerath"
];

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function seedUnits(): Unit[] {
  const units: Unit[] = [
    { id: "gesamt", name: "Münster/Möhnesee", parentId: null, kind: "group", entryMode: "rollup", active: true },
    { id: "muenster", name: "Münster", parentId: "gesamt", kind: "location", entryMode: "rollup", active: true },
    { id: "moehnesee", name: "Möhnesee", parentId: "gesamt", kind: "location", entryMode: "direct", active: true }
  ];
  for (const name of MUENSTER_TEAM) {
    units.push({
      id: slug(name),
      name,
      parentId: "muenster",
      kind: "person",
      entryMode: "direct",
      active: true
    });
  }
  return units;
}

export function seedState(now: Date = new Date()): AppState {
  const current = todayWeekId(now);
  return {
    version: STATE_VERSION,
    units: seedUnits(),
    inputs: [],
    snapshots: [],
    settings: {
      assumptions: {
        crOfferToOrder: 0.269,
        stornoRate: 0.138,
        handoverRate: 0.771,
        aov: 24812,
        cycleDays: 14
      },
      crMode: "manual",
      horizonStart: shiftWeek(current, -12),
      horizonEnd: shiftWeek(current, 8)
    }
  };
}
