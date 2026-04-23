import crypto from "node:crypto";
import { connectToDatabase } from "@/lib/db";
import { UserModel } from "@/lib/models/User";
import { UserContextModel } from "@/lib/models/UserContext";
import type { ControlRoomPreferenceState, UserContextSnapshot } from "@/lib/career/types";
import { cleanText, splitList, tokenize, uniqueStrings } from "@/lib/career/utils";

type StoredProfile = {
  name?: string;
  major?: string;
  school?: string;
  studyPeriod?: string;
  email?: string;
  workEmail?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  profileSummary?: string;
  skills?: string;
  languages?: string;
  projects?: Array<{ name?: string; summary?: string; description?: string }>;
  experiences?: Array<{
    companyName?: string;
    role?: string;
    summary?: string;
    description?: string;
    timeFrom?: string;
    timeTo?: string;
  }>;
};

function buildSourceHash(parts: string[]) {
  return crypto.createHash("sha1").update(parts.join("::")).digest("hex");
}

function deriveTargetRoles(profile: StoredProfile) {
  return uniqueStrings([
    ...(profile.experiences || []).map((experience) => experience.role || ""),
    profile.major,
  ]).slice(0, 6);
}

function deriveProofPoints(profile: StoredProfile) {
  return uniqueStrings([
    profile.profileSummary,
    ...(profile.projects || []).flatMap((project) => [project.summary, project.description]),
    ...(profile.experiences || []).flatMap((experience) => [experience.summary, experience.description]),
  ]).slice(0, 8);
}

function deriveCandidateFacts(profile: StoredProfile) {
  const profileFact = cleanText(profile.profileSummary)
    ? [
        {
          kind: "profile",
          title: "Professional profile",
          sourceLabel: "Profile summary",
          summary: cleanText(profile.profileSummary),
          evidence: [cleanText(profile.profileSummary)],
          keywords: tokenize(profile.profileSummary || "").slice(0, 8),
          impact: cleanText(profile.profileSummary),
          confidence: 0.82,
          sourceHash: buildSourceHash(["profile", cleanText(profile.profileSummary)]),
        },
      ]
    : [];

  const experienceFacts = (profile.experiences || []).map((experience) => {
    const summary = cleanText(`${experience.summary || ""} ${experience.description || ""}`);
    return {
      kind: "experience",
      title: cleanText(`${experience.companyName || "Company"} - ${experience.role || "Role"}`),
      sourceLabel: cleanText(experience.companyName),
      summary,
      evidence: [cleanText(experience.summary), cleanText(experience.description)].filter(Boolean),
      keywords: uniqueStrings([
        ...(tokenize(summary).slice(0, 6)),
        ...tokenize(experience.role || "").slice(0, 3),
      ]),
      impact: cleanText(experience.summary || experience.description),
      confidence: 0.78,
      sourceHash: buildSourceHash([
        "experience",
        cleanText(experience.companyName),
        cleanText(experience.role),
        summary,
      ]),
    };
  });

  const projectFacts = (profile.projects || []).map((project) => {
    const summary = cleanText(`${project.summary || ""} ${project.description || ""}`);
    return {
      kind: "project",
      title: cleanText(project.name) || "Project",
      sourceLabel: cleanText(project.name),
      summary,
      evidence: [cleanText(project.summary), cleanText(project.description)].filter(Boolean),
      keywords: tokenize(summary).slice(0, 8),
      impact: cleanText(project.summary || project.description),
      confidence: 0.74,
      sourceHash: buildSourceHash(["project", cleanText(project.name), summary]),
    };
  });

  return [...profileFact, ...experienceFacts, ...projectFacts].filter((fact) => fact.summary);
}

function deriveStoryBank(profile: StoredProfile) {
  return [
    ...(profile.experiences || []).map((experience) => ({
      title: cleanText(`${experience.companyName || "Company"} - ${experience.role || "Role"}`),
      situation: cleanText(experience.description),
      task: cleanText(experience.summary),
      action: cleanText(experience.summary || experience.description),
      result: cleanText(experience.description),
      reflection: "",
      tags: uniqueStrings([
        ...tokenize(experience.role || "").slice(0, 4),
        ...tokenize(experience.summary || "").slice(0, 4),
      ]),
      evidenceSource: cleanText(experience.companyName),
      confidence: 0.58,
    })),
    ...(profile.projects || []).map((project) => ({
      title: cleanText(project.name) || "Project",
      situation: cleanText(project.description),
      task: cleanText(project.summary),
      action: cleanText(project.summary || project.description),
      result: cleanText(project.description),
      reflection: "",
      tags: tokenize(`${project.name || ""} ${project.summary || ""}`).slice(0, 6),
      evidenceSource: cleanText(project.name),
      confidence: 0.52,
    })),
  ].filter((story) => story.title && (story.action || story.result));
}

