import { buildApiUrl } from "@/lib/api";
import type { StyleOption } from "@/components/resume/types";

// Point every preview at the real `/styleX.pdf` asset so the chooser matches the downloadable format.
export const STYLE_OPTIONS: StyleOption[] = [
  { id: "style1", label: "Style 1 - Harvard", previewKind: "pdf", previewSrc: buildApiUrl("/style1.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitV&zoom=1.15") },
  { id: "style2", label: "Style 2 - Chronological", previewKind: "pdf", previewSrc: buildApiUrl("/style2.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitV&zoom=1.05") },
  { id: "style3", label: "Style 3 - Modernised", previewKind: "pdf", previewSrc: buildApiUrl("/style3.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitV&zoom=1.15") },
  { id: "style4", label: "Style 4 - Creative", previewKind: "pdf", previewSrc: buildApiUrl("/style4.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitV&zoom=1.15") },
  { id: "style5", label: "Style 5 - Ledger", previewKind: "pdf", previewSrc: buildApiUrl("/style5.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitV&zoom=1.05") },
];
