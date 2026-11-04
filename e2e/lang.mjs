import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://127.0.0.1:8787";
const browser = await chromium.launch();
for (const lang of ["ja", "en"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((l) => localStorage.setItem("ha_settings", JSON.stringify({ lang: l, voice: false })), lang);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(base + "/");
  await page.waitForSelector("#rName");
  await page.fill("#rName", "Kenji");
  await page.fill("#rStable", "Sakura " + lang + Math.floor(Math.random() * 1e5));
  await page.click("#reg");
  await page.waitForSelector(".hero h1");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `e2e/shots/lang_${lang}_home.png` });
  await page.goto(base + "/altro");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `e2e/shots/lang_${lang}_more.png` });
  console.log(lang, errs);
  await ctx.close();
}
await browser.close();
