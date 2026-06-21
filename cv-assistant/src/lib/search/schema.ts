import { z } from "zod";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  MAX_RESULTS_OPTIONS,
  POSTED_WITHIN_OPTIONS,
  SEARCH_SOURCES,
  WORKPLACE_MODE_OPTIONS,
  type AdvancedSearchQuestionPlan,
  type SearchInstructionContext,
  type SearchInstructionExpansion,
  type SearchRequest,
} from "@/lib/search/types";

export const searchFiltersSchema = z.object({
  postedWithin: z.enum(POSTED_WITHIN_OPTIONS).default("any"),
  workplaceMode: z.enum(WORKPLACE_MODE_OPTIONS).default("any"),
  employmentType: z.enum(EMPLOYMENT_TYPE_OPTIONS).default("any"),
});

export const searchInstructionExpansionSchema: z.ZodType<SearchInstructionExpansion> = z.object({
  normalizedInstruction: z.string().trim().default(""),
  suggestedJobTitle: z.string().trim().optional(),
  suggestedLocation: z.string().trim().optional(),
  suggestedSources: z.array(z.enum(SEARCH_SOURCES)).default([]),
  suggestedFilters: searchFiltersSchema.partial().default({}),
  preferredKeywords: z.array(z.string().trim()).default([]),
  optionalKeywords: z.array(z.string().trim()).default([]),
  summary: z.string().trim().default(""),
});

export const advancedSearchQuestionSchema = z.object({
  id: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  helperText: z.string().trim().optional(),
});

const advancedSearchAnswerSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});

export const advancedSearchSessionSchema = z.object({
  summary: z.string().trim().default(""),
  questionsAsked: z.array(advancedSearchQuestionSchema).default([]),
  answers: z.array(advancedSearchAnswerSchema).default([]),
});

export const searchRequestSchema = z.object({
  jobTitle: z.string().trim().min(1, "Job title is required."),
  location: z.string().trim().min(1, "Location is required."),
  filters: searchFiltersSchema.default({
    postedWithin: "any",
    workplaceMode: "any",
    employmentType: "any",
  }),
  maxResultsPerSource: z.union(MAX_RESULTS_OPTIONS.map((value) => z.literal(value)) as [
    z.ZodLiteral<25>,
    z.ZodLiteral<50>,
    z.ZodLiteral<100>,
  ]).default(50),
  selectedSources: z
    .array(z.enum(SEARCH_SOURCES))
    .min(1, "Select at least one hiring platform.")
    .default([...SEARCH_SOURCES]),
  searchInstruction: z.string().trim().max(1200).optional().default(""),
  instructionExpansion: searchInstructionExpansionSchema.nullable().optional().default(null),
  advancedSearchSession: advancedSearchSessionSchema.nullable().optional().default(null),
});

export const searchInstructionContextSchema: z.ZodType<SearchInstructionContext> = z.object({
  targetRoles: z.array(z.string().trim()).default([]),
  preferredLocations: z.array(z.string().trim()).default([]),
  preferredSources: z.array(z.enum(SEARCH_SOURCES)).default([]),
  remoteOnly: z.boolean().default(false),
  techStackPreferences: z.array(z.string().trim()).default([]),
  cultureSignals: z.array(z.string().trim()).default([]),
});

export const advancedSearchQuestionPlanSchema: z.ZodType<AdvancedSearchQuestionPlan> = z.object({
  summary: z.string().trim().default(""),
  questions: z.array(advancedSearchQuestionSchema).min(2).max(5).default([]),
});

export const defaultSearchRequest: SearchRequest = {
  jobTitle: "",
  location: "",
  filters: {
    postedWithin: "any",
    workplaceMode: "any",
    employmentType: "any",
  },
  maxResultsPerSource: 50,
  selectedSources: [...SEARCH_SOURCES],
  searchInstruction: "",
  instructionExpansion: null,
  advancedSearchSession: null,
};
