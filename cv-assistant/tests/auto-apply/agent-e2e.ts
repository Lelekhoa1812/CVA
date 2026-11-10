/**
 * End-to-end check of the local apply agent against employer forms served from this machine. No real employer is
 * contacted: every variant is a page this script serves, and it counts how many applications actually arrived.
 * Run with `npm run test:agent` (needs Playwright's Chromium).
 */
import http from "node:http";
import { inferCountry, runApplyAgent } from "../../src/lib/auto-apply/agent";
import type { AutofillPack } from "../../src/lib/auto-apply/pack";

let received = 0;
let lastBody = "";

const FIELDS = `
<label for="name">Full name *</label><input id="name" name="name" required>
<label for="email">Email *</label><input id="email" name="email" type="email" required>
<label for="phone">Phone</label><input id="phone" name="phone">
<label for="rights">Are you legally authorized to work in Australia? *</label>
<select id="rights" name="rights" required><option value="">Choose</option><option>Yes</option><option>No</option></select>
<label for="letter">Cover letter</label><textarea id="letter" name="letter"></textarea>
<label for="resume">Resume *</label><input id="resume" name="resume" type="file" required>
<label><input id="consent" name="consent" type="checkbox" required> I agree to the privacy policy *</label>
<p>Will you now or in the future require sponsorship? *</p><ul><li><label><input type="radio" name="sponsor" value="Yes" required> Yes</label></li><li><label><input type="radio" name="sponsor" value="No"> No</label></li></ul>`;

const page = (extra = "", message = "", button = "Submit application") => `<!doctype html><html><body><h1>Backend Engineer</h1>${message}
<form method="post" action="/apply" enctype="multipart/form-data">${FIELDS}${extra}<button type="submit">${button}</button></form></body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  if (req.method === "POST") {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received += 1;
      lastBody = Buffer.concat(chunks).toString("latin1");
      const mode = req.headers.referer?.split("/").pop() || "";
      res.setHeader("content-type", "text/html");
      if (mode === "form-reject") return res.end(page("", `<p class="error">This field is required: Phone</p>`));
      if (mode === "form-silent") return res.end(page());
      res.end(`<!doctype html><html><body><h1>Thank you for applying</h1><p>Your application has been received.</p></body></html>`);
    });
    return;
  }
  res.setHeader("content-type", "text/html");
  if (url === "/form-captcha") return res.end(page(`<iframe title="hCaptcha challenge" src="/hcaptcha-frame" width="300" height="78"></iframe>`));
  if (url === "/form-recaptcha-badge") return res.end(page(`<div class="grecaptcha-badge" style="position:fixed;bottom:14px;right:-186px"><iframe title="reCAPTCHA" src="/recaptcha/enterprise/anchor" width="256" height="60"></iframe></div>`));
  // Greenhouse's react-select: the input stays empty, the choice shows beside it, and a hidden unlabeled input only serves validation.
  if (url === "/form-react-select") return res.end(page(`<div class="select-shell"><label for="country">Country *</label><div class="select__control"><div class="select__single-value">Australia</div><input id="country" role="combobox" aria-required="true" class="select__input" value=""></div><input class="requiredInput" required style="opacity:0;height:1px"></div>`));
  if (url === "/form-restricted") return res.end(`<!doctype html><html><body><h1>Access is temporarily restricted</h1><p>We detected unusual activity from your device or network.</p><iframe title="challenge" src="/hcaptcha-frame" width="300" height="78"></iframe></body></html>`);
  if (url === "/hcaptcha-frame") return res.end("<p>captcha</p>");
  if (url === "/form-hidden-captcha") return res.end(page(`<iframe title="Widget containing checkbox for hCaptcha security challenge" src="/hcaptcha-frame" style="visibility:hidden;position:fixed;top:0;left:0;width:100%;height:100%"></iframe>`));
  if (url === "/form-badge") return res.end(page(`<p style="font-size:9px">This site is protected by reCAPTCHA and the Google Privacy Policy.</p>`));
  if (url === "/form-extra") return res.end(page(`<label for="years">Years of experience *</label><input id="years" name="years" required>`));
  if (url === "/form-location") return res.end(`<!doctype html><html><body><h1>Backend Engineer</h1><form method="post" action="/apply" enctype="multipart/form-data">${FIELDS}
