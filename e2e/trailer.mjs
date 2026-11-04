import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto((process.argv[2] ?? "http://127.0.0.1:8787") + "/trailer");
await p.waitForFunction(() => window.ready);
await p.click("#play");
for (const s of [3, 21, 40]) { await p.waitForTimeout(s === 3 ? 3000 : 18000); await p.screenshot({ path: `e2e/shots/trailer_${s}.png` }); }
console.log(errs); await b.close();
