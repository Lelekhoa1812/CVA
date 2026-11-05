import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "default" | "sm" | "icon";

const variantClass: Record<ButtonVariant, string> = {
  default:
    "bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)))] text-primary-foreground shadow-[0_16px_32px_hsl(var(--primary)/0.22)] enabled:hover:-translate-y-px",
  secondary:
    "border border-border bg-[hsl(var(--surface-1)/0.72)] text-foreground enabled:hover:border-primary/40 enabled:hover:bg-[hsl(var(--surface-2)/0.88)]",
  outline: "border border-border bg-transparent text-foreground enabled:hover:bg-muted",
  ghost: "bg-transparent text-foreground enabled:hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground enabled:hover:brightness-110",
};

const sizeClass: Record<ButtonSize, string> = {
  default: "min-h-11 px-5 py-2.5 text-sm",
  sm: "min-h-9 px-3.5 py-1.5 text-xs",
  icon: "h-11 w-11",
};

export function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
    variantClass[variant],
    sizeClass[size],
    className,
  );
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={buttonVariants({ variant, size, className })} {...props} />;
});
