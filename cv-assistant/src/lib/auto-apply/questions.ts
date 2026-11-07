// Application-form question model shared by the resolver (schema ingestion), the preparer (answer drafting),
// the review UI, and the autofill script. Everything here is pure so it can be unit tested.

export type FormQuestionType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "url"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "boolean"
  | "file";

export type QuestionCategory =
  | "first_name"
  | "last_name"
  | "full_name"
  | "preferred_name"
  | "email"
  | "phone"
  | "location"
  | "current_company"
  | "linkedin"
  | "github"
  | "website"
  | "resume"
  | "cover_letter"
  | "work_rights"
  | "sponsorship"
  | "salary"
  | "notice"
  | "relocation"
  | "workplace"
  | "source"
  | "demographic"
  | "consent"
  | "relatives"
  | "previous_employment"
  | "motivation"
  | "experience"
  | "other";

export type QuestionOption = { label: string; value: string };

export type FormQuestion = {
  id: string;
  /** The form field's own name/path (e.g. question_123, urls[LinkedIn], _systemfield_email). */
  fieldName: string;
  label: string;
  type: FormQuestionType;
  required: boolean;
  options: QuestionOption[];
  description?: string;
  category: QuestionCategory;
};

export type AnswerSource = "profile" | "preference" | "memory" | "ai" | "user" | "document" | "default";

export type DraftAnswer = {
  questionId: string;
  fieldName: string;
  label: string;
  type: FormQuestionType;
  category: QuestionCategory;
  required: boolean;
  options: QuestionOption[];
  value: string;
  source: AnswerSource;
  confidence: number;
  needsInput: boolean;
  sensitive: boolean;
  note?: string;
};

export type ApplicantPreferences = {
  workRights: string;
  requiresSponsorship: "" | "yes" | "no";
  salaryExpectation: string;
  noticePeriod: string;
  currentLocation: string;
  willingToRelocate: "" | "yes" | "no";
  hybridOk: "" | "yes" | "no";
  howHeard: string;
  github: string;
  currentCompany: string;
};

export const EMPTY_PREFERENCES: ApplicantPreferences = {
  workRights: "",
  requiresSponsorship: "",
  salaryExpectation: "",
  noticePeriod: "",
  currentLocation: "",
  willingToRelocate: "",
  hybridOk: "",
  howHeard: "",
  github: "",
  currentCompany: "",
};

export type CandidateProfile = {
  employers?: string[];
  name?: string;
  email?: string;
  workEmail?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  location?: string;
};

const SENSITIVE_CATEGORIES = new Set<QuestionCategory>([
  "work_rights",
  "sponsorship",
  "salary",
  "notice",
  "relocation",
  "workplace",
  "demographic",
  "consent",
  "relatives",
]);

