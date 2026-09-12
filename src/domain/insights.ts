import type { MonthResult, WeekResult } from "./forecast";
import type { Assumptions } from "./types";

export interface FunnelStage {
  key: string;
  label: string;
  hint: string;
  count: number | null;
  forecast: number;
  actual: number | null;
  /** Conversion von der vorherigen Stufe. */
  conversion: number | null;
}

/**
 * Trichter wie in der Excel: Angebote → AE vor Storno → baubare Aufträge →
 * Stornierungen → Auftragseingang.
 */
export function funnelFor(weeks: WeekResult[], assumptions: Assumptions): FunnelStage[] {
  const sum = (pick: (r: WeekResult) => number) => weeks.reduce((acc, r) => acc + pick(r), 0);
  const offersVolume = sum((r) => r.offersVolume);
  const offersCount = sum((r) => r.offersCount);
  const forecastGross = sum((r) => r.forecastGross);
  const actualGross = sum((r) => r.actualGrossVolume);
  const actualStorno = sum((r) => r.actualStorno);
  const hasActual = weeks.some((r) => r.hasActual);
  const aov = assumptions.aov > 0 ? assumptions.aov : null;

  return [
    {
      key: "offers",
      label: "Angebote versendet",
      hint: "Neu erstellte Pipeline dieser Periode",
      count: offersCount || (aov ? Math.round(offersVolume / aov) : null),
      forecast: offersVolume,
      actual: offersVolume || null,
      conversion: null
    },
    {
      key: "ordersGross",
      label: "Auftragseingang vor Storno",
      hint: "Angebotsvolumen × Conversion Rate",
      count: aov ? Math.round(forecastGross / aov) : null,
      forecast: forecastGross,
      actual: hasActual ? actualGross : null,
      conversion: offersVolume > 0 ? forecastGross / offersVolume : null
    },
    {
      key: "handover",
      label: "Baubare Aufträge",
      hint: "Handover-Quote auf den Brutto-Auftragseingang",
      count: aov ? Math.round(sum((r) => r.forecastHandover) / aov) : null,
      forecast: sum((r) => r.forecastHandover),
      actual: null,
      conversion: assumptions.handoverRate
    },
    {
      key: "storno",
      label: "Stornierungen",
      hint: "Erwartete Stornoquote",
      count: aov ? Math.round(sum((r) => r.forecastStorno) / aov) : null,
      forecast: sum((r) => r.forecastStorno),
      actual: hasActual ? actualStorno : null,
      conversion: assumptions.stornoRate
    },
    {
      key: "net",
      label: "Auftragseingang",
      hint: "Brutto-Auftragseingang abzüglich Storno",
      count: aov ? Math.round(sum((r) => r.forecastNet) / aov) : null,
      forecast: sum((r) => r.forecastNet),
      actual: hasActual ? actualGross - actualStorno : null,
      conversion: forecastGross > 0 ? sum((r) => r.forecastNet) / forecastGross : null
    }
  ];
}

export interface DriverAnalysis {
  gap: number;
  /** Anteil der Lücke, der auf zu wenig bzw. zu viel Pipeline zurückgeht. */
  pipelineEffect: number;
  /** Anteil der Lücke, der auf eine abweichende Conversion Rate zurückgeht. */
  conversionEffect: number;
  drivingOffers: number;
  neededOffers: number;
  planNetCr: number;
  actualNetCr: number | null;
  headline: string;
}

/**
 * Zerlegt die Abweichung zum Ziel exakt in Pipeline- und Conversion-Effekt.
 *
 *   Ist − Ziel = (Pipeline_ist − Pipeline_nötig) × CR_plan
 *              +  Pipeline_ist × (CR_ist − CR_plan)
 */
