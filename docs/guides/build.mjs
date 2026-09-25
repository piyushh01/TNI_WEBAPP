// Renders the Skillgo user guides (HTML in this folder) to PDFs in public/guides/,
// which the app links to from the sidebar ("User Guide").
//
//   npm i --no-save playwright-core && node docs/guides/build.mjs
//
// Uses the installed Google Chrome (set CHROME_PATH to override).
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../public/guides");
fs.mkdirSync(out, { recursive: true });

const GUIDES = [
  ["reportee.html", "Skillgo-Reportee-Guide.pdf", "Reportee Guide"],
  ["manager.html", "Skillgo-Reporting-Manager-Guide.pdf", "Reporting Manager Guide"],
  ["admin.html", "Skillgo-Admin-HR-Guide.pdf", "Admin / HR Guide"],
];

const executablePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
for (const [src, dest, name] of GUIDES) {
  await page.goto(pathToFileURL(path.join(here, src)).href, { waitUntil: "networkidle" });
  await page.pdf({
    path: path.join(out, dest),
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="width:100%;font-size:8px;color:#77827b;padding:0 16mm;display:flex;justify-content:space-between;font-family:Segoe UI,Arial,sans-serif">
      <span>Skillgo · ${name} · o2h technology</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    margin: { top: "16mm", bottom: "18mm", left: "0", right: "0" },
  });
  console.log("wrote", dest);
}
await browser.close();
