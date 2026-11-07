/**
 * Optional local "agent mode": fills an employer form with a CV Assistant autofill pack using real browser input
 * (trusted keyboard and mouse events plus file upload), for forms the bookmarklet cannot finish. It never submits.
 *
 * Usage:
 *   npm run agent:fill -- --pack pack.json [--resume /path/to/cv.pdf] [--headless] [--engine chromium|firefox|webkit]
 *
 * Safety: every request that looks like an application submission is aborted at the network layer, and the script
 * never clicks a submit/apply button. You review the filled form in the window and press Submit yourself.
 * Get a pack from the app: Apply step > "Copy answers as text", or GET /api/auto-apply/job/<id>/pack (signed in).
 */
import fs from "node:fs";
import { chromium, firefox, webkit, type Page } from "playwright";
import { AUTOFILL_FUNCTION } from "../src/lib/auto-apply/autofill-script";
import { isSubmitRequest, SUBMIT_GUARD_INIT_SCRIPT } from "../src/lib/auto-apply/submit-guard";

type Field = { fieldName: string; label: string; type: string; required: boolean; value: string; options: string[] };
type Pack = { job: { title: string; company: string; applyUrl: string; provider: string }; fields: Field[]; coverLetter: string };

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

async function typeIntoCombobox(page: Page, field: Field) {
  const target = page.getByRole("combobox", { name: new RegExp(field.label.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
  if (!(await target.count())) return false;
  await target.click();
  await target.fill(field.value.split(",")[0]);
  await page.waitForTimeout(900);
  const option = page.getByRole("option").filter({ hasText: new RegExp(field.value.split(",")[0].slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
  if (await option.count()) {
    await option.click();
    return true;
  }
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  return true;
}

async function main() {
  const packPath = arg("pack");
  if (!packPath) throw new Error("Pass --pack <file.json> (see the header of this script).");
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8")) as Pack & { kind?: string };
  const resume = arg("resume");
  const type = { chromium, firefox, webkit }[(arg("engine") as "chromium") || "chromium"];
  const browser = await type.launch({ headless: flag("headless"), ...(arg("engine") && arg("engine") !== "chromium" ? {} : { channel: "chrome" }) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let blocked = 0;
  await context.route("**/*", (route) => {
    const request = route.request();
    if (isSubmitRequest(request.method(), request.url(), request.postData())) {
      blocked += 1;
      console.log(`  blocked ${request.method()} ${request.url().slice(0, 110)}`);
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(SUBMIT_GUARD_INIT_SCRIPT);
  const page = await context.newPage();
  await page.goto(pack.job.applyUrl, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const report = (await page.evaluate(`(${AUTOFILL_FUNCTION})(${JSON.stringify({ ...pack, kind: "cva-autofill", version: 1 })})`)) as { filled: number; total: number; results: Array<{ label: string; status: string; type?: string }> };
  console.log(`Bookmarklet pass: ${report.filled}/${report.total} filled`);

  // Second pass with real input for whatever the in-page script could not finish.
  const open = report.results.filter((entry) => entry.status === "partial" || entry.status === "missing");
  for (const entry of open) {
    const field = pack.fields.find((candidate) => candidate.label === entry.label);
    if (!field || !field.value) continue;
    const ok = await typeIntoCombobox(page, field).catch(() => false);
    console.log(`  real input  ${ok ? "filled " : "skipped"} | ${field.label.slice(0, 70)}`);
  }

  if (resume && fs.existsSync(resume)) {
    const files = page.locator("input[type=file]");
    const count = await files.count();
    if (count) {
      await files.first().setInputFiles(resume).catch(() => {});
      console.log(`  resume attached to the first file input (${count} file input${count === 1 ? "" : "s"} found)`);
    }
  }

  // Verify the upload really landed on the input, then refresh the on-page panel so it matches the final state.
  // Some uploaders (Greenhouse) consume the file and clear the input, so also look for the filename on the page.
  await page.waitForTimeout(1500);
  const baseName = resume ? resume.split("/").pop() || "" : "";
  const attached = (await page.evaluate(`(function(){var n=${JSON.stringify(baseName)};var held=[].slice.call(document.querySelectorAll('input[type=file]')).map(function(i){return i.files&&i.files[0]?i.files[0].name:''}).filter(Boolean).join(', ');if(held)return held;return n&&document.body.innerText.indexOf(n)>=0?n+' (shown on page)':''})()`)) as string;
  if (resume) console.log(attached ? `  verified: resume present: ${attached}` : "  warning: could not confirm the resume on the page");
  const stillOpen = open.filter((entry) => !pack.fields.some((field) => field.label === entry.label && field.value && field.type !== "file")).length;
  const summary = `Agent mode finished: ${report.total - Math.max(0, open.length - (open.length - stillOpen))}/${report.total} fields filled${attached ? `, resume attached (${attached})` : ""}. Review every field, then press Submit yourself.`;
  await page.evaluate(`(function(){var p=document.getElementById('cva-autofill-panel');if(p){p.innerHTML='<strong>CV Assistant agent mode</strong><br>'+${JSON.stringify(summary)}}})()`);
  console.log(`Blocked ${blocked} submission request(s). Nothing was submitted.`);
  if (flag("headless")) {
    await page.screenshot({ path: arg("screenshot") || "agent-fill.png" });
    await browser.close();
  } else {
    console.log("Review the form in the window, then press Submit yourself. Close the window when done.");
    await new Promise<void>((resolve) => page.on("close", () => resolve()));
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
