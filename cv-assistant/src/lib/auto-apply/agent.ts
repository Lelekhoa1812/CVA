// Local apply agent: opens an approved application's real employer form in a browser the applicant's own machine runs,
// fills it from the approved pack, checks that nothing required is left, and only then (when the applicant has chosen
// to) presses Submit and reads the employer's confirmation. It is local-only: a serverless host cannot keep a browser.
//
// It never works around a protection. A CAPTCHA, a login wall, an access block, a required field it cannot fill or a
// form that rejects the answers all stop it, and the application is handed back to the applicant with the reason.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserContext, Page } from "playwright";
import type { Profile } from "@/lib/models/User";
import { safeHttpUrl } from "./ats";
import { AUTOFILL_FUNCTION } from "./autofill-script";
import { detectAutomationBlockers } from "./browser";
import type { AutofillPack } from "./pack";
import { isSubmitRequest, SUBMIT_GUARD_INIT_SCRIPT } from "./submit-guard";

export type AgentMode = "check" | "submit";
export type AgentStatus = "submitted" | "ready" | "blocked" | "failed" | "uncertain";
export type AgentResult = {
  status: AgentStatus;
  reason: string;
  filled: number;
  total: number;
  /** Required fields that are still empty when the agent stopped. */
  missing: string[];
  url: string;
  /** What the employer's page said after Submit. */
  confirmation?: string;
  screenshot?: string;
};

/** The agent needs a browser on this machine, so it is off on a serverless host and off unless the applicant turned it on. */
export function isAgentEnabled() {
  return !process.env.VERCEL && process.env.AUTO_APPLY_AGENT === "true";
}

