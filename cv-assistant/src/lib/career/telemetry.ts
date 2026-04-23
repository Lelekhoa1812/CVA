import { ApplicationEventModel } from "@/lib/models/ApplicationEvent";
import { JobEvaluationModel } from "@/lib/models/JobEvaluation";

export async function loadOutcomeTelemetry(userId: string) {
  const [evaluations, selfFiltered] = await Promise.all([
    JobEvaluationModel.find({ userId }).sort({ createdAt: -1 }).limit(40).lean(),
    ApplicationEventModel.find({ userId, type: "self_filtered" }).sort({ createdAt: -1 }).limit(25).lean(),
  ]);

  const skipped = evaluations.filter((evaluation) => evaluation.recommendation === "skip").length;
  const prioritized = evaluations.filter((evaluation) => evaluation.recommendation === "prioritize").length;
  const commonExclusions = selfFiltered
    .flatMap((event) => {
      const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : {};
      return Array.isArray(payload.reasons) ? payload.reasons.filter((value): value is string => typeof value === "string") : [];
    })
    .slice(0, 8);

  const winningKeywords = evaluations
    .filter((evaluation) => evaluation.recommendation === "prioritize")
    .flatMap((evaluation) => evaluation.matchedRequirements || [])
    .filter((match) => match.coverage === "covered")
    .flatMap((match) => match.matchedFacts || [])
    .slice(0, 12);

  return {
    evaluationCount: evaluations.length,
    skippedCount: skipped,
    prioritizedCount: prioritized,
    commonExclusions,
    winningKeywords,
  };
}