const DEFAULT_CONTROL_ROOM_PREFERENCES: ControlRoomPreferenceState = {
  scoreFloor: "65",
  salaryFloor: "0",
  targetMin: "0",
  targetMax: "0",
  jobTitles: "",
  locations: "",
  preferredLocations: "",
  avoidLocations: "",
  remoteOnly: false,
};

function normalizeControlRoomPreferences(overrides?: Partial<ControlRoomPreferenceState>): ControlRoomPreferenceState {
  return {
    ...DEFAULT_CONTROL_ROOM_PREFERENCES,
    ...overrides,
    remoteOnly: Boolean(overrides?.remoteOnly ?? DEFAULT_CONTROL_ROOM_PREFERENCES.remoteOnly),
  };
}

function createEmptySnapshot(): UserContextSnapshot {
  return {
    targetRoles: [],
    archetypes: [],
    compensation: { currency: "AUD", targetMin: 0, targetMax: 0, salaryFloor: 0 },
    workPreferences: {
      modes: ["remote", "hybrid"],
      preferredLocations: [],
      avoidLocations: [],
      visaStatus: "",
      remoteOnly: false,
    },
    searchPreferences: {
      jobTitles: [],
      locations: [],
      sources: [],
      remoteOnly: false,
    },
    techStackPreferences: [],
    cultureSignals: [],
    proofPoints: [],
    learnedExclusions: [],
    scoreFloor: 65,
    outreachPreferences: { channels: ["email", "linkedin"], tone: "confident" },
    candidateFacts: [],
    storyBank: [],
  controlRoomPreferences: DEFAULT_CONTROL_ROOM_PREFERENCES,
  };
}

function toSnapshot(value: unknown): UserContextSnapshot {
  if (!value) return createEmptySnapshot();

  const plain = (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toObject?: () => unknown }).toObject === "function"
      ? (value as { toObject: () => unknown }).toObject()
      : value
  ) as Partial<UserContextSnapshot>;

  return {
    targetRoles: plain.targetRoles || [],
    archetypes: plain.archetypes || [],
    compensation: plain.compensation || { currency: "AUD", targetMin: 0, targetMax: 0, salaryFloor: 0 },
    workPreferences: plain.workPreferences || {
      modes: ["remote", "hybrid"],
      preferredLocations: [],
      avoidLocations: [],
      visaStatus: "",
      remoteOnly: false,
    },
    searchPreferences: plain.searchPreferences || {
      jobTitles: [],
      locations: [],
      sources: [],
      remoteOnly: false,
    },
    techStackPreferences: plain.techStackPreferences || [],
    cultureSignals: plain.cultureSignals || [],
    proofPoints: plain.proofPoints || [],
    learnedExclusions: plain.learnedExclusions || [],
    scoreFloor: plain.scoreFloor || 65,
    outreachPreferences: plain.outreachPreferences || { channels: ["email", "linkedin"], tone: "confident" },
    candidateFacts: plain.candidateFacts || [],
    storyBank: plain.storyBank || [],
    controlRoomPreferences: normalizeControlRoomPreferences(plain.controlRoomPreferences),
  } satisfies UserContextSnapshot;
}

/* Motivation vs Logic:
   Motivation: The modernization work needs one durable memory layer that can survive across search, scoring, and
   tailoring runs instead of rebuilding candidate context from raw profile fields in every route.
   Logic: Seed a dedicated UserContext document from the existing profile once, preserve any explicit user overrides,
   and keep reusable facts plus story-bank material in a normalized snapshot that every agent service can read. */