const CONFIRMATION = /\b(thank you for (?:applying|your application|submitting|your interest)|(?:your )?application (?:has been |was )?(?:successfully )?(?:received|submitted|sent|complete)|we(?:'|’)ve received your application|we have received your application|successfully submitted)\b/i;
const CHALLENGE_TEXT = /verify (?:that )?you(?:'re|’re| are) (?:a )?human|i(?:'|’)m not a robot|are you a robot|complete the security check/i;
const FORM_ERROR = /\b(this field is required|is required|please (?:enter|select|complete|fill|provide|choose|upload)|must be (?:filled|provided|selected)|invalid (?:email|phone|value|format))\b/i;

/** The words of the page that prove the employer received the application. Empty when it has not said so. */
export function confirmationIn(text: string) {
  const hit = text.match(CONFIRMATION);
  return hit ? hit[0] : "";
}

/** Why the agent must not go on with this page. A reCAPTCHA badge or a privacy line that names it is not a challenge. */
export function pageBlockers(text: string, url: string, challengeVisible: boolean) {
  const out = new Set<string>();
  if (challengeVisible || CHALLENGE_TEXT.test(text)) out.add("captcha");
  for (const blocker of detectAutomationBlockers(text, url)) if (blocker === "platform_login_required" || blocker === "employer_login_required" || blocker === "paywall") out.add(blocker);
  if (/access denied|request blocked|unusual traffic|unusual activity|you have been blocked|access is temporarily restricted/i.test(text)) {
    // The site's own refusal is the real reason; a challenge frame on that page is part of the same wall.
    out.delete("captcha");
    out.add("automation_blocked");
  }
  return [...out];
}

export const BLOCKER_MESSAGES: Record<string, string> = {
  captcha: "The form asks for a CAPTCHA or human check. Open it and finish by hand.",
  platform_login_required: "The job board asks you to sign in first. Open it and sign in yourself.",
  employer_login_required: "The employer's site asks you to sign in first. Open it and sign in yourself.",
  paywall: "The page sits behind a paywall.",
  automation_blocked: "The site blocked automated access. Open it and apply by hand.",
};

export function blockerMessage(blockers: string[]) {
  return blockers.map((blocker) => BLOCKER_MESSAGES[blocker] || blocker).join(" ");
}

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

function sentences(value: string) {
  return value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** A plain one-column resume built only from the profile, for forms that require a file. Nothing in it is written by a model. */
export function buildResumeHtml(profile: Partial<Profile>) {
  const contact = [profile.email, profile.phone, profile.linkedin, profile.website].filter(Boolean).map(esc).join(" · ");
  const experiences = (profile.experiences || [])
    .map((experience) => {
      const dates = [experience.timeFrom, experience.timeTo].filter(Boolean).join(" - ");
      const bullets = sentences(experience.description || experience.summary || "").map((line) => `<li>${esc(line)}</li>`).join("");
      return `<section><h3>${esc(experience.role)}, ${esc(experience.companyName)}</h3><p class="meta">${esc([experience.location, dates].filter(Boolean).join(" · "))}</p>${bullets ? `<ul>${bullets}</ul>` : ""}</section>`;
    })
    .join("");
  const projects = (profile.projects || [])
    .map((project) => `<section><h3>${esc(project.name)}</h3><p>${esc(project.description || project.summary || "")}</p></section>`)
    .join("");
  const education = [profile.major, profile.school, profile.studyPeriod].filter(Boolean).map(esc).join(" · ");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(profile.name || "Resume")}</title><style>
body{font:11pt/1.4 Helvetica,Arial,sans-serif;color:#111;margin:0;padding:28pt 34pt}h1{font-size:20pt;margin:0 0 2pt}h2{font-size:11pt;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid #999;margin:14pt 0 6pt;padding-bottom:2pt}h3{font-size:11pt;margin:8pt 0 0}p{margin:2pt 0}.meta{color:#555;font-size:10pt}ul{margin:3pt 0 0 14pt;padding:0}li{margin:1pt 0}
</style></head><body><h1>${esc(profile.name || "")}</h1><p>${contact}</p>${profile.profileSummary ? `<h2>Summary</h2><p>${esc(profile.profileSummary)}</p>` : ""}${profile.skills ? `<h2>Skills</h2><p>${esc(profile.skills)}</p>` : ""}${experiences ? `<h2>Experience</h2>${experiences}` : ""}${projects ? `<h2>Projects</h2>${projects}` : ""}${education ? `<h2>Education</h2><p>${education}</p>` : ""}${profile.languages ? `<h2>Languages</h2><p>${esc(profile.languages)}</p>` : ""}</body></html>`;
}

type PageState = { text: string; url: string; challenge: boolean; errors: string[]; invalid: number };

async function pageState(page: Page): Promise<PageState> {
  return (await page.evaluate(`(function(){
    var visible=function(el){return !!(el&&(el.offsetWidth||el.offsetHeight||el.getClientRects().length));};
    // An invisible challenge frame (visibility hidden, zero opacity) or the reCAPTCHA badge (Greenhouse's invisible mode) is a background check, not a wall in front of the applicant.
    var shown=function(el){return visible(el)&&(el.checkVisibility?el.checkVisibility({checkVisibilityCSS:true,checkOpacity:true}):getComputedStyle(el).visibility!=='hidden');};
    var text=(document.body&&document.body.innerText)||'';
    var challenge=[].slice.call(document.querySelectorAll('iframe')).some(function(f){var src=(f.getAttribute('src')||'')+' '+(f.getAttribute('title')||'');var r=f.getBoundingClientRect();return /captcha|turnstile|challenge/i.test(src)&&r.width>=100&&r.height>=40&&shown(f)&&!f.closest('.grecaptcha-badge');});
    var errors=[].slice.call(document.querySelectorAll('.error, .field-error, [class*="error"], [role="alert"]')).filter(visible).map(function(n){return (n.textContent||'').replace(/\\s+/g,' ').trim();}).filter(Boolean).slice(0,8);
    var invalid=[].slice.call(document.querySelectorAll('[aria-invalid="true"]')).filter(visible).length;
    return {text:text.slice(0,20000),url:location.href,challenge:challenge,errors:errors,invalid:invalid};
  })()`)) as PageState;
}

/** Required controls with no value, by their on-page label. File inputs count as filled when the page shows the file's name. */
async function missingRequired(page: Page, resumeName: string): Promise<string[]> {
  return (await page.evaluate(`(function(){
    var visible=function(el){return !!(el&&(el.offsetWidth||el.offsetHeight||el.getClientRects().length));};
    var label=function(el){var l=el.id&&document.querySelector('label[for="'+el.id+'"]');var t=(l&&l.textContent)||(el.closest('label')&&el.closest('label').textContent)||el.getAttribute('aria-label')||el.getAttribute('placeholder')||el.name||'field';return t.replace(/\\s+/g,' ').replace(/[✱*]/g,'').trim().slice(0,80);};
    var page=document.body.innerText||'';var name=${JSON.stringify(resumeName)};var out=[];var seen={};
    [].slice.call(document.querySelectorAll('input,select,textarea')).forEach(function(el){
      if(el.type==='hidden'||el.disabled||(!visible(el)&&el.type!=='file'))return;
      var required=el.required||el.getAttribute('aria-required')==='true';if(!required)return;
      // A react-select keeps its input empty and shows the chosen option beside it; its hidden validation input has no label.
      var shell=el.closest('.select-shell,.select__container,[class*="select__control"],[class*="select-container"]')||(el.getAttribute('role')==='combobox'?el.closest('div[class*="select"]')&&el.closest('div[class*="select"]').parentElement:null);
      var chosen=shell&&shell.querySelector('[class*="single-value"],[class*="singleValue"],[class*="multi-value__label"]');
      if(chosen&&(chosen.textContent||'').trim())return;
      var empty=false;
      if(el.type==='checkbox'){var group=el.name?[].slice.call(document.querySelectorAll('input[type=checkbox]')).filter(function(c){return c.name===el.name;}):[el];if(group.length>1){if(seen['cb:'+el.name])return;seen['cb:'+el.name]=1;empty=!group.some(function(c){return c.checked;});}else empty=!el.checked;}
      else if(el.type==='radio'){if(seen[el.name])return;seen[el.name]=1;empty=![].slice.call(document.querySelectorAll('input[type=radio][name="'+el.name+'"]')).some(function(r){return r.checked;});}
      else if(el.type==='file')empty=!(el.files&&el.files.length)&&!(name&&page.indexOf(name)>=0);
      else empty=!String(el.value||'').trim();
      if(empty)out.push(label(el));
    });
    return out;
  })()`)) as string[];
}

const AU_STATE = /\b(?:vic|nsw|qld|wa|sa|tas|act|nt|victoria|new south wales|queensland|western australia|south australia|tasmania|australian capital territory|northern territory|australia)\b/i;

/** The country a required Country box should name, when the profile makes it plain (an Australian state or a +61 / 04 phone). Empty when unclear. */
export function inferCountry(profile: Partial<Profile>, location = ""): string {
  const place = location;
  if (AU_STATE.test(place)) return "Australia";
  const phone = String(profile.phone || "").replace(/[\s().-]/g, "");
  if (/^(?:\+?61|0061)\d{9}$/.test(phone) || /^04\d{8}$/.test(phone)) return "Australia";
  if (/\b(?:ho chi minh|hanoi|vietnam)\b/i.test(place) || /^\+84/.test(phone)) return "Vietnam";
  if (/\b(?:united states|usa|new york|california|texas)\b/i.test(place) || /^\+1\d{10}$/.test(phone)) return "United States";
  return "";
}

const LOCATION_LABEL = /\b(?:current )?location\b|\bcity\b|\bsuburb\b|where are you (?:currently )?(?:based|located|living)\b/i;
const STATE_NAMES: Record<string, string> = { vic: "victoria", nsw: "new south wales", qld: "queensland", wa: "western australia", sa: "south australia", tas: "tasmania", act: "australian capital territory", nt: "northern territory" };

/** How well a suggestion from a place autocomplete matches the applicant's location ("Melbourne, VIC" fits "Melbourne, Victoria, AUS"). */
export function locationOptionScore(option: string, wanted: string) {
  const norm = (text: string) => text.toLowerCase().replace(/[^a-z ,]+/g, " ").replace(/\s+/g, " ").trim();
  const text = norm(option);
  const parts = norm(wanted).split(",").map((part) => part.trim()).filter(Boolean);
  const city = parts[0] || "";
  if (!city || !text.includes(city)) return 0;
  let score = text.startsWith(city) ? 3 : 1;
  for (const part of parts.slice(1)) {
    const full = STATE_NAMES[part] || part;
    if (text.includes(full) || new RegExp(`\\b${part}\\b`).test(text)) score += 2;
  }
  if (/\b(?:aus|australia)\b/.test(text)) score += 1;
  return score;
}

const SUGGESTIONS = '.dropdown-location, [role="option"], .pac-item, [class*="autocomplete"] li, [class*="suggestion"] li, [class*="typeahead"] li';

/** A location box that offers a list of places only counts once a place is picked from it. Returns whether one was picked. */
async function pickLocation(page: Page, fieldName: string, label: string, value: string) {
  const byName = page.locator(`input[name="${fieldName.replace(/"/g, "")}"]`).first();
  const input = (await byName.count()) ? byName : page.getByLabel(new RegExp(label.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")).first();
  if (!(await input.count())) return false;
  const city = value.split(",")[0].trim();
  await input.click();
  await input.fill("");
  await input.pressSequentially(city, { delay: 40 });
  const options = page.locator(SUGGESTIONS);
  // A plain text box shows nothing; a place search shows a spinner first and can take many seconds to answer.
  const started = await page.locator(`${SUGGESTIONS}, [class*="dropdown-loading"], [class*="loading-results"]`).first().waitFor({ state: "visible", timeout: 2000 }).then(() => true).catch(() => false);
  const listed = started ? await options.first().waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false) : false;
  if (!listed) {
    await input.fill(value);
    return false;
  }
  const texts = await options.allInnerTexts();
  const scores = texts.map((text) => locationOptionScore(text, value));
  const best = scores.indexOf(Math.max(...scores));
  if (best < 0 || scores[best] === 0) {
    await input.fill(value);
    return false;
  }
  await options.nth(best).click();
  return true;
}

async function typeIntoCombobox(page: Page, label: string, value: string) {
  const first = value.split(",")[0];
  const target = page.getByRole("combobox", { name: new RegExp(label.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
  if (!(await target.count())) return false;
  await target.click();
  await target.fill(first);
  await page.waitForTimeout(900);
  const option = page.getByRole("option").filter({ hasText: new RegExp(first.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
  if (await option.count()) {
    await option.click();
    return true;
  }
  return false;
}

const UPLOAD_BUSY = /parsing your resume|analy[sz]ing (?:your )?resume|autofilling|uploading|processing your (?:resume|file)/i;

/**
 * Attaches a plain resume built from the profile to the form's file field and waits until the form has taken it in. Many
 * forms parse the file and fill their own fields from it, so this runs before the approved answers are written: the
 * answers then have the last word.
 */
async function attachResume(page: Page, context: BrowserContext, profile: Partial<Profile>, workDir: string, resumeName: string) {
  const files = page.locator("input[type=file]");
  const count = await files.count();
  if (!count) return false;
  const resumePath = path.join(workDir, resumeName);
  const pdfPage = await context.newPage();
  await pdfPage.setContent(buildResumeHtml(profile));
  await pdfPage.pdf({ path: resumePath, format: "A4", printBackground: true });
  await pdfPage.close();
  for (let index = 0; index < count; index += 1) {
    const input = files.nth(index);
    const hint = await input.evaluate((node) => `${node.getAttribute("name") || ""} ${node.getAttribute("id") || ""} ${node.getAttribute("aria-label") || ""} ${(node.closest("label, fieldset, div")?.textContent || "").slice(0, 120)}`).catch(() => "");
    if (/cover/i.test(hint) && !/resume|cv/i.test(hint)) continue;
    await input.setInputFiles(resumePath).catch(() => undefined);
    break;
  }
  const started = Date.now();
  await page.waitForTimeout(800);
  while (Date.now() - started < 25_000) {
    const text = await page.evaluate("document.body.innerText").catch(() => "") as string;
    const held = await page.evaluate(`[].slice.call(document.querySelectorAll('input[type=file]')).some(function(i){return i.files&&i.files.length;})`).catch(() => false);
    if (!UPLOAD_BUSY.test(text) && (text.includes(resumeName) || held || Date.now() - started > 6000)) break;
    await page.waitForTimeout(500);
  }
  return true;
}

export async function runApplyAgent(args: {
  pack: AutofillPack;
  profile: Partial<Profile>;
  mode: AgentMode;
  /** Where to keep the screenshot and the generated resume. */
  workDir?: string;
  headless?: boolean;
  /** Tests point the agent at a form on this machine. */
  allowLocalUrls?: boolean;
  /** How long to wait for the employer's confirmation after Submit. */
  confirmTimeoutMs?: number;
  signal?: AbortSignal;
}): Promise<AgentResult> {
  const applyUrl = safeHttpUrl(args.pack.job.applyUrl);
  const base = { filled: 0, total: 0, missing: [] as string[], url: applyUrl || args.pack.job.applyUrl };
  if (!applyUrl) return { ...base, status: "failed", reason: "The application has no usable web address." };
  const host = new URL(applyUrl).hostname;
  if (!args.allowLocalUrls && (/^(localhost|127\.|10\.|192\.168\.|0\.|169\.254\.)/.test(host) || host.endsWith(".local") || host === "::1")) {
    return { ...base, status: "failed", reason: "The agent only opens public employer sites." };
  }

  const workDir = args.workDir || (await fs.mkdtemp(path.join(os.tmpdir(), "cva-agent-")));
  await fs.mkdir(workDir, { recursive: true });
  const { chromium } = await import("playwright");
  const headless = args.headless ?? process.env.AUTO_APPLY_BROWSER_HEADLESS !== "false";
  // AUTO_APPLY_BROWSER_PATH points at a Chromium or Chrome binary; without it the bundled one is tried, then the installed Chrome.
  const browser = await chromium
    .launch({ headless, executablePath: process.env.AUTO_APPLY_BROWSER_PATH || undefined })
    .catch((error: unknown) => (process.env.AUTO_APPLY_BROWSER_PATH ? Promise.reject(error) : chromium.launch({ headless, channel: "chrome" })));
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // A check run must never send the application: the network guard from the fill script stays on for it.
    if (args.mode === "check") {
      await context.route("**/*", (route) => {
        const request = route.request();
        return isSubmitRequest(request.method(), request.url(), request.postData()) ? route.abort() : route.continue();
      });
      await context.addInitScript(SUBMIT_GUARD_INIT_SCRIPT);
    }
    const page = await context.newPage();
    args.signal?.addEventListener("abort", () => void browser.close().catch(() => undefined), { once: true });
    const shot = async (name: string) => {
      const file = path.join(workDir, name);
      await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
      return file;
    };
    await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);

    let state = await pageState(page);
    const before = pageBlockers(state.text, state.url, state.challenge);
    if (before.length) return { ...base, status: "blocked", reason: blockerMessage(before), url: state.url, screenshot: await shot("blocked.png") };

    const resumeName = `${(args.profile.name || "Resume").replace(/[^\w ]+/g, "").trim() || "Resume"} - Resume.pdf`;
    await attachResume(page, context, args.profile, workDir, resumeName);

    const report = (await page.evaluate(`(${AUTOFILL_FUNCTION})(${JSON.stringify({ ...args.pack, kind: "cva-autofill", version: 1 })})`)) as { filled: number; total: number; results: Array<{ label: string; status: string }> };
    for (const entry of report.results.filter((result) => result.status === "partial" || result.status === "missing")) {
      const field = args.pack.fields.find((candidate) => candidate.label === entry.label);
      if (field?.value && field.type !== "file") await typeIntoCombobox(page, field.label, field.value).catch(() => false);
    }

    // Place searches (Lever's location box) need a suggestion picked; the in-page fill only types the text.
    for (const field of args.pack.fields) {
      if (field.type !== "text" || !field.value || !LOCATION_LABEL.test(field.label)) continue;
      await pickLocation(page, field.fieldName, field.label, field.value).catch(() => false);
    }

    // A required Country box is not one of the posting's questions; the profile usually settles it.
    const country = inferCountry(args.profile, args.pack.fields.find((field) => field.value && LOCATION_LABEL.test(field.label))?.value || "");
    if (country && (await page.getByRole("combobox", { name: /^country\b/i }).count())) await typeIntoCombobox(page, "Country", country).catch(() => false);

    const missing = await missingRequired(page, resumeName);
    state = await pageState(page);
    const afterFill = pageBlockers(state.text, state.url, state.challenge);
    const shotReady = await shot(missing.length ? "incomplete.png" : "filled.png");
    const result = { ...base, filled: report.filled, total: report.total, missing, url: state.url, screenshot: shotReady };
    if (afterFill.length) return { ...result, status: "blocked", reason: blockerMessage(afterFill) };
    if (missing.length) return { ...result, status: "blocked", reason: `Required ${missing.length === 1 ? "field" : "fields"} the approved answers do not cover: ${missing.slice(0, 4).join("; ")}.` };
    if (args.mode === "check") return { ...result, status: "ready", reason: "The form is filled and complete. Nothing was submitted." };

    // Submit, then read what the employer's page says. Without a confirmation the agent does not retry: it could duplicate the application.
    const button = page.getByRole("button", { name: /^(submit( your)? application|submit|apply( now)?|send application|complete application)\b/i }).last();
    if (!(await button.count()) || !(await button.isEnabled().catch(() => false))) return { ...result, status: "blocked", reason: "There is no Submit button the agent can press." };
    await button.click();
    const deadline = Date.now() + (args.confirmTimeoutMs ?? 25_000);
    let latest = state;
    while (Date.now() < deadline) {
      await page.waitForTimeout(700);
      latest = await pageState(page).catch(() => latest);
      const done = confirmationIn(latest.text);
      if (done) return { ...result, status: "submitted", reason: "The employer's page confirmed the application.", confirmation: done, url: latest.url, screenshot: await shot("submitted.png") };
      const blockers = pageBlockers(latest.text, latest.url, latest.challenge);
      if (blockers.length) return { ...result, status: "blocked", reason: `${blockerMessage(blockers)} The application was not sent.`, url: latest.url, screenshot: await shot("blocked-after-submit.png") };
      // A banner or a toast in role=alert is not a rejection; a field marked invalid, or an error line that says what is wrong, is.
      const problems = latest.errors.filter((line) => FORM_ERROR.test(line));
      if (latest.invalid || problems.length) {
        return { ...result, status: "failed", reason: `The form rejected the answers${problems.length ? `: ${problems.slice(0, 3).join("; ")}` : ` (${latest.invalid} field${latest.invalid === 1 ? "" : "s"} marked invalid)`}. Nothing was retried.`, url: latest.url, screenshot: await shot("rejected.png") };
      }
    }
    return { ...result, status: "uncertain", reason: "Submit was pressed but the page never confirmed it. Check your email or the employer's site before trying again.", url: latest.url, screenshot: await shot("uncertain.png") };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
