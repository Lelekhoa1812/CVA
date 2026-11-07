/** Guards for the cover-letter agent that must hold regardless of the model. Run with `npm run test:auto-apply`. */
import assert from "node:assert/strict";
import { PREPARE_HARD_DEADLINE_MS, PREPARE_START_CUTOFF_MS } from "../../src/lib/auto-apply/engine";
import { issueQuotesEvidence } from "../../src/lib/generate/claim-check";
import { describeClaim, extractTechTerms, findLetterDefects, findUnsupportedClaims, repairLetterStructure, stripUnsupportedSentences } from "../../src/lib/cover-letter-service";

const profile = {
  name: "Dang Khoa Le",
  skills: ["Python", "PyTorch", "FastAPI", "OpenTelemetry"],
  experiences: [{ companyName: "Mizco", role: "AI Team Lead", description: "Led an enterprise AI platform with FastAPI and OpenTelemetry." }],
};
const posting = "Neara needs a Senior Machine Learning Engineer with PyTorch and TensorFlow experience, LiDAR and imagery data, and C# for tooling.";
const letter = "I am applying for the Senior Machine Learning Engineer role at Neara. At Mizco I built a platform with PyTorch and FastAPI. I also have deep TensorFlow experience across LiDAR and imagery data. I enjoy working in C# as well.";

const degreeProfile = { ...profile, major: "Bachelor of Software Engineer (Honours)", school: "Swinburne University of Technology" };

