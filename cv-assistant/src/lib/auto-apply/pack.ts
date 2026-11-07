import type { DraftAnswer } from "./questions";

export type AutofillPack = {
  kind: "cva-autofill";
  version: number;
  job: { title: string; company: string; applyUrl: string; provider: string };
  fields: Array<{ fieldName: string; label: string; type: string; required: boolean; value: string; options: string[] }>;
  coverLetter: string;
  createdAt: string;
};

export function buildAutofillPack(args: {
  title: string;
  company: string;
  applyUrl: string;
  provider: string;
  answers: DraftAnswer[];
  coverLetter: string;
}): AutofillPack {
  return {
    kind: "cva-autofill",
    version: 1,
    job: { title: args.title, company: args.company, applyUrl: args.applyUrl, provider: args.provider },
    fields: args.answers.map((answer) => ({
      fieldName: answer.fieldName,
      label: answer.label,
      type: answer.type,
      required: answer.required,
      value: answer.category === "cover_letter" && answer.type !== "file" ? args.coverLetter : answer.value,
      options: answer.options.map((option) => option.label),
    })),
    coverLetter: args.coverLetter,
    createdAt: new Date().toISOString(),
  };
}

/** Plain-text copy of the application for job boards where autofill cannot run. */
export function packToText(pack: AutofillPack) {
  const lines = [`${pack.job.title} at ${pack.job.company}`, pack.job.applyUrl, ""];
  for (const field of pack.fields) {
    if (field.type === "file" || !field.value) continue;
    lines.push(`${field.label}\n${field.value}\n`);
  }
  if (pack.coverLetter) lines.push("Cover letter", pack.coverLetter);
  return lines.join("\n").trim();
}

/** URL-fragment encoding (base64url of UTF-8 JSON). The fragment is never sent to any server. */
export function encodePackForFragment(pack: AutofillPack) {
  const bytes = new TextEncoder().encode(JSON.stringify(pack));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
