export type Project = { name: string; summary?: string; description?: string };
export type Experience = { companyName: string; role: string; summary?: string; description?: string };
export type Profile = {
  name: string;
  major: string;
  school: string;
  studyPeriod?: string;
  email: string;
  workEmail?: string;
  phone: string;
  website?: string;
  linkedin?: string;
  skills?: string;
  projects: Project[];
  experiences: Experience[];
  languages?: string;
};

export type StyleId = "style1" | "style2" | "style3" | "style4" | "style5";
export type FontSize = "8pt" | "10pt" | "11pt" | "12pt" | "14pt";
export type AccentColor = "black" | "dark-blue" | "dark-gray" | "crimson" | "dark-green";
export type CoachRole = "user" | "assistant";
export type CoachMessage = { role: CoachRole; content: string };
export type ContentSelection = { type: "project" | "experience"; index: number; name: string };
export type CoachingAgent = "styling" | "content";

export type StylePreferences = {
  fontSize?: string;
  useBold?: boolean;
  useItalic?: boolean;
  boldSections?: string[];
  italicSections?: string[];
  contentDensity?: string;
  additionalNotes?: string;
  accentColor?: AccentColor;
};

export type StyleOption = {
  id: StyleId;
  label: string;
  previewKind: "pdf" | "mock";
  previewSrc?: string;
};
