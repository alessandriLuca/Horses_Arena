import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://127.0.0.1:8787";
const vp = process.argv[3] === "desk" ? { width: 1280, height: 760 } : { width: 390, height: 844 };
const tag = process.argv[3] ?? "phone";
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await browser.newContext({ viewport: vp, locale: "it-IT" })).newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", (e) => errs.push("PAGE " + e.message));
await page.goto(base + "/");
await page.waitForSelector("#rName");
await page.fill("#rName", "Tester");
await page.fill("#rStable", "Scuderia Flow " + Math.floor(Math.random() * 1e5));
await page.click("#reg");
await page.waitForSelector(".hero h1");
const token = await page.evaluate(() => localStorage.getItem("ha_token"));
const api0 = (p, b) => page.evaluate(async ([p, b, token]) => (await fetch("/api" + p, { method: b ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: b ? JSON.stringify(b) : undefined })).json(), [p, b, token]);
const api = async (p, b) => { for (let i = 0; i < 5; i++) { try { return await api0(p, b); } catch (e) { await page.waitForTimeout(2000); } } return {}; };
const m = await api("/market");
const horse = m.horses.filter((h) => !h.canRace).sort((a, b) => a.price - b.price)[0];
console.log("buy", JSON.stringify(await api("/market/buy", { horseId: horse.id })).slice(0, 200));
const f = await api("/friendly", { horseId: horse.id, bots: 9, botLevel: 0.45, distance: 1200 });
console.log("friendly", f.raceId);
await page.goto(base + "/corsa/" + f.raceId);
await page.waitForTimeout(1500);
await page.screenshot({ path: `e2e/shots/flow_${tag}_card.png` });
// aspetta la chiusura e la simulazione
for (let i = 0; i < 40; i++) {
  const r = await api("/race/" + f.raceId);
  if (r.status !== "open" && Date.now() + 0 >= 0) { if (r.now >= r.replayAt) break; }
  await page.waitForTimeout(3000);
}
await page.goto(base + "/corsa/" + f.raceId + "?watch=1");
await page.waitForSelector(".viewer-stage canvas", { timeout: 30000 });
for (const s of [6, 22, 45, 70]) {
  await page.waitForTimeout(s === 6 ? 6000 : 15000);
  await page.screenshot({ path: `e2e/shots/flow_${tag}_v${s}.png` });
}
console.log("errors", errs.slice(0, 10));
await browser.close();
