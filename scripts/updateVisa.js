const fs = require("node:fs/promises");
const path = require("node:path");
const BULLETIN_INDEX = "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html";
const ROOT = path.resolve(__dirname, "..");
const LATEST_PATH = path.join(ROOT, "latest.json");
const HISTORY_PATH = path.join(ROOT, "history.json");
const MONTHS = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };
const VISA_MONTHS = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
function decodeHtml(value) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function absoluteUrl(href) {
  return new URL(href, BULLETIN_INDEX).toString();
}
async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "EB3 Tracker GitHub Action (+https://github.com/rex611/eb3-tracker)" } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response.text();
}
function findCurrentBulletin(indexHtml) {
  const links = [...indexHtml.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ href: absoluteUrl(match[1]), text: decodeHtml(match[2]) }))
    .filter((link) => /Visa Bulletin For [A-Za-z]+ \d{4}/i.test(link.text));
  if (!links.length) throw new Error("No Visa Bulletin links found on index page.");
  return links[0];
}
function parseBulletinMonth(text) {
  const match = text.match(/Visa Bulletin For ([A-Za-z]+) (\d{4})/i);
  if (!match) throw new Error(`Unable to parse bulletin month from: ${text}`);
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) throw new Error(`Unknown bulletin month: ${match[1]}`);
  return `${match[2]}-${month}`;
}
function parseVisaDate(raw) {
  if (raw === "C" || raw === "U") return raw;
  const match = raw.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  if (!match) throw new Error(`Unexpected visa date format: ${raw}`);
  const [, day, mon, yy] = match;
  const year = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
  return `${year}-${VISA_MONTHS[mon]}-${day}`;
}
function daysBetween(previous, next) {
  if (!previous || previous === "C" || previous === "U" || next === "C" || next === "U") return 0;
  return Math.round((new Date(`${next}T00:00:00Z`) - new Date(`${previous}T00:00:00Z`)) / 86400000);
}
function parseEb3RowFinalActionDate(html) {
  const text = decodeHtml(html);
  const sectionMatch = text.match(/A\.\s*FINAL ACTION DATES FOR\s*EMPLOYMENT-BASED\s*PREFERENCE CASES([\s\S]*?)B\.\s*DATES FOR FILING/i);
  if (!sectionMatch) throw new Error("Employment-based Final Action Dates section was not found.");
  const rowMatch = sectionMatch[1].match(/\b3rd\s+([0-9]{2}[A-Z]{3}[0-9]{2}|C|U)\s+/i);
  if (!rowMatch) throw new Error("EB-3 row was not found in Final Action Dates table.");
  return rowMatch[1].toUpperCase();
}
async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}
async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
async function main() {
  const indexHtml = await fetchText(BULLETIN_INDEX);
  const bulletin = findCurrentBulletin(indexHtml);
  const bulletinMonth = parseBulletinMonth(bulletin.text);
  const bulletinHtml = await fetchText(bulletin.href);
  const rawFinalActionDate = parseEb3RowFinalActionDate(bulletinHtml);
  const finalActionDate = parseVisaDate(rawFinalActionDate);
  const history = await readJson(HISTORY_PATH, []);
  const existingIndex = history.findIndex((entry) => entry.bulletinMonth === bulletinMonth);
  const previousEntry = existingIndex > 0 ? history[existingIndex - 1] : history.at(-1);
  const entry = { bulletinMonth, finalActionDate, rawFinalActionDate, movementDays: daysBetween(previousEntry?.finalActionDate, finalActionDate), sourceUrl: bulletin.href };
  if (existingIndex >= 0) {
    const prior = existingIndex > 0 ? history[existingIndex - 1] : null;
    entry.movementDays = daysBetween(prior?.finalActionDate, finalActionDate);
    history[existingIndex] = entry;
  } else {
    history.push(entry);
  }
  history.sort((a, b) => a.bulletinMonth.localeCompare(b.bulletinMonth));
  for (let i = 0; i < history.length; i += 1) {
    history[i].movementDays = i === 0 ? history[i].movementDays || 0 : daysBetween(history[i - 1].finalActionDate, history[i].finalActionDate);
  }
  const latest = { category: "EB-3", chargeability: "ROW", chart: "Final Action Date", bulletinMonth, finalActionDate, rawFinalActionDate, sourceUrl: bulletin.href, updatedAt: new Date().toISOString() };
  await writeJson(LATEST_PATH, latest);
  await writeJson(HISTORY_PATH, history);
  console.log(`Updated EB-3 ROW Chart A to ${rawFinalActionDate} for ${bulletin.text}.`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