export function normalizeQuestionLabel(label: string) {
  return label
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[✱*]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CATEGORY_RULES: Array<[QuestionCategory, RegExp]> = [
  ["preferred_name", /\bpreferred (first )?name\b|\bname you go by\b/],
  ["first_name", /\bfirst name\b|\bgiven name\b|^first$/],
  ["last_name", /\blast name\b|\bsurname\b|\bfamily name\b/],
  ["full_name", /^(full |legal |your )?name\b(?! of )|\bfull name\b|^legal name/],
  ["email", /\be ?mail\b/],
  ["phone", /\bphone\b|\bmobile\b|\bcontact number\b/],
  ["linkedin", /linked ?in/],
  ["github", /\bgithub\b/],
  ["website", /\bportfolio\b|\bwebsite\b|\bpersonal (site|url)\b|^urls? other|\bother (url|website|link)\b/],
  ["resume", /\bresume\b|\bcurriculum vitae\b|^cv\b|\bcv\b/],
  ["cover_letter", /\bcover letter\b/],
  ["sponsorship", /\bsponsor|\bvisa (assistance|support)\b/],
  [
    "work_rights",
    /\b(right|rights|eligib\w*|authori[sz]\w*|entitle\w*|permitted|legally able)\b.{0,40}\bwork\b|\bwork(ing)? (rights|permit|authori[sz]ation|visa)\b|\bvisa (status|type)\b|\bcitizen(ship)?\b|\bpermanent resident\b/,
  ],
  ["salary", /\bsalary\b|\bcompensation\b|\bremuneration\b|\bpay expectation|\brate expectation|\bdaily rate\b/],
  ["notice", /\bnotice period\b|\bstart date\b|\bwhen (can|could) you start\b|\bavailab(le|ility) to start\b|\bearliest start\b/],
  ["relocation", /\breloca/],
  ["workplace", /\bflexible working\b|\bworking arrangement\b|\bhybrid\b|\bin[- ]office\b|\bon[- ]?site\b|\bcommute\b|\bremote\b.{0,20}\b(ok|comfortable|able)\b/],
  ["previous_employment", /\b(previously|ever|before)\b.{0,30}\b(employed|worked|work)\b.{0,20}\b(by|for|at)\b|\bformer (employee|staff)\b|\bex[- ]employee\b/],
  ["relatives", /\brelative|\bfamily member\b.{0,40}\bwork/],
  [
    "demographic",
    /\bgender\b|\bpronoun|\bethnic|\brace\b|\bveteran\b|\bdisabilit|\bsexual orientation\b|\baboriginal\b|\btorres strait\b|\bindigenous\b|\blgbt|\btransgender\b|\bage range\b/,
  ],
  [
    "consent",
    /\bconsent\b|\bprivacy (policy|notice|statement)\b|\bi (agree|acknowledge|confirm|certify|declare)\b|\backnowledg|\bterms\b|\bdeclaration\b|\bbackground check\b/,
  ],
  ["source", /\bhow did you (hear|find|learn)\b|\bwhere did you (hear|find|see)\b|\breferr(al|ed) source\b|^source$/],
  ["current_company", /\bcurrent (company|employer|organi[sz]ation)\b|^company$|^org$/],
  ["location", /\blocation\b|\bwhere (are you|do you) (currently )?(located|live|based)\b|\bcity\b|\bcountry of residence\b|\baddress\b/],
  ["motivation", /\bwhy\b.{0,40}\b(join|work|interested|apply|us|role|company|position)\b|\bwhat (excites|interests|attracts|draws) you\b|\bmotivat/],
  [
    "experience",
    /\bdescribe\b|\btell us\b|\bexample\b|\bexperience (with|in)\b|\bhow many years\b|\byears of experience\b|\bproject\b|\bachievement\b|\bwalk us through\b|\bexplain\b/,
  ],
];

export function classifyQuestion(label: string, type?: FormQuestionType): QuestionCategory {
  const normalized = normalizeQuestionLabel(label);
  if (type === "file") {
    if (/cover letter/.test(normalized)) return "cover_letter";
    return "resume";
  }
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(normalized)) return category;
  }
  return "other";
}

export function isSensitiveCategory(category: QuestionCategory) {
  return SENSITIVE_CATEGORIES.has(category);
}

export function buildQuestion(input: Omit<FormQuestion, "category"> & { category?: QuestionCategory }): FormQuestion {
  return {
    ...input,
    label: input.label.replace(/\s+/g, " ").replace(/[✱*]\s*$/, "").trim(),
    options: input.options || [],
    category: input.category || classifyQuestion(input.label, input.type),
  };
}

/** The question set used when the employer form schema cannot be read (job boards, Workday, PageUp, ...). */
export function standardQuestionSet(company: string): FormQuestion[] {
  const base: Array<[string, string, FormQuestionType, boolean]> = [
    ["first_name", "First name", "text", true],
    ["last_name", "Last name", "text", true],
    ["email", "Email", "email", true],
    ["phone", "Phone", "phone", true],
    ["location", "Current location", "text", true],
    ["linkedin", "LinkedIn profile", "url", false],
    ["website", "Portfolio or website", "url", false],
    ["resume", "Resume/CV", "file", true],
    ["cover_letter", "Cover letter", "textarea", false],
    ["work_rights", "Do you have the right to work in Australia?", "text", true],
    ["sponsorship", "Will you now or in the future require visa sponsorship?", "boolean", true],
    ["salary", "What are your salary expectations?", "text", false],
    ["notice", "What is your notice period / earliest start date?", "text", false],
    ["motivation", `Why do you want to work at ${company || "this company"}?`, "textarea", false],
  ];
  return base.map(([id, label, type, required]) =>
    buildQuestion({ id: `std:${id}`, fieldName: id, label, type, required, options: [] }),
  );
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] || "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function normalizeUrl(value?: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const YES = /^(y|yes|true|1|i do|i will|i am|correct)\b/i;
const NO = /^(n|no|false|0|i do not|i don t|i will not|not required|none)\b/i;

