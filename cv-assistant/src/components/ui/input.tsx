import * as React from "react";
import { cn } from "@/lib/utils";

export const controlClassName =
  "rounded-2xl border border-border bg-[hsl(var(--input))] text-sm text-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)/0.05)] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ className, type = "text", ...props }, ref) {
  return <input ref={ref} type={type} className={cn("flex h-11 w-full px-4", controlClassName, className)} {...props} />;
});
