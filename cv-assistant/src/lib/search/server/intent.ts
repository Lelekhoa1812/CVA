import { generateJsonSafe } from "@/lib/ai";
import type {
  AdvancedSearchQuestionPlan,
  SearchInstructionContext,
  SearchInstructionExpansion,
  SearchRequest,
} from "@/lib/search/types";
import {
  advancedSearchQuestionPlanSchema,
  searchInstructionContextSchema,
  searchInstructionExpansionSchema,
} from "@/lib/search/schema";

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function fallbackExpansion(request: Pick<SearchRequest, "jobTitle" | "location" | "filters" | "selectedSources" | "searchInstruction">): SearchInstructionExpansion {
  return {
    normalizedInstruction: (request.searchInstruction || "").trim().toLowerCase(),
    suggestedJobTitle: request.jobTitle,
    suggestedLocation: request.location,
    suggestedSources: request.selectedSources,
    suggestedFilters: {},
    preferredKeywords: [],
    optionalKeywords: [],
    summary: request.searchInstruction?.trim() || "",
  };
}

/* Motivation vs Logic:
   Motivation: The new Search Instruction and Advanced Search flow both need structured, low-latency AI output without introducing a separate orchestration service.
   Logic: Reuse the repository's JSON-only Azure Foundry pattern, validate with Zod, and fall back to deterministic payloads so search still runs when the model is unavailable. */
export async function expandSearchInstruction(args: {
  request: Pick<SearchRequest, "jobTitle" | "location" | "filters" | "selectedSources" | "searchInstruction">;
  context?: SearchInstructionContext | null;
}): Promise<SearchInstructionExpansion> {
  const request = args.request;
  const context = searchInstructionContextSchema.parse(args.context || {});
  const instruction = request.searchInstruction?.trim();
  if (!instruction) {
    return fallbackExpansion(request);
  }

  const prompt = `You are helping refine a job search request.
Return ONLY valid JSON with these exact keys:
- normalizedInstruction: cleaned version of the user's instruction.
- suggestedJobTitle: keep the current title unless the instruction clearly narrows it.
- suggestedLocation: keep the current location unless the instruction clearly narrows it.
- suggestedSources: subset or superset of the currently selected sources when explicitly justified.
- suggestedFilters: object with any of postedWithin, workplaceMode, employmentType when strongly implied; otherwise omit.
- preferredKeywords: 0-6 precise keywords or short phrases to bias ranking.
- optionalKeywords: 0-8 softer keywords that should widen recall, not restrict it.
- summary: one short sentence explaining the resulting bias.

Rules:
- Never blank out the search or make filtering overly strict.
- Prefer recall-friendly outputs.
- If the user did not ask for source or filter changes, keep them empty.

Search request:
${stringifyJson(request)}

User context:
${stringifyJson(context)}`;

  try {
    const raw = await generateJsonSafe("easy", prompt, 1);
    return searchInstructionExpansionSchema.parse(raw);
  } catch {
    return fallbackExpansion(request);
  }
}

function fallbackQuestionPlan(request: Pick<SearchRequest, "jobTitle" | "location" | "searchInstruction">): AdvancedSearchQuestionPlan {
  const prompts = [
    `What type of ${request.jobTitle} problems or product area do you want most?`,
    `Which location or work setup around ${request.location} would make this role a strong fit?`,
  ];

  if (request.searchInstruction?.trim()) {
    prompts.push("Which technologies, industries, or team signals from your instruction matter most?");
  }

  return {
    summary: "Answer a few quick prompts so the search can bias ranking and suggested filters before the crawl starts.",
    questions: prompts.slice(0, 3).map((prompt, index) => ({
      id: `fallback-${index + 1}`,
      prompt,
    })),
  };
}

