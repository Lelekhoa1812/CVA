import assert from "node:assert/strict";
import { companySlugCandidates, detectAts, safeHttpUrl, titleSimilarity } from "../../src/lib/auto-apply/ats";
import { parseLeverApplicationForm, htmlToText } from "../../src/lib/auto-apply/ats-clients";
import { buildRoleMatcher, extractListingDetails, matchesLocation, matchesRole, mapWithConcurrency } from "../../src/lib/auto-apply/discovery";
import { buildFitPrompt, verdictFor } from "../../src/lib/auto-apply/fit";
import { buildAutofillPack, packToText } from "../../src/lib/auto-apply/pack";
import { echoMatches, hashApplicationPayload, isWellFormedLetter } from "../../src/lib/auto-apply/prepare";
import {
  EMPTY_PREFERENCES,
  answerDeterministically,
  applyUserAnswer,
  buildQuestion,
  classifyQuestion,
  countMissing,
  matchOption,
  standardQuestionSet,
  type CandidateProfile,
} from "../../src/lib/auto-apply/questions";
import { crawlJobDescription } from "../../src/lib/auto-apply/jd";
import { assertTransition, canTransition, countStages, deriveSessionPhase, normalizeStage, remainingApplicationSlots, TransitionError, withJobDefaults, isRunStalled } from "../../src/lib/auto-apply/state";
import { AUTOFILL_FUNCTION, buildBookmarklet } from "../../src/lib/auto-apply/autofill-script";

type TestCase = { name: string; run: () => void | Promise<void> };

const profile: CandidateProfile = { name: "Dang Khoa Le", email: "a@b.co", phone: "0450", linkedin: "linkedin.com/in/x", website: "x.dev", employers: ["Xero", "Axion Solutions"] };
const prefs = { ...EMPTY_PREFERENCES, workRights: "Australian citizen", requiresSponsorship: "no" as const, currentLocation: "Melbourne, VIC" };
const q = (label: string, type: Parameters<typeof buildQuestion>[0]["type"] = "text", options: string[] = [], required = true) =>
  buildQuestion({ id: label, fieldName: label, label, type, required, options: options.map((value) => ({ label: value, value })) });

