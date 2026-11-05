import * as React from "react";
import { cn } from "@/lib/utils";
import { controlClassName } from "@/components/ui/input";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn("flex w-full px-4 py-3", controlClassName, className)} {...props} />;
});
