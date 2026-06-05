import { flattenGroundTruthText } from "./ground-truth";

const sensitivePatterns = [
  /visa|work rights|citizenship|sponsor|sponsorship/i,
  /salary|compensation|notice period|availability|start date/i,
  /disability|gender|ethnicity|veteran|background check/i,
  /license|certification|clearance|criminal|declaration|signature|consent/i,
];

export function classifyEmployerQuestion(question: string) {
  if (sensitivePatterns.some((pattern) => pattern.test(question))) {
    return "requires_user";
  }
  if (/why|describe|tell us|example|experience|project|achievement/i.test(question)) {
    return "grounded_generation";
  }
  if (/name|email|phone|linkedin|website|education|language/i.test(question)) {
    return "factual_profile";
  }
  return "unknown";
}

export function answerEmployerQuestionFromGroundTruth(args: {
  question: string;
  groundTruthSnapshot: { items?: Array<{ title?: string; summary?: string; evidence?: string[] }> };
  savedAnswers?: Array<{ questionPattern: string; answer: string }>;
}) {
  const normalizedQuestion = args.question.toLowerCase();
  const saved = (args.savedAnswers || []).find(
    (item) =>
      normalizedQuestion.includes(item.questionPattern.toLowerCase()) ||
      item.questionPattern.toLowerCase().includes(normalizedQuestion),
  );
  if (saved) {
    return {
      answer: saved.answer,
      confidence: 0.9,
      requiresUserReview: false,
      sourceEvidence: [`Saved answer: ${saved.questionPattern}`],
      reason: "Matched a user-approved saved answer.",
    };
  }

  const classification = classifyEmployerQuestion(args.question);
  if (classification === "requires_user" || classification === "unknown") {
    return {
      answer: "",
      confidence: 0.2,
      requiresUserReview: true,
      sourceEvidence: [],
      reason: "The question asks for sensitive, personal, legal, or unsupported information.",
    };
  }

  const selectedItems = args.groundTruthSnapshot.items || [];
  const groundTruthText = flattenGroundTruthText(args.groundTruthSnapshot);
  const terms = normalizedQuestion
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 3);
  const overlap = terms.filter((term) => groundTruthText.includes(term));

  if (!selectedItems.length || overlap.length === 0) {
    return {
      answer: "",
      confidence: 0.35,
      requiresUserReview: true,
      sourceEvidence: [],
      reason: "No selected ground truth clearly supports an answer.",
    };
  }

  const strongest = selectedItems.find((item) =>
    [item.title || "", item.summary || "", ...(item.evidence || [])]
      .join(" ")
      .toLowerCase()
      .includes(overlap[0]),
  );

  return {
    answer: strongest?.summary || strongest?.evidence?.[0] || "",
    confidence: 0.74,
    requiresUserReview: true,
    sourceEvidence: strongest ? [strongest.title || "Selected ground truth"] : [],
    reason: "Drafted from selected session ground truth and should be reviewed by the user.",
  };
}
