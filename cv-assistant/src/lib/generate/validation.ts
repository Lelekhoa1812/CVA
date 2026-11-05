/** Limits apply to the raw trimmed inputs before they are interpolated into model prompts. */
export function validateGenerationInput(args: {
  kind: 'cover-letter' | 'employer-question';
  company: string;
  jobDescription: string;
  question?: string;
  idealWordCount?: string;
  answerStyle?: string;
  indices: unknown;
}): string | null {
  if (args.kind === 'cover-letter' && (!args.company || !args.jobDescription)) return 'Missing inputs';
  if (args.kind === 'employer-question' && !args.question) return 'Missing question';
  if (args.company.length > 300 || args.jobDescription.length > 18_000 || (args.question?.length || 0) > 4_000 || (args.idealWordCount?.length || 0) > 100 || (args.answerStyle?.length || 0) > 300) return 'Input too long';
  if (args.indices != null && (!Array.isArray(args.indices) || args.indices.length > 30 || args.indices.some((index: unknown) => !Number.isSafeInteger(index) || Number(index) < 0))) return 'Invalid evidence selection';
  return null;
}
