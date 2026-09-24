// Screenshot every slide at fixed fake times.
// Usage: NODE_PATH=<dir with playwright> node tools/shoot.mjs [baseURL] [outDir]
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || "playwright");
import fs from "fs";

const BASE = process.argv[2] || "http://localhost:8765/mlsp2026show/";
const OUT = process.argv[3] || "shots";
const TIMES = ["2026-09-25T12:00", "2026-09-28T09:45", "2026-09-29T10:15", "2026-09-29T11:20", "2026-09-29T16:30", "2026-09-30T18:30", "2026-10-01T13:30", "2026-10-01T16:00"];
const TIME_DEP = /^(now|posters|keynotes-\d|tutorials)$/;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const report = { errors: [], plans: {}, overflow: [] };

async function shot(page, url, file) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => document.body.classList.contains("ready") && document.querySelector(".slide.in"), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  // Overflow check: any element inside the slide that extends past the stage or is clipped.
  const issues = await page.evaluate(() => {
    const out = [];
    const s = document.querySelector(".slide.in");
    if (!s) return ["no slide"];
    s.querySelectorAll("*").forEach((e) => {
      const r = e.getBoundingClientRect();
      const st = document.getElementById("stage").getBoundingClientRect();
      const sc = st.width / 1920;
      if (r.width === 0) return;
      if (r.right > st.right + 2 || r.bottom > st.bottom - 160 * sc || r.left < st.left - 2) out.push("outside: " + e.className + " " + (e.textContent || "").slice(0, 40));
      const cs = getComputedStyle(e);
      if ((cs.overflow === "hidden" || cs.textOverflow === "ellipsis") && e.scrollWidth > e.clientWidth + 2 && cs.webkitLineClamp === "none") out.push("clipped-x: " + e.className + " " + (e.textContent || "").slice(0, 50));
    });
    return out.slice(0, 8);
  });
  if (issues.length) report.overflow.push({ file, issues });
  await page.screenshot({ path: file });
}

for (const vp of [{ w: 1920, h: 1080, tag: "" }]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(m.text()); });
  page.on("pageerror", (e) => report.errors.push(String(e)));
  for (const [ti, t] of TIMES.entries()) {
    await page.goto(`${BASE}?now=${t}&static=1&slide=now`, { waitUntil: "load" });
    await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
    const ids = await page.evaluate(() => window.__show.catalog());
    report.plans[t] = await page.evaluate(() => window.__show.plan());
    for (const id of ids) {
      if (ti > 0 && !TIME_DEP.test(id)) continue;
      if (ONLY && !ONLY.test(id)) continue;
      const file = `${OUT}/${t.replace(/[:]/g, "")}__${id}.png`;
      await shot(page, `${BASE}?now=${t}&static=1&slide=${id}`, file);
    }
  }
  await page.close();
}
// Scaling checks
for (const [w, h] of [[1280, 720], [3840, 2160], [1440, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  for (const id of ["now", "committee-1", "stat-themes"]) {
    const t = id === "now" ? "2026-09-29T10:15" : "2026-09-25T12:00";
    await shot(page, `${BASE}?now=${t}&static=1&slide=${id}`, `${OUT}/scale-${w}x${h}__${id}.png`);
  }
  await page.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log("errors:", report.errors.length, "overflow:", report.overflow.length);
