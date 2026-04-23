import assert from "node:assert/strict";
import { validateResumeDraft } from "../../src/lib/career/ats";
import { scoreLeadFit } from "../../src/lib/career/career-strategist";
import { classifyLeadLiveness } from "../../src/lib/career/liveness";
import type { ResumeDraft, UserContextSnapshot } from "../../src/lib/career/types";

type TestCase = {
  name: string;
  run: () => void;
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
    run: () => {
      const result = scoreLeadFit(
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
    run: () => {
      const result = scoreLeadFit(
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
      assert.ok(result.gapMap.some((gap) => gap.title === "Work-mode mismatch"));
    },
  },
];

let failures = 0;

for (const testCase of tests) {
  try {
    testCase.run();
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
