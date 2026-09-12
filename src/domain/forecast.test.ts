import { describe, expect, it } from "vitest";
import { computeLeafSeries, cohortOffsetWeeks, groupByMonth } from "./forecast";
import { analyseDrivers } from "./insights";
import { shiftWeek, weekMeta, weekRange, weekIdOf, utc } from "./time";
import { EMPTY_INPUT, type Assumptions, type WeekInput } from "./types";

const assumptions: Assumptions = {
  crOfferToOrder: 0.25,
  stornoRate: 0.1,
  handoverRate: 0.8,
  aov: 25_000,
  cycleDays: 14
};

const input = (weekId: string, patch: Partial<WeekInput>): WeekInput => ({
  ...EMPTY_INPUT(weekId, "u"),
  ...patch
});

describe("ISO-Wochenlogik", () => {
  it("ordnet Wochen über Jahresgrenzen korrekt zu", () => {
    // Der 1.1.2027 ist ein Freitag und gehört noch zur KW 53 des Jahres 2026.
    expect(weekIdOf(utc(2027, 0, 1))).toBe("2026-W53");
    expect(weekIdOf(utc(2026, 8, 12))).toBe("2026-W37");
  });

  it("weist den Monat nach der Donnerstagsregel zu", () => {
    // KW 40/2026 läuft vom 28.09. bis 04.10.; Donnerstag ist der 01.10.
    const meta = weekMeta("2026-W40");
    expect(meta.monthKey).toBe("2026-10");
  });

  it("bildet einen lückenlosen Bereich", () => {
    const range = weekRange("2026-W35", "2026-W38");
    expect(range).toEqual(["2026-W35", "2026-W36", "2026-W37", "2026-W38"]);
  });

  it("verschiebt Wochen über den Jahreswechsel", () => {
    expect(shiftWeek("2026-W52", 2)).toBe("2027-W01");
  });
});

describe("Kohortenlogik", () => {
  it("rechnet 14 Tage Cycle Time in zwei Wochen Versatz um", () => {
    expect(cohortOffsetWeeks(14)).toBe(2);
    expect(cohortOffsetWeeks(10)).toBe(1);
  });

  it("verschiebt erwarteten Auftragseingang um den Kohortenversatz", () => {
    const horizon = weekRange("2026-W10", "2026-W14");
    const series = computeLeafSeries(
      horizon,
      [input("2026-W10", { offersVolume: 400_000 })],
      assumptions,
      "manual"
    );

    // Kohorte KW 10 landet in KW 12: 400.000 × 25 % = 100.000 brutto.
    expect(series[0].forecastGross).toBe(0);
    expect(series[2].forecastGross).toBeCloseTo(100_000, 6);
    expect(series[2].forecastNet).toBeCloseTo(90_000, 6);
    expect(series[0].landingWeekId).toBe("2026-W12");
  });

  it("nutzt das Ist, sobald es erfasst ist, und sonst den Forecast", () => {
    const horizon = weekRange("2026-W10", "2026-W12");
    const series = computeLeafSeries(
      horizon,
      [
        input("2026-W10", { offersVolume: 400_000 }),
        input("2026-W12", { ordersGrossVolume: 120_000, stornoVolume: 20_000, closed: true, target: 90_000 })
      ],
      assumptions,
      "manual"
    );

    const landing = series[2];
    expect(landing.actualNet).toBe(100_000);
    expect(landing.effective).toBe(100_000);
    expect(landing.isForecast).toBe(false);
    // Ist-CR misst gegen die auslösende Kohorte aus KW 10.
    expect(landing.crActual).toBeCloseTo(0.3, 6);
    expect(landing.forecastDeviation).toBeCloseTo(10_000, 6);
  });

  it("leitet die Rolling-CR aus abgeschlossenen Wochen ab", () => {
    const horizon = weekRange("2026-W10", "2026-W20");
    const inputs = horizon.map((weekId, index) =>
      input(weekId, {
        offersVolume: 400_000,
        // Ab KW 12 landen Kohorten; realisierte CR liegt konstant bei 30 %.
        ordersGrossVolume: index >= 2 ? 120_000 : 0,
        closed: index <= 6
      })
    );
    const series = computeLeafSeries(horizon, inputs, assumptions, "rolling4");
    const late = series[series.length - 1];
    expect(late.crForecast).toBeCloseTo(0.3, 6);
    expect(late.crSourceLabel).toContain("Rolling");
  });

  it("fällt ohne Historie auf die manuelle Annahme zurück", () => {
    const horizon = weekRange("2026-W10", "2026-W12");
    const series = computeLeafSeries(horizon, [input("2026-W10", { offersVolume: 100_000 })], assumptions, "rolling8");
    expect(series[2].crForecast).toBe(assumptions.crOfferToOrder);
    expect(series[2].crSourceLabel).toContain("Annahme");
  });
});

describe("Aggregation und Treiberanalyse", () => {
  it("aggregiert Wochen zu Monaten", () => {
    const horizon = weekRange("2026-W09", "2026-W14");
    const series = computeLeafSeries(
      horizon,
      horizon.map((weekId) => input(weekId, { offersVolume: 200_000, target: 40_000 })),
      assumptions,
      "manual"
    );
    const months = groupByMonth(series);
    const total = months.reduce((acc, m) => acc + m.target, 0);
    expect(total).toBe(horizon.length * 40_000);
    expect(months.every((m) => m.weeks.every((w) => w.meta.monthKey === m.monthKey))).toBe(true);
  });

  it("zerlegt die Zielabweichung vollständig in Pipeline und Conversion", () => {
    const horizon = weekRange("2026-W10", "2026-W16");
    const series = computeLeafSeries(
      horizon,
      horizon.map((weekId, index) =>
        input(weekId, {
          offersVolume: 300_000,
          target: 80_000,
          ordersGrossVolume: index >= 2 ? 60_000 : 0,
          closed: index >= 2
        })
      ),
      assumptions,
      "manual"
    );
    const drivers = analyseDrivers(series, assumptions);
    expect(drivers.pipelineEffect + drivers.conversionEffect).toBeCloseTo(drivers.gap, 4);
  });
});
