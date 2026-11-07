import { chromium, firefox, webkit } from "playwright";
import { AUTOFILL_FUNCTION } from "../src/lib/auto-apply/autofill-script";
const GH_URL = "https://job-boards.anz.greenhouse.io/quantium/jobs/4005581201";
const URL = GH_URL;
const ghPack = { kind: "cva-autofill", version: 1, job: { title: "t", company: "Quantium", applyUrl: URL, provider: "greenhouse" }, coverLetter: "", createdAt: "", fields: [
  { fieldName: "first_name", label: "First Name", type: "text", required: true, value: "Dang Khoa", options: [] },
  { fieldName: "last_name", label: "Last Name", type: "text", required: true, value: "Le", options: [] },
  { fieldName: "email", label: "Email", type: "text", required: true, value: "test@example.com", options: [] },
  { fieldName: "country", label: "Country", type: "select", required: true, value: "Australia", options: ["Australia", "New Zealand"] },
  { fieldName: "x", label: "Location (City)", type: "text", required: true, value: "Melbourne, VIC", options: [] },
] };
const ashbyPack = { kind: "cva-autofill", version: 1, job: { title: "t", company: "Neara", applyUrl: "https://jobs.ashbyhq.com/neara/1ea30af7-974f-49cf-8742-edcfc4230c52/application", provider: "ashby" }, coverLetter: "", createdAt: "", fields: [
  { fieldName: "_systemfield_name", label: "First Name", type: "text", required: true, value: "Dang Khoa", options: [] },
  { fieldName: "x1", label: "Last Name", type: "text", required: true, value: "Le", options: [] },
  { fieldName: "_systemfield_email", label: "Email", type: "email", required: true, value: "test@example.com", options: [] },
  { fieldName: "x2", label: "Phone Number", type: "phone", required: true, value: "0400000000", options: [] },
  { fieldName: "x3", label: "Salary expectations", type: "text", required: true, value: "$130,000 - $150,000 + super", options: [] },
] };
async function run(name: string, type: typeof chromium, pack: typeof ghPack | typeof ashbyPack = ghPack) {
  const URL = pack.job.applyUrl;
  const b = await type.launch(name === "chromium" ? { channel: "chrome" } : {});
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(URL, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.evaluate("window.__cvaSubmitted=false;document.addEventListener('submit',function(){window.__cvaSubmitted=true},true)");
  const out = (await p.evaluate(`(${AUTOFILL_FUNCTION})(${JSON.stringify(pack)})`).catch((e) => ({ error: String(e).slice(0, 200) }))) as { filled?: number; total?: number; results?: Array<{ label: string; status: string }>; error?: string };
  const shown = await p.evaluate("[].slice.call(document.querySelectorAll('[class*=singleValue],[class*=single-value]')).map(function(e){return e.textContent}).join(' || ')");
  console.log(name, "filled", out.filled, "/", out.total, out.error || "", (out.results || []).map((r) => r.label.slice(0, 18) + ":" + r.status).join(", "), "| SHOWN:", shown);
  const submitted = await p.evaluate("window.__cvaSubmitted");
  await b.close();
  if (submitted) throw new Error(name + ": autofill submitted the form");
  if (out.filled !== out.total) throw new Error(name + ": expected every field filled, got " + out.filled + "/" + out.total);
}
// Live check against a real Greenhouse form (react-select country + async city search) in three browser engines.
// Usage: npm run test:autofill-live   (needs network and `npx playwright install firefox webkit`)
(async () => {
  for (const [name, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]] as const) {
    await run(name, type, ghPack);
    await run(name, type, ashbyPack);
  }
  console.log("autofill-live: all engines passed");
})().catch((error) => { console.error(error); process.exit(1); });
