"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within Tabs");
  }
  return context;
}

type TabsProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
};

export function Tabs({ value: valueProp, defaultValue = "", onValueChange, className, children }: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const value = valueProp ?? uncontrolledValue;
  const baseId = React.useId();
  const onValueChangeRef = React.useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  const setValue = React.useCallback((next: string) => {
    if (valueProp === undefined) setUncontrolledValue(next);
    onValueChangeRef.current?.(next);
  }, [valueProp]);

  const context = React.useMemo(() => ({ value, setValue, baseId }), [value, setValue, baseId]);

  return (
    <TabsContext.Provider value={context}>
      <div className={cn("min-w-0", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  orientation = "horizontal",
  onKeyDown,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      {...props}
      role="tablist"
      aria-orientation={orientation}
      className={cn(
        orientation === "vertical"
          ? "flex w-full flex-col items-stretch gap-2"
          : "inline-flex max-w-full items-center gap-1 rounded-full bg-muted/70 p-1",
        className,
      )}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
        const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
        if (!horizontal && !vertical && event.key !== "Home" && event.key !== "End") return;
        if (orientation === "horizontal" && vertical) return;
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'));
        const current = tabs.findIndex((tab) => tab === document.activeElement);
        if (current === -1 || tabs.length === 0) return;
        event.preventDefault();
        let next = current;
        if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % tabs.length;
        else next = (current - 1 + tabs.length) % tabs.length;
        tabs[next]?.focus();
        tabs[next]?.click();
      }}
    />
  );
}

export function TabsTrigger({
  className,
  value,
  onClick,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const { value: selectedValue, setValue, baseId } = useTabsContext();
  const selected = selectedValue === value;

  return (
    <button
      {...props}
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      data-state={selected ? "active" : "inactive"}
      className={cn(
        "inline-flex min-h-11 items-center rounded-2xl px-3 py-2 text-sm font-medium transition focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border border-primary bg-primary/15 text-foreground"
          : "border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setValue(value);
      }}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  className,
  value,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const { value: selectedValue, baseId } = useTabsContext();
  if (selectedValue !== value) return null;

  return (
    <div
      {...props}
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      className={cn("min-w-0", className)}
    >
      {children}
    </div>
  );
}
