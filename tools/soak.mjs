// Soak test: run the loop for N minutes at ?speed=4, sample heap and errors.
// Usage: PW=<playwright path> node tools/soak.mjs [baseURL] [minutes] [now]
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || "playwright");

const BASE = process.argv[2] || "http://localhost:8765/mlsp2026show/";
const MIN = +(process.argv[3] || 30);
const NOW = process.argv[4] || "2026-09-29T15:50";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror " + e));
page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errors.push(m.text()); });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
await page.goto(`${BASE}?now=${NOW}&speed=4&debug=1`);
const seen = new Set();
const samples = [];
const t0 = Date.now();
while (Date.now() - t0 < MIN * 60000) {
  await page.waitForTimeout(15000);
  const m = await cdp.send("Performance.getMetrics");
  const get = (n) => (m.metrics.find((x) => x.name === n) || {}).value;
  const info = await page.evaluate(() => ({ cur: window.__show.current(), loops: window.__show.loops(), nodes: document.getElementsByTagName("*").length, slides: document.querySelectorAll(".slide").length, log: window.__show.log().slice(-3) }));
  seen.add(info.cur);
  samples.push({ t: Math.round((Date.now() - t0) / 1000), heapMB: +(get("JSHeapUsedSize") / 1e6).toFixed(1), nodes: info.nodes, slides: info.slides, loops: info.loops, cur: info.cur });
}
await browser.close();
const first = samples.slice(0, 4), last = samples.slice(-4);
const avg = (a, k) => (a.reduce((s, x) => s + x[k], 0) / a.length).toFixed(1);
console.log(JSON.stringify({ minutes: MIN, samples: samples.length, loops: samples.at(-1).loops, distinctSlides: seen.size, heapStartMB: avg(first, "heapMB"), heapEndMB: avg(last, "heapMB"), nodesStart: avg(first, "nodes"), nodesEnd: avg(last, "nodes"), maxSlidesInDom: Math.max(...samples.map((s) => s.slides)), errors }, null, 1));
