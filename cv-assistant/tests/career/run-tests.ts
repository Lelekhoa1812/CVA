import assert from "node:assert/strict";
import { resolveAutoApplySupervisorModelName, resolveModelName } from "../../src/lib/ai";
import { answerEmployerQuestionFromGroundTruth } from "../../src/lib/auto-apply/answering";
import { toComputerScreenshotOutput, toResponsesImagePart } from "../../src/lib/auto-apply/browser";
import { isVisibleBrowserEnabled, startVisibleBrowserSession } from "../../src/lib/auto-apply/browser-session";
import { suggestGroundTruthSelection } from "../../src/lib/auto-apply/ground-truth";
import { rankAutoApplyCandidates } from "../../src/lib/auto-apply/ranking";
import { refineAutoApplyProfileDraft } from "../../src/lib/auto-apply/profile-draft";
import { saveAnswerSchema, submitApplicationSchema } from "../../src/lib/auto-apply/types";
import { validateResumeDraft } from "../../src/lib/career/ats";
import { scoreLeadFit } from "../../src/lib/career/career-strategist";

type GroundTruthProfileInput = Parameters<typeof suggestGroundTruthSelection>[0];

// Deterministic tests: avoid flaking on live LLM output when API keys are present
process.env.CONTROL_ROOM_STRATEGIST_MODE = "heuristic";
import { classifyLeadLiveness } from "../../src/lib/career/liveness";
import type { ResumeDraft, UserContextSnapshot } from "../../src/lib/career/types";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const context: UserContextSnapshot = {
  targetRoles: ["Software Engineer"],
  archetypes: ["product engineer"],
  compensation: {
    currency: "AUD",
    targetMin: 140000,
    targetMax: 190000,
    salaryFloor: 130000,
  },
  workPreferences: {
    modes: ["remote", "hybrid"],
    preferredLocations: ["Melbourne"],
    avoidLocations: [],
    visaStatus: "",
    remoteOnly: true,
  },
  searchPreferences: {
    jobTitles: ["Software Engineer"],
    locations: ["Melbourne"],
    sources: ["linkedin"],
    remoteOnly: true,
  },
  techStackPreferences: ["react", "typescript", "node", "aws"],
  cultureSignals: [
    { label: "builder culture", weight: 0.8 },
    { label: "clear ownership", weight: 0.7 },
  ],
  proofPoints: ["Built React and Node products on AWS."],
  learnedExclusions: [],
  scoreFloor: 70,
  outreachPreferences: {
    channels: ["email", "linkedin"],
    tone: "confident",
  },
  candidateFacts: [
    {
      kind: "experience",
      title: "Platform Engineer",
      sourceLabel: "Profile",
      summary: "Built React, TypeScript, Node, and AWS systems.",
      evidence: ["React", "TypeScript", "Node", "AWS"],
      keywords: ["react", "typescript", "node", "aws"],
      impact: "Delivered production systems.",
      confidence: 0.9,
    },
  ],
  storyBank: [
    {
      title: "Platform launch",
      situation: "Team needed a scalable app.",
      task: "Own full-stack delivery.",
      action: "Built React and Node services.",
      result: "Released production workflow.",
      reflection: "",
      tags: ["react", "node", "aws"],
      confidence: 0.8,
    },
  ],
};

const baseDraft: ResumeDraft = {
  headline: "Candidate - Software Engineer",
  summary: "Software engineer delivering React, TypeScript, Node, and AWS systems.",
  competencies: ["react", "typescript", "node", "aws"],
  experiences: [
    {
      company: "Acme",
      role: "Software Engineer",
      period: "2022 - Present",
      bullets: ["Built React and TypeScript interfaces backed by Node services on AWS."],
    },
  ],
  projects: [
    {
      name: "Workflow Platform",
      label: "Selected proof point",
      bullets: ["Created AWS-backed workflow tooling with React and Node."],
    },
  ],
  education: [
    {
      school: "University",
      credential: "Computer Science",
      period: "2020 - 2024",
    },
  ],
  skills: ["react", "typescript", "node", "aws"],
  languages: ["English"],
  requirementCoverage: [],
};

