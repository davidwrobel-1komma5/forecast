import {
  monthLabel,
  shiftWeek,
  weekMeta,
  type WeekId,
  type WeekMeta
} from "./time";
import type {
  AppState,
  Assumptions,
  CrMode,
  Unit,
  UnitId,
  WeekInput
} from "./types";

export type Status = "good" | "watch" | "risk";

export interface WeekResult {
  weekId: WeekId;
  meta: WeekMeta;

  /** Pipeline-Kohorte dieser Woche: neu versendete Angebote. */
  offersCount: number;
  offersVolume: number;

  /** Für die Kohorte dieser Woche verwendete Conversion Rate. */
  crForecast: number;
  /** Tatsächlich gemessene CR: Ist-AE dieser Woche gegen die auslösende Kohorte. */
  crActual: number | null;
  crSourceLabel: string;

  /** Erwarteter Brutto-AE aus der Kohorte dieser Woche … */
  cohortExpectedGross: number;
  /** … und die Woche, in der er laut Cycle Time landet. */
  landingWeekId: WeekId;

  /** Summe aller Kohorten, die in dieser Woche zu Auftragseingang werden. */
  forecastGross: number;
  forecastHandover: number;
  forecastStorno: number;
  forecastNet: number;

  actualGrossCount: number;
  actualGrossVolume: number;
  actualStorno: number;
  actualNet: number;
  hasActual: boolean;
  closed: boolean;

  /** Ist, sobald erfasst – sonst Forecast. Basis aller Aggregationen. */
  effective: number;
  isForecast: boolean;

  target: number;
  delta: number;
  attainment: number | null;
  status: Status;

  /** Zusätzlich nötiges Angebotsvolumen, um das Wochenziel zu erreichen. */
  requiredPipeline: number;
  /** Forecast-Abweichung einer abgeschlossenen Woche (Ist − Forecast). */
  forecastDeviation: number | null;
  accuracy: number | null;

  aov: number;
  fte: number;
  workingDays: number;
  assumptions: Assumptions;
  note?: string;
}

export interface MonthResult {
  monthKey: string;
  label: string;
  weeks: WeekResult[];
  offersVolume: number;
  forecastNet: number;
  actualNet: number;
  effective: number;
  target: number;
  delta: number;
  attainment: number | null;
  status: Status;
  openWeeks: number;
  requiredPipeline: number;
}

const clamp0 = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function statusOf(ratio: number | null): Status {
  if (ratio === null) return "watch";
  if (ratio >= 1) return "good";
  if (ratio >= 0.85) return "watch";
  return "risk";
}

/** Zeitversatz der Kohortenlogik in ganzen Wochen. */
export function cohortOffsetWeeks(cycleDays: number): number {
  return Math.max(0, Math.round(cycleDays / 7));
}

export function unitChildren(units: Unit[], parentId: UnitId | null): Unit[] {
  return units.filter((u) => u.parentId === parentId && u.active);
}

/** Alle direkt erfassten Blätter unterhalb (oder gleich) einer Einheit. */
export function directLeaves(units: Unit[], unitId: UnitId): Unit[] {
  const unit = units.find((u) => u.id === unitId);
  if (!unit) return [];
  if (unit.entryMode === "direct") return [unit];
  return unitChildren(units, unitId).flatMap((child) => directLeaves(units, child.id));
}

function mergeAssumptions(base: Assumptions, overrides: Partial<Assumptions>): Assumptions {
  return {
    crOfferToOrder: overrides.crOfferToOrder ?? base.crOfferToOrder,
    stornoRate: overrides.stornoRate ?? base.stornoRate,
    handoverRate: overrides.handoverRate ?? base.handoverRate,
    aov: overrides.aov ?? base.aov,
    cycleDays: overrides.cycleDays ?? base.cycleDays
  };
}

const ROLLING_WINDOW: Record<CrMode, number> = {
  manual: 0,
  rolling4: 4,
  rolling8: 8,
  rolling12: 12
};

const CR_LABEL: Record<CrMode, string> = {
  manual: "Manuelle Annahme",
  rolling4: "Rolling CR – 4 Wochen",
  rolling8: "Rolling CR – 8 Wochen",
  rolling12: "Rolling CR – 12 Wochen"
};

/**
 * Kernberechnung für eine direkt erfasste Einheit.
 *
 * Kohortenlogik: Das in Woche `t` erstellte Angebotsvolumen wird mit der
 * Forecast-CR bewertet und um `cycleDays` versetzt als erwarteter
 * Auftragseingang der Woche `t + offset` ausgewiesen.
 */
