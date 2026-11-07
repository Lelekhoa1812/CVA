/** Guards for the cover-letter agent that must hold regardless of the model. Run with `npm run test:auto-apply`. */
import assert from "node:assert/strict";
import { extractTechTerms, findLetterDefects, findUnsupportedClaims, repairLetterStructure, stripUnsupportedSentences } from "../../src/lib/cover-letter-service";

const profile = {
  name: "Dang Khoa Le",
  skills: ["Python", "PyTorch", "FastAPI", "OpenTelemetry"],
  experiences: [{ companyName: "Mizco", role: "AI Team Lead", description: "Led an enterprise AI platform with FastAPI and OpenTelemetry." }],
};
const posting = "Neara needs a Senior Machine Learning Engineer with PyTorch and TensorFlow experience, LiDAR and imagery data, and C# for tooling.";
const letter = "I am applying for the Senior Machine Learning Engineer role at Neara. At Mizco I built a platform with PyTorch and FastAPI. I also have deep TensorFlow experience across LiDAR and imagery data. I enjoy working in C# as well.";

const tests: Array<{ name: string; run: () => void }> = [
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
