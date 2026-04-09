import { MIN_JOB_DESCRIPTION_WORDS } from '@/lib/resume/constants';

type AICoachingInputProps = {
  enabled: boolean;
  jobDescription: string;
  disabled?: boolean;
  error?: string | null;
  onEnabledChange: (enabled: boolean) => void;
  onJobDescriptionChange: (jobDescription: string) => void;
};

export function AICoachingInput({
  enabled,
  jobDescription,
  disabled = false,
  error,
  onEnabledChange,
  onJobDescriptionChange,
}: AICoachingInputProps) {
  const wordCount = jobDescription.trim() ? jobDescription.trim().split(/\s+/).length : 0;

  return (
    <div className="bg-card border rounded-xl p-6">
      <div className="flex items-start gap-3">
        <input
          id="ai-coaching"
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        <div className="flex-1">
          <label htmlFor="ai-coaching" className="text-xl font-semibold text-foreground">
            AI Coaching
          </label>
          <p className="mt-1 text-sm text-muted-foreground">
            AI scores your full project and experience history against the role, keeps the strongest
            matches, and tailors the bullets without inventing new experience.
          </p>
        </div>
      </div>

      {enabled && (
        <div className="mt-4 space-y-2">
          <label htmlFor="job-description" className="text-sm font-medium text-foreground">
            Job Description <span className="text-destructive">*</span>
          </label>
          <textarea
            id="job-description"
            className="min-h-40 w-full rounded border bg-background px-3 py-2 text-foreground"
            placeholder="Paste the full job description so AI can rerank and tailor your resume to the role."
            value={jobDescription}
            disabled={disabled}
            onChange={(event) => onJobDescriptionChange(event.target.value)}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              Required for AI Coaching. Aim for at least {MIN_JOB_DESCRIPTION_WORDS} words so the AI
              has enough signal.
            </span>
            <span>{wordCount} words</span>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
