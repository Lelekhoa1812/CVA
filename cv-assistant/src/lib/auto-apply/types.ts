import { z } from "zod";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  MAX_RESULTS_OPTIONS,
  SEARCH_SOURCES,
  WORKPLACE_MODE_OPTIONS,
  type SearchRequest,
  type SearchSource,
} from "../search/types";

export const autoApplyModeSchema = z.enum(["ai_coaching", "manual_curate"]);
export type AutoApplyMode = z.infer<typeof autoApplyModeSchema>;

export const autoApplyStatusSchema = z.enum([
  "idle",
  "searching",
  "ranking",
  "awaiting_selection",
  "preparing",
  "browser_active",
  "awaiting_user_answer",
  "ready_for_review",
  "submitting",
  "submitted",
  "blocked",
  "failed",
  "stopped",
  "completed",
]);

export const autoApplyFiltersSchema = z.object({
  location: z.string().trim().default(""),
  workplaceMode: z.enum(WORKPLACE_MODE_OPTIONS).default("any"),
  employmentType: z.enum(EMPLOYMENT_TYPE_OPTIONS).default("any"),
  seniority: z.string().trim().default(""),
  salaryMin: z.string().trim().default(""),
  salaryMax: z.string().trim().default(""),
  workRights: z.string().trim().default(""),
  mustHaveKeywords: z.array(z.string().trim()).default([]),
  excludeKeywords: z.array(z.string().trim()).default([]),
  companyBlacklist: z.array(z.string().trim()).default([]),
  applicationLimit: z.number().int().min(1).max(100).default(10),
  selectedSources: z.array(z.enum(SEARCH_SOURCES)).min(1).default([...SEARCH_SOURCES]),
  maxResultsPerSource: z
    .union(MAX_RESULTS_OPTIONS.map((value) => z.literal(value)) as [
      z.ZodLiteral<25>,
      z.ZodLiteral<50>,
      z.ZodLiteral<100>,
    ])
    .default(25),
});
export type AutoApplyFilters = z.infer<typeof autoApplyFiltersSchema>;

export const defaultAutoApplyFilters: AutoApplyFilters = {
  location: "",
  workplaceMode: "any",
  employmentType: "any",
  seniority: "",
  salaryMin: "",
  salaryMax: "",
  workRights: "",
  mustHaveKeywords: [],
  excludeKeywords: [],
  companyBlacklist: [],
  applicationLimit: 10,
  selectedSources: [...SEARCH_SOURCES],
  maxResultsPerSource: 25,
};

export const createAutoApplySessionSchema = z.object({
  mode: autoApplyModeSchema.default("ai_coaching"),
  prompt: z.string().trim().min(1, "Prompt is required."),
  filters: autoApplyFiltersSchema.default(defaultAutoApplyFilters),
  selectedGroundTruthIds: z.array(z.string()).default([]),
  allowFullResumeContext: z.boolean().default(false),
});

export const updateAutoApplySessionSchema = z.object({
  mode: autoApplyModeSchema.optional(),
  status: autoApplyStatusSchema.optional(),
  prompt: z.string().trim().optional(),
  filters: autoApplyFiltersSchema.partial().optional(),
  selectedGroundTruthIds: z.array(z.string()).optional(),
  allowFullResumeContext: z.boolean().optional(),
});

export const saveAnswerSchema = z.object({
  questionPattern: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  scope: z.enum(["session", "reusable_profile"]).default("session"),
  source: z
    .enum(["user", "resume", "selected_project", "generated_with_user_approval"])
    .default("user"),
  provenance: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.8),
  explicitReusableConsent: z.boolean().default(false),
});

export const answerQuestionSchema = z.object({
  question: z.string().trim().min(1),
  draftAnswer: z.string().trim().optional(),
});

export const submitApplicationSchema = z.object({
  confirmSubmit: z.boolean(),
});

export function toSearchRequest(prompt: string, filters: AutoApplyFilters): SearchRequest {
  return {
    jobTitle: prompt.trim(),
    location: filters.location.trim() || "Australia",
    filters: {
      postedWithin: "any",
      workplaceMode: filters.workplaceMode,
      employmentType: filters.employmentType,
    },
    maxResultsPerSource: filters.maxResultsPerSource,
    selectedSources: filters.selectedSources as SearchSource[],
  };
}