const tests: TestCase[] = [
  {
    name: "auto apply model routing preserves global presets",
    run: () => {
      const previousSupervisor = process.env.AUTO_APPLY_SUPERVISOR_MODEL;
      delete process.env.AUTO_APPLY_SUPERVISOR_MODEL;

      assert.equal(resolveModelName("hard"), process.env.AZURE_AI_FOUNDRY_MODEL || "gpt-5.4-mini");
      assert.equal(resolveModelName("easy"), "gpt-5-nano");
      assert.equal(resolveModelName("document"), "gpt-5.4-mini");
      assert.equal(resolveAutoApplySupervisorModelName(), "gpt-5.4");

      if (previousSupervisor) process.env.AUTO_APPLY_SUPERVISOR_MODEL = previousSupervisor;
    },
  },
  {
    name: "auto apply screenshot maps to Responses image input",
    run: () => {
      const part = toResponsesImagePart({
        base64: Buffer.from("png").toString("base64"),
        detail: "original",
      });

      assert.equal(part.type, "input_image");
      assert.equal(part.detail, "original");
      assert.ok(part.image_url.startsWith("data:image/png;base64,"));
    },
  },
  {
    name: "auto apply computer screenshot maps to computer call output",
    run: () => {
      const output = toComputerScreenshotOutput({
        callId: "call_123",
        base64: Buffer.from("png").toString("base64"),
      });

      assert.equal(output.type, "computer_call_output");
      assert.equal(output.call_id, "call_123");
      assert.equal(output.output.type, "computer_screenshot");
      assert.equal(output.output.detail, "original");
    },
  },
  {
    name: "auto apply browser defaults to production attempt and explicit disable falls back cleanly",
    run: async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      const previousBrowserEnabled = process.env.AUTO_APPLY_BROWSER_ENABLED;
      const previousHeadless = process.env.AUTO_APPLY_BROWSER_HEADLESS;

      process.env.NODE_ENV = "production";
      delete process.env.AUTO_APPLY_BROWSER_ENABLED;
      delete process.env.AUTO_APPLY_BROWSER_HEADLESS;
      assert.equal(isVisibleBrowserEnabled(), true);

      process.env.AUTO_APPLY_BROWSER_ENABLED = "false";
      const disabled = await startVisibleBrowserSession("test-browser-session", "https://example.com");
      assert.equal(disabled.mode, "manual_guided");
      assert.equal(disabled.reason, "browser_unavailable");
      assert.match(disabled.guidance || "", /disabled on this deployment/i);

      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousBrowserEnabled === undefined) delete process.env.AUTO_APPLY_BROWSER_ENABLED;
      else process.env.AUTO_APPLY_BROWSER_ENABLED = previousBrowserEnabled;
      if (previousHeadless === undefined) delete process.env.AUTO_APPLY_BROWSER_HEADLESS;
      else process.env.AUTO_APPLY_BROWSER_HEADLESS = previousHeadless;
    },
  },
  {
    name: "auto apply ranking dedupes jobs and flags restricted sources",
    run: () => {
      const ranked = rankAutoApplyCandidates({
        prompt: "Senior AI Engineer RAG LLM Melbourne",
        groundTruthSnapshot: {
          items: [
            {
              title: "AI Platform",
              summary: "Built LLM and RAG systems with TypeScript and healthcare AI workflows.",
              evidence: ["LLM", "RAG", "healthcare AI"],
            },
          ],
        },
        mustHaveKeywords: ["LLM"],
        excludeKeywords: ["door to door"],
        companyBlacklist: ["BadCo"],
        jobs: [
          {
            source: "seek",
            title: "Senior AI Engineer",
            company: "GoodCo",
            location: "Melbourne",
            descriptionText: "LLM RAG healthcare AI role.",
            dedupeKey: "same",
          },
          {
            source: "seek",
            title: "Senior AI Engineer",
            company: "GoodCo",
            location: "Melbourne",
            descriptionText: "Duplicate.",
            dedupeKey: "same",
          },
          {
            source: "linkedin",
            title: "AI Engineer",
            company: "AnotherCo",
            location: "Remote Australia",
            descriptionText: "LLM platform role.",
          },
        ],
      });

      assert.equal(ranked.length, 2);
      assert.ok(ranked[0].fitScore >= 70);
      assert.ok(ranked.some((job) => job.riskFlags.includes("restricted_source_manual_guidance")));
    },
  },
  {
    name: "auto apply ranking keeps placeholder-company duplicates",
    run: () => {
      const ranked = rankAutoApplyCandidates({
        prompt: "Software Engineer",
        groundTruthSnapshot: { items: [] },
        jobs: [
          {
            source: "seek",
            title: "Software Engineer",
            company: "Unknown",
            location: "Melbourne",
            descriptionText: "Platform role.",
            dedupeKey: "seek-1",
          },
          {
            source: "careerone",
            title: "Software Engineer",
            company: "Unknown",
            location: "Melbourne",
            descriptionText: "Potentially different result.",
            dedupeKey: "careerone-1",
          },
        ],
      });

      assert.equal(ranked.length, 2);
    },
  },
  {
    name: "auto apply profile draft refinement keeps prompt compact and filters selective",
    run: () => {
      const refined = refineAutoApplyProfileDraft(
        {
          prompt:
            "Senior software engineer focused on React, TypeScript, Node.js, AWS, CI/CD, stakeholder management, and end-to-end delivery across product teams.",
          seniority: "Senior",
          mustHaveKeywords: [
            "React, TypeScript, Node.js, AWS",
            "stakeholder management",
            "software engineer",
            "CI/CD",
            "TypeScript",
          ],
          excludeKeywords: ["door to door", "Door to door", "team player"],
          companyBlacklist: ["BadCo", "badco", " AnotherCo "],
        },
        {
          experiences: [{ role: "Senior Software Engineer", companyName: "Acme", summary: "Built React and Node products." }],
        } as GroundTruthProfileInput & Parameters<typeof refineAutoApplyProfileDraft>[1],
      );

      assert.ok(refined.prompt.split(/\s+/).length <= 8);
      assert.ok(refined.mustHaveKeywords.length <= 4);
      assert.ok(!refined.mustHaveKeywords.some((keyword) => keyword.toLowerCase() === "software engineer"));
      assert.deepEqual(refined.companyBlacklist, ["BadCo", "AnotherCo"]);
      assert.deepEqual(refined.excludeKeywords, ["door to door"]);
    },
  },
  {
    name: "auto apply ground truth suggestion prefers relevant profile evidence",
    run: () => {
      const profileDraft: GroundTruthProfileInput = {
        experiences: [
          {
            companyName: "MedSwin",
            role: "AI Engineer",
            summary: "Built LLM and RAG systems for healthcare workflows.",
          },
        ],
        projects: [
          {
            name: "Enterprise AI Platform",
            summary: "Deployed agentic systems and semantic search.",
          },
        ],
        skills: "LLM, RAG, healthcare AI",
      };

      const ids = suggestGroundTruthSelection(
        profileDraft,
        "Senior AI/ML Engineer with LLM and RAG focus",
      );

      assert.ok(ids.length > 0);
      assert.ok(ids.some((id) => id.startsWith("experience:") || id.startsWith("project:")));
    },
  },
  {
    name: "auto apply answerer requires user input for unsupported sensitive questions",
    run: () => {
      const result = answerEmployerQuestionFromGroundTruth({
        question: "What is your visa status and work rights?",
        groundTruthSnapshot: {
          items: [{ title: "Project", summary: "Built RAG systems.", evidence: ["RAG"] }],
        },
      });

      assert.equal(result.requiresUserReview, true);
      assert.equal(result.answer, "");
      assert.ok(result.reason.includes("sensitive"));
    },
  },
  {
    name: "auto apply reusable memory requires explicit consent",
    run: () => {
      const parsed = saveAnswerSchema.parse({
        questionPattern: "Notice period",
        answer: "Available in four weeks.",
        scope: "reusable_profile",
      });

      assert.equal(parsed.explicitReusableConsent, false);
    },
  },
  {
    name: "auto apply submit schema requires explicit confirmation",
    run: () => {
      assert.equal(submitApplicationSchema.parse({ confirmSubmit: false }).confirmSubmit, false);
      assert.equal(submitApplicationSchema.parse({ confirmSubmit: true }).confirmSubmit, true);
    },
  },
  {
    name: "liveness marks closed listings as expired",
    run: () => {
      const result = classifyLeadLiveness({
        bodyText: "This job has expired and is no longer open.",
        finalUrl: "https://example.com/jobs/123",
        statusCode: 200,
      });

      assert.equal(result.liveStatus, "expired");
    },
  },
  {
    name: "liveness marks listings with apply controls as active",
    run: () => {
      const result = classifyLeadLiveness({
        bodyText: `${"Product engineering role. ".repeat(20)} Apply now to start your application.`,
        finalUrl: "https://example.com/jobs/active",
        statusCode: 200,
      });

      assert.equal(result.liveStatus, "active");
    },
  },
  {
    name: "ATS validation catches placeholder or unsupported claim markers",
    run: () => {
      const report = validateResumeDraft(
        {
          ...baseDraft,
          experiences: [
            {
              ...baseDraft.experiences[0],
              bullets: ["Delivered <metric> improvement using React and TypeScript."],
            },
          ],
        },
        { keywords: ["react", "typescript", "node", "aws"], pageBudget: 2 },
      );

      assert.equal(report.unsupportedClaims, 1);
      assert.equal(report.passed, false);
    },
  },
  {
    name: "ATS validation passes a complete citation-safe draft",
    run: () => {
      const report = validateResumeDraft(baseDraft, {
        keywords: ["react", "typescript", "node", "aws"],
        pageBudget: 2,
      });

      assert.equal(report.passed, true);
      assert.equal(report.keywordCoverage, 100);
    },
  },
  {
    name: "strategist prioritizes high-fit remote roles with covered evidence",
    run: async () => {
      const result = await scoreLeadFit(
        {
          title: "Software Engineer",
          location: "Remote Australia",
          company: "Acme",
          canonicalJobDescription: "React TypeScript Node AWS role.",
          extractedKeywords: ["react", "typescript", "node", "aws"],
          salaryText: "AUD 145k - 170k",
          remotePolicy: "remote",
          companySignals: ["builder culture", "clear ownership"],
          liveStatus: "active",
        },
        context,
        {
          evaluationCount: 0,
          skippedCount: 0,
          prioritizedCount: 0,
          commonExclusions: [],
          winningKeywords: [],
        },
      );

      assert.equal(result.recommendation, "prioritize");
      assert.ok(result.fitScore >= context.scoreFloor);
    },
  },
  {
    name: "strategist skips roles that violate remote-only constraints",
    run: async () => {
      const result = await scoreLeadFit(
        {
          title: "Software Engineer",
          location: "Sydney office",
          company: "OfficeCo",
          canonicalJobDescription: "React TypeScript Node role.",
          extractedKeywords: ["react", "typescript", "node"],
          salaryText: "AUD 160k",
          remotePolicy: "onsite",
          companySignals: ["builder culture"],
          liveStatus: "active",
        },
        context,
        {
          evaluationCount: 1,
          skippedCount: 0,
          prioritizedCount: 1,
          commonExclusions: [],
          winningKeywords: ["react"],
        },
      );

      assert.equal(result.recommendation, "skip");
      assert.ok(result.gapMap.some((gap) => gap.title === "Work-mode mismatch" || gap.code === "work_mode_mismatch"));
    },
  },
];

async function runTests() {
  let failures = 0;

  for (const testCase of tests) {
    try {
      await testCase.run();
      console.log(`✓ ${testCase.name}`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${testCase.name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  } else {
    console.log(`All ${tests.length} career unit tests passed.`);
  }
}

void runTests();
