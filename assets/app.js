const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0
});
const percent = new Intl.NumberFormat("de-DE", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});
const number = new Intl.NumberFormat("de-DE");
const STORAGE_KEY = "forecast-muenster-weeks-v1";

const defaultWeeks = [
  { week: 28, date: "06.–12. Jul", offers: 16, pipeline: 2042858, cr: .252, actual: 474352, target: 358325, aov: 25434, cycle: 14 },
  { week: 29, date: "13.–19. Jul", offers: 14, pipeline: 1604250, cr: .252, actual: 390969, target: 358325, aov: 24000, cycle: 14 },
  { week: 30, date: "20.–26. Jul", offers: 18, pipeline: 2408170, cr: .252, actual: 0, target: 358325, aov: 24728, cycle: 14 },
  { week: 31, date: "27. Jul–02. Aug", offers: 15, pipeline: 2126627, cr: .252, actual: 0, target: 358325, aov: 24728, cycle: 14 }
];

const june = {
  actual: [375887, 682591, 1174323, 1758491],
  forecast: [434328, 877504, 1288353, 1566950],
  target: 1566950
};

const fields = ["offers", "pipeline", "cr", "cycle", "actual", "target", "aov"];
const inputIds = {
  offers: "input-offers",
  pipeline: "input-pipeline",
  cr: "input-cr",
  cycle: "input-cycle",
  actual: "input-actual",
  target: "input-target",
  aov: "input-aov"
};
const titles = {
  overview: "Vertriebsübersicht",
  forecast: "Forecast",
  pipeline: "Pipeline",
  team: "Mitarbeiter"
};

let weeks = loadWeeks();
let activePeriod = "july";
let selectedWeek = 29;
let isDirty = false;
let toastTimer;

function calculateWeek(week) {
  const forecast = Math.round(Math.max(0, week.pipeline) * Math.max(0, week.cr));
  const ratio = week.target > 0 ? forecast / week.target : 0;
  const status = ratio >= 1 ? "good" : ratio >= .85 ? "watch" : "risk";
  const label = ratio >= 1 ? "Im Plan" : ratio >= .85 ? "Beobachten" : "Pipeline-Risiko";
  return { ...week, forecast, status, label };
}

function loadWeeks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved)) return defaultWeeks.map(calculateWeek);
    return defaultWeeks.map(base => {
      const stored = saved.find(item => Number(item.week) === base.week);
      return calculateWeek({ ...base, ...(stored || {}) });
    });
  } catch {
    return defaultWeeks.map(calculateWeek);
  }
}

function persistWeeks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(weeks));
}

function julySeries() {
  let actualTotal = 0;
  let projectedTotal = 0;
  const actual = [];
  const forecast = [];
  weeks.forEach(week => {
    actualTotal += week.actual;
    projectedTotal += week.actual > 0 ? week.actual : week.forecast;
    actual.push(actualTotal);
    forecast.push(projectedTotal);
  });
  return {
    actual,
    forecast,
    actualTotal,
    projectedTotal,
    target: weeks.reduce((sum, week) => sum + week.target, 0)
  };
}

