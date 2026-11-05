import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariant = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  outline: "border-border bg-transparent text-foreground",
  destructive: "border-transparent bg-destructive/15 text-destructive",
} as const;

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: keyof typeof badgeVariant;
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        badgeVariant[variant],
        className,
      )}
      {...props}
    />
  );
}