export async function loadUserContextSnapshot(userId: string) {
  await connectToDatabase();

  const existing = await UserContextModel.findOne({ userId });
  if (existing) {
    return toSnapshot(existing);
  }

  const user = await UserModel.findById(userId).lean();
  const profile = (user?.profile || {}) as StoredProfile;

  const seeded = await UserContextModel.create({
    userId,
    targetRoles: deriveTargetRoles(profile),
    archetypes: deriveTargetRoles(profile).slice(0, 4),
    compensation: {
      currency: "AUD",
      targetMin: 0,
      targetMax: 0,
      salaryFloor: 0,
    },
    workPreferences: {
      modes: ["remote", "hybrid"],
      preferredLocations: [],
      avoidLocations: [],
      visaStatus: "",
      remoteOnly: false,
    },
    searchPreferences: {
      jobTitles: deriveTargetRoles(profile),
      locations: [],
      sources: [],
      remoteOnly: false,
    },
    techStackPreferences: splitList(profile.skills).slice(0, 14),
    cultureSignals: [
      { label: "builder culture", weight: 0.8 },
      { label: "clear ownership", weight: 0.65 },
    ],
    proofPoints: deriveProofPoints(profile),
    learnedExclusions: [],
    scoreFloor: 65,
    outreachPreferences: { channels: ["email", "linkedin"], tone: "confident" },
    candidateFacts: deriveCandidateFacts(profile),
    storyBank: deriveStoryBank(profile).slice(0, 12),
    controlRoomPreferences: normalizeControlRoomPreferences({
      jobTitles: deriveTargetRoles(profile).join(", "),
    }),
  });

  return toSnapshot(seeded);
}

export async function updateUserContextSnapshot(
  userId: string,
  patch: Partial<{
    targetRoles: string[];
    searchPreferences: { jobTitles: string[]; locations: string[]; sources: string[]; remoteOnly: boolean };
    compensation: { targetMin: number; targetMax: number; salaryFloor: number; currency: string };
    workPreferences: {
      modes: string[];
      preferredLocations: string[];
      avoidLocations: string[];
      visaStatus: string;
      remoteOnly: boolean;
    };
    techStackPreferences: string[];
    cultureSignals: Array<{ label: string; weight: number }>;
    proofPoints: string[];
    learnedExclusions: string[];
    scoreFloor: number;
    controlRoomPreferences: ControlRoomPreferenceState;
  }>,
) {
  await connectToDatabase();
  await loadUserContextSnapshot(userId);

  const nextUpdate: Record<string, unknown> = {};
  if (patch.targetRoles) nextUpdate.targetRoles = uniqueStrings(patch.targetRoles);
  if (patch.searchPreferences) {
    nextUpdate.searchPreferences = {
      jobTitles: uniqueStrings(patch.searchPreferences.jobTitles),
      locations: uniqueStrings(patch.searchPreferences.locations),
      sources: uniqueStrings(patch.searchPreferences.sources),
      remoteOnly: Boolean(patch.searchPreferences.remoteOnly),
    };
  }
  if (patch.compensation) {
    nextUpdate.compensation = {
      currency: cleanText(patch.compensation.currency) || "AUD",
      targetMin: Number(patch.compensation.targetMin) || 0,
      targetMax: Number(patch.compensation.targetMax) || 0,
      salaryFloor: Number(patch.compensation.salaryFloor) || 0,
    };
  }
  if (patch.workPreferences) {
    nextUpdate.workPreferences = {
      modes: uniqueStrings(patch.workPreferences.modes),
      preferredLocations: uniqueStrings(patch.workPreferences.preferredLocations),
      avoidLocations: uniqueStrings(patch.workPreferences.avoidLocations),
      visaStatus: cleanText(patch.workPreferences.visaStatus),
      remoteOnly: Boolean(patch.workPreferences.remoteOnly),
    };
  }
  if (patch.techStackPreferences) nextUpdate.techStackPreferences = uniqueStrings(patch.techStackPreferences);
  if (patch.cultureSignals) {
    nextUpdate.cultureSignals = patch.cultureSignals
      .map((signal) => ({
        label: cleanText(signal.label),
        weight: Number(signal.weight) || 0,
      }))
      .filter((signal) => signal.label);
  }
  if (patch.proofPoints) nextUpdate.proofPoints = uniqueStrings(patch.proofPoints);
  if (patch.learnedExclusions) nextUpdate.learnedExclusions = uniqueStrings(patch.learnedExclusions);
  if (typeof patch.scoreFloor === "number") nextUpdate.scoreFloor = patch.scoreFloor;
  if (patch.controlRoomPreferences) {
    nextUpdate.controlRoomPreferences = normalizeControlRoomPreferences(patch.controlRoomPreferences);
  }

  const updated = await UserContextModel.findOneAndUpdate(
    { userId },
    { $set: nextUpdate },
    { new: true },
  );

  return toSnapshot(updated);
}
