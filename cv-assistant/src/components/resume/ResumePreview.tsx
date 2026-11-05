import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ResumePreviewProps = {
  pdfUrl: string | null;
  loading: boolean;
  loadingMessage: string;
  onEdit: () => void;
};

export function ResumePreview({ pdfUrl, loading, loadingMessage, onEdit }: ResumePreviewProps) {
  return (
    <div className="space-y-4">
      <Card className="flex min-h-[300px] items-center justify-center overflow-hidden p-3 sm:min-h-[400px] sm:p-4">
        {pdfUrl ? (
          <iframe
            src={pdfUrl}
            title="Generated resume PDF preview"
            className="h-[min(75vh,800px)] min-h-[320px] w-full max-w-full rounded-xl bg-white sm:min-h-[400px]"
          />
        ) : (
          <div className="px-4 py-10 text-center" aria-live="polite">
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">{loadingMessage}</p>
              </div>
            ) : (
              <>
                <p className="font-medium text-foreground">Your generated resume preview will appear here</p>
                <p className="mt-1 text-sm text-muted-foreground">Fill the form and click Generate PDF</p>
              </>
            )}
          </div>
        )}
      </Card>
      {pdfUrl ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onEdit}>
            Edit resume
          </Button>
          <a href={pdfUrl} download="resume.pdf" className={cn(buttonVariants(), "w-full sm:w-auto")}>
            Download PDF
          </a>
        </div>
      ) : null}
    </div>
  );
}