export function computeLeafSeries(
  horizon: WeekId[],
  inputs: WeekInput[],
  base: Assumptions,
  crMode: CrMode
): WeekResult[] {
  const byWeek = new Map<WeekId, WeekInput>();
  for (const input of inputs) byWeek.set(input.weekId, input);

  const assumptionsFor = (weekId: WeekId) =>
    mergeAssumptions(base, byWeek.get(weekId)?.overrides ?? {});

  const offersVolumeOf = (weekId: WeekId) => clamp0(byWeek.get(weekId)?.offersVolume ?? 0);

  // Ist-CR einer Woche: realisierter Brutto-AE gegen die Kohorte, die ihn ausgelöst hat.
  const crActualOf = (weekId: WeekId): number | null => {
    const input = byWeek.get(weekId);
    if (!input || !input.closed) return null;
    const offset = cohortOffsetWeeks(assumptionsFor(weekId).cycleDays);
    const source = offersVolumeOf(shiftWeek(weekId, -offset));
    if (source <= 0) return null;
    return clamp0(input.ordersGrossVolume) / source;
  };

  /** Rolling-CR aus den zuletzt abgeschlossenen Wochen vor `weekId`. */
  const rollingCr = (weekId: WeekId, window: number): number | null => {
    let orders = 0;
    let offers = 0;
    let used = 0;
    for (let i = 1; used < window && i <= window * 4; i += 1) {
      const past = shiftWeek(weekId, -i);
      const input = byWeek.get(past);
      if (!input || !input.closed) continue;
      const offset = cohortOffsetWeeks(assumptionsFor(past).cycleDays);
      const source = offersVolumeOf(shiftWeek(past, -offset));
      if (source <= 0) continue;
      orders += clamp0(input.ordersGrossVolume);
      offers += source;
      used += 1;
    }
    if (offers <= 0 || used === 0) return null;
    return orders / offers;
  };

  const crForecastOf = (weekId: WeekId, assumptions: Assumptions) => {
    const window = ROLLING_WINDOW[crMode];
    if (window > 0) {
      const rolling = rollingCr(weekId, window);
      if (rolling !== null) return { cr: rolling, label: CR_LABEL[crMode] };
      return { cr: assumptions.crOfferToOrder, label: "Annahme (zu wenig Historie)" };
    }
    return { cr: assumptions.crOfferToOrder, label: CR_LABEL.manual };
  };

  // 1. Durchgang: Kohortenerwartung je Woche und Ziel-Landewoche bestimmen.
  const landing = new Map<WeekId, number>();
  const cohort = new Map<WeekId, { expected: number; landingWeekId: WeekId; cr: number; label: string }>();

  // Auch Kohorten vor dem Horizont berücksichtigen, damit die ersten Wochen nicht leer sind.
  const maxOffset = cohortOffsetWeeks(base.cycleDays) + 4;
  const scanStart = horizon.length ? shiftWeek(horizon[0], -maxOffset) : null;
  const scan: WeekId[] = [];
  if (scanStart) {
    for (let i = 0; i < maxOffset; i += 1) scan.push(shiftWeek(scanStart, i));
  }
  for (const weekId of [...scan, ...horizon]) {
    const assumptions = assumptionsFor(weekId);
    const { cr, label } = crForecastOf(weekId, assumptions);
    const expected = offersVolumeOf(weekId) * cr;
    const landingWeekId = shiftWeek(weekId, cohortOffsetWeeks(assumptions.cycleDays));
    cohort.set(weekId, { expected, landingWeekId, cr, label });
    landing.set(landingWeekId, (landing.get(landingWeekId) ?? 0) + expected);
  }

  // 2. Durchgang: Ergebniszeile je Woche des Horizonts.
  return horizon.map((weekId) => {
    const input = byWeek.get(weekId);
    const assumptions = assumptionsFor(weekId);
    const own = cohort.get(weekId)!;

    const forecastGross = clamp0(landing.get(weekId) ?? 0);
    const forecastStorno = forecastGross * assumptions.stornoRate;
    const forecastNet = forecastGross - forecastStorno;
    const forecastHandover = forecastGross * assumptions.handoverRate;

    const actualGrossVolume = clamp0(input?.ordersGrossVolume ?? 0);
    const actualStorno = clamp0(input?.stornoVolume ?? 0);
    const actualNet = actualGrossVolume - actualStorno;
    const hasActual = actualGrossVolume > 0 || actualStorno > 0;
    const closed = Boolean(input?.closed);

    const useActual = closed || hasActual;
    const effective = useActual ? actualNet : forecastNet;
    const target = clamp0(input?.target ?? 0);
    const attainment = target > 0 ? effective / target : null;

    const netCr = assumptions.crOfferToOrder * (1 - assumptions.stornoRate);
    const requiredPipeline = target > effective && netCr > 0 ? (target - effective) / netCr : 0;

    const forecastDeviation = closed ? actualNet - forecastNet : null;
    const accuracy =
      closed && actualNet > 0 ? Math.max(0, 1 - Math.abs(actualNet - forecastNet) / actualNet) : null;

    return {
      weekId,
      meta: weekMeta(weekId),
      offersCount: clamp0(input?.offersCount ?? 0),
      offersVolume: offersVolumeOf(weekId),
      crForecast: own.cr,
      crActual: crActualOf(weekId),
      crSourceLabel: own.label,
      cohortExpectedGross: own.expected,
      landingWeekId: own.landingWeekId,
      forecastGross,
      forecastHandover,
      forecastStorno,
      forecastNet,
      actualGrossCount: clamp0(input?.ordersGrossCount ?? 0),
      actualGrossVolume,
      actualStorno,
      actualNet,
      hasActual,
      closed,
      effective,
      isForecast: !useActual,
      target,
      delta: effective - target,
      attainment,
      status: statusOf(attainment),
      requiredPipeline,
      forecastDeviation,
      accuracy,
      aov: assumptions.aov,
      fte: input?.fte ?? 0,
      workingDays: input?.workingDays ?? 5,
      assumptions,
      note: input?.note
    } satisfies WeekResult;
  });
}