/** Map a free-text answer onto one of a question's options (exact, contains, yes/no synonyms). */
export function matchOption(value: string, options: QuestionOption[]): QuestionOption | null {
  if (!options.length || !value.trim()) return null;
  const target = normalizeQuestionLabel(value);
  const normalized = options.map((option) => ({ option, label: normalizeQuestionLabel(option.label) }));
  const exact = normalized.find((entry) => entry.label === target || normalizeQuestionLabel(entry.option.value) === target);
  if (exact) return exact.option;
  if (YES.test(target)) {
    const yes = normalized.find((entry) => YES.test(entry.label));
    if (yes) return yes.option;
  }
  if (NO.test(target)) {
    const no = normalized.find((entry) => NO.test(entry.label));
    if (no) return no.option;
  }
  const contains = normalized.find((entry) => entry.label && (entry.label.includes(target) || target.includes(entry.label)));
  if (contains) return contains.option;
  const targetTokens = new Set(target.split(" ").filter((token) => token.length > 2));
  let best: { option: QuestionOption; score: number } | null = null;
  for (const entry of normalized) {
    const tokens = entry.label.split(" ").filter((token) => token.length > 2);
    if (!tokens.length) continue;
    const shared = tokens.filter((token) => targetTokens.has(token)).length;
    const score = shared / Math.max(tokens.length, targetTokens.size || 1);
    if (shared && (!best || score > best.score)) best = { option: entry.option, score };
  }
  return best && best.score >= 0.34 ? best.option : null;
}

const DECLINE_OPTION = /decline|prefer not|don t wish|do not wish|not to (say|answer|disclose)|rather not/;

function yesNo(value: "" | "yes" | "no") {
  return value === "yes" ? "Yes" : value === "no" ? "No" : "";
}

function makeAnswer(
  question: FormQuestion,
  value: string,
  source: AnswerSource,
  confidence: number,
  note?: string,
): DraftAnswer {
  const sensitive = isSensitiveCategory(question.category);
  let finalValue = value.trim();
  let needsInput = false;
  if (question.type === "boolean" || question.options.length === 2) {
    if (/^(true|yes|y)$/i.test(finalValue)) finalValue = "Yes";
    else if (/^(false|no|n)$/i.test(finalValue)) finalValue = "No";
  }
  if (question.options.length && finalValue && question.type !== "file") {
    const option = matchOption(finalValue, question.options);
    if (option) finalValue = option.label;
    else {
      needsInput = question.required;
      note = note || "Could not map the answer onto one of the form's options.";
    }
  }
  if (!finalValue && question.required && question.type !== "file") needsInput = true;
  return {
    questionId: question.id,
    fieldName: question.fieldName,
    label: question.label,
    type: question.type,
    category: question.category,
    required: question.required,
    options: question.options,
    value: finalValue,
    source,
    confidence: finalValue ? confidence : 0,
    needsInput,
    sensitive,
    note,
  };
}

export type MemoryEntry = { questionPattern: string; answer: string };

export function findMemoryAnswer(question: FormQuestion, memory: MemoryEntry[]): MemoryEntry | null {
  const target = normalizeQuestionLabel(question.label);
  if (!target) return null;
  const targetTokens = new Set(target.split(" ").filter((token) => token.length > 2));
  let best: { entry: MemoryEntry; score: number } | null = null;
  for (const entry of memory) {
    const pattern = normalizeQuestionLabel(entry.questionPattern);
    if (!pattern || !entry.answer.trim()) continue;
    if (pattern === target) return entry;
    if (classifyQuestion(pattern) !== question.category) continue;
    const tokens = pattern.split(" ").filter((token) => token.length > 2);
    const shared = tokens.filter((token) => targetTokens.has(token)).length;
    const score = (2 * shared) / (tokens.length + targetTokens.size || 1);
    if (!best || score > best.score) best = { entry, score };
  }
  return best && best.score >= 0.8 ? best.entry : null;
}

/**
 * Deterministic answers from the profile, saved preferences, and the question bank. Returns null when the
 * question needs generated (AI) content.
 */