function kpisForPeriod() {
  if (activePeriod === "june") {
    const actual = june.actual[june.actual.length - 1];
    const forecast = june.forecast[june.forecast.length - 1];
    return [
      { label: "Auftragseingang Ist", value: actual, meta: "Monat abgeschlossen", delta: "112,2 % vom Ziel", tone: "primary" },
      { label: "Finaler Forecast", value: forecast, meta: "Letzter Snapshot", delta: "+12,2 % Ist vs. FC", good: true },
      { label: "Monatsziel", value: june.target, meta: "Erreicht", delta: euro.format(actual - june.target), good: true },
      { label: "Forecast-Abweichung", value: actual - forecast, meta: "Ist minus Forecast", delta: "Unterschätzt", good: false }
    ];
  }

  const { actualTotal, projectedTotal, target } = julySeries();
  const remaining = Math.max(0, target - actualTotal);
  const gap = projectedTotal - target;
  return [
    {
      label: "Auftragseingang Ist",
      value: actualTotal,
      meta: "Manuell erfasst",
      delta: target ? `${number.format(Math.round(actualTotal / target * 100))} % vom Ziel` : "Kein Ziel",
      tone: "primary"
    },
    {
      label: "Aktueller Forecast",
      value: projectedTotal,
      meta: "Ist + offene Wochen",
      delta: gap >= 0 ? `${euro.format(gap)} über Ziel` : `${euro.format(Math.abs(gap))} unter Ziel`,
      good: gap >= 0
    },
    {
      label: "Monatsziel",
      value: target,
      meta: "Verbleibend",
      delta: euro.format(remaining),
      good: remaining === 0
    },
    {
      label: "Forecast-Lücke",
      value: gap,
      meta: "Zum Monatsziel",
      delta: target ? `${number.format(Math.abs(gap / target * 100).toFixed(1))} % ${gap >= 0 ? "über" : "unter"} Ziel` : "Kein Ziel",
      good: gap >= 0
    }
  ];
}

function renderKpis() {
  document.querySelector("#kpi-grid").innerHTML = kpisForPeriod().map(kpi => `
    <article class="kpi-card ${kpi.tone || ""}">
      <div class="kpi-label"><span>${kpi.label}</span><span aria-hidden="true">•••</span></div>
      <strong class="kpi-value">${euro.format(kpi.value)}</strong>
      <div class="kpi-meta">
        <span class="delta ${kpi.good ? "good" : "bad"}">${kpi.delta}</span>
        <span>${kpi.meta}</span>
      </div>
    </article>
  `).join("");
}

function renderAction() {
  if (activePeriod !== "july") {
    document.querySelector("#overview-summary").textContent = "Der Juni ist abgeschlossen und liegt über dem Monatsziel.";
    document.querySelector("#action-status").textContent = "Abgeschlossen";
    document.querySelector("#action-status").className = "risk-pill good";
    document.querySelector("#action-title").textContent = "Monatsziel erreicht";
    document.querySelector("#action-copy").textContent = "Der tatsächliche Auftragseingang liegt über Forecast und Ziel.";
    return;
  }

  const { projectedTotal, target } = julySeries();
  const gap = projectedTotal - target;
  const openWeeks = weeks.filter(week => week.actual === 0);
  const averageCr = openWeeks.length
    ? openWeeks.reduce((sum, week) => sum + week.cr, 0) / openWeeks.length
    : weeks.reduce((sum, week) => sum + week.cr, 0) / weeks.length;
  const neededPipeline = gap < 0 && averageCr > 0 ? Math.ceil(Math.abs(gap) / averageCr) : 0;
  const status = document.querySelector("#action-status");

  if (gap >= 0) {
    document.querySelector("#overview-summary").textContent = `Der aktuelle Forecast deckt das Monatsziel mit einem Puffer von ${euro.format(gap)}.`;
    status.textContent = "Im Plan";
    status.className = "risk-pill good";
    document.querySelector("#action-title").textContent = "Forecast deckt Monatsziel";
    document.querySelector("#action-copy").textContent = "Auf Basis der gespeicherten Wochenwerte ist aktuell keine zusätzliche Pipeline erforderlich.";
  } else {
    document.querySelector("#overview-summary").textContent = `Der Monatsforecast liegt ${euro.format(Math.abs(gap))} unter Ziel. Zusätzliche Pipeline ist erforderlich.`;
    status.textContent = gap / target > -.15 ? "Beobachten" : "Risiko";
    status.className = gap / target > -.15 ? "risk-pill watch" : "risk-pill";
    document.querySelector("#action-title").textContent = `${euro.format(neededPipeline)} Pipeline fehlen`;
    document.querySelector("#action-copy").textContent = `Bei einer durchschnittlichen Conversion Rate von ${percent.format(averageCr)} muss diese Pipeline noch aufgebaut werden, um das Monatsziel zu erreichen.`;
  }
}

