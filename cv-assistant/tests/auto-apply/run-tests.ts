import assert from "node:assert/strict";
import { companySlugCandidates, detectAts, safeHttpUrl, titleSimilarity } from "../../src/lib/auto-apply/ats";
import { parseLeverApplicationForm, htmlToText } from "../../src/lib/auto-apply/ats-clients";
import { buildRoleMatcher, extractListingDetails, matchesLocation, matchesRole, mapWithConcurrency } from "../../src/lib/auto-apply/discovery";
import { buildFitPrompt, verdictFor } from "../../src/lib/auto-apply/fit";
import { buildAutofillPack, packToText } from "../../src/lib/auto-apply/pack";
import { echoMatches, hashApplicationPayload, isNonQuestionField, isWellFormedLetter } from "../../src/lib/auto-apply/prepare";
import {
  EMPTY_PREFERENCES,
  answerDeterministically,
  applyUserAnswer,
  buildQuestion,
  suggestOption,
  classifyQuestion,
  countMissing,
  matchOption,
  standardQuestionSet,
  type CandidateProfile,
} from "../../src/lib/auto-apply/questions";
import { isSubmitRequest } from "../../src/lib/auto-apply/submit-guard";
const WORDS_ = (text: string) => text.split(/\s+/).filter(Boolean).length;
import { findLetterDefects, findUnsupportedClaims, repairLetterStructure, stripUnsupportedSentences } from "../../src/lib/cover-letter-service";
import { cleanTitle } from "../../src/lib/auto-apply/engine";
import { crawlJobDescription } from "../../src/lib/auto-apply/jd";
import { assertTransition, canTransition, countStages, deriveSessionPhase, normalizeStage, remainingApplicationSlots, TransitionError, withJobDefaults, isRunStalled, stalledRunMessage } from "../../src/lib/auto-apply/state";
import { AUTOFILL_FUNCTION, buildBookmarklet } from "../../src/lib/auto-apply/autofill-script";

type TestCase = { name: string; run: () => void | Promise<void> };

const profile: CandidateProfile = { name: "Dang Khoa Le", email: "a@b.co", phone: "0450", linkedin: "linkedin.com/in/x", website: "x.dev", employers: ["Xero", "Axion Solutions"] };
const prefs = { ...EMPTY_PREFERENCES, workRights: "Australian citizen", requiresSponsorship: "no" as const, currentLocation: "Melbourne, VIC" };
const q = (label: string, type: Parameters<typeof buildQuestion>[0]["type"] = "text", options: string[] = [], required = true) =>
  buildQuestion({ id: label, fieldName: label, label, type, required, options: options.map((value) => ({ label: value, value })) });

