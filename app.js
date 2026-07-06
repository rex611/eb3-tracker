const PRIORITY_DATE = "2025-06-20";
const BASELINE_DATE = "2024-10-01";
const state = { latest: null, history: [], chart: null };
const els = {
  onlineStatus: document.querySelector("#onlineStatus"),
  latestDate: document.querySelector("#latestDate"),
  bulletinMonth: document.querySelector("#bulletinMonth"),
  priorityDate: document.querySelector("#priorityDate"),
  progressPercent: document.querySelector("#progressPercent"),
  remainingDays: document.querySelector("#remainingDays"),
  remainingMonths: document.querySelector("#remainingMonths"),
  estimatedCurrent: document.querySelector("#estimatedCurrent"),
  velocityLabel: document.querySelector("#velocityLabel"),
  lastMovement: document.querySelector("#lastMovement"),
  lastUpdated: document.querySelector("#lastUpdated"),
  progressBar: document.querySelector("#progressBar"),
  progressTrack: document.querySelector(".progress-track"),
  historyTable: document.querySelector("#historyTable"),
  predictionList: document.querySelector("#predictionList")
};
function parseDate(value) {
  if (!value || value === "C" || value === "U") return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
function addDays(dateValue, days) {
  const date = parseDate(dateValue);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return date;
}
function formatDate(value, options = {}) {
  if (value === "C") return "Current";
  if (value === "U") return "Unavailable";
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return "--";
  return new Intl.DateTimeFormat("en-US", {
    month: options.short ? "short" : "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}
function formatMonth(value) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}
function monthLabel(value) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}
function averageMovement(entries, months = 6) {
  const recent = entries.slice(-months).map((entry) => entry.movementDays).filter(Number.isFinite);
  if (!recent.length) return 0;
  return recent.reduce((sum, days) => sum + days, 0) / recent.length;
}
function calculateProgress(latestDate) {
  const total = daysBetween(BASELINE_DATE, PRIORITY_DATE);
  const advanced = daysBetween(BASELINE_DATE, latestDate);
  return Math.max(0, Math.min(100, (advanced / total) * 100));
}
function renderDashboard() {
  const latestDate = state.latest.finalActionDate;
  const remaining = Math.max(0, daysBetween(latestDate, PRIORITY_DATE));
  const avg = Math.max(0, averageMovement(state.history));
  const estimatedMonths = remaining === 0 ? 0 : avg > 0 ? Math.ceil(remaining / avg) : null;
  const estimatedDate = estimatedMonths === null ? null : addDays(new Date().toISOString().slice(0, 10), estimatedMonths * 30.44);
  const progress = calculateProgress(latestDate);
  const last = state.history.at(-1);
  els.latestDate.textContent = formatDate(latestDate, { short: true });
  els.bulletinMonth.textContent = `${formatMonth(state.latest.bulletinMonth)} bulletin`;
  els.priorityDate.textContent = formatDate(PRIORITY_DATE, { short: true });
  els.progressPercent.textContent = `${Math.round(progress)}%`;
  els.remainingDays.textContent = remaining === 0 ? "Current" : `${remaining.toLocaleString()} days`;
  els.remainingMonths.textContent = remaining === 0 ? "Your priority date is current" : `About ${Math.ceil(remaining / 30.44)} months behind`;
  els.estimatedCurrent.textContent = remaining === 0 ? "Now" : estimatedDate ? formatDate(estimatedDate, { short: true }) : "Not enough data";
  els.velocityLabel.textContent = avg > 0 ? `${avg.toFixed(1)} days/month average` : "No forward movement recently";
  els.lastMovement.textContent = last?.movementDays ? `${last.movementDays > 0 ? "+" : ""}${last.movementDays} days` : "No change";
  els.lastMovement.className = last?.movementDays > 0 ? "movement-up" : last?.movementDays < 0 ? "movement-down" : "movement-flat";
  els.lastUpdated.textContent = state.latest.updatedAt ? `Updated ${formatDate(state.latest.updatedAt, { short: true })}` : "Updated by automation";
  els.progressBar.style.width = `${progress}%`;
  document.documentElement.style.setProperty("--progress", `${progress}%`);
  els.progressTrack.setAttribute("aria-valuenow", String(Math.round(progress)));
}
function renderPredictions() {
  const remaining = Math.max(0, daysBetween(state.latest.finalActionDate, PRIORITY_DATE));
  const avg = averageMovement(state.history);
  const scenarios = [
    { name: "Best case", movement: Math.max(avg * 1.65, 75), tone: "Fast movement resumes" },
    { name: "Expected", movement: Math.max(avg, 30), tone: "Recent average continues" },
    { name: "Worst case", movement: Math.max(avg * 0.45, 10), tone: "Slow movement or pauses" }
  ];
  els.predictionList.innerHTML = scenarios.map((scenario) => {
    const months = remaining === 0 ? 0 : Math.ceil(remaining / scenario.movement);
    const date = remaining === 0 ? "Now" : formatDate(addDays(new Date().toISOString().slice(0, 10), months * 30.44), { short: true });
    return `<div class="prediction-card"><div><strong>${scenario.name}</strong><span>${scenario.tone} - ${Math.round(scenario.movement)} days/month</span></div><time>${date}</time></div>`;
  }).join("");
}
function renderTable() {
  els.historyTable.innerHTML = state.history.slice().reverse().map((entry) => {
    const movement = entry.movementDays || 0;
    const movementClass = movement > 0 ? "movement-up" : movement < 0 ? "movement-down" : "movement-flat";
    const movementText = movement === 0 ? "No change" : `${movement > 0 ? "+" : ""}${movement} days`;
    return `<tr><td>${formatMonth(entry.bulletinMonth)}</td><td>${formatDate(entry.finalActionDate, { short: true })}</td><td class="${movementClass}">${movementText}</td><td><a href="${entry.sourceUrl}" rel="noreferrer" target="_blank">travel.state.gov</a></td></tr>`;
  }).join("");
}
function renderChart() {
  const ctx = document.querySelector("#historyChart");
  const labels = state.history.map((entry) => monthLabel(entry.bulletinMonth));
  const data = state.history.map((entry) => parseDate(entry.finalActionDate)?.getTime() ?? null);
  const textColor = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  state.chart?.destroy();
  state.chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Final Action Date", data, borderColor: accent, backgroundColor: "rgba(100, 210, 255, 0.16)", borderWidth: 3, pointRadius: 4, pointHoverRadius: 7, tension: 0.35, fill: true }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => formatDate(new Date(context.parsed.y), { short: true }) } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor } },
        y: { ticks: { color: textColor, callback: (value) => formatDate(new Date(value), { short: true }) }, grid: { color: "rgba(148, 163, 184, 0.16)" } }
      }
    }
  });
}
function updateOnlineStatus() {
  els.onlineStatus.textContent = navigator.onLine ? "Online" : "Offline ready";
}
async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json();
}
async function init() {
  updateOnlineStatus();
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
  const [latest, history] = await Promise.all([loadJson("latest.json"), loadJson("history.json")]);
  state.latest = latest;
  state.history = history.sort((a, b) => a.bulletinMonth.localeCompare(b.bulletinMonth));
  renderDashboard();
  renderPredictions();
  renderTable();
  renderChart();
}
init().catch((error) => {
  console.error(error);
  els.onlineStatus.textContent = "Data unavailable";
});