export function analyseDrivers(weeks: WeekResult[], assumptions: Assumptions): DriverAnalysis {
  const planNetCr = assumptions.crOfferToOrder * (1 - assumptions.stornoRate);
  let drivingOffers = 0;
  let neededOffers = 0;
  let pipelineEffect = 0;
  let conversionEffect = 0;
  let realisedNet = 0;

  for (const week of weeks) {
    const cohortVolume = week.crForecast > 0 ? week.forecastGross / week.crForecast : 0;
    const needed = planNetCr > 0 ? week.target / planNetCr : 0;
    const actualNetCr = cohortVolume > 0 ? week.effective / cohortVolume : planNetCr;

    drivingOffers += cohortVolume;
    neededOffers += needed;
    realisedNet += week.effective;
    pipelineEffect += (cohortVolume - needed) * planNetCr;
    conversionEffect += cohortVolume * (actualNetCr - planNetCr);
  }

  const target = weeks.reduce((acc, w) => acc + w.target, 0);
  const gap = realisedNet - target;
  const actualNetCr = drivingOffers > 0 ? realisedNet / drivingOffers : null;

  const headline = (() => {
    if (target === 0) return "Für diesen Zeitraum ist noch kein Ziel hinterlegt.";
    if (gap >= 0) return "Der Forecast liegt über Ziel.";
    return Math.abs(pipelineEffect) >= Math.abs(conversionEffect)
      ? "Hauptursache ist zu wenig erstellte Pipeline."
      : "Hauptursache ist eine zu niedrige Conversion Rate.";
  })();

  return {
    gap,
    pipelineEffect,
    conversionEffect,
    drivingOffers,
    neededOffers,
    planNetCr,
    actualNetCr,
    headline
  };
}

export interface AccuracyStats {
  /** Mittlere Genauigkeit über abgeschlossene Wochen. */
  accuracy: number | null;
  /** Systematische Über-/Unterschätzung in Euro (Ist − Forecast). */
  bias: number;
  closedWeeks: number;
  worst: WeekResult | null;
}

export function accuracyStats(weeks: WeekResult[]): AccuracyStats {
  const closed = weeks.filter((w) => w.closed && w.accuracy !== null);
  if (!closed.length) return { accuracy: null, bias: 0, closedWeeks: 0, worst: null };
  const accuracy = closed.reduce((acc, w) => acc + (w.accuracy ?? 0), 0) / closed.length;
  const bias = closed.reduce((acc, w) => acc + (w.forecastDeviation ?? 0), 0);
  const worst = closed.reduce((worstSoFar, w) =>
    Math.abs(w.forecastDeviation ?? 0) > Math.abs(worstSoFar.forecastDeviation ?? 0) ? w : worstSoFar
  );
  return { accuracy, bias, closedWeeks: closed.length, worst };
}

/**
 * Pipeline Coverage: offenes Angebotsvolumen gegen den Auftragseingang, der im
 * Zeitraum noch fehlt. Bereits realisierte Wochen reduzieren den Bedarf.
 */
export function coverage(weeks: WeekResult[], _assumptions: Assumptions): number | null {
  const realised = weeks.reduce((acc, w) => acc + (w.isForecast ? 0 : w.actualNet), 0);
  const target = weeks.reduce((acc, w) => acc + w.target, 0);
  const remaining = target - realised;
  if (remaining <= 0) return null;
  const pipeline = weeks.filter((w) => w.isForecast).reduce((acc, w) => acc + w.offersVolume, 0);
  return pipeline / remaining;
}

export interface Risk {
  tone: "risk" | "watch" | "good";
  title: string;
  body: string;
}

/** Operativer Handlungsimpuls für die nächste gefährdete Woche. */
export function nextRisk(weeks: WeekResult[], month: MonthResult | undefined): Risk {
  const open = weeks.filter((w) => w.isForecast && w.target > 0);
  const critical = open.find((w) => w.status === "risk") ?? open.find((w) => w.status === "watch");

  if (!critical) {
    return {
      tone: "good",
      title: "Keine akute Forecast-Lücke",
      body: month
        ? `Der Forecast für ${month.label} liegt bei ${Math.round((month.attainment ?? 0) * 100)} % des Ziels.`
        : "Alle offenen Wochen liegen im Plan."
    };
  }

  const missing = Math.max(0, critical.target - critical.effective);
  return {
    tone: critical.status === "risk" ? "risk" : "watch",
    title: `${critical.meta.label} liegt ${Math.round((1 - (critical.attainment ?? 0)) * 100)} % unter Ziel`,
    body:
      `Es fehlen ${Math.round(missing).toLocaleString("de-DE")} € Auftragseingang. ` +
      `Dafür sind rund ${Math.round(critical.requiredPipeline).toLocaleString("de-DE")} € zusätzliches ` +
      `Angebotsvolumen nötig – erstellt spätestens in ${critical.meta.label} minus ` +
      `${Math.round(critical.assumptions.cycleDays / 7)} Wochen.`
  };
}