<label for="loc">Current location *</label><input id="loc" name="location" required><input type="hidden" id="sel" name="selectedLocation" required>
<div class="dropdown-container"><div class="dropdown-loading-results" style="display:none">Loading</div><div class="dropdown-results"></div></div>
<script>var inp=document.getElementById('loc'),box=document.querySelector('.dropdown-results'),ld=document.querySelector('.dropdown-loading-results');
inp.addEventListener('keyup',function(){ld.style.display='block';box.innerHTML='';setTimeout(function(){ld.style.display='none';
['Melbourne, FL, USA','Melbourne, Victoria, AUS'].forEach(function(t){var d=document.createElement('div');d.className='dropdown-location';d.textContent=t;d.onclick=function(){inp.value=t;document.getElementById('sel').value=t;box.innerHTML='';};box.appendChild(d);});},2500);});</script>
<button type="submit">Submit application</button></form></body></html>`);
  if (url === "/form-parse") return res.end(page(`<div id="note"></div><script>document.getElementById('resume').addEventListener('change',function(){var n=document.getElementById('note');n.textContent='Parsing your resume. Autofilling key fields...';setTimeout(function(){document.getElementById('name').value='WRONG PARSED NAME';n.textContent='';},2500);});</script>`));
  if (url === "/form-login") return res.end(`<html><body><h1>Sign in to apply</h1><p>Log in to apply for this role.</p></body></html>`);
  res.end(page());
});

const pack = (applyUrl: string): AutofillPack => ({
  kind: "cva-autofill",
  version: 1,
  job: { title: "Backend Engineer", company: "Mock Co", applyUrl, provider: "mock" },
  fields: [
    { fieldName: "name", label: "Full name", type: "text", required: true, value: "Taylor Nguyen", options: [] },
    { fieldName: "email", label: "Email", type: "email", required: true, value: "taylor@example.com", options: [] },
    { fieldName: "phone", label: "Phone", type: "text", required: false, value: "0400 123 456", options: [] },
    { fieldName: "rights", label: "Are you legally authorized to work in Australia?", type: "select", required: true, value: "Yes", options: ["Yes", "No"] },
    { fieldName: "letter", label: "Cover letter", type: "textarea", required: false, value: "Dear team, I built the API that serves 40,000 daily requests.", options: [] },
    { fieldName: "sponsor", label: "Will you now or in the future require sponsorship?", type: "select", required: true, value: "No", options: ["Yes", "No"] },
    { fieldName: "consent", label: "I agree to the privacy policy", type: "boolean", required: true, value: "Yes", options: ["Yes", "No"] },
  ],
  coverLetter: "Dear team",
  createdAt: new Date().toISOString(),
});

const profile = { name: "Taylor Nguyen", email: "taylor@example.com", phone: "0400 123 456", skills: "TypeScript, Python", experiences: [{ companyName: "Northwind Analytics", role: "Software Engineer", description: "Built an API. Cut report time from 90 seconds to 25 seconds." }] } as never;

async function main() {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  const run = (path: string, mode: "check" | "submit", extra: Record<string, unknown> = {}) =>
    runApplyAgent({ pack: pack(`http://127.0.0.1:${port}${path}`), profile, mode, headless: true, allowLocalUrls: true, confirmTimeoutMs: 3000, ...extra });
  const results: string[] = [];
  const check = (name: string, ok: boolean, detail = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${detail}`}`);
    if (!ok) process.exitCode = 1;
  };

  let result = await run("/form", "check");
  check("check mode fills the form and reports it ready", result.status === "ready", JSON.stringify(result));
  check("check mode never sends the application", received === 0, `received ${received}`);

  result = await run("/form", "submit");
  check("submit mode sends the application once and reads the confirmation", result.status === "submitted" && received === 1 && /thank you|received/i.test(result.confirmation || ""), JSON.stringify(result));
  check("the resume reached the employer as a PDF", /%PDF/.test(lastBody) || /Taylor Nguyen - Resume\.pdf/.test(lastBody), lastBody.slice(0, 200));
  check("a radio group whose options sit in separate list items is answered by its shared name", /name="sponsor"\r\n\r\nNo/.test(lastBody), lastBody.slice(0, 600));
  check("the approved answers reached the employer", /Taylor Nguyen/.test(lastBody) && /taylor@example\.com/.test(lastBody) && /40,000 daily requests/.test(lastBody), lastBody.slice(0, 300));

  received = 0;
  result = await run("/form-captcha", "submit");
  check("a visible CAPTCHA stops the agent before anything is sent", result.status === "blocked" && /CAPTCHA/i.test(result.reason) && received === 0, JSON.stringify(result));

  result = await run("/form-badge", "submit");
  check("a reCAPTCHA badge line is not a challenge", result.status === "submitted", JSON.stringify(result));

  result = await run("/form-hidden-captcha", "check");
  check("an invisible hCaptcha frame, as on real Lever forms, is not a challenge", result.status === "ready", JSON.stringify(result));

  result = await run("/form-recaptcha-badge", "check");
  check("the reCAPTCHA Enterprise badge frame, as on real Greenhouse forms, is not a challenge", result.status === "ready", JSON.stringify(result));

  result = await run("/form-restricted", "check");
  check("a site that refuses automated access is reported as that, not as a CAPTCHA", result.status === "blocked" && /blocked automated access/i.test(result.reason), JSON.stringify(result));

  result = await run("/form-react-select", "check");
  check("a react-select that shows its choice counts as filled", result.status === "ready", JSON.stringify(result));

  check("the country is read from an Australian state or phone", inferCountry({}, "Melbourne, VIC") === "Australia" && inferCountry({ phone: "0400 123 456" }) === "Australia" && inferCountry({ phone: "+61 400 123 456" }) === "Australia");
  check("an unclear country is left empty", inferCountry({ phone: "" }, "Paris") === "");

  received = 0;
  result = await run("/form-parse", "submit");
  check("a form that parses the resume and autofills its own fields does not overwrite the approved answers", result.status === "submitted" && /Taylor Nguyen/.test(lastBody) && !/WRONG PARSED NAME/.test(lastBody), JSON.stringify(result) + lastBody.slice(0, 300));

  received = 0;
  const withLocation = pack("http://127.0.0.1:" + port + "/form-location");
  withLocation.fields.push({ fieldName: "location", label: "Current location", type: "text", required: true, value: "Melbourne, VIC", options: [] });
  result = await runApplyAgent({ pack: withLocation, profile, mode: "submit", headless: true, allowLocalUrls: true, confirmTimeoutMs: 3000 });
  check("a place search is answered by picking the matching suggestion", result.status === "submitted" && /selectedLocation"\r\n\r\nMelbourne, Victoria, AUS/.test(lastBody), JSON.stringify(result) + lastBody.slice(-300));

  received = 0;
  result = await run("/form-extra", "submit");
  check("a required field the answers do not cover stops the agent", result.status === "blocked" && /Years of experience/i.test(result.reason) && received === 0, JSON.stringify(result));

  result = await run("/form-login", "submit");
  check("a sign-in wall stops the agent", result.status === "blocked" && /sign in/i.test(result.reason) && received === 0, JSON.stringify(result));

  received = 0;
  result = await run("/form-reject", "submit");
  check("a form that rejects the answers is reported, not retried", result.status === "failed" && received === 1, JSON.stringify(result));

  received = 0;
  result = await run("/form-silent", "submit");
  check("no confirmation is reported as uncertain and is not retried", result.status === "uncertain" && received === 1, JSON.stringify(result));

  result = await runApplyAgent({ pack: pack("http://127.0.0.1:1/form"), profile, mode: "submit", headless: true });
  check("the agent refuses a private address by default", result.status === "failed" && /public employer sites/.test(result.reason), JSON.stringify(result));

  console.log(results.join("\n"));
  server.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  server.close();
});
