"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog components must be used within Dialog");
  }
  return context;
}

type DialogProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
};

export function Dialog({ open: openProp, defaultOpen = false, onOpenChange, restoreFocusRef, children }: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const titleId = React.useId();
  const descriptionId = React.useId();
  const onOpenChangeRef = React.useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const setOpen = React.useCallback((next: boolean) => {
    if (openProp === undefined) setUncontrolledOpen(next);
    onOpenChangeRef.current?.(next);
  }, [openProp]);

  const context = React.useMemo(
    () => ({ open, setOpen, titleId, descriptionId, restoreFocusRef }),
    [open, setOpen, titleId, descriptionId, restoreFocusRef],
  );

  return <DialogContext.Provider value={context}>{children}</DialogContext.Provider>;
}

export function DialogContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen, titleId, descriptionId, restoreFocusRef } = useDialogContext();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const setOpenRef = React.useRef(setOpen);
  setOpenRef.current = setOpen;

  React.useLayoutEffect(() => {
    if (!open) return;
    const opener =
      restoreFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = panelRef.current;
    node?.querySelector<HTMLElement>("button")?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpenRef.current(false);
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown, true);
      if (opener && !opener.hasAttribute("disabled")) opener.focus();
    };
  }, [open, restoreFocusRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-background/80 p-3 backdrop-blur-sm sm:p-6">
      <div
        {...props}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn(
          "glass-panel-strong relative max-h-full min-h-0 w-full min-w-0 max-w-5xl overflow-x-hidden overflow-y-auto overscroll-contain rounded-[1.5rem] p-4 text-foreground shadow-2xl sm:p-6",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 space-y-1 pr-12", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = useDialogContext();
  return <h2 id={titleId} className={cn("font-display text-xl text-foreground", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  const { descriptionId } = useDialogContext();
  return <p id={descriptionId} className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end", className)} {...props} />;
}

export function DialogClose({ className, onClick, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useDialogContext();
  return (
    <button
      type="button"
      {...props}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "absolute right-3 top-3", className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(false);
      }}
    >
      {children}
    </button>
  );
}
