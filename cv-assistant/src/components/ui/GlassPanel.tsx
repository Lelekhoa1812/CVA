import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type GlassPanelProps<T extends ElementType> = {
  as?: T;
  children: ReactNode;
  className?: string;
  id?: string;
  strong?: boolean;
};

export default function GlassPanel<T extends ElementType = "div">({
  as,
  children,
  className,
  id,
  strong = false,
}: GlassPanelProps<T>) {
  const Component = (as || "div") as ElementType;

  return (
    <Component
      id={id}
      className={cn(
        strong ? "glass-panel-strong" : "glass-panel",
        "rounded-[1.5rem]",
        className,
      )}
    >
      {children}
    </Component>
  );
}