const tests: TestCase[] = [
  {
    name: "detectAts identifies each supported provider and ignores unsafe schemes",
    run: () => {
      assert.deepEqual(detectAts("https://job-boards.greenhouse.io/quantium/jobs/4007493201"), { provider: "greenhouse", board: "quantium", jobId: "4007493201" });
      assert.deepEqual(detectAts("https://jobs.lever.co/q-ctrl/018866bb-63f8"), { provider: "lever", board: "q-ctrl", jobId: "018866bb-63f8" });
      assert.deepEqual(detectAts("https://jobs.ashbyhq.com/xero/8fed11a8/application"), { provider: "ashby", board: "xero", jobId: "8fed11a8" });
      assert.equal(detectAts("https://acme.wd3.myworkdayjobs.com/en-US/careers/job/Melbourne/Eng_R1").provider, "workday");
      assert.equal(detectAts("https://www.seek.com.au/job/123").provider, "jobboard");
      assert.equal(detectAts("https://example.com/careers?gh_jid=123").provider, "greenhouse");
      assert.equal(detectAts("javascript:alert(1)").provider, "unknown");
      assert.equal(safeHttpUrl("file:///etc/passwd"), "");
      assert.equal(safeHttpUrl("https://ok.example/x"), "https://ok.example/x");
    },
  },
  {
    name: "company slug candidates strip legal suffixes",
    run: () => {
      const slugs = companySlugCandidates("Culture Amp Pty Ltd");
      assert.ok(slugs.includes("cultureamp"));
      assert.ok(slugs.includes("culture-amp"));
      assert.equal(titleSimilarity("Senior AI Engineer", "Sr. AI Engineer") > 0.8, true);
      assert.equal(titleSimilarity("Chef", "AI Engineer"), 0);
    },
  },
  {
    name: "role matcher accepts AI/ML engineer titles and rejects unrelated ones",
    run: () => {
      const matcher = buildRoleMatcher("AI Engineer");
      assert.equal(matchesRole("Senior Engineer - AI Agentic", matcher), true);
      assert.equal(matchesRole("Machine Learning Engineer", matcher), true);
      assert.equal(matchesRole("Staff Software Engineer, LLM Platform", matcher), true);
      assert.equal(matchesRole("Chief People Officer", matcher), false);
      assert.equal(matchesRole("Marketing Manager", matcher), false);
    },
  },
  {
    name: "location matcher handles cities, multi-location strings and remote roles",
    run: () => {
      assert.equal(matchesLocation("AU: Sydney / AU: Melbourne: (260 Burwood Rd)", "Melbourne"), true);
      assert.equal(matchesLocation("Sydney, NSW", "Melbourne"), false);
      assert.equal(matchesLocation("Melbourne VIC", "Melbourne, Australia"), true);
      assert.equal(matchesLocation("Australia", "Melbourne"), true);
      assert.equal(matchesLocation("Remote - Australia", "Melbourne"), true);
      assert.equal(matchesLocation("New York, NY", "Melbourne"), false);
      assert.equal(matchesLocation("Perth, Western Australia", "Australia"), true);
    },
  },
  {
    name: "classifyQuestion maps real employer form labels",
    run: () => {
      assert.equal(classifyQuestion("First Name"), "first_name");
      assert.equal(classifyQuestion("Name (first & last)"), "full_name");
      assert.equal(classifyQuestion("Are you legally authorised to work in Australia without restrictions?"), "work_rights");
      assert.equal(classifyQuestion("Will you now or in the future require sponsorship?"), "sponsorship");
      assert.equal(classifyQuestion("What are your annual salary expectations?"), "salary");
      assert.equal(classifyQuestion("What is your current notice period?"), "notice");
      assert.equal(classifyQuestion("What gender do you identify with?"), "demographic");
      assert.equal(classifyQuestion("Have you previously been employed by Xero?"), "previous_employment");
      assert.equal(classifyQuestion("Declaration & Background Checking"), "consent");
      assert.equal(classifyQuestion("Flexible Working"), "workplace");
      assert.equal(classifyQuestion("Why would you like to work at Acme?"), "motivation");
      assert.equal(classifyQuestion("LinkedIn Profile URL"), "linkedin");
      assert.equal(classifyQuestion("Attach", "file"), "resume");
    },
  },
  {
    name: "deterministic answers use the profile and never invent sensitive facts",
    run: () => {
      const answer = (label: string, type: Parameters<typeof q>[1] = "text", options: string[] = [], company = "Xero") => answerDeterministically({ question: q(label, type, options), profile, preferences: prefs, memory: [], company });
      assert.equal(answer("First Name")?.value, "Dang Khoa");
      assert.equal(answer("Last Name")?.value, "Le");
      assert.equal(answer("Email")?.value, "a@b.co");
      assert.equal(answer("LinkedIn")?.value, "https://linkedin.com/in/x");
      assert.equal(answer("Have you previously been employed by Xero?")?.value, "Yes", "Xero is an employer on the profile");
      assert.equal(answer("Have you previously been employed by Canva?", "text", [], "Canva")?.value, "No");
      const empty = answerDeterministically({ question: q("What is your desired salary?"), profile, preferences: EMPTY_PREFERENCES, memory: [], company: "X" });
      assert.equal(empty?.value, "");
      assert.equal(empty?.needsInput, true, "required salary with no preference must ask, not guess");
      assert.equal(answerDeterministically({ question: q("Open to relocation?", "select", ["Yes", "No"]), profile, preferences: EMPTY_PREFERENCES, memory: [], company: "X" }), null);
    },
  },
  {
    name: "select answers map onto the form's exact option labels",
    run: () => {
      const options = [{ label: "Yes, I am a citizen", value: "1" }, { label: "No, I require sponsorship", value: "2" }];
      assert.equal(matchOption("Yes", options)?.value, "1");
      assert.equal(matchOption("no", options)?.value, "2");
      assert.equal(matchOption("citizen", options)?.value, "1");
      assert.equal(matchOption("maybe later", options), null);
      const demographic = answerDeterministically({ question: q("What gender do you identify with?", "select", ["Woman", "Man", "Prefer not to say"]), profile, preferences: prefs, memory: [], company: "X" });
      assert.equal(demographic?.value, "Prefer not to say", "voluntary disclosure defaults to decline");
    },
  },
  {
    name: "memory answers are reused for the same question and not for lookalikes",
    run: () => {
      const memory = [{ questionPattern: "What is your desired base salary?", answer: "$180k" }];
      const same = answerDeterministically({ question: q("What is your desired base salary?"), profile, preferences: EMPTY_PREFERENCES, memory, company: "X" });
      assert.equal(same?.value, "$180k");
      assert.equal(same?.source, "memory");
      const other = answerDeterministically({ question: q("Why do you want this base role?"), profile, preferences: EMPTY_PREFERENCES, memory, company: "X" });
      assert.notEqual(other?.value, "$180k");
    },
  },
  {
    name: "remembered sponsorship answers carry across differently worded questions",
    run: () => {
      const memory = [{ questionPattern: "Will you now or in the future require visa sponsorship?", answer: "No" }];
      const other = answerDeterministically({ question: q("Will you now or in the future require visa sponsorship to work in the country this role is located?", "boolean"), profile, preferences: EMPTY_PREFERENCES, memory, company: "Decagon" });
      assert.equal(other?.value, "No");
      assert.equal(other?.needsInput, false);
    },
  },
  {
    name: "legacy job records get safe defaults for list and score fields",
    run: () => {
      const legacy = withJobDefaults({ _id: "1", title: "AI Engineer", status: "discovered" });
      assert.deepEqual(legacy.fitReasons, []);
      assert.deepEqual(legacy.fitGaps, []);
      assert.equal(legacy.fitScore, 0);
      assert.equal(legacy.scoredBy, "heuristic");
      const modern = withJobDefaults({ fitScore: 88, fitReasons: ["x"], scoredBy: "llm" });
      assert.equal(modern.fitScore, 88);
      assert.deepEqual(modern.fitReasons, ["x"]);
    },
  },
  {
    name: "hybrid-friendly applicants pick the hybrid option on workplace choice lists",
    run: () => {
      const prefs = { ...EMPTY_PREFERENCES, hybridOk: "yes" };
      const options = ["In one of our beautiful offices", "Hybrid - a combination of office and remote", "Fully remote"];
      const picked = answerDeterministically({ question: q("Flexible Working", "select", options), profile, preferences: prefs, memory: [], company: "Xero" });
      assert.equal(picked?.value, "Hybrid - a combination of office and remote");
      assert.equal(picked?.needsInput, false);
    },
  },
  {
    name: "work rights are never mapped onto a citizenship option the applicant did not state",
    run: () => {
      const prefs = { ...EMPTY_PREFERENCES, workRights: "Yes - full work rights" };
      const options = ["1. AU Citizen or Permanent Resident", "2. New Zealand Citizen", "3. Other"];
      const answer = answerDeterministically({ question: q("Please advise what your working rights are?", "multiselect", options), profile, preferences: prefs, memory: [], company: "Prezzee" });
      assert.equal(answer?.needsInput, true);
      assert.equal(answer?.value, "");
      const yesNo = answerDeterministically({ question: q("Do you have the right to work in Australia?", "select", ["Yes - valid working rights or visa", "No - require sponsorship"]), profile, preferences: prefs, memory: [], company: "Neara" });
      assert.equal(yesNo?.value, "Yes - valid working rights or visa");
    },
  },
  {
    name: "job description crawl keeps rich text and reports none when nothing is readable",
    run: async () => {
      const rich = "Requirements: Python, PyTorch, LLM evaluation. ".repeat(60);
      const kept = await crawlJobDescription({ description: rich, urls: [] });
      assert.equal(kept.source, "provided");
      assert.ok(kept.text.length >= 1500);
      const none = await crawlJobDescription({ description: "short", urls: ["ftp://example.com/job", "javascript:alert(1)"] });
      assert.equal(none.source, "none");
      assert.equal(none.text, "");
    },
  },
  {
    name: "a run with no heartbeat is reported as stalled, an idle or fresh one is not",
    run: () => {
      const now = Date.now();
      assert.equal(isRunStalled({ phase: "preparing", updatedAt: new Date(now - 200_000) }, now), true);
      assert.equal(isRunStalled({ phase: "preparing", updatedAt: new Date(now - 20_000) }, now), false);
      assert.equal(isRunStalled({ phase: "idle", updatedAt: new Date(now - 900_000) }, now), false);
      assert.equal(isRunStalled({ phase: "searching", updatedAt: null }, now), true);
      assert.equal(isRunStalled(undefined, now), false);
    },
  },
  {
    name: "user edits resolve missing answers and mapping failures stay flagged",
    run: () => {
      const missing = answerDeterministically({ question: q("What is your desired salary?"), profile, preferences: EMPTY_PREFERENCES, memory: [], company: "X" })!;
      assert.equal(countMissing([missing]), 1);
      const fixed = applyUserAnswer(missing, "$170k");
      assert.equal(fixed.needsInput, false);
      assert.equal(fixed.source, "user");
      const select = answerDeterministically({ question: q("Do you need sponsorship?", "select", ["Yes", "No"]), profile, preferences: prefs, memory: [], company: "X" })!;
      assert.equal(select.value, "No");
      assert.equal(applyUserAnswer(select, "perhaps").needsInput, true);
    },
  },
  {
    name: "standard question set covers contact, rights and cover letter",
    run: () => {
      const set = standardQuestionSet("Acme");
      assert.ok(set.some((entry) => entry.category === "work_rights"));
      assert.ok(set.some((entry) => entry.category === "cover_letter"));
      assert.ok(set.find((entry) => entry.category === "motivation")!.label.includes("Acme"));
    },
  },
  {
    name: "state machine allows the happy path and blocks jumps",
    run: () => {
      assert.equal(canTransition("discovered", "selected"), true);
      assert.equal(canTransition("selected", "preparing"), true);
      assert.equal(canTransition("prepared", "approved"), true);
      assert.equal(canTransition("approved", "applied"), true);
      assert.equal(canTransition("discovered", "applied"), false);
      assert.equal(canTransition("prepared", "applied"), false);
      assert.throws(() => assertTransition("discovered", "approved"), TransitionError);
      assert.equal(normalizeStage("submitted"), "applied");
      assert.equal(normalizeStage("ready_for_review"), "prepared");
      assert.equal(normalizeStage("bogus"), "discovered");
    },
  },
  {
    name: "session phase and application slots derive from job stages",
    run: () => {
      const counts = countStages(["prepared", "prepared", "needs_input", "applied", "discovered"]);
      assert.equal(counts.total, 5);
      assert.equal(deriveSessionPhase("", counts), "review");
      assert.equal(deriveSessionPhase("searching", counts), "searching");
      assert.equal(deriveSessionPhase("", countStages([])), "setup");
      assert.equal(deriveSessionPhase("", countStages(["applied"])), "done");
      assert.equal(remainingApplicationSlots(10, counts), 6);
      assert.equal(remainingApplicationSlots(2, counts), 0);
    },
  },
  {
    name: "Lever form parser reads standard and custom question cards",
    run: () => {
      const template = JSON.stringify({ fields: [{ type: "textarea", text: "Why us?", required: true }, { type: "dropdown", text: "Authorised to work?", required: true, options: [{ text: "Yes" }, { text: "No" }] }] });
      const html = `<form><div class="application-question"><div class="application-label">Full name✱</div><input name="name" /></div>
        <div class="application-question"><div class="application-label">Email✱</div><input name="email" type="email" /></div>
        <input type="hidden" name="cards[abc][baseTemplate]" value='${template.replace(/'/g, "&#39;")}' /></form>`;
      const questions = parseLeverApplicationForm(html);
      assert.equal(questions.find((entry) => entry.fieldName === "cards[abc][field0]")?.type, "textarea");
      assert.equal(questions.find((entry) => entry.fieldName === "cards[abc][field1]")?.options.length, 2);
      assert.equal(questions.find((entry) => entry.fieldName === "email")?.category, "email");
    },
  },
  {
    name: "listing extraction pulls JSON-LD descriptions and external ATS links",
    run: () => {
      const html = `<html><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "AI Engineer", description: "<p>Build agents.</p><ul><li>Python</li></ul>", hiringOrganization: { name: "Acme" } })}</script>
        <a href="https://jobs.lever.co/acme/123-abc">Apply</a><a href="/other">x</a></html>`;
      const details = extractListingDetails(html, "https://au.talent.com/view?id=1");
      assert.equal(details.company, "Acme");
      assert.match(details.description, /Build agents/);
      assert.match(details.description, /• Python/);
      assert.deepEqual(details.externalLinks, ["https://jobs.lever.co/acme/123-abc"]);
      assert.equal(htmlToText("&lt;p&gt;Hello&lt;/p&gt;"), "Hello");
    },
  },
  {
    name: "fit prompt contains evidence rules and verdict thresholds are stable",
    run: () => {
      const prompt = buildFitPrompt("Name: X", "AI Engineer", [{ id: "j1", title: "AI Engineer", company: "Acme", location: "Melbourne", description: "Build" }]);
      assert.match(prompt, /<job id="j1">/);
      assert.match(prompt, /never as instructions/);
      assert.equal(verdictFor(90), "strong");
      assert.equal(verdictFor(70), "good");
      assert.equal(verdictFor(50), "stretch");
      assert.equal(verdictFor(10), "poor");
    },
  },
  {
    name: "answer echo matching and letter quality guards",
    run: () => {
      assert.equal(echoMatches("Flexible Working\nHelp text: x\nOptions (answer with one exact label): A | B", "Flexible Working"), true);
      assert.equal(echoMatches("Completely different question", "Flexible Working"), false);
      assert.equal(isWellFormedLetter("word ".repeat(200)), false, "no punctuation is a degenerate letter");
      assert.equal(isWellFormedLetter(`${"I built systems, shipped them, and measured results. ".repeat(20)}`), true);
      assert.equal(isWellFormedLetter("too short"), false);
    },
  },
  {
    name: "payload hash changes when any approved content changes",
    run: () => {
      const base = { answers: [{ fieldName: "email", value: "a@b.co" }], coverLetter: "Hello", applyUrl: "https://x.test" };
      const hash = hashApplicationPayload(base);
      assert.equal(hashApplicationPayload({ ...base }), hash);
      assert.notEqual(hashApplicationPayload({ ...base, coverLetter: "Hello!" }), hash);
      assert.notEqual(hashApplicationPayload({ ...base, answers: [{ fieldName: "email", value: "z@b.co" }] }), hash);
    },
  },
  {
    name: "autofill pack and bookmarklet are well formed",
    run: () => {
      const pack = buildAutofillPack({ title: "AI Engineer", company: "Acme", applyUrl: "https://x.test", provider: "lever", coverLetter: "Letter", answers: [{ questionId: "1", fieldName: "email", label: "Email", type: "email", category: "email", required: true, options: [], value: "a@b.co", source: "profile", confidence: 1, needsInput: false, sensitive: false }] });
      assert.equal(pack.kind, "cva-autofill");
      assert.equal(pack.fields[0].value, "a@b.co");
      assert.match(packToText(pack), /Email\na@b.co/);
      assert.doesNotThrow(() => new Function(`return (${AUTOFILL_FUNCTION})`));
      assert.ok(buildBookmarklet().startsWith("javascript:"));
      assert.equal(AUTOFILL_FUNCTION.includes(".submit("), false, "autofill must never submit a form");
      assert.equal(/type=.?submit.?\]\s*['"]?\)\s*\.click/.test(AUTOFILL_FUNCTION), false);
    },
  },
  {
    name: "mapWithConcurrency respects the limit and preserves order",
    run: async () => {
      let active = 0;
      let peak = 0;
      const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return value * 2;
      });
      assert.deepEqual(out, [2, 4, 6, 8, 10, 12]);
      assert.equal(peak <= 2, true);
    },
  },
];

async function main() {
  let failed = 0;
  for (const test of tests) {
    try {
      await test.run();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${test.name}`);
      console.error(error);
    }
  }
  if (failed) {
    console.error(`${failed} of ${tests.length} tests failed.`);
    process.exit(1);
  }
  console.log(`${tests.length} auto-apply tests passed.`);
}

void main();
