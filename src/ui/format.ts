const euroFull = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0
});
const percentFmt = new Intl.NumberFormat("de-DE", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});
const numberFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

export function euro(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return euroFull.format(value);
}

/** Kompakte Darstellung für Achsen und enge Karten. */
export function euroShort(value: number): string {
  if (!Number.isFinite(value)) return "–";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio €`;
  if (abs >= 1_000) return `${Math.round(value / 1000).toLocaleString("de-DE")} k€`;
  return `${Math.round(value)} €`;
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return percentFmt.format(value);
}

export function count(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return numberFmt.format(value);
}

export function signedEuro(value: number): string {
  if (!Number.isFinite(value)) return "–";
  const formatted = euro(Math.abs(value));
  if (Math.round(value) === 0) return formatted;
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

/** Deutsche Zahleneingabe ("24.812,50") robust in eine Zahl überführen. */
export function parseGermanNumber(raw: string): number {
  const cleaned = raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

export function formatInputNumber(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "";
  return numberFmt.format(value);
}

export function formatInputPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "";
  return (value * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

/** Deckungsgrad als Vielfaches, z. B. „4,3×". Sehr hohe Werte werden gekappt. */
export function ratio(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "–";
  if (value > 20) return "> 20×";
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`;
}
