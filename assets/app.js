const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("de-DE", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

const months = {
  july: {
    kpis: [
      { label: "Auftragseingang Ist", value: 1239279, meta: "Bis 20. Juli", delta: "86,5 % vom Ziel", tone: "primary" },
      { label: "Aktueller Forecast", value: 1408127, meta: "Base Case", delta: "+13,6 % vs. Ist", good: true },
      { label: "Monatsziel", value: 1433300, meta: "Verbleibend", delta: "194.020 €", good: false },
      { label: "Forecast-Lücke", value: -25173, meta: "Zum Monatsziel", delta: "1,8 % unter Ziel", good: false }
    ],
    actual: [0, 370541, 1049787, 1239279],
    forecast: [0, 432921, 954497, 1364345, 1408127],
    target: 1433300
  },
  june: {
    kpis: [
      { label: "Auftragseingang Ist", value: 1758491, meta: "Monat abgeschlossen", delta: "112,2 % vom Ziel", tone: "primary" },
      { label: "Finaler Forecast", value: 1566950, meta: "Letzter Snapshot", delta: "+12,2 % Ist vs. FC", good: true },
      { label: "Monatsziel", value: 1566950, meta: "Erreicht", delta: "+191.541 €", good: true },
      { label: "Forecast-Abweichung", value: 191541, meta: "Ist minus Forecast", delta: "Unterschätzt", good: false }
    ],
    actual: [0, 375887, 682591, 1174323, 1758491],
    forecast: [0, 434328, 877504, 1288353, 1566950],
    target: 1566950
  }
};

const weeks = [
  { week: 28, date: "06.–12. Jul", pipeline: 2042858, cr: .252, forecast: 409848, actual: 474352, target: 358325, status: "good", label: "Über Plan", aov: 25434, cycle: 14 },
  { week: 29, date: "13.–19. Jul", pipeline: 1604250, cr: .252, forecast: 406983, actual: 390969, target: 358325, status: "good", label: "Im Plan", aov: 24000, cycle: 14 },
  { week: 30, date: "20.–26. Jul", pipeline: 2408170, cr: .252, forecast: 606863, actual: 0, target: 358325, status: "watch", label: "Beobachten", aov: 24728, cycle: 14 },
  { week: 31, date: "27. Jul–02. Aug", pipeline: 2126627, cr: .252, forecast: 535910, actual: 0, target: 358325, status: "risk", label: "Pipeline-Risiko", aov: 24728, cycle: 14 }
];

const titles = { overview: "Vertriebsübersicht", forecast: "Forecast", pipeline: "Pipeline", team: "Mitarbeiter" };
let activePeriod = "july";
let selectedWeek = 29;

function renderKpis() {
  document.querySelector("#kpi-grid").innerHTML = months[activePeriod].kpis.map(k => `
    <article class="kpi-card ${k.tone || ""}">
      <div class="kpi-label"><span>${k.label}</span><span aria-hidden="true">•••</span></div>
      <strong class="kpi-value">${euro.format(k.value)}</strong>
      <div class="kpi-meta"><span class="delta ${k.good ? "good" : "bad"}">${k.delta}</span><span>${k.meta}</span></div>
    </article>`).join("");
}

function points(values, width, height, max) {
  return values.map((v, i) => `${32 + i * ((width - 48) / (values.length - 1))},${height - 28 - (v / max) * (height - 48)}`).join(" ");
}

function renderChart() {
  const { actual, forecast, target } = months[activePeriod];
  const width = 700, height = 240, max = Math.max(target, ...actual, ...forecast) * 1.12;
  const forecastPoints = points(forecast, width, height, max);
  const actualPoints = points(actual, width, height, max);
  const targetY = height - 28 - (target / max) * (height - 48);
  const grid = [0, .33, .66, 1].map((n) => {
    const y = height - 28 - n * (height - 48);
    return `<line class="grid" x1="32" x2="684" y1="${y}" y2="${y}"/><text x="0" y="${y + 3}">${Math.round(max * n / 1000)}k</text>`;
  }).join("");
  document.querySelector("#trend-chart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <defs><linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d39e7" stop-opacity=".16"/><stop offset="1" stop-color="#6d39e7" stop-opacity="0"/></linearGradient></defs>
    ${grid}<line class="target-line" x1="32" x2="684" y1="${targetY}" y2="${targetY}"/>
    <polygon class="forecast-area" points="${forecastPoints} 684,212 32,212"/>
    <polyline class="forecast-line" points="${forecastPoints}"/><polyline class="actual-line" points="${actualPoints}"/>
    ${forecast.map((v,i) => { const [x,y] = points([0,v], 32 + i*((width-48)/(forecast.length-1)), height, max).split(" ").pop().split(","); return `<circle cx="${x}" cy="${y}" r="4.5" fill="#6d39e7"/>`; }).join("")}
    <text x="32" y="234">KW 27</text><text x="242" y="234">KW 28</text><text x="458" y="234">KW 29</text><text x="652" y="234">KW 30</text>
  </svg>`;
}

function renderWeeks() {
  document.querySelector("#week-cards").innerHTML = weeks.map(w => {
    const ratio = Math.min(100, Math.round(w.forecast / w.target * 100));
    return `<div class="week-card ${w.status === "risk" ? "risk" : ""}"><div class="week-top"><strong>KW ${w.week}</strong><span class="week-date">${w.date}</span></div><span class="week-value">${euro.format(w.forecast)}</span><div class="week-bar" aria-label="${ratio} Prozent des Wochenziels"><i style="width:${ratio}%"></i></div><div class="week-foot"><span>${w.label}</span><span>${ratio} % Ziel</span></div></div>`;
  }).join("");
}

function renderTable() {
  document.querySelector("#forecast-table").innerHTML = weeks.map(w => `<tr data-week="${w.week}" tabindex="0" class="${w.week === selectedWeek ? "is-selected" : ""}" aria-selected="${w.week === selectedWeek}">
    <td class="row-week"><strong>KW ${w.week}</strong><span>${w.date}</span></td><td>${euro.format(w.pipeline)}</td><td>${percent.format(w.cr)}</td><td><strong>${euro.format(w.forecast)}</strong></td><td>${w.actual ? euro.format(w.actual) : "–"}</td><td>${euro.format(w.target)}</td><td><span class="table-status ${w.status}">${w.label}</span></td>
  </tr>`).join("");
  document.querySelectorAll("#forecast-table tr").forEach(row => {
    const choose = () => { selectedWeek = Number(row.dataset.week); renderTable(); renderDetail(); };
    row.addEventListener("click", choose);
    row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } });
  });
}

function renderDetail() {
  const w = weeks.find(item => item.week === selectedWeek);
  document.querySelector("#detail-week").textContent = `KW ${w.week}`;
  const status = document.querySelector("#detail-status");
  status.textContent = w.label;
  status.className = `status-pill ${w.status}`;
  document.querySelector("#detail-result").textContent = euro.format(w.forecast);
  document.querySelector("#detail-formula").textContent = `${euro.format(w.pipeline)} × ${percent.format(w.cr)}`;
  document.querySelector("#detail-assumptions").innerHTML = `<div><dt>Pipeline-Kohorte</dt><dd>KW ${w.week - 2}</dd></div><div><dt>Forecast Conversion Rate</dt><dd>${percent.format(w.cr)}</dd></div><div><dt>Cycle Time</dt><dd>${w.cycle} Tage</dd></div><div><dt>Ø Auftragswert</dt><dd>${euro.format(w.aov)}</dd></div>`;
  const gap = w.forecast - w.target;
  document.querySelector("#detail-explanation").textContent = gap >= 0 ? `Der Forecast liegt ${euro.format(gap)} über dem Wochenziel. Die Pipeline-Kohorte deckt das Ziel im Base Case ab.` : `Der Forecast liegt ${euro.format(Math.abs(gap))} unter dem Wochenziel. Bei gleicher Conversion fehlen ${euro.format(Math.abs(gap) / w.cr)} zusätzliche Pipeline.`;
}

function showView(view) {
  document.querySelectorAll(".nav-item").forEach(item => { const active = item.dataset.view === view; item.classList.toggle("is-active", active); active ? item.setAttribute("aria-current", "page") : item.removeAttribute("aria-current"); });
  document.querySelectorAll(".view").forEach(v => v.classList.remove("is-active"));
  const target = view === "overview" || view === "forecast" ? document.querySelector(`#${view}-view`) : document.querySelector("#placeholder-view");
  target.classList.add("is-active");
  document.querySelector("#page-title").textContent = titles[view];
  if (target.id === "placeholder-view") document.querySelector("#placeholder-heading").textContent = `${titles[view]} entsteht als Nächstes`;
  document.querySelector(".sidebar").classList.remove("is-open");
  document.querySelector("#mobile-menu").setAttribute("aria-expanded", "false");
  document.querySelector("#main").focus({ preventScroll: true });
}

document.querySelectorAll("[data-view], [data-view-link]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view || button.dataset.viewLink)));
document.querySelector("#period-filter").addEventListener("change", e => { activePeriod = e.target.value; renderKpis(); renderChart(); });
document.querySelector("#mobile-menu").addEventListener("click", e => { const open = document.querySelector(".sidebar").classList.toggle("is-open"); e.currentTarget.setAttribute("aria-expanded", String(open)); });

renderKpis();
renderChart();
renderWeeks();
renderTable();
renderDetail();