function chartPoint(values, index, width, height, max) {
  const x = 38 + index * ((width - 58) / Math.max(1, values.length - 1));
  const y = height - 28 - (values[index] / max) * (height - 52);
  return { x, y };
}

function renderChart() {
  const series = activePeriod === "june"
    ? { actual: june.actual, forecast: june.forecast, target: june.target }
    : julySeries();
  const width = 700;
  const height = 240;
  const max = Math.max(series.target, ...series.actual, ...series.forecast, 1) * 1.12;
  const forecastPoints = series.forecast.map((_, index) => {
    const point = chartPoint(series.forecast, index, width, height, max);
    return `${point.x},${point.y}`;
  }).join(" ");
  const actualPoints = series.actual.map((_, index) => {
    const point = chartPoint(series.actual, index, width, height, max);
    return `${point.x},${point.y}`;
  }).join(" ");
  const targetY = height - 28 - (series.target / max) * (height - 52);
  const grid = [0, .33, .66, 1].map(position => {
    const y = height - 28 - position * (height - 52);
    return `<line class="grid" x1="38" x2="684" y1="${y}" y2="${y}"/><text x="0" y="${y + 3}">${Math.round(max * position / 1000)}k</text>`;
  }).join("");
  const labels = series.forecast.map((_, index) => {
    const point = chartPoint(series.forecast, index, width, height, max);
    return `<text x="${point.x - 15}" y="234">KW ${28 + index}</text>`;
  }).join("");
  const dots = series.forecast.map((_, index) => {
    const point = chartPoint(series.forecast, index, width, height, max);
    return `<circle cx="${point.x}" cy="${point.y}" r="4.5" fill="#6d39e7"/>`;
  }).join("");
  const baseLeft = chartPoint(series.forecast, 0, width, height, max).x;
  const baseRight = chartPoint(series.forecast, series.forecast.length - 1, width, height, max).x;

  document.querySelector("#trend-chart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <title>Forecast, Ist und Ziel im Monatsverlauf</title>
      <desc>Die Werte aktualisieren sich nach dem Speichern einer Woche.</desc>
      <defs>
        <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#6d39e7" stop-opacity=".16"/>
          <stop offset="1" stop-color="#6d39e7" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <line class="target-line" x1="38" x2="684" y1="${targetY}" y2="${targetY}"/>
      <polygon class="forecast-area" points="${forecastPoints} ${baseRight},212 ${baseLeft},212"/>
      <polyline class="forecast-line" points="${forecastPoints}"/>
      <polyline class="actual-line" points="${actualPoints}"/>
      ${dots}
      ${labels}
    </svg>
  `;
}

function renderWeeks() {
  document.querySelector("#week-cards").innerHTML = weeks.map(week => {
    const ratio = week.target > 0 ? Math.round(week.forecast / week.target * 100) : 0;
    const barWidth = Math.min(100, ratio);
    return `
      <div class="week-card ${week.status === "risk" ? "risk" : ""}">
        <div class="week-top"><strong>KW ${week.week}</strong><span class="week-date">${week.date}</span></div>
        <span class="week-value">${euro.format(week.forecast)}</span>
        <div class="week-bar" aria-label="${ratio} Prozent des Wochenziels"><i style="width:${barWidth}%"></i></div>
        <div class="week-foot"><span>${week.label}</span><span>${ratio} % Ziel</span></div>
      </div>
    `;
  }).join("");
}

function renderTable() {
  document.querySelector("#forecast-table").innerHTML = weeks.map(week => `
    <tr data-week="${week.week}" tabindex="0" class="${week.week === selectedWeek ? "is-selected" : ""}" aria-selected="${week.week === selectedWeek}">
      <td class="row-week"><strong>KW ${week.week}</strong><span>${week.date}</span></td>
      <td>${euro.format(week.pipeline)}</td>
      <td>${percent.format(week.cr)}</td>
      <td><strong>${euro.format(week.forecast)}</strong></td>
      <td>${week.actual ? euro.format(week.actual) : "–"}</td>
      <td>${euro.format(week.target)}</td>
      <td><span class="table-status ${week.status}">${week.label}</span></td>
    </tr>
  `).join("");

  document.querySelectorAll("#forecast-table tr").forEach(row => {
    const choose = () => chooseWeek(Number(row.dataset.week));
    row.addEventListener("click", choose);
    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose();
      }
    });
  });
}

function chooseWeek(weekNumber) {
  if (weekNumber === selectedWeek) return;
  if (isDirty && !window.confirm("Ungespeicherte Änderungen verwerfen und die Woche wechseln?")) return;
  selectedWeek = weekNumber;
  setDirty(false);
  renderTable();
  renderDetail();
}

function selectedWeekData() {
  return weeks.find(item => item.week === selectedWeek);
}

function populateForm(week) {
  document.querySelector(`#${inputIds.offers}`).value = week.offers;
  document.querySelector(`#${inputIds.pipeline}`).value = week.pipeline;
  document.querySelector(`#${inputIds.cr}`).value = (week.cr * 100).toFixed(1);
  document.querySelector(`#${inputIds.cycle}`).value = week.cycle;
  document.querySelector(`#${inputIds.actual}`).value = week.actual;
  document.querySelector(`#${inputIds.target}`).value = week.target;
  document.querySelector(`#${inputIds.aov}`).value = week.aov;
  document.querySelector("#last-saved").textContent = week.savedAt
    ? `Zuletzt gespeichert: ${new Date(week.savedAt).toLocaleString("de-DE")}`
    : "Ausgangswerte des Prototyps";
}

function readForm() {
  return {
    week: selectedWeek,
    offers: Number(document.querySelector(`#${inputIds.offers}`).value),
    pipeline: Number(document.querySelector(`#${inputIds.pipeline}`).value),
    cr: Number(document.querySelector(`#${inputIds.cr}`).value) / 100,
    cycle: Number(document.querySelector(`#${inputIds.cycle}`).value),
    actual: Number(document.querySelector(`#${inputIds.actual}`).value),
    target: Number(document.querySelector(`#${inputIds.target}`).value),
    aov: Number(document.querySelector(`#${inputIds.aov}`).value)
  };
}

function validateDraft(draft, showErrors = true) {
  let message = "";
  fields.forEach(field => {
    const input = document.querySelector(`#${inputIds[field]}`);
    const invalid = !Number.isFinite(draft[field]) || draft[field] < 0
      || (field === "cr" && draft[field] > 1)
      || (field === "cycle" && draft[field] > 365);
    input.setAttribute("aria-invalid", String(invalid));
    if (!message && invalid) message = field === "cr"
      ? "Die Conversion Rate muss zwischen 0 und 100 % liegen."
      : "Bitte trage in allen Feldern gültige, nicht negative Werte ein.";
  });
  document.querySelector("#entry-error").textContent = showErrors ? message : "";
  return !message;
}

function updatePreview(draft) {
  const safeDraft = {};
  fields.forEach(field => {
    safeDraft[field] = Number.isFinite(draft[field]) && draft[field] >= 0 ? draft[field] : 0;
  });
  const preview = calculateWeek({ ...selectedWeekData(), ...safeDraft });
  const gap = preview.forecast - preview.target;
  const neededPipeline = gap < 0 && preview.cr > 0 ? Math.ceil(Math.abs(gap) / preview.cr) : 0;

  document.querySelector("#detail-result").textContent = euro.format(preview.forecast);
  document.querySelector("#detail-formula").textContent = `${euro.format(preview.pipeline)} × ${percent.format(preview.cr)}`;
  const gapElement = document.querySelector("#detail-gap");
  gapElement.textContent = `${gap >= 0 ? "+" : "−"} ${euro.format(Math.abs(gap))}`;
  gapElement.className = gap >= 0 ? "positive" : "negative";
  document.querySelector("#detail-needed-pipeline").textContent = neededPipeline ? euro.format(neededPipeline) : "Keine";
  document.querySelector("#detail-explanation").textContent = gap >= 0
    ? `Der berechnete Forecast liegt ${euro.format(gap)} über dem Wochenziel.`
    : `Der berechnete Forecast liegt ${euro.format(Math.abs(gap))} unter dem Wochenziel. Bei gleicher Conversion fehlen ${euro.format(neededPipeline)} Pipeline.`;

  const status = document.querySelector("#detail-status");
  status.textContent = preview.label;
  status.className = `status-pill ${preview.status}`;
}

function renderDetail() {
  const week = selectedWeekData();
  document.querySelector("#detail-week").textContent = `KW ${week.week}`;
  populateForm(week);
  validateDraft(week, false);
  updatePreview(week);
}

function hasChanges(draft) {
  const saved = selectedWeekData();
  return fields.some(field => Math.abs(Number(draft[field]) - Number(saved[field])) > .00001);
}

function setDirty(dirty) {
  isDirty = dirty;
  const state = document.querySelector("#save-state");
  state.textContent = dirty ? "Ungespeicherte Änderungen" : "Gespeichert";
  state.classList.toggle("is-dirty", dirty);
  document.querySelector("#discard-button").disabled = !dirty;
}

function refreshAll() {
  renderKpis();
  renderAction();
  renderChart();
  renderWeeks();
  renderTable();
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3500);
}

