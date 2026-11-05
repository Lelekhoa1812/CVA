import { MIN_JOB_DESCRIPTION_WORDS } from "@/lib/resume/constants";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Switch
          id="ai-coaching"
          checked={enabled}
          disabled={disabled}
          onCheckedChange={onEnabledChange}
          aria-label="Tailor to a job"
        />
        <Label htmlFor="ai-coaching">Use AI coaching</Label>
      </div>

      {enabled ? (
        <div className="space-y-2">
          <Label htmlFor="job-description">
            Job description <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="job-description"
            className="min-h-40 resize-y"
            aria-invalid={!!error}
            aria-describedby={error ? "job-description-help job-description-error" : "job-description-help"}
            placeholder="Paste the full job description so AI can rerank and tailor your resume to the role."
            value={jobDescription}
            disabled={disabled}
            onChange={(event) => onJobDescriptionChange(event.target.value)}
          />
          <div id="job-description-help" className="flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center">
            <span className="max-w-prose">
              Required for AI Coaching. Aim for at least {MIN_JOB_DESCRIPTION_WORDS} words so the AI
              has enough signal.
            </span>
            <span aria-live="polite" aria-atomic="true" className="shrink-0">{wordCount} words</span>
          </div>
          {error ? <p id="job-description-error" className="text-sm text-destructive" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
