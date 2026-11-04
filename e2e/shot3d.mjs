import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://127.0.0.1:8787";
const out = process.argv[3] ?? "e2e/shots";
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [name, vp] of [["desk", { width: 1280, height: 720 }], ["phone", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(base + "/dev.html");
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  for (const [t, cam] of (name === "desk" ? [[-8, "tv"], [5, "tv"], [30, "heli"], [60, "follow"], [95, "tv"], [101, "tv"]] : [[20, "tv"], [99, "tv"]])) {
    await page.evaluate(([t, cam]) => { window.viewer.seek(t); window.viewer.setCam(cam, 2); }, [t, cam]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${name}_${t}_${cam}.png` });
  }
  await page.close();
}
await browser.close();