/** Summiert mehrere Serien und rechnet Quoten aus den Summen neu. */
export function aggregateSeries(series: WeekResult[][], horizon: WeekId[]): WeekResult[] {
  if (series.length === 1) return series[0];
  return horizon.map((weekId, index) => {
    const rows = series.map((s) => s[index]).filter(Boolean);
    const sum = (pick: (r: WeekResult) => number) => rows.reduce((acc, r) => acc + pick(r), 0);

    const offersVolume = sum((r) => r.offersVolume);
    const forecastGross = sum((r) => r.forecastGross);
    const forecastNet = sum((r) => r.forecastNet);
    const actualGrossVolume = sum((r) => r.actualGrossVolume);
    const actualStorno = sum((r) => r.actualStorno);
    const actualNet = actualGrossVolume - actualStorno;
    const effective = sum((r) => r.effective);
    const target = sum((r) => r.target);
    const cohortExpectedGross = sum((r) => r.cohortExpectedGross);
    const closed = rows.length > 0 && rows.every((r) => r.closed);
    const hasActual = rows.some((r) => r.hasActual);
    const attainment = target > 0 ? effective / target : null;

    const template = rows[0];
    const grossCrActual = (() => {
      const parts = rows.map((r) => r.crActual).filter((v): v is number => v !== null);
      if (!parts.length || offersVolume <= 0) return null;
      return actualGrossVolume / offersVolume;
    })();

    return {
      ...template,
      weekId,
      meta: weekMeta(weekId),
      offersCount: sum((r) => r.offersCount),
      offersVolume,
      crForecast: offersVolume > 0 ? cohortExpectedGross / offersVolume : template.crForecast,
      crActual: grossCrActual,
      crSourceLabel: "Gewichtet aus Untereinheiten",
      cohortExpectedGross,
      forecastGross,
      forecastHandover: sum((r) => r.forecastHandover),
      forecastStorno: sum((r) => r.forecastStorno),
      forecastNet,
      actualGrossCount: sum((r) => r.actualGrossCount),
      actualGrossVolume,
      actualStorno,
      actualNet,
      hasActual,
      closed,
      effective,
      isForecast: !(closed || hasActual),
      target,
      delta: effective - target,
      attainment,
      status: statusOf(attainment),
      requiredPipeline: sum((r) => r.requiredPipeline),
      forecastDeviation: closed ? actualNet - forecastNet : null,
      accuracy: closed && actualNet > 0 ? Math.max(0, 1 - Math.abs(actualNet - forecastNet) / actualNet) : null,
      fte: sum((r) => r.fte),
      workingDays: template.workingDays
    } satisfies WeekResult;
  });
}

/** Wochenserie einer beliebigen Einheit – direkt erfasst oder aufsummiert. */
export function seriesForUnit(state: AppState, unitId: UnitId, horizon: WeekId[]): WeekResult[] {
  const leaves = directLeaves(state.units, unitId);
  if (!leaves.length) {
    return computeLeafSeries(horizon, [], state.settings.assumptions, state.settings.crMode);
  }
  const series = leaves.map((leaf) =>
    computeLeafSeries(
      horizon,
      state.inputs.filter((i) => i.unitId === leaf.id),
      state.settings.assumptions,
      state.settings.crMode
    )
  );
  return aggregateSeries(series, horizon);
}

export function groupByMonth(weeks: WeekResult[]): MonthResult[] {
  const map = new Map<string, WeekResult[]>();
  for (const week of weeks) {
    const list = map.get(week.meta.monthKey) ?? [];
    list.push(week);
    map.set(week.meta.monthKey, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, list]) => {
      const sum = (pick: (r: WeekResult) => number) => list.reduce((acc, r) => acc + pick(r), 0);
      const effective = sum((r) => r.effective);
      const target = sum((r) => r.target);
      const attainment = target > 0 ? effective / target : null;
      return {
        monthKey,
        label: monthLabel(monthKey),
        weeks: list,
        offersVolume: sum((r) => r.offersVolume),
        forecastNet: sum((r) => r.forecastNet),
        actualNet: sum((r) => r.actualNet),
        effective,
        target,
        delta: effective - target,
        attainment,
        status: statusOf(attainment),
        openWeeks: list.filter((r) => r.isForecast).length,
        requiredPipeline: sum((r) => r.requiredPipeline)
      } satisfies MonthResult;
    });
}
