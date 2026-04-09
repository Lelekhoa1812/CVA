import { z } from "zod";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  MAX_RESULTS_OPTIONS,
  POSTED_WITHIN_OPTIONS,
  WORKPLACE_MODE_OPTIONS,
  type SearchRequest,
} from "@/lib/search/types";

export const searchFiltersSchema = z.object({
  postedWithin: z.enum(POSTED_WITHIN_OPTIONS).default("any"),
  workplaceMode: z.enum(WORKPLACE_MODE_OPTIONS).default("any"),
  employmentType: z.enum(EMPLOYMENT_TYPE_OPTIONS).default("any"),
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
};
