/** Guards for the cover-letter agent that must hold regardless of the model. Run with `npm run test:auto-apply`. */
import assert from "node:assert/strict";
import { PREPARE_HARD_DEADLINE_MS, PREPARE_START_CUTOFF_MS } from "../../src/lib/auto-apply/engine";
import { isMissingInputRemark, isNonClaimRemark, issueQuotesEvidence } from "../../src/lib/generate/claim-check";
import { NoEvidenceError, buildRecordLetter, describeClaim, extractTechTerms, findLetterDefects, findUnsupportedClaims, isThinProfile, repairLetterStructure, runCoverLetterAgent, stripUnsupportedSentences } from "../../src/lib/cover-letter-service";

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
    name: "repairs: 'Senior AI/ML Engineer <Name> brings ...' becomes 'I bring ...'",
    run: () => {
      const letter = "Dear Hiring Manager,\n\nI am applying for the Senior AI/ML Engineer role at Artificial Analysis. Senior AI/ML Engineer Dang Khoa Le brings experience leading forecasting infrastructure. I also built ETL pipelines.\n\nSincerely,\nDang Khoa Le";
      const fixed = repairLetterStructure(letter, "Dang Khoa Le", "Artificial Analysis", "Senior AI/ML Engineer");
      assert.ok(fixed.includes("Artificial Analysis. I bring experience leading forecasting infrastructure."), fixed);
      assert.ok(!findLetterDefects(fixed, "Dang Khoa Le", "Artificial Analysis", "Senior AI/ML Engineer").some((d) => /third person/.test(d)), fixed);
      assert.ok(fixed.endsWith("Sincerely,\nDang Khoa Le"), fixed);
    },
  },
  {
    name: "repairs: an orphan 'This platform ...' first sentence is dropped when the opening is added; model-check issues phrased 'The candidate states ...' are filtered too",
    run: () => {
      const letter = "Dear Hiring Manager,\n\nThis platform includes diagram generation for faster onboarding. At Mizco, I led the Axis platform and built ETL pipelines.\n\nSincerely,\nDang Khoa Le";
      const fixed = repairLetterStructure(letter, "Dang Khoa Le", "Xero", "Senior Engineer");
      assert.ok(fixed.startsWith("Dear Hiring Manager,\n\nI am applying for the Senior Engineer role at Xero. At Mizco, I led the Axis platform"), fixed);
      const evidence = JSON.stringify([{ title: "Mizco", description: "Led end-to-end architecture and production delivery of an enterprise AI platform that transformed unstructured RFQ corpora into governed artifacts under a Trust-First AI model." }]);
      assert.ok(issueQuotesEvidence("The candidate states they led end-to-end architecture and production delivery of an enterprise AI platform at Mizco to transform unstructured RFQ corpora into governed artifacts under a Trust-First - not shown", evidence));
    },
  },
  {
    name: "repairs: a verbless 'AI Software Engineer at <Company> who ...' sentence becomes 'I am an ...'",
    run: () => {
      const letter = "Dear Hiring Manager,\n\nI am applying for the Senior Engineer - AI Agentic role at Xero. AI Software Engineer at Axion Solutions who architected a modular workflow engine. I also built ETL pipelines.\n\nSincerely,\nDang Khoa Le";
      const fixed = repairLetterStructure(letter, "Dang Khoa Le", "Xero", "Senior Engineer - AI Agentic");
      assert.ok(fixed.includes("Xero. I am an AI Software Engineer at Axion Solutions who architected a modular workflow engine."), fixed);
      const fine = "Dear Hiring Manager,\n\nI am applying for the Senior Engineer role at Xero. I am a Software Engineer at Axion Solutions who built things.\n\nSincerely,\nDang Khoa Le";
      assert.ok(repairLetterStructure(fine, "Dang Khoa Le", "Xero", "Senior Engineer").includes("I am a Software Engineer at Axion Solutions who built things."));
    },
  },
  {
    name: "scale and infrastructure terms that only the posting mentions are flagged once; terms in the CV are not",
    run: () => {
      const text = "I built data pipelines processing terabyte-scale data and maintained Linux systems with Docker.";
      const claims = findUnsupportedClaims(text, { skills: ["Docker", "Python"] } as never, "Acme");
      assert.deepEqual(claims.filter((claim) => /terabyte|linux|docker/.test(claim)).sort(), ["linux", "terabyte"]);
      assert.deepEqual(findUnsupportedClaims(text, { skills: ["Docker", "Linux", "terabyte datasets"] } as never, "Acme").filter((claim) => /terabyte|linux/.test(claim)), []);
    },
  },
  {
    name: "repairs: requirement-talk sentences are dropped and an opening that never names the role and company gets one",
    run: () => {
      const letter = "Dear Hiring Manager,\n\nI seek to apply my experience with Kubernetes. In my role at Axion Solutions, I led the Axis platform. My experience directly aligns with Airwallex's need for reliable internal tooling. I also built ETL pipelines.\n\nI would welcome the opportunity to discuss.\n\nSincerely,\nDang Khoa Le";
      const fixed = repairLetterStructure(letter, "Dang Khoa Le", "Airwallex", "Staff Software Engineer, AI Tooling");
      assert.ok(fixed.includes("I am applying for the Staff Software Engineer, AI Tooling role at Airwallex. I seek to apply"), fixed);
      assert.ok(!/directly aligns/.test(fixed) && /I also built ETL pipelines\./.test(fixed), fixed);
      assert.ok(/Axis platform\. I also built ETL pipelines\./.test(fixed), "the space between sentences is kept: " + fixed);
      const long = repairLetterStructure("Dear Hiring Manager,\n\nI am applying for the Agent Deployment Engineer role at Decagon. I led the Axis platform. My work reducing operational overhead through a controllable platform that meets strict SLAs directly aligns with Decagon's need for reliable, scalable AI agent deployment. I also built ETL pipelines.\n\nSincerely,\nDang Khoa Le", "Dang Khoa Le", "Decagon", "Agent Deployment Engineer");
      assert.ok(!/aligns with/.test(long) && /Axis platform\. I also built ETL pipelines\./.test(long), long);
      assert.ok(findLetterDefects(letter, "Dang Khoa Le", "Airwallex", "Staff Software Engineer, AI Tooling").some((d) => /requirements/.test(d)));
      const fine = "Dear Hiring Manager,\n\nI am applying for the Staff Software Engineer, AI Tooling role at Airwallex. I built tooling.\n\nSincerely,\nDang Khoa Le";
      assert.equal((repairLetterStructure(fine, "Dang Khoa Le", "Airwallex", "Staff Software Engineer, AI Tooling").match(/I am applying for/g) || []).length, 1);
    },
  },
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
    name: "tool names and wording that only the posting has are flagged and stripped (Xero production letter)",
    run: () => {
      const jd = "Senior Engineer - AI Builder. Integrate systems via APIs and design clean data structures using Jira, Confluence and enterprise data warehouses. Treat internal stakeholders as valued customers and drive rapid prototyping.";
      const profile = { name: "Dang Khoa Le", experiences: [{ companyName: "Harry the Hirer", description: "Built a multi-agent RAG platform on Azure with context pruning and HNSW indexing. Wrote Python services and exposed REST APIs. Designed and operated services for planning, retrieval and verification across several teams and many releases over a long period of delivery. Designed and operated services for planning, retrieval and verification across several teams and many releases over a long period of delivery. Designed and operated services for planning, retrieval and verification across several teams and many releases over a long period of delivery. Designed and operated services for planning, retrieval and verification across several teams and many releases over a long period of delivery. Designed and operated services for planning, retrieval and verification across several teams and many releases over a long period of delivery. Designed and operated services for planning, retrieval and verification across several teams and many releases over a long period of delivery. Designed and operated services for planning, retrieval and verification across several teams and many releases over a long period of delivery. Designed and operated services for planning, retrieval and verification across several teams and many releases over a long period of delivery." }, { companyName: "Axion", description: "Architect a LangChain workflow engine for capital-markets automation." }] };
      const bad = "Dear Hiring Manager,\n\nI am applying for the Senior Engineer - AI Builder role at Xero. At Harry the Hirer I built a multi-agent RAG platform on Azure with context pruning and HNSW indexing, and exposed the services as REST APIs for the business and its planning teams, which kept the platform reliable under changing load.\n\nI integrated systems via APIs and designed clean data structures using Jira, Confluence, and enterprise data warehouses while treating internal stakeholders as valued customers and driving rapid prototyping. At Axion I architect a LangChain workflow engine for capital-markets automation, with version-controlled components and governed AI pipelines that investors rely on every day.\n\nI would welcome the opportunity to discuss how my background fits the role.\n\nDang Khoa Le";
      const found = findUnsupportedClaims(bad, profile as never, "Xero", jd, "Senior Engineer - AI Builder");
      assert.ok(found.some((term) => term === "posting name: jira"), `jira: ${found}`);
      assert.ok(found.some((term) => term === "posting name: confluence"), `confluence: ${found}`);
      assert.ok(found.some((term) => term.startsWith("posting wording: ")), `wording: ${found}`);
      const stripped = stripUnsupportedSentences(bad + "\n\nAcross these roles I wrote Python services, exposed REST APIs and kept the work observable, so each platform could be operated by a small team without a dedicated support rota or manual interventions each week.", found, "Xero");
      assert.ok(stripped && !/Jira|Confluence|rapid prototyping/.test(stripped), String(stripped));
      assert.ok(/Axion I architect|Harry the Hirer I built/.test(stripped || ""));
      // A letter built from the CV, with a closing sentence of ordinary words, is left alone.
      const good = "Dear Hiring Manager,\n\nI am applying for the Senior Engineer - AI Builder role at Xero. At Harry the Hirer I built a multi-agent RAG platform on Azure with context pruning and HNSW indexing, and exposed it through REST APIs.\n\nI would welcome the opportunity to discuss how my background and approach to complex problems fit the mission of the team.\n\nDang Khoa Le";
      assert.deepEqual(findUnsupportedClaims(good, profile as never, "Xero", jd, "Senior Engineer - AI Builder"), []);
    },
  },
  {
    name: "thin CV: invented detail is flagged, record-bound sentences pass, percent figures compare with %",
    run: () => {
      const sparse = { name: "Omar Haddad", major: "Diploma of Hospitality", school: "William Angliss Institute", skills: "Barista skills, food safety.", experiences: [{ companyName: "Corner Cafe", role: "Barista", description: "Made coffee and served customers on weekends." }], projects: [] };
      assert.ok(isThinProfile(sparse as never));
      assert.ok(!isThinProfile({ name: "X", experiences: [{ companyName: "A", description: Array.from({ length: 130 }, (_, i) => `word${i}`).join(" ") }] } as never));
      const jd = "Barista to prepare espresso drinks and serve customers.";
      const honest = "Dear Hiring Manager,\n\nI am applying for the Barista role at Industry Beans. At Corner Cafe I made coffee and served customers on weekends, and I hold a Diploma of Hospitality from William Angliss Institute.\n\nI would welcome the opportunity to discuss the role.\n\nOmar Haddad";
      assert.deepEqual(findUnsupportedClaims(honest, sparse as never, "Industry Beans", jd, "Barista"), []);
      const padded = "Dear Hiring Manager,\n\nI am applying for the Barista role at Industry Beans. At Corner Cafe I made coffee and served customers on weekends. I operated commercial equipment, processed payments and communicated special requests to the kitchen.\n\nI would welcome the opportunity to discuss the role.\n\nOmar Haddad";
      const found = findUnsupportedClaims(padded, sparse as never, "Industry Beans", jd, "Barista");
      assert.ok(found.some((term) => term.startsWith("invented detail: ")), String(found));
      const stripped = stripUnsupportedSentences(padded + "\n\n" + "Filler sentence that is long enough to keep the letter above the minimum length used by the strip step, and it is written only to keep the word count high enough for this test case to hold together as a real letter body.".repeat(2), found, "Industry Beans");
      assert.ok(stripped && !/processed payments/.test(stripped) && /made coffee and served customers/.test(stripped), String(stripped));
      const withFigure = { name: "A", experiences: [{ companyName: "B", description: "Reduced effort by 80%." }] };
      assert.ok(!findUnsupportedClaims("I reduced manual effort by 80 percent.", withFigure as never, "C", "", "D").some((term) => /percent|80/.test(term)));
      assert.ok(findUnsupportedClaims("I reduced data entry time by 40 percent.", withFigure as never, "C", "", "D").some((term) => /40/.test(term)));
    },
  },
  {
    name: "thin CV: the letter is built from the CV's own text and cannot contain invented detail",
    run: async () => {
      const sparse = { name: "Omar Haddad", major: "Diploma of Hospitality", school: "William Angliss Institute", skills: "Barista skills, food safety.", experiences: [{ companyName: "Corner Cafe", role: "Barista", description: "Made coffee and served customers on weekends." }], projects: [] };
      const letter = buildRecordLetter({ profile: sparse as never, company: "Crown Melbourne", title: "Restaurant Supervisor" });
      assert.ok(/^Dear Hiring Manager,/.test(letter) && /Sincerely,\nOmar Haddad$/.test(letter), letter);
      assert.ok(/I am applying for the Restaurant Supervisor role at Crown Melbourne\./.test(letter));
      assert.ok(/My education is a Diploma of Hospitality at William Angliss Institute\./.test(letter));
      assert.ok(/As a Barista at Corner Cafe, I made coffee and served customers on weekends\./.test(letter), letter);
      assert.ok(/Skills on my CV: Barista skills, food safety\./.test(letter));
      // Nothing in it is a claim the CV lacks, even against a posting full of duties.
      assert.deepEqual(findUnsupportedClaims(letter, sparse as never, "Crown Melbourne", "Restaurant Supervisor to lead a team of ten, manage rosters, supervise staff and handle complaints.", "Restaurant Supervisor"), []);
      // The pipeline returns it without a model call, for every redundancy, flagged only as short.
      const result = await runCoverLetterAgent({ profile: sparse as never, company: "Crown Melbourne", title: "Restaurant Supervisor", jobDescription: "Lead a team of ten." });
      assert.equal(result.model, "record-only");
      assert.equal(result.thin, true);
      assert.deepEqual((result.unsupportedClaims || []).filter((claim) => !claim.startsWith("the letter is short because")), []);
      // Bullets that are not verb-first are left out rather than rewritten.
      const mixed = buildRecordLetter({ profile: { name: "A B", experiences: [{ companyName: "X", role: "Clerk", description: "- Responsible for filing.\n- Filed 200 forms a week.\n- Strong communication skills." }], projects: [] } as never, company: "Y", title: "Z" });
      assert.ok(/I filed 200 forms a week\./.test(mixed) && !/Responsible|Strong communication/.test(mixed), mixed);
    },
  },
  {
    name: "a profile with nothing on record is refused instead of inventing a history",
    run: async () => {
      await assert.rejects(() => runCoverLetterAgent({ profile: { name: "Zoe Carter", experiences: [], projects: [] } as never, company: "Woolworths", title: "Customer Service Team Member", jobDescription: "Serve customers." }), (error: unknown) => error instanceof NoEvidenceError && /add some details to your profile/i.test((error as Error).message));
    },
  },
  {
    name: "repair removes dashes used as punctuation and fixes a gerund after 'I'",
    run: () => {
      const letter = "Dear Hiring Manager,\n\nI am applying for the Senior Accountant role at Kmart. I bringing six years of close experience, from quoting through to sign-off \u2014 and I ran 10\u201312 audits.\n\nI would welcome the opportunity to discuss the role.\n\nPriya Raman";
      const fixed = repairLetterStructure(letter, "Priya Raman", "Kmart", "Senior Accountant");
      assert.ok(!/[\u2013\u2014]/.test(fixed), fixed);
      assert.ok(/I bring six years/.test(fixed), fixed);
      assert.ok(/sign-off, and I ran 10-12 audits/.test(fixed), fixed);
      const fluff = repairLetterStructure("Dear Hiring Manager,\n\nI am applying for the Marketing Manager role at Xero. I run HubSpot lead scoring and email nurture programs at Northline, demonstrating my capability to own the full customer journey from awareness to conversion. At Fresh Pantry I launched 14 products across grocery chains, which required clear communication and patience.\n\nThis FMCG experience honed my ability to craft compelling narratives for brands.\n\nI, I managed a team of four and a $900,000 annual budget at Northline across several channels.\n\nI would welcome the opportunity to discuss the role.\n\nDaniel Ortiz", "Daniel Ortiz", "Xero", "Marketing Manager");
      assert.ok(!/demonstrating|which required|honed|I, I/.test(fluff), fluff);
      assert.ok(/HubSpot lead scoring and email nurture programs at Northline\./.test(fluff) && /launched 14 products across grocery chains\./.test(fluff) && /I managed a team of four/.test(fluff), fluff);
      assert.ok(!/\n{3,}/.test(fluff), "blank lines collapsed");
      const lead = repairLetterStructure("Dear Hiring Manager,\n\nI am applying for the Head of Product Marketing role at Canva. I with ten years leading marketing strategy across consumer brands and B2B software, including proven expertise and demonstrated success in demand generation for the business.\n\nI would welcome the opportunity to discuss the role.\n\nDaniel Ortiz", "Daniel Ortiz", "Canva", "Head of Product Marketing");
      assert.ok(/I bring ten years/.test(lead) && !/proven|demonstrated success/.test(lead), lead);
      const closer = repairLetterStructure("Dear Hiring Manager,\n\nI am applying for the Senior Engineer role at Xero. I built a multi-agent RAG platform on Azure with context pruning and HNSW indexing for an enterprise client in events.\n\nI would welcome the opportunity to discuss how this experience aligns with Xero's needs.\n\nDang Khoa Le", "Dang Khoa Le", "Xero", "Senior Engineer");
      assert.ok(/discuss the role\./.test(closer) && !/needs/.test(closer), closer);
      assert.ok(!findLetterDefects(closer, "Dang Khoa Le", "Xero", "Senior Engineer").some((defect) => /requirement/.test(defect)));
      assert.ok(/month-end/.test(repairLetterStructure("Dear Hiring Manager,\n\nI own the month\u2011end close. I am applying for the Senior Accountant role at Kmart.\n\nI would welcome the opportunity to discuss the role.\n\nPriya Raman", "Priya Raman", "Kmart", "Senior Accountant").replace("month-end", "month-end")));
    },
  },
  {
    name: "credentials and duties that only the posting states are flagged; ones the CV states pass",
    run: () => {
      const letter = "Dear Hiring Manager,\n\nI am applying for the Senior Accountant role at Kmart. I hold a CPA qualification and I led the month-end close for four entities. During this work I mentored junior accountants and reduced audit adjustments.\n\nI would welcome the opportunity to discuss the role.\n\nPriya Raman";
      const jd = "Senior Accountant. Mentor junior accountants. CPA or CA qualification required.";
      const withCpa = { name: "Priya Raman", profileSummary: "CPA-qualified accountant", experiences: [{ companyName: "Harbour", description: "Own the month-end close for four entities. Reduced audit adjustments." }] };
      const noCpa = { name: "Priya Raman", profileSummary: "Accountant", experiences: withCpa.experiences };
      const flagged = findUnsupportedClaims(letter, withCpa as never, "Kmart", jd, "Senior Accountant");
      assert.ok(!flagged.some((term) => term.startsWith("credential")), `CPA held: ${flagged}`);
      assert.ok(flagged.some((term) => term.startsWith("duty only the posting mentions")), `mentoring not flagged: ${flagged}`);
      assert.ok(findUnsupportedClaims(letter, noCpa as never, "Kmart", jd, "Senior Accountant").some((term) => term.startsWith("credential: ")));
      // A nurse who precepted graduates has mentored; the verb does not need to match.
      const nurse = { name: "Sam", experiences: [{ companyName: "Alfred", description: "Precepted six graduate nurses through their first rotation." }] };
      assert.ok(!findUnsupportedClaims("I mentored graduate nurses at the Alfred.", nurse as never, "RMH", "Mentor junior nurses.", "Registered Nurse").some((term) => term.startsWith("duty")));
      // The flagged sentence is removed, the rest kept.
      const stripped = stripUnsupportedSentences(`${letter}\n\nAt Harbour I own the month-end close for four entities and deliver reports on business day five, reconcile intercompany balances, and lodge quarterly BAS for a group with several entities and a large turnover. I also prepare management accounts and cash flow forecasts for thirty clients and train nobody. This experience fits the role well and I have enough words here to stay above the minimum length needed for the strip step to keep the letter, which is why this closing sentence runs a little longer than usual.`, ["duty only the posting mentions: mentored"], "Kmart");
      assert.ok(stripped && !/mentored/.test(stripped));
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
      // Possessive wording ("Candidate's claim to have ... is not supported ...") is read the same way.
      assert.ok(issueQuotesEvidence("Candidate's claim to have led a 6-person team delivering a Vietnamese-language AI assistant is not supported by any evidence in the candidate material", evidence));
      assert.ok(!issueQuotesEvidence("Candidate's claim to have led a 40-person team at Google is not supported by any evidence in the candidate material", evidence));
      // A remark about missing clarification answers is not a claim.
      assert.ok(isMissingInputRemark("No clarification answers provided to verify accuracy of job application draft claims"));
      assert.ok(!isMissingInputRemark("Candidate's claim to have led a 40-person team at Google is not supported"));
      // Role name from the posting, "implied relevance" and vague lines are not claims; a specific claim still is.
      assert.ok(isNonClaimRemark("The draft mentions the role 'Senior Software Engineer, AI Tooling, Information Security' at Airwallex, but there is no candidate evidence or clarification that confirms the candidate applied for or"));
      assert.ok(isNonClaimRemark("The draft implies relevance to 'Information Security' through terms like 'Trust-First AI model'"));
      assert.ok(isNonClaimRemark("Claims about leadership roles lack verification"));
      assert.ok(!isNonClaimRemark("Candidate's claim to have led a 40-person team at Google is not supported"));
      assert.ok(!isNonClaimRemark("The draft says the candidate managed 12 engineers at Atlassian"));
      assert.ok(!isNonClaimRemark("Claims about a 35% cost reduction lack verification"));
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
    console.error(`${failed} of ${tests.length} letter tests failed.`);
    process.exit(1);
  }
  console.log(`${tests.length} letter guard tests passed.`);
}
void main();
