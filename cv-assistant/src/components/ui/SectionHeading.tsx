import type { ReactNode } from "react";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export default function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl space-y-2">
        {eyebrow ? <p className="section-kicker">{eyebrow}</p> : null}
        <h2 className="text-foreground font-display text-2xl sm:text-3xl">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-sm leading-7 sm:text-base">{description}</p>
        ) : null}
      </div>
      {action ? <div className="sm:shrink-0">{action}</div> : null}
    </div>
  );
}