export function answerDeterministically(args: {
  question: FormQuestion;
  profile: CandidateProfile;
  preferences: ApplicantPreferences;
  memory: MemoryEntry[];
  company: string;
}): DraftAnswer | null {
  const { question, profile, preferences } = args;
  const name = splitName(profile.name || "");
  const remembered = findMemoryAnswer(question, args.memory);

  switch (question.category) {
    case "first_name":
      return makeAnswer(question, name.first, "profile", 0.99);
    case "last_name":
      return makeAnswer(question, name.last, "profile", 0.99);
    case "full_name":
      return makeAnswer(question, profile.name || "", "profile", 0.99);
    case "preferred_name":
      return makeAnswer(question, name.first, "profile", 0.9);
    case "email":
      return makeAnswer(question, profile.email || profile.workEmail || "", "profile", 0.99);
    case "phone":
      return makeAnswer(question, profile.phone || "", "profile", 0.99);
    case "linkedin":
      return makeAnswer(question, normalizeUrl(profile.linkedin), "profile", 0.97);
    case "github":
      return makeAnswer(question, normalizeUrl(preferences.github), "preference", 0.95);
    case "website":
      return makeAnswer(question, normalizeUrl(profile.website), "profile", 0.95);
    case "location":
      return makeAnswer(question, preferences.currentLocation || profile.location || "", "preference", 0.95);
    case "current_company":
      return makeAnswer(question, preferences.currentCompany, "preference", 0.9);
    case "resume":
      return { ...makeAnswer(question, "Attached resume", "document", 1), needsInput: false };
    case "cover_letter":
      // Filled with the generated cover letter by the preparer.
      return null;
    case "work_rights":
      if (remembered) return makeAnswer(question, remembered.answer, "memory", 0.95);
      if (question.options.length || question.type === "boolean") {
        const hasRights = /citizen|permanent|unrestricted|full|yes/i.test(preferences.workRights);
        const answer = preferences.workRights ? (hasRights ? "Yes" : preferences.workRights) : "";
        return makeAnswer(question, answer, "preference", 0.9);
      }
      return makeAnswer(question, preferences.workRights, "preference", 0.95);
    case "sponsorship":
      return makeAnswer(question, remembered?.answer || yesNo(preferences.requiresSponsorship), remembered ? "memory" : "preference", 0.95);
    case "salary":
      return makeAnswer(question, remembered?.answer || preferences.salaryExpectation, remembered ? "memory" : "preference", 0.9);
    case "notice":
      return makeAnswer(question, remembered?.answer || preferences.noticePeriod, remembered ? "memory" : "preference", 0.9);
    case "relocation": {
      const value = remembered?.answer || yesNo(preferences.willingToRelocate);
      return value ? makeAnswer(question, value, remembered ? "memory" : "preference", 0.85) : null;
    }
    case "workplace": {
      const value = remembered?.answer || yesNo(preferences.hybridOk);
      return value ? makeAnswer(question, value, remembered ? "memory" : "preference", 0.85) : null;
    }
    case "previous_employment": {
      const company = normalizeQuestionLabel(args.company);
      const worked = Boolean(company) && (profile.employers || []).some((employer) => {
        const name = normalizeQuestionLabel(employer);
        return Boolean(name) && (name.includes(company) || company.includes(name));
      });
      return makeAnswer(question, worked ? "Yes" : "No", "profile", 0.9);
    }
    case "relatives":
      return makeAnswer(question, remembered?.answer || "No", remembered ? "memory" : "default", 0.7, "Defaulted to No; change it if you have relatives at this company.");
    case "source":
      return makeAnswer(question, remembered?.answer || preferences.howHeard || "Company careers page", remembered ? "memory" : "preference", 0.8);
    case "demographic": {
      const decline = question.options.find((option) => DECLINE_OPTION.test(normalizeQuestionLabel(option.label)));
      if (remembered) return makeAnswer(question, remembered.answer, "memory", 0.95);
      if (decline) return makeAnswer(question, decline.label, "default", 0.9, "Voluntary disclosure defaulted to decline.");
      return { ...makeAnswer(question, "", "default", 0), needsInput: question.required };
    }
    case "consent": {
      const agree = question.options.find((option) => /yes|agree|acknowledge|accept|confirm|consent|i have read/i.test(option.label));
      const value = remembered?.answer || agree?.label || (question.type === "boolean" ? "Yes" : "");
      return makeAnswer(question, value, remembered ? "memory" : "default", 0.8, "Acknowledgement pre-checked; it is shown for your approval.");
    }
    default:
      if (remembered) return makeAnswer(question, remembered.answer, "memory", 0.9);
      return null;
  }
}

export function finalizeGeneratedAnswer(question: FormQuestion, value: string, confidence = 0.75, note?: string): DraftAnswer {
  return makeAnswer(question, value, "ai", confidence, note);
}

export function applyUserAnswer(answer: DraftAnswer, value: string): DraftAnswer {
  const question: FormQuestion = {
    id: answer.questionId,
    fieldName: answer.fieldName,
    label: answer.label,
    type: answer.type,
    required: answer.required,
    options: answer.options,
    category: answer.category,
  };
  const next = makeAnswer(question, value, "user", 1);
  return { ...next, note: next.needsInput ? next.note : undefined };
}

export function countMissing(answers: DraftAnswer[]) {
  return answers.filter((answer) => answer.needsInput).length;
}