const tests: TestCase[] = [
  {
    name: "verifier pruning keeps paragraph breaks and removes only the flagged sentence",
    run: () => {
      const text = "Dear Hiring Manager,\n\nI built payment systems for many years.\n\nAs an Agent Deployment Engineer, I led everything at scale.\n\nI welcome the opportunity to talk.\n\nDang Khoa Le";
      const bad = "As an Agent Deployment Engineer, I led everything at scale.";
      const pruned = text.split(/\n{2,}/).map((paragraph) => paragraph.split(/(?<=[.!?])\s+/).filter((sentence) => !sentence.includes(bad.slice(0, 40))).join(" ").trim()).filter(Boolean).join("\n\n");
      assert.ok(!/Agent Deployment/.test(pruned) && pruned.includes("\n\n") && pruned.split("\n\n").length === 4);
    },
  },
  {
    name: "a hyphenated title is not a run-on; a bare title sentence is flagged",
    run: () => {
      const ok = "Dear Hiring Manager,\n\nI am applying for the Senior Engineer - AI Agentic role at Xero. I built things for many teams.\n\nDang Khoa Le";
      assert.ok(!findLetterDefects(ok, "Dang Khoa Le", "Xero", "Senior Engineer - AI Agentic").some((d) => d.includes("run into")));
      const bare = "Dear Hiring Manager,\n\nStaff Software Engineer, AI Tooling at Airwallex. I built things for many teams.\n\nDang Khoa Le";
      assert.ok(findLetterDefects(bare, "Dang Khoa Le", "Airwallex", "Staff Software Engineer, AI Tooling").some((d) => d.includes("bare sentence")));
    },
  },
  {
    name: "letter defects: run-on title opening, chat-line closing; repair drops chat lines and duplicate closers",
    run: () => {
      const runOn = "Dear Hiring Manager,\n\nSenior Software Engineer, AI Tooling at Airwallex - AI platform architect with production experience who built AI infrastructure.\n\nI would welcome the opportunity to discuss this role.\n\nDang Khoa Le";
      assert.ok(findLetterDefects(runOn, "Dang Khoa Le", "Airwallex", "Senior Software Engineer, AI Tooling").some((d) => d.includes("job title run into")));
      const chat = "Dear Hiring Manager,\n\nI built things, and I shipped them to production at scale for many users.\n\nLet me know if you would like to discuss the role.\n\nDang Khoa Le";
      assert.ok(findLetterDefects(chat, "Dang Khoa Le", "Acme", "Data Engineer").some((d) => d.includes("chat-style")));
      const fixed = repairLetterStructure("Dear Hiring Manager,\n\nI built things, and I shipped them.\n\nI would welcome the opportunity to discuss this role.\n\nI look forward to discussing it further.\n\nLet me know if you would like to talk.\n\nDang Khoa Le", "Dang Khoa Le", "Acme", "Data Engineer");
      assert.ok(!/Let me know/.test(fixed) && (fixed.match(/welcome|look forward/g) || []).length === 1);
    },
  },
  {
    name: "repair puts a greeting run into the first sentence on its own line",
    run: () => {
      const fixed = repairLetterStructure("Dear Hiring Manager, I am writing to apply for the role at Acme. I built things.\n\nI welcome the opportunity to discuss this.\n\nDang Khoa Le", "Dang Khoa Le", "Acme", "Data Engineer");
      assert.ok(fixed.startsWith("Dear Hiring Manager,\n\nI am applying for the role at Acme."), fixed);
    },
  },
  {
    name: "repair turns a title run-on into an opening and does not duplicate an existing one",
    run: () => {
      const a = repairLetterStructure("Dear Hiring Manager,\n\nSenior Engineer - ML & AI Systems at Xero, I architect production systems for many teams, shipping reliably.\n\nI would welcome the opportunity to discuss this.\n\nDang Khoa Le", "Dang Khoa Le", "Xero", "Senior Engineer - ML & AI Systems");
      assert.ok(a.includes("I am applying for the Senior Engineer - ML & AI Systems role at Xero. I architect production systems"));
      const b = repairLetterStructure("Dear Hiring Manager,\n\nI am writing to apply for the Senior Machine Learning Engineer role at Neara. I led teams, and shipped systems.\n\nI would welcome the opportunity to discuss this.\n\nDang Khoa Le", "Dang Khoa Le", "Neara", "Senior Machine Learning Engineer - Australia");
      assert.equal((b.match(/appl(y|ying)/g) || []).length, 1);
      const c = repairLetterStructure("Dear Hiring Manager,\n\nSenior Software Engineer, AI Tooling at Airwallex - led development of AI infrastructure at Mizco, shipping systems.\n\nDang Khoa Le", "Dang Khoa Le", "Airwallex", "Senior Software Engineer, AI Tooling");
      assert.ok(c.includes("role at Airwallex. I led development of AI infrastructure"));
    },
  },
  {
    name: "letters claiming history with the employer, 180-minute figures or copying the posting are flagged",
    run: () => {
      const cv = { projects: [{ name: "Chatbot", summary: "Python bot" }] } as never;
      const invented = "I co-developed your existing outage prediction framework and read your recent technical blog. My models gave 180-minute lookahead.";
      const found = findUnsupportedClaims(invented, cv, "Neara", "");
      assert.ok(found.some((t) => t.startsWith("claims a history with the employer")) && found.includes("180-minute"));
      const jd = "You communicate clearly by bringing people along with an idea rather than shipping code quietly in the background";
      const copied = "I communicate clearly by bringing people along with an idea rather than shipping code quietly in the background today.";
      assert.ok(findUnsupportedClaims(copied, cv, "Acme", jd).some((t) => t.startsWith("echo: ")));
      const stripped = stripUnsupportedSentences(copied + " " + "Supported words here, and more. ".repeat(40), findUnsupportedClaims(copied, cv, "Acme", jd), "Acme");
      assert.ok(stripped && !/shipping code quietly/.test(stripped));
    },
  },
  {
    name: "repair splits a name run onto the last sentence and keeps contact lines under the name",
    run: () => {
      const a = repairLetterStructure("Dear Hiring Manager,\n\nI am applying for the Data Engineer role at Acme, and I built pipelines for many teams, shipping them reliably.\n\nI can discuss this opportunity further with you at your convenience. Dang Khoa Le", "Dang Khoa Le", "Acme", "Data Engineer");
      assert.ok(/convenience\.\n\nSincerely,\nDang Khoa Le$/.test(a));
      const b = repairLetterStructure("Dear Hiring Manager,\n\nI am applying for the Data Engineer role at Acme, and I built pipelines for many teams, shipping them reliably each quarter.\n\nDang Khoa Le\n0450445373 | a@b.co", "Dang Khoa Le", "Acme", "Data Engineer");
      assert.ok(/welcome the opportunity/.test(b) && b.endsWith("a@b.co") && b.indexOf("welcome") < b.indexOf("Dang Khoa Le"));
    },
  },
  {
    name: "repair removes body contact sentences and adds a closing sentence before the sign-off",
    run: () => {
      const letter = "Dear Hiring Manager,\n\nI am applying for the Data Engineer role at Acme, and I built pipelines.\n\nI built things, and shipped them to production for users. I can be reached at 0450445373 or a@b.co to talk.\n\nDang Khoa Le";
      const fixed = repairLetterStructure(letter, "Dang Khoa Le", "Acme", "Data Engineer");
      assert.ok(!/0450445373|a@b\.co/.test(fixed));
      assert.ok(/welcome the opportunity/.test(fixed));
      assert.ok(fixed.trim().endsWith("Dang Khoa Le"));
    },
  },
  {
    name: "sentence stripping does not split inside Next.js or version numbers",
    run: () => {
      const text = "I built a Next.js app with Gemini 2.5 and shipped it. I used Kubernetes daily at scale. " + "More supported words follow here, and continue. ".repeat(30);
      const stripped = stripUnsupportedSentences(text, ["kubernetes"], "Acme");
      assert.ok(stripped && stripped.includes("Next.js app with Gemini 2.5 and shipped it.") && !/Kubernetes/.test(stripped));
    },
  },
  {
    name: "projects are not employers; greeting, sign-off and CV-shows filler are repaired",
    run: () => {
      const cv = { projects: [{ name: "EstateFolio" }] } as never;
      const text = "My CV shows I led a team. At EstateFolio, I led a 5-engineer team to build a forecasting system. I also built other things.";
      assert.deepEqual(findUnsupportedClaims(text, cv, "Acme"), ["project as employer: EstateFolio"]);
      const stripped = stripUnsupportedSentences(text + " " + "Filler words are here, again. ".repeat(30), ["project as employer: EstateFolio"], "Acme");
      assert.ok(stripped && !/EstateFolio/.test(stripped) && /other things/.test(stripped));
      const fixed = repairLetterStructure("My CV shows I built things, and shipped them.", "Dang Khoa Le");
      assert.ok(repairLetterStructure("Dear Hiring Manager,\n\nI built things, and shipped them.\n\nSincerely,\nDang Khoa Le", "Dang Khoa Le", "Acme", "Data Engineer").includes("I am applying for the Data Engineer role at Acme."));
      assert.ok(fixed.startsWith("Dear Hiring Manager,") && fixed.includes("I built things") && !/My CV shows/.test(fixed) && fixed.endsWith("Sincerely,\nDang Khoa Le"));
    },
  },
  {
    name: "letter defects: fragment opening, missing company and role, missing sign-off",
    run: () => {
      const body = "I have built many things, and I enjoy shipping software. ".repeat(14);
      const bad = `Senior AI Engineer Dang Khoa Le, with proven experience. ${body}\nThanks for reading this long closing sentence that never ends well.`;
      const defects = findLetterDefects(bad, "Dang Khoa Le", "Airwallex", "Senior AI Engineer");
      assert.ok(defects.some((d) => d.includes("greeting")) && defects.some((d) => d.includes("Airwallex")) && defects.some((d) => d.includes("sign-off")));
      const good = `Dear Hiring Manager,\n\nI am applying to the Senior AI Engineer role at Airwallex. ${body}\n\n${body}\nSincerely,\nDang Khoa Le`;
      assert.deepEqual(findLetterDefects(good, "Dang Khoa Le", "Airwallex", "Senior AI Engineer"), []);
    },
  },
  {
    name: "cleanTitle strips markdown and repeated slash titles",
    run: () => {
      assert.equal(cleanTitle("AI Software Engineer / Senior Engineer AI Software Engineer"), "AI Software Engineer");
      assert.equal(cleanTitle("*Full Stack LLM Engineer*"), "Full Stack LLM Engineer");
      assert.equal(cleanTitle("Data Scientist / ML Engineer"), "Data Scientist / ML Engineer");
    },
  },
  {
    name: "employer-employment claims, bare trailing link and years are caught",
    run: () => {
      const cv = { projects: [{ title: "Chatbot" }] } as never;
      const letter = "As Senior ML Engineer at Neara, I developed deep learning models. Other text here.";
      assert.deepEqual(findUnsupportedClaims(letter, cv, "Neara"), ["employment at Neara"]);
      assert.deepEqual(findUnsupportedClaims(letter, { projects: [{ title: "Neara intern" }] } as never, "Neara"), []);
      assert.ok(findLetterDefects("word ".repeat(200) + "\n\ncom", "X Y").includes("truncated link"));
    },
  },
  {
    name: "letter defects: candidate phrasing, short, truncated link; years and degree fields flagged",
    run: () => {
      const bad = "As Senior Engineer candidate Dang Khoa Le, I bring value.\n\ncom/in/dang-khoa-le";
      const defects = findLetterDefects(bad, "Dang Khoa Le");
      assert.ok(defects.includes("too short") && defects.some((d) => d.includes("candidate")) && defects.includes("truncated link"));
      const cv = { major: "Bachelor of Software Engineering" } as never;
      assert.deepEqual(findUnsupportedClaims("I have 7 years building systems with a Computer Science degree.", cv).sort(), ["7 years", "computer science"]);
      assert.deepEqual(findUnsupportedClaims("I have five years of work.", { note: "five years of work" } as never), []);
    },
  },
  {
    name: "declarations and in-office questions are never auto-confirmed",
    run: () => {
      const hybrid = { ...prefs, hybridOk: "yes" as const };
      const decl = answerDeterministically({ question: q("Declaration & Background Checking", "boolean"), profile, preferences: hybrid, memory: [], company: "Xero" });
      assert.equal(decl?.value, "");
      assert.equal(decl?.needsInput, true);
      const office = answerDeterministically({ question: q("Are you excited to work in-office five days a week?", "select", ["Yes", "No"]), profile, preferences: hybrid, memory: [], company: "Decagon" });
      assert.equal(office?.value, "");
      assert.equal(office?.needsInput, true);
    },
  },
  {
    name: "working-visa preference maps to a Yes work-authorisation option",
    run: () => {
      const visa = { ...prefs, workRights: "Working visa (valid work rights)" };
      const answer = answerDeterministically({ question: q("Work Authorization", "select", ["Yes", "No"]), profile, preferences: visa, memory: [], company: "AA" });
      assert.equal(answer?.value, "Yes");
    },
  },
  {
    name: "cover letter claims absent from the profile are detected and stripped",
    run: () => {
      const cv = { projects: [{ title: "Chatbot", description: "Python and React" }], major: "Bachelor of Software Engineering" } as never;
      const letter = "I build Python services. I hold a Master's in Computer Science. I used OAuth and React daily. " + "Filler words continue here. ".repeat(40);
      const found = findUnsupportedClaims(letter, cv);
      assert.deepEqual(found.sort(), ["computer science", "master's", "oauth"].sort());
      const stripped = stripUnsupportedSentences(letter, found);
      assert.ok(stripped && !/master|oauth|computer science/i.test(stripped) && /Python services/.test(stripped));
    },
  },
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
    name: "a stalled search asks for Search again, a stalled preparation points to Prepare in Matches",
    run: () => {
      assert.match(stalledRunMessage("searching"), /Press Search again/);
      assert.match(stalledRunMessage("scoring"), /Press Search again/);
      assert.doesNotMatch(stalledRunMessage("searching"), /Prepare/);
      assert.match(stalledRunMessage("preparing"), /Open Matches and press Prepare/);
    },
  },
  {
    name: "current company comes from the ongoing experience unless a preference or memory says otherwise",
    run: () => {
      const withCurrent = { ...profile, currentEmployer: "Acme Pty Ltd" };
      const fromProfile = answerDeterministically({ question: q("Current company"), profile: withCurrent, preferences: EMPTY_PREFERENCES, memory: [], company: "Blinq" });
      assert.equal(fromProfile?.value, "Acme Pty Ltd");
      assert.equal(fromProfile?.needsInput, false);
      const preferred = answerDeterministically({ question: q("Current company"), profile: withCurrent, preferences: { ...EMPTY_PREFERENCES, currentCompany: "Freelance" }, memory: [], company: "Blinq" });
      assert.equal(preferred?.value, "Freelance");
      const unknown = answerDeterministically({ question: q("Current company"), profile, preferences: EMPTY_PREFERENCES, memory: [], company: "Blinq" });
      assert.equal(unknown?.needsInput, true);
    },
  },
  {
    name: "optional URL slots and short unlabeled inputs are not drafted by the AI",
    run: () => {
      const urlSlot = buildQuestion({ id: "x", fieldName: "urls[Other]", label: "Blinq", type: "text", required: false, options: [] });
      assert.equal(isNonQuestionField(urlSlot), true);
      const real = buildQuestion({ id: "y", fieldName: "question_1", label: "What excites you about working with our customers?", type: "textarea", required: false, options: [] });
      assert.equal(isNonQuestionField(real), false);
      const required = buildQuestion({ id: "z", fieldName: "q2", label: "Pronouns", type: "text", required: true, options: [] });
      assert.equal(isNonQuestionField(required), false);
    },
  },
  {
    name: "choice questions get a preselected suggestion based on the evidence",
    run: () => {
      const question = q("What approach do you take when starting a piece of work?", "select", ["I plan carefully and write a design first", "I jump in and prototype quickly", "I prefer not to say"]);
      const picked = suggestOption(question, "Built a prototype quickly and iterated with the team on prototype feedback");
      assert.equal(picked?.label, "I jump in and prototype quickly");
      assert.notEqual(suggestOption(question, "")?.label, "I prefer not to say");
      assert.equal(suggestOption(q("Free text"), "x"), null);
    },
  },
  {
    name: "a visa holder picks the visa or other option on a work-rights status list",
    run: () => {
      const prefs = { ...EMPTY_PREFERENCES, workRights: "Working visa (valid work rights)" };
      const options = ["Australian citizen", "Australian permanent resident", "New Zealand citizen", "Work visa holder", "Other"];
      const answer = answerDeterministically({ question: q("Working Rights", "select", options), profile, preferences: prefs, memory: [], company: "Xero" });
      assert.equal(answer?.value, "Work visa holder");
      assert.equal(answer?.needsInput, false);
      const plain = answerDeterministically({ question: q("Working Rights", "select", ["Australian citizen", "New Zealand citizen", "Other"]), profile, preferences: prefs, memory: [], company: "Xero" });
      assert.equal(plain?.value, "Other");
    },
  },
  {
    name: "a remembered work-rights answer that does not fit this form's options falls back to the visa preference",
    run: () => {
      const prefs = { ...EMPTY_PREFERENCES, workRights: "Working visa (valid work rights)" };
      const memory = [{ questionPattern: "Please advise what your working rights are?", answer: "3. Other" }];
      const options = ["Australian citizen", "Australian permanent resident", "Work visa holder"];
      const answer = answerDeterministically({ question: q("Working Rights", "select", options), profile, preferences: prefs, memory, company: "Xero" });
      assert.equal(answer?.needsInput, false);
      assert.equal(answer?.value, "Work visa holder");
    },
  },
  {
    name: "the agent-fill guard blocks submissions but lets uploads and page loads through",
    run: () => {
      assert.equal(isSubmitRequest("POST", "https://job-boards.greenhouse.io/acme/jobs/1/applications", ""), true);
      assert.equal(isSubmitRequest("POST", "https://jobs.lever.co/acme/abc/apply", ""), true);
      assert.equal(isSubmitRequest("POST", "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiSubmitApplication", '{"operationName":"ApiSubmitApplication"}'), true);
      assert.equal(isSubmitRequest("POST", "https://grnhse-prod.s3.ap-southeast-4.amazonaws.com/", "Content-Type: application/pdf"), false);
      assert.equal(isSubmitRequest("GET", "https://jobs.lever.co/acme/abc/apply", ""), false);
      assert.equal(isSubmitRequest("POST", "https://www.google-analytics.com/collect", "t=event"), false);
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
    name: "stock filler and same-organization framing are flagged and repaired",
    run: () => {
      const body = "I built agent platforms, shipped them, and measured results. ".repeat(14);
      const stock = `Dear Hiring Manager,\n\nI am excited to apply for the Engineer role at Acme. ${body}\n\n${body}\n\nSincerely,\nDang Khoa Le`;
      assert.ok(findLetterDefects(stock, "Dang Khoa Le", "Acme", "Engineer").some((d) => d.includes("stock filler")));
      const clean = `Dear Hiring Manager,\n\nI am applying for the Engineer role at Acme. ${body}\n\n${body}\n\nSincerely,\nDang Khoa Le`;
      assert.ok(!findLetterDefects(clean, "Dang Khoa Le", "Acme", "Engineer").some((d) => d.includes("stock filler")));
      const same = `Dear Hiring Manager,\n\nI am applying for the Engineer role at Acme.\n\nIn the same organization, I built a horse breeding ranker.\n\nSincerely,\nDang Khoa Le`;
      assert.ok(findLetterDefects(`${same} ${body}\n\n${body}`, "Dang Khoa Le", "Acme", "Engineer").some((d) => d.includes("same organization")));
      assert.ok(repairLetterStructure(same, "Dang Khoa Le", "Acme", "Engineer").includes("I also built a horse breeding ranker."));
    },
  },
  {
    name: "job title as experience is flagged and generic greetings are normalised",
    run: () => {
      const body = "I built agent platforms, shipped them, and measured results. ".repeat(14);
      const bad = `Dear Hiring Manager,\n\nI am applying for the Senior Software Engineer, AI Tooling role at Airwallex. As Senior Software Engineer for AI Tooling, I led an enterprise platform. ${body}\n\n${body}\n\nSincerely,\nDang Khoa Le`;
      assert.ok(findLetterDefects(bad, "Dang Khoa Le", "Airwallex", "Senior Software Engineer, AI Tooling").some((d) => d.includes("job title as past experience")));
      const good = `Dear Hiring Manager,\n\nI am applying for the Senior Software Engineer, AI Tooling role at Airwallex. At Mizco, I led an enterprise platform. ${body}\n\n${body}\n\nSincerely,\nDang Khoa Le`;
      assert.ok(!findLetterDefects(good, "Dang Khoa Le", "Airwallex", "Senior Software Engineer, AI Tooling").some((d) => d.includes("job title as past experience")));
      const fixedTitle = repairLetterStructure("Dear Hiring Manager,\n\nI am applying for the Senior Machine Learning Engineer role at Contoso Cloud.\n\nAs Senior Machine Learning Engineer at Contoso Cloud, I built a Python service.", "Dang Khoa Le", "Contoso Cloud", "Senior Machine Learning Engineer");
      assert.ok(fixedTitle.includes("\n\nI built a Python service.") && !fixedTitle.includes("As Senior Machine Learning Engineer at Contoso Cloud, I"), fixedTitle);
      const third = repairLetterStructure("Dear Hiring Manager,\n\nAlex Tester is applying for the Engineer role at Acme.\n\nSincerely,\nAlex Tester", "Alex Tester", "Acme", "Engineer");
      assert.ok(third.includes("I am applying for the Engineer role at Acme."), third);
      assert.ok(findLetterDefects(`Dear Hiring Manager,\n\nAlex Tester built agents. ${"I built agent platforms, shipped them, and measured results. ".repeat(14)}\n\n${"I built agent platforms, shipped them, and measured results. ".repeat(14)}\n\nSincerely,\nAlex Tester`, "Alex Tester", "Acme", "Engineer").some((d) => d.includes("third person")));
      const signed = `Dear Hiring Manager,\n\nI am applying for the Engineer role at Acme. ${"I built agent platforms, shipped them, and measured results. ".repeat(14)}\n\n${"I built agent platforms, shipped them, and measured results. ".repeat(14)}\n\nSincerely,\nAlex Tester\nalex@example.com`;
      assert.ok(!findLetterDefects(signed, "Alex Tester", "Acme", "Engineer").some((d) => d.includes("third person")), "sign-off name and contact lines are not third person");
      const stray = repairLetterStructure("Dear Hiring Manager,\n\nI am applying for the Engineer role at Xero. I at Xero: I designed backends.", "Dang Khoa Le", "Xero", "Engineer");
      assert.ok(stray.includes("Xero. I designed backends.") && !stray.includes("I at Xero"), stray);
      const garbled = repairLetterStructure("Dear Hiring Manager,\n\nI am applying for the Senior Engineer position at Airwalexecss.\n\nSincerely,\nDang Khoa Le", "Dang Khoa Le", "Airwallex", "Senior Engineer");
      assert.ok(garbled.includes("at Airwallex.") && !garbled.includes("Airwalexecss"), garbled);
      assert.ok(findLetterDefects(`Dear Hiring Manager,\n\nI am applying for the Engineer role at Acme. This is directly addressing your need for reliability. ${"I built agent platforms, shipped them, and measured results. ".repeat(14)}\n\n${"I built agent platforms, shipped them, and measured results. ".repeat(14)}\n\nSincerely,\nDang Khoa Le`, "Dang Khoa Le", "Acme", "Engineer").some((d) => d.includes("requirements")));
      assert.ok(findLetterDefects(`Dear Hiring Manager,\n\nI am applying for the Staff Software Engineer, AI Tooling role at Airwallex. Staff Software Engineer, AI Tooling position at Airwallex, demonstrated by leading work. ${"I built agent platforms, shipped them, and measured results. ".repeat(14)}\n\n${"I built agent platforms, shipped them, and measured results. ".repeat(14)}\n\nSincerely,\nDang Khoa Le`, "Dang Khoa Le", "Airwallex", "Staff Software Engineer, AI Tooling").some((d) => d.includes("bare sentence")));
      const wall = "I built agent platforms, shipped them, and measured results across teams. ".repeat(12).trim();
      const split = repairLetterStructure(`Dear Hiring Manager,\n\nI am applying for the Engineer role at Acme. ${wall}\n\nSincerely,\nDang Khoa Le`, "Dang Khoa Le", "Acme", "Engineer");
      assert.ok(split.split(/\n{2,}/).filter((b) => WORDS_(b) > 25).length >= 2, split);
      const titled = repairLetterStructure("Dear Hiring Manager,\n\nI am applying for the Senior Engineer - AI Platform role at Xero.\n\nSenior Software Engineer - AI Platform at Xero, I designed and delivered a platform.\n\nSincerely,\nDang Khoa Le", "Dang Khoa Le", "Xero", "Senior Engineer - AI Platform");
      assert.ok(titled.includes("\n\nI designed and delivered a platform.") && !titled.includes("Software Engineer - AI Platform at Xero, I"), titled);
      const withContact = `Dear Hiring Manager,\n\nI am applying for the Engineer role at Acme. ${"I built agent platforms, shipped them, and measured results. ".repeat(14)}\n\n${"I built agent platforms, shipped them, and measured results. ".repeat(14)}\n\nSincerely,\nDang Khoa Le\n0450445373 | liam@example.com | https://example.com/me`;
      const contactDefects = findLetterDefects(withContact, "Dang Khoa Le", "Acme", "Engineer");
      assert.ok(!contactDefects.some((d) => d.includes("sign-off") || d.includes("fragment")), contactDefects.join("; "));
      const subject = repairLetterStructure("Dear Hiring Manager,\n\nSubject: AI Engineer - Alex Tester\n\nDear Hiring Manager,\n\nI am applying for the AI Engineer role at Acme.", "Alex Tester", "Acme", "AI Engineer");
      assert.ok(!/Subject:/.test(subject) && (subject.match(/Dear Hiring Manager,/g) || []).length === 1, subject);
      const slash = repairLetterStructure("Dear Hiring Manager,\n\nAs Senior AI/ML Engineer at Artificial Analysis, I am applying for the Senior AI / ML Engineer position at Artificial Analysis.\n\nSincerely,\nDang Khoa Le", "Dang Khoa Le", "Artificial Analysis", "Senior AI / ML Engineer");
      assert.ok(!slash.includes("As Senior AI/ML Engineer at Artificial Analysis, I") && slash.includes("I am applying for the Senior AI / ML Engineer position"), slash);
      assert.ok(findLetterDefects("Dear Hiring Manager,\n\nAs Senior AI/ML Engineer at Artificial Analysis, I am applying for it. " + "I built agent platforms, shipped them, and measured results. ".repeat(14) + "\n\n" + "I built agent platforms, shipped them, and measured results. ".repeat(14) + "\n\nSincerely,\nDang Khoa Le", "Dang Khoa Le", "Artificial Analysis", "Senior AI / ML Engineer").some((d) => d.includes("job title as past experience")));
      assert.ok(repairLetterStructure("Dear Recruiter,\n\nI am applying for the Engineer role at Acme.", "Dang Khoa Le", "Acme", "Engineer").startsWith("Dear Hiring Manager,\n\n"));
      assert.ok(repairLetterStructure("Dear Hiring Team\n\nI am applying for the Engineer role at Acme.", "Dang Khoa Le", "Acme", "Engineer").startsWith("Dear Hiring Manager,\n\n"));
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