const tests: Array<{ name: string; run: () => void }> = [
  {
    name: "repairs: the employer's own title as an opening and a trailing 'aligning with your need' clause",
    run: () => {
      const letter = "Dear Hiring Manager,\n\nAs Decagon's Agent Deployment Engineer, I deliver end-to-end agent builds at Axion Solutions, directly aligning with your need for enterprise-grade AI solutions deployed at scale. I also led a team.\n\nSincerely,\nDang Khoa Le";
      const fixed = repairLetterStructure(letter, "Dang Khoa Le", "Decagon", "Agent Deployment Engineer");
      assert.ok(fixed.startsWith("Dear Hiring Manager,\n\nI am applying for the Agent Deployment Engineer role at Decagon. I deliver end-to-end agent builds at Axion Solutions."), fixed);
      assert.ok(!/your need/.test(fixed), fixed);
      assert.deepEqual(findLetterDefects(fixed, "Dang Khoa Le", "Decagon", "Agent Deployment Engineer").filter((d) => /employer's own|requirements/.test(d)), []);
    },
  },
  {
    name: "garbled openings that give the applicant the employer's job or call them a proposal are flagged; normal ones are not",
    run: () => {
      const wrap = (opening: string) => `Dear Hiring Manager,\n\n${opening}\n\nSincerely,\nDang Khoa Le`;
      const check = (opening: string) => findLetterDefects(wrap(opening), "Dang Khoa Le", "Decagon", "Agent Deployment Engineer");
      assert.ok(check("As Decagon's Agent Deployment Engineer, I propose an AI Software Engineer with proven end-to-end leadership.").length >= 2);
      assert.ok(!check("I am applying for the Agent Deployment Engineer role at Decagon. As an AI Software Engineer at Axion Solutions, I led the Axis platform.").some((d) => /employer's own|talks about the applicant/.test(d)));
      const fixed = repairLetterStructure(wrap("I am applying for the Agent Deployment Engineer role at Decagon with proven end-to-end delivery."), "Dang Khoa Le", "Decagon", "Agent Deployment Engineer");
      assert.ok(/with end-to-end delivery/.test(fixed), fixed);
    },
  },
  {
    name: "'proven experience' is flagged as stock filler",
    run: () => {
      const stock = "Dear Hiring Manager,\n\nAs an AI Software Engineer with proven experience building agents, I am applying for the Agent Deployment Engineer role at Decagon.\n\nSincerely,\nDang Khoa Le";
      assert.ok(findLetterDefects(stock, "Dang Khoa Le", "Decagon", "Agent Deployment Engineer").some((defect) => /stock filler/.test(defect)));
      const fixed = repairLetterStructure(stock, "Dang Khoa Le", "Decagon", "Agent Deployment Engineer");
      assert.ok(/with experience building agents/.test(fixed), fixed);
      assert.ok(!findLetterDefects(fixed, "Dang Khoa Le", "Decagon", "Agent Deployment Engineer").some((defect) => /stock filler/.test(defect)));
    },
  },
  {
    name: "model-check issues that quote the CV almost word for word are dropped; invented claims are kept",
    run: () => {
      const evidence = JSON.stringify([{ title: "CPG Seedcom", description: "Led a 6-person team delivering a Vietnamese-language AI assistant that converts business questions into executable SQL, reducing manual effort by 80%." }]);
      assert.ok(issueQuotesEvidence("Claimed 'leading a six-person team delivering a Vietnamese-language AI assistant' is not verified", evidence));
      assert.ok(!issueQuotesEvidence("The draft says 'managed a 40-engineer platform organisation at Google' which is not in the evidence", evidence));
      assert.ok(!issueQuotesEvidence("The letter claims strong leadership skills", evidence));
      assert.ok(issueQuotesEvidence("Claimed leading a six-person team delivering a Vietnamese-language AI assistant - the evidence only shows a summary", evidence));
      assert.ok(!issueQuotesEvidence("Claimed managing a 40-engineer platform organisation at Google - the evidence does not mention it", evidence));
    },
  },
  {
    name: "guard tokens are shown to the applicant in plain language",
    run: () => {
      assert.equal(describeClaim("posting term: tensorflow"), 'the tool or term "tensorflow", which only the job posting mentions');
      assert.match(describeClaim("echo: the development of ai tools"), /copied from the job posting/);
      assert.match(describeClaim("degree field: Biomedical Informatics"), /education record does not show/);
      assert.equal(describeClaim("five years"), "five years");
    },
  },
  {
    name: "a sign-off with the name that sits above the closing sentence is moved to the end",
    run: () => {
      const body = "I am applying for the Senior Engineer role at Xero. At Mizco I built a platform with FastAPI and OpenTelemetry. ".repeat(8).trim();
      const letter = `Dear Hiring Manager,\n\n${body}\n\nBest regards,\nDang Khoa Le\n\nI would welcome the opportunity to discuss how my experience fits the role.`;
      const fixed = repairLetterStructure(letter, "Dang Khoa Le", "Xero", "Senior Engineer");
      assert.ok(fixed.endsWith("Best regards,\nDang Khoa Le"), fixed.slice(-120));
      assert.ok(fixed.indexOf("I would welcome") < fixed.indexOf("Best regards"));
      assert.equal(repairLetterStructure(fixed, "Dang Khoa Le", "Xero", "Senior Engineer"), fixed);
    },
  },
  {
    name: "a degree field the education record does not give is flagged and its sentence stripped; the real degree is not",
    run: () => {
      const bad = "I am applying for the AI Engineer role at Xero. I hold a degree in Biomedical Informatics from Swinburne University where I led a team. At Mizco I built a platform with FastAPI and OpenTelemetry that routed enterprise documents through several services, which kept the pipeline observable and the support load low for the whole team. " + "I also wrote the Python tooling that checked each release against a set of regression cases before it reached customers, and I mentored two newer engineers on the team through their first production changes over the following year. " + "Over the same period I also reviewed pull requests, wrote the documentation for the service, and ran the weekly planning sessions that kept the work moving. " + "I would welcome the chance to bring the same habits to Xero and to talk through how they apply to the role.";
      const claims = findUnsupportedClaims(bad, degreeProfile, "Xero", undefined, "AI Engineer");
      assert.ok(claims.includes("degree field: Biomedical Informatics"), claims.join("; "));
      const stripped = stripUnsupportedSentences(bad, claims, "Xero") || "";
      assert.ok(!/Biomedical/.test(stripped) && /Mizco/.test(stripped), stripped);
      for (const good of ["I hold a Bachelor of Software Engineering (Honours) from Swinburne University.", "I have a Software Engineering degree from Swinburne.", "I hold an honours degree from Swinburne University."]) {
        assert.deepEqual(findUnsupportedClaims(good, degreeProfile, "Xero", undefined, "AI Engineer").filter((claim) => claim.startsWith("degree field:")), [], good);
      }
    },
  },
  {
    name: "tech terms: tools and acronyms are extracted, ordinary words and stop terms are not",
    run: () => {
      const terms = extractTechTerms("I used TensorFlow, LiDAR, CrewAI, C#, OAuth and AWS with AI and ML. Dear Hiring Manager, Neara builds twins.");
      for (const wanted of ["tensorflow", "lidar", "crewai", "c#", "oauth", "aws"]) assert.ok(terms.has(wanted), wanted);
      for (const unwanted of ["ai", "ml", "dear", "hiring", "neara"]) assert.ok(!terms.has(unwanted), unwanted);
    },
  },
  {
    name: "posting terms the CV never mentions are flagged; terms in the CV are not",
    run: () => {
      const claims = findUnsupportedClaims(letter, profile, "Neara", posting, "Senior Machine Learning Engineer");
      assert.ok(claims.includes("posting term: tensorflow"), claims.join("; "));
      assert.ok(claims.includes("posting term: lidar"), claims.join("; "));
      assert.ok(claims.includes("posting term: c#"), claims.join("; "));
      assert.ok(!claims.includes("posting term: pytorch"), "PyTorch is in the CV");
      assert.ok(!claims.includes("posting term: fastapi"), "FastAPI is not in the posting");
    },
  },
  {
    name: "a letter with no posting-only terms raises no posting-term flags",
    run: () => {
      const clean = "I am applying for the Senior Machine Learning Engineer role at Neara. At Mizco I built a platform with PyTorch and FastAPI.";
      assert.deepEqual(findUnsupportedClaims(clean, profile, "Neara", posting, "Senior Machine Learning Engineer").filter((claim) => claim.startsWith("posting term:")), []);
    },
  },
  {
    name: "sentences that assert a posting-only term are stripped, the rest of the letter stays",
    run: () => {
      const long = `${letter} ${"I led a team and shipped production systems at Mizco, measured results, and improved reliability. ".repeat(10)}`;
      const claims = findUnsupportedClaims(long, profile, "Neara", posting, "Senior Machine Learning Engineer");
      const stripped = stripUnsupportedSentences(long, claims, "Neara");
      assert.ok(stripped, "enough of the letter remains");
      assert.ok(!/TensorFlow|LiDAR|C#/.test(stripped as string), stripped as string);
      assert.ok(/PyTorch and FastAPI/.test(stripped as string));
    },
  },
  {
    name: "repair: garbled 'I as an <title> at X I led' and a bare title sentence are fixed, stock filler is trimmed",
    run: () => {
      const letter = "Dear Hiring Manager,\n\nI am applying for the Senior Software Engineer, AI Tooling role at Airwallex. Senior Software Engineer, AI Tooling at Airwallex. I as an AI Software Engineer at Axion Solutions I led a platform with proven ability to ship. I am excited to apply for this work.\n\nSincerely,\nDang Khoa Le";
      const fixed = repairLetterStructure(letter, "Dang Khoa Le", "Airwallex", "Senior Software Engineer, AI Tooling");
      assert.ok(fixed.includes("As an AI Software Engineer at Axion Solutions, I led"), fixed);
      assert.ok(!fixed.includes("Airwallex. Senior Software Engineer, AI Tooling at Airwallex."), fixed);
      assert.ok(fixed.includes("I am applying for the Senior Software Engineer, AI Tooling role at Airwallex."), fixed);
      assert.ok(!/proven ability|excited to apply/i.test(fixed), fixed);
      const dash = repairLetterStructure("Dear Hiring Manager,\n\nI am applying for the Staff Software Engineer, AI Tooling role at Airwallex. Staff Software Engineer, AI Tooling at Airwallex - as AI Software Engineer at Axion, I led a platform.\n\nSincerely,\nDang Khoa Le", "Dang Khoa Le", "Airwallex", "Staff Software Engineer, AI Tooling");
      assert.ok(dash.includes("Airwallex. As AI Software Engineer at Axion, I led a platform."), dash);
    },
  },
  {
    name: "repair: letterhead between two greetings is dropped; first-name third person becomes first person",
    run: () => {
      const header = repairLetterStructure("Dear Hiring Manager,\n\nAlex Tester\nalex@example.com\n\nDear Hiring Manager,\n\nI am applying for the Engineer role at Acme.\n\nSincerely,\nAlex Tester", "Alex Tester", "Acme", "Engineer");
      assert.equal((header.match(/Dear Hiring Manager,/g) || []).length, 1, header);
      assert.ok(header.startsWith("Dear Hiring Manager,\n\nI am applying"), header);
      const third = "Dear Hiring Manager,\n\nI am applying for the Engineer role at Acme. Alex built a Python bot.\n\nAt Acme, Alex created dashboards. Alex is ready to discuss.\n\nAlex Tester";
      assert.ok(findLetterDefects(third, "Alex Tester", "Acme", "Engineer").some((d) => d.includes("third person")));
      const fixed = repairLetterStructure(third, "Alex Tester", "Acme", "Engineer");
      assert.ok(fixed.includes("I built a Python bot.") && fixed.includes("I created dashboards.") && fixed.includes("I am ready to discuss."), fixed);
      assert.ok(!findLetterDefects(fixed, "Alex Tester", "Acme", "Engineer").some((d) => d.includes("third person")), fixed);
    },
  },
  {
    name: "repair: greeting spacing, 'I where I', em-dash title opening",
    run: () => {
      const spaced = repairLetterStructure("Dear Hiring Manager,\nI am applying for the Engineer role at Acme.\n\nSincerely,\nDang Khoa Le", "Dang Khoa Le", "Acme", "Engineer");
      assert.ok(spaced.startsWith("Dear Hiring Manager,\n\nI am applying"), spaced);
      const where = repairLetterStructure("Dear Hiring Manager,\n\nI am applying for the Engineer role at Acme. I where I architected a platform.\n\nSincerely,\nDang Khoa Le", "Dang Khoa Le", "Acme", "Engineer");
      assert.ok(where.includes("In that role, I architected a platform."), where);
      const dash = repairLetterStructure("Dear Hiring Manager,\n\nI am applying for the Senior Software Engineer, AI Tooling role at Airwallex. Senior Software Engineer, AI Tooling at Airwallex \u2014 led an enterprise platform at Mizco.\n\nSincerely,\nDang Khoa Le", "Dang Khoa Le", "Airwallex", "Senior Software Engineer, AI Tooling");
      assert.ok(dash.includes("Airwallex. I led an enterprise platform at Mizco."), dash);
    },
  },
  {
    name: "prepare runs: jobs only start early and every job must end inside the 300 s function limit",
    run: () => {
      assert.ok(PREPARE_HARD_DEADLINE_MS < 300_000, "deadline is inside the platform limit");
      assert.ok(PREPARE_HARD_DEADLINE_MS - PREPARE_START_CUTOFF_MS >= 150_000, "a job that starts at the cutoff still has at least 150 s");
      assert.ok(PREPARE_START_CUTOFF_MS >= 60_000, "the first batch always gets to start");
    },
  },
];

let failed = 0;
for (const test of tests) {
  try {
    test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${test.name}`);
    console.error(error);
  }
}
if (failed) {
  console.error(`${failed} of ${tests.length} letter tests failed.`);
  process.exit(1);
}
console.log(`${tests.length} letter guard tests passed.`);
