type RewriteMode = 'concise' | 'preserve' | 'enhance';

type HighImpactRewritePromptParams = {
  itemType: string;
  itemName: string;
  originalContent: string;
  requestedFormat?: string;
  userModifications?: string;
};

type BulletRange = {
  min: number;
  max: number;
  instruction: string;
};

function resolveRewriteMode(requestedFormat?: string): RewriteMode {
  const normalized = (requestedFormat || '').trim().toLowerCase();

  if (normalized.includes('concise')) return 'concise';
  if (normalized.includes('enhance')) return 'enhance';
  return 'preserve';
}

function getBulletRange(mode: RewriteMode): BulletRange {
  if (mode === 'concise') {
    return {
      min: 3,
      max: 4,
      instruction: 'Provide 3-4 bullet points with the sharpest, highest-signal outcomes only.',
    };
  }

  if (mode === 'enhance') {
    return {
      min: 5,
      max: 7,
      instruction: 'Provide 5-7 bullet points with deeper technical and business detail.',
    };
  }

  return {
    min: 4,
    max: 5,
    instruction: 'Provide 4-5 bullet points with balanced depth and readability.',
  };
}

export function buildHighImpactRewritePrompt({
  itemType,
  itemName,
  originalContent,
  requestedFormat,
  userModifications,
}: HighImpactRewritePromptParams): string {
  const mode = resolveRewriteMode(requestedFormat);
  const bulletRange = getBulletRange(mode);

  // Motivation vs Logic:
  // Motivation: Resume rewriting now needs one consistently high-caliber prompt across profile editing and
  // targeted resume enhancement so users get the same executive-grade, metric-heavy output regardless of entry point.
  // Logic: This helper centralizes the role framing, bullet-count policy, and rewrite rules while still allowing
  // per-request controls like concise/preserve/enhance and user-specified modification notes.
  return `Role: You are an expert Executive Resume Writer and Career Coach specialising in quantifiable achievements and technical precision.

Objective: Rewrite the user's selected ${itemType} description. Move away from passive responsibilities and toward high-impact outcomes.

Selected ${itemType}:
- Name: ${itemName}
- Source content:
${originalContent}

User preferences:
- Requested format: ${requestedFormat || 'preserve'}
- Additional modification requests: ${userModifications || 'None provided'}

Strict requirements:
- ${bulletRange.instruction}
- Every bullet must start with a strong, diverse action verb.
- Every bullet must include quantifiable impact. If the source lacks a metric, infer a realistic placeholder or use a credible high-magnitude descriptor.
- Emphasize technical, operational, or financial depth using concrete terminology from the source wherever possible.
- Lead with the result first, then explain the mechanism.
- Prefer advanced tools, frameworks, systems, methods, and business outcomes that are supported by the source content.
- Avoid passive phrasing, generic filler, and repetitive sentence openings.
- Keep each bullet ATS-friendly, executive-ready, and materially distinct from the others.
- Return plain newline-separated bullets only, with no preamble, markdown emphasis, or commentary.
`;
}

export function normalizeHighImpactBulletOutput(
  text: string,
  fallbackText: string,
  requestedFormat?: string,
): string {
  const mode = resolveRewriteMode(requestedFormat);
  const { max } = getBulletRange(mode);
  const toBulletLines = (value: string) => value
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^Here are .*?:/i, '')
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, max)
    .map((line) => `- ${line}`);

  const lines = toBulletLines(text || '');
  if (lines.length > 0) {
    return lines.join('\n');
  }

  const fallbackLines = toBulletLines(fallbackText);
  if (fallbackLines.length > 0) {
    return fallbackLines.join('\n');
  }

  return fallbackText;
}
