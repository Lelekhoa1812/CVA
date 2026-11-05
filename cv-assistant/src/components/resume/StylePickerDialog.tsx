"use client";

import type { RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STYLE_OPTIONS } from "@/components/resume/style-options";
import type { StyleId, StyleOption } from "@/components/resume/types";
import { cn } from "@/lib/utils";

type StylePickerDialogProps = {
  open: boolean;
  isMobile: boolean;
  currentPreviewIndex: number;
  modalSelectedStyle: StyleId | null;
  aiCoachingInputError: string | null;
  restoreFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onGoTo: (index: number) => void;
  onSelectStyle: (styleId: StyleId) => void;
  onGenerate: () => void;
};

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      {direction === "left" ? (
        <path d="M15 19 8 12l7-7" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function StylePreviewFrame({ style, selected, tall }: { style: StyleOption; selected: boolean; tall: boolean }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-[hsl(var(--surface-2)/0.72)] px-3 py-2">
        <span className="min-w-0 text-sm font-medium text-foreground" aria-live="polite" aria-atomic="true">
          {style.label}
        </span>
        {selected ? <Badge className="shrink-0">Selected</Badge> : null}
      </div>
      <div className={cn("relative w-full overflow-hidden bg-white", tall ? "h-[min(52vh,520px)]" : "h-[min(32vh,280px)]")}>
        {style.previewKind === "pdf" && style.previewSrc ? (
          <iframe
            key={style.id}
            src={style.previewSrc}
            title={`${style.label} Preview`}
            tabIndex={-1}
            className="h-full w-full border-0"
            style={{ width: "100%", height: "100%" }}
            onError={(event) => console.error(`${style.label} PDF failed to load:`, event)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Preview unavailable</div>
        )}
      </div>
    </Card>
  );
}

function SelectStyleButton({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant={selected ? "secondary" : "default"} aria-pressed={selected} className="min-h-11 w-full" onClick={onClick}>
      {selected ? "Selected" : "Select this style"}
    </Button>
  );
}

export function StylePickerDialog({
  open,
  isMobile,
  currentPreviewIndex,
  modalSelectedStyle,
  aiCoachingInputError,
  restoreFocusRef,
  onClose,
  onPrev,
  onNext,
  onGoTo,
  onSelectStyle,
  onGenerate,
}: StylePickerDialogProps) {
  const currentStyle = STYLE_OPTIONS[currentPreviewIndex] ?? STYLE_OPTIONS[0];
  const currentSelected = modalSelectedStyle === currentStyle.id;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }} restoreFocusRef={restoreFocusRef}>
      <DialogContent>
        <DialogClose aria-label="Close">
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        </DialogClose>
        <DialogHeader>
          <DialogTitle>Choose a resume style</DialogTitle>
          <DialogDescription>
            {isMobile
              ? "Use Previous and Next to preview each style, then select the one you want."
              : "Preview a style at a readable size, select it, then generate."}
          </DialogDescription>
        </DialogHeader>

        {isMobile ? (
          <div className="space-y-4">
            <StylePreviewFrame style={currentStyle} selected={currentSelected} tall={false} />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" className="min-h-11" aria-label="Previous style" onClick={onPrev}>
                <Chevron direction="left" />
                Previous
              </Button>
              <Button type="button" variant="secondary" className="min-h-11" aria-label="Next style" onClick={onNext}>
                Next
                <Chevron direction="right" />
              </Button>
            </div>
            <p className="text-center text-sm text-muted-foreground" aria-live="polite">
              {currentPreviewIndex + 1} of {STYLE_OPTIONS.length}
              {modalSelectedStyle && modalSelectedStyle !== currentStyle.id
                ? ` · Selected: ${STYLE_OPTIONS.find((style) => style.id === modalSelectedStyle)?.label}`
                : ""}
            </p>
            <SelectStyleButton selected={currentSelected} onClick={() => onSelectStyle(currentStyle.id)} />
          </div>
        ) : (
          <Tabs
            value={currentStyle.id}
            onValueChange={(styleId) => {
              const index = STYLE_OPTIONS.findIndex((style) => style.id === styleId);
              if (index >= 0) onGoTo(index);
            }}
            className="grid min-w-0 grid-cols-[minmax(0,15rem)_minmax(0,1fr)] gap-4"
          >
            <TabsList orientation="vertical" aria-label="Resume styles">
              {STYLE_OPTIONS.map((style) => {
                const chosen = modalSelectedStyle === style.id;
                const showing = style.id === currentStyle.id;
                return (
                  <TabsTrigger key={style.id} value={style.id} className="h-auto w-full whitespace-normal py-2">
                    <span className="flex w-full min-w-0 flex-col items-start gap-1 text-left">
                      <span className="font-medium text-foreground">{style.label}</span>
                      {chosen ? (
                        <span className="text-xs text-primary">Selected</span>
                      ) : showing ? (
                        <span className="text-xs text-muted-foreground">Showing</span>
                      ) : null}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {STYLE_OPTIONS.map((style) => (
              <TabsContent key={style.id} value={style.id} className="space-y-3">
                <StylePreviewFrame style={style} selected={modalSelectedStyle === style.id} tall />
                <SelectStyleButton selected={modalSelectedStyle === style.id} onClick={() => onSelectStyle(style.id)} />
              </TabsContent>
            ))}
          </Tabs>
        )}

        <Separator className="my-4" />
        {aiCoachingInputError ? (
          <p className="mb-3 text-sm text-destructive" role="alert">{aiCoachingInputError}</p>
        ) : !modalSelectedStyle ? (
          <p className="mb-3 text-sm text-muted-foreground">Select a style to enable Generate.</p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={!modalSelectedStyle || !!aiCoachingInputError}
            onClick={onGenerate}
          >
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