function showView(view) {
  document.querySelectorAll(".nav-item").forEach(item => {
    const active = item.dataset.view === view;
    item.classList.toggle("is-active", active);
    active ? item.setAttribute("aria-current", "page") : item.removeAttribute("aria-current");
  });
  document.querySelectorAll(".view").forEach(element => element.classList.remove("is-active"));
  const target = view === "overview" || view === "forecast"
    ? document.querySelector(`#${view}-view`)
    : document.querySelector("#placeholder-view");
  target.classList.add("is-active");
  document.querySelector("#page-title").textContent = titles[view];
  if (target.id === "placeholder-view") {
    document.querySelector("#placeholder-heading").textContent = `${titles[view]} entsteht als Nächstes`;
  }
  document.querySelector(".sidebar").classList.remove("is-open");
  document.querySelector("#mobile-menu").setAttribute("aria-expanded", "false");
  document.querySelector("#main").focus({ preventScroll: true });
}

document.querySelectorAll("[data-view], [data-view-link]").forEach(button => {
  button.addEventListener("click", () => showView(button.dataset.view || button.dataset.viewLink));
});

document.querySelector("#period-filter").addEventListener("change", event => {
  activePeriod = event.target.value;
  renderKpis();
  renderAction();
  renderChart();
});

document.querySelector("#mobile-menu").addEventListener("click", event => {
  const open = document.querySelector(".sidebar").classList.toggle("is-open");
  event.currentTarget.setAttribute("aria-expanded", String(open));
});

document.querySelector("#week-entry-form").addEventListener("input", () => {
  const draft = readForm();
  validateDraft(draft, false);
  updatePreview(draft);
  setDirty(hasChanges(draft));
});

document.querySelector("#week-entry-form").addEventListener("submit", event => {
  event.preventDefault();
  const draft = readForm();
  if (!validateDraft(draft, true)) return;
  const current = selectedWeekData();
  const saved = calculateWeek({
    ...current,
    ...draft,
    savedAt: new Date().toISOString()
  });
  weeks = weeks.map(week => week.week === selectedWeek ? saved : week);
  persistWeeks();
  setDirty(false);
  refreshAll();
  renderDetail();
  showToast(`KW ${selectedWeek} wurde gespeichert. Übersicht und Forecast sind aktualisiert.`);
});

document.querySelector("#discard-button").addEventListener("click", () => {
  setDirty(false);
  renderDetail();
  showToast("Ungespeicherte Änderungen wurden verworfen.");
});

window.addEventListener("beforeunload", event => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

refreshAll();
renderDetail();