export async function buildAdvancedSearchQuestionPlan(args: {
  request: Pick<SearchRequest, "jobTitle" | "location" | "filters" | "selectedSources" | "searchInstruction">;
  context?: SearchInstructionContext | null;
}): Promise<AdvancedSearchQuestionPlan> {
  const context = searchInstructionContextSchema.parse(args.context || {});
  const prompt = `You are preparing a short advanced job-search intake.
Return ONLY valid JSON with these exact keys:
- summary: one short sentence telling the user what this question set will clarify.
- questions: array of 2 to 5 objects, each with id, prompt, and optional helperText.

Rules:
- Ask between 2 and 5 questions.
- Questions must be sequentially useful before a job-board crawl begins.
- Focus on role nuance, work mode, location, tech/domain preferences, and red flags.
- Do not ask for information already explicit in the request unless you are narrowing it.

Search request:
${stringifyJson(args.request)}

User context:
${stringifyJson(context)}`;

  try {
    const raw = await generateJsonSafe("easy", prompt, 1);
    return advancedSearchQuestionPlanSchema.parse(raw);
  } catch {
    return fallbackQuestionPlan(args.request);
  }
}

type SequentialQuestionResult = {
  question: { id: string; prompt: string; helperText?: string } | null;
  isComplete: boolean;
  summary?: string;
};

export async function buildSequentialQuestion(args: {
  request: Pick<SearchRequest, "jobTitle" | "location" | "filters" | "selectedSources" | "searchInstruction">;
  context?: SearchInstructionContext | null;
  previousQuestions: Array<{ id: string; prompt: string; helperText?: string }>;
  previousAnswers: Array<{ questionId: string; answer: string }>;
  experiences?: Array<{ title: string; summary: string; keywords: string[] }>;
}): Promise<SequentialQuestionResult> {
  const context = searchInstructionContextSchema.parse(args.context || {});
  const { previousQuestions, previousAnswers, experiences = [] } = args;

  const topExperiences = experiences.slice(0, 3);
  
  const prompt = `You are conducting a conversational job-search intake, one question at a time.

Job search request:
${stringifyJson(args.request)}

User context:
${stringifyJson(context)}

${topExperiences.length > 0 ? `Latest experiences:
${stringifyJson(topExperiences)}
` : ""}

Previous questions asked:
${previousQuestions.length > 0 ? stringifyJson(previousQuestions) : "None"}

Previous answers:
${previousAnswers.length > 0 ? stringifyJson(previousAnswers) : "None"}

Your task:
1. Review what you already know from the search request, user context, and previous Q&A
2. Determine if you have enough information to tailor the search effectively
3. If more clarity would help, generate ONE focused follow-up question
4. If you have enough context, mark the intake as complete

Return ONLY valid JSON with these exact keys:
{
  "isComplete": boolean,  // true if you have enough context; false if you need one more question
  "question": {           // null if isComplete is true; otherwise a single question object
    "id": "question-N",   // where N is the next sequential number
    "prompt": "...",      // the question text
    "helperText": "..."   // optional guidance for the user
  } | null,
  "summary": "..."        // optional: a brief statement of what you've learned (only if isComplete is true)
}

Rules:
- Maximum 5 questions total (count previous questions)
- Focus on: role nuances, tech preferences, work setup, domain interests, and dealbreakers
- Make each question build on previous answers
- Use experiences to inform recommendations in your first question
- Stop when you have sufficient context or reach 5 questions
- Questions should be conversational and specific to what you've learned`;

  try {
    const raw = await generateJsonSafe("easy", prompt, 1);
    
    if (typeof raw === "object" && raw !== null) {
      const isComplete = Boolean(raw.isComplete) || previousQuestions.length >= 5;
      const question = isComplete ? null : (raw.question || null);
      const summary = typeof raw.summary === "string" ? raw.summary : "";
      
      return { isComplete, question, summary };
    }
    
    throw new Error("Invalid response format");
  } catch {
    if (previousQuestions.length >= 5) {
      return {
        isComplete: true,
        question: null,
        summary: "Gathered sufficient context for tailored job search.",
      };
    }
    
    const nextId = `question-${previousQuestions.length + 1}`;
    return {
      isComplete: false,
      question: {
        id: nextId,
        prompt: `What matters most to you in a ${args.request.jobTitle} role?`,
        helperText: "Share your priorities so we can focus the search.",
      },
    };
  }
}
