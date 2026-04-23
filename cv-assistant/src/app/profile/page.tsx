"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HoverTooltip from "@/components/ui/HoverTooltip";
import ModuleShell from "@/components/ui/ModuleShell";
import GlassPanel from "@/components/ui/GlassPanel";
import SectionHeading from "@/components/ui/SectionHeading";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion/Reveal";
import { buildApiUrl } from "@/lib/api";
import {
  sortExperiencesByRecency,
  type ExperienceOrderingMetadata,
} from "@/lib/experience-ordering";
import type { ImportedProfileData } from "@/lib/profile-import";

type Project = {
  _id?: string;
  name: string;
  description: string;
  summary?: string;
  _needsSummary?: boolean;
  _clientId?: string;
  createdAt?: string;
};

type Experience = {
  _id?: string;
  companyName: string;
  role: string;
  timeFrom: string;
  timeTo: string;
  description: string;
  summary?: string;
  _needsSummary?: boolean;
  _clientId?: string;
  createdAt?: string;
  updatedAt?: string;
  normalizedTimeTo?: ExperienceOrderingMetadata["normalizedTimeTo"];
  normalizedTimeToSortKey?: ExperienceOrderingMetadata["normalizedTimeToSortKey"];
  normalizedTimeToIsPresent?: ExperienceOrderingMetadata["normalizedTimeToIsPresent"];
  normalizedTimeToSource?: ExperienceOrderingMetadata["normalizedTimeToSource"];
};

type Profile = {
  name: string;
  major: string;
  school: string;
  studyPeriod?: string;
  email: string;
  workEmail?: string;
  phone: string;
  website?: string;
  linkedin?: string;
  profileSummary?: string;
  skills?: string;
  projects: Project[];
  experiences: Experience[];
  languages?: string;
};

type TextSectionField = "profileSummary" | "skills";
type TextSectionAction = "enhance" | "explore";

const TEXT_SECTION_META = {
  profileSummary: {
    apiType: "profile" as const,
    name: "Profile",
    label: "profile",
    exploreTooltip:
      "Explore drafts a resume-ready profile from your education, projects, experience, and saved skills so the summary stays specific to your background.",
  },
  skills: {
    apiType: "skills" as const,
    name: "Skills",
    label: "skills",
    exploreTooltip:
      "Explore derives the strongest employer-friendly skills from your education, projects, and experience so this section stays concise, focused, and ATS-friendly.",
  },
} as const;

const emptyProfile: Profile = {
  name: "",
  major: "",
  school: "",
  studyPeriod: "",
  email: "",
  workEmail: "",
  phone: "",
  website: "",
  linkedin: "",
  profileSummary: "",
  skills: "",
  projects: [],
  experiences: [],
  languages: "",
};

const createClientId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
};

const PROFILE_SCALAR_FIELDS = [
  "name",
  "major",
  "school",
  "studyPeriod",
  "email",
  "workEmail",
  "phone",
  "website",
  "linkedin",
  "profileSummary",
  "skills",
  "languages",
] as const satisfies ReadonlyArray<keyof Profile>;

const cleanString = (value: string | undefined | null) => value?.trim() || "";

/* Motivation vs Logic:
   Motivation: Explore should build Profile and Skills copy from evidence the user already entered elsewhere instead of making them restate the same story manually.
   Logic: normalize education, projects, experiences, and optional saved skills into one shared payload so both text sections can reuse the same request shape. */
function getTextSectionExploreContext(profile: Profile, field: TextSectionField) {
  const projects = profile.projects
    .map((project) => ({
      name: cleanString(project.name),
      description: cleanString(project.description),
      summary: cleanString(project.summary),
    }))
    .filter((project) => project.name || project.description || project.summary);

  const experiences = profile.experiences
    .map((experience) => ({
      companyName: cleanString(experience.companyName),
      role: cleanString(experience.role),
      timeFrom: cleanString(experience.timeFrom),
      timeTo: cleanString(experience.timeTo),
      description: cleanString(experience.description),
      summary: cleanString(experience.summary),
    }))
    .filter(
      (experience) =>
        experience.companyName ||
        experience.role ||
        experience.timeFrom ||
        experience.timeTo ||
        experience.description ||
        experience.summary
    );

  return {
    major: cleanString(profile.major),
    school: cleanString(profile.school),
    studyPeriod: cleanString(profile.studyPeriod),
    skills: field === "profileSummary" ? cleanString(profile.skills) : "",
    projects,
    experiences,
  };
}

function hasTextSectionExploreEvidence(profile: Profile) {
  const context = getTextSectionExploreContext(profile, "skills");

  return Boolean(
    context.major ||
      context.school ||
      context.studyPeriod ||
      context.projects.length ||
      context.experiences.length
  );
}

function getListIdentity<T extends { _id?: string; createdAt?: string }>(item: T, index: number) {
  if (item._id) return `id:${item._id}`;
  if (item.createdAt) return `created:${item.createdAt}`;
  return `index:${index}`;
}

function ensureClientIds<T extends { _clientId?: string; _id?: string; createdAt?: string }>(
  items: T[] | undefined,
  fallback?: T[]
) {
  const list = items || [];
  const fallbackByIdentity = new Map(
    (fallback || []).map((item, index) => [getListIdentity(item, index), item] as const)
  );

  return list.map((item, index) => ({
    ...item,
    _clientId:
      item._clientId ??
      fallbackByIdentity.get(getListIdentity(item, index))?._clientId ??
      fallback?.[index]?._clientId ??
      createClientId(),
  }));
}

const timestampFrom = (value?: string) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};

/* Motivation vs Logic:
   Motivation: project cards still follow creation order, so fresh portfolio work should remain visible at the top after an API roundtrip.
   Logic: preserve creation timestamps on each project and sort only that collection by `createdAt` during hydration. */
function sortByCreatedAtDescending<T extends { createdAt?: string }>(items: T[]) {
  return [...items].sort((a, b) => timestampFrom(b.createdAt) - timestampFrom(a.createdAt));
}

const hydrateList = <T extends { createdAt?: string; _clientId?: string; _id?: string }>(
  items: T[] | undefined,
  previous?: T[]
) => sortByCreatedAtDescending(ensureClientIds(items, previous));

const hydrateExperiences = (
  items: Experience[] | undefined,
  previous?: Experience[]
) => sortExperiencesByRecency(ensureClientIds(items, previous));

/* Root Cause vs Logic:
   Root Cause: newly added cards were only pinned while completely blank, so the first keystroke dropped them back into the persisted sort order and made the editor jump to the bottom mid-entry.
   Logic: keep fresh local cards pinned by client ID during rendering until a successful save clears that temporary pin, preserving the stable editing surface without mutating the stored order. */
function prioritizeFreshEntries<T extends { _clientId?: string }>(
  items: T[],
  pinnedEntryIds: string[]
) {
  const entries = items.map((item, index) => ({ item, index }));

  if (pinnedEntryIds.length === 0) {
    return entries;
  }

  const pinnedOrder = new Map(pinnedEntryIds.map((id, index) => [id, index] as const));
  const pinnedEntries = entries
    .filter(({ item }) => item._clientId && pinnedOrder.has(item._clientId))
    .sort(
      (left, right) =>
        pinnedOrder.get(left.item._clientId || "")! - pinnedOrder.get(right.item._clientId || "")!
    );

  if (pinnedEntries.length === 0) {
    return entries;
  }

  const pinnedIds = new Set(pinnedEntries.map(({ item }) => item._clientId));
  return [
    ...pinnedEntries,
    ...entries.filter(({ item }) => !item._clientId || !pinnedIds.has(item._clientId)),
  ];
}

/* Root Cause vs Logic:
   Root Cause: using editable strings as React keys caused cards to unmount mid-edit when the key value changed.
   Logic: persist per-card IDs on every project and experience so keyboard input updates the card without the key shifting. */
function hydrateProfile(profile: Profile | null | undefined, previous?: Profile): Profile {
  const base = profile || emptyProfile;
  const projects = hydrateList(base.projects, previous?.projects);
  /* Root Cause vs Logic:
     Root Cause: the profile page used to reapply a created-at sort during hydration, so a fresh API response could undo backend reindexing and leave Experience 01 tied to save order instead of role recency.
     Logic: keep project hydration unchanged, but hydrate experiences through the shared recency sorter so the client preserves the same chronology rule the backend persists. */
  const experiences = hydrateExperiences(base.experiences, previous?.experiences);
  return {
    ...base,
    projects,
    experiences,
  };
}

function stripClientIds(profile: Profile): Profile {
  const withoutClientId = <T extends { _clientId?: string }>(item: T) => {
    const clone = { ...item };
    delete clone._clientId;
    return clone;
  };

  return {
    ...profile,
    projects: profile.projects.map(withoutClientId),
    experiences: profile.experiences.map(withoutClientId),
  };
}

function mergeImportedProfile(current: Profile, imported: ImportedProfileData): Profile {
  const importBaseTime = Date.now();
  const importedProjects = (imported.projects || []).map((item, index) => ({
    name: item.name || "",
    description: item.description || "",
    createdAt: new Date(importBaseTime + index).toISOString(),
    _clientId: createClientId(),
    _needsSummary: true,
  })) as Project[];

  const importedExperiences = (imported.experiences || []).map((item, index) => ({
    companyName: item.companyName || "",
    role: item.role || "",
    timeFrom: item.timeFrom || "",
    timeTo: item.timeTo || "",
    description: item.description || "",
    createdAt: new Date(importBaseTime + index).toISOString(),
    updatedAt: new Date(importBaseTime + index).toISOString(),
    _clientId: createClientId(),
    _needsSummary: true,
  })) as Experience[];

  return {
    ...current,
    ...PROFILE_SCALAR_FIELDS.reduce<Partial<Profile>>((accumulator, field) => {
      const incomingValue = cleanString(imported[field]);
      if (!incomingValue) {
        return accumulator;
      }

      return {
        ...accumulator,
        [field]: cleanString(current[field]) || incomingValue,
      };
    }, {}),
    projects: [
      ...importedProjects,
      ...current.projects,
    ],
    experiences: sortExperiencesByRecency([
      ...importedExperiences,
      ...current.experiences,
    ]),
  };
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
};

function TextField({ label, value, onChange, placeholder, hint, type = "text" }: FieldProps) {
  const id = label.toLowerCase().replace(/\s+/g, "-");

  return (
    <label htmlFor={id} className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-foreground text-sm font-medium">{label}</span>
        {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
      </div>
      <input
        id={id}
        type={type}
        className="input-premium"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

type TextareaFieldProps = FieldProps & {
  rows?: number;
};

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 5,
}: TextareaFieldProps) {
  const id = label.toLowerCase().replace(/\s+/g, "-");

  return (
    <label htmlFor={id} className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-foreground text-sm font-medium">{label}</span>
        {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
      </div>
      <textarea
        id={id}
        rows={rows}
        className="input-premium min-h-32 resize-y"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

type TextSectionActionButtonsProps = {
  field: TextSectionField;
  helperText?: string;
  activeAction: TextSectionAction | null;
  copied: boolean;
  onExplore: () => void;
  onEnhance: () => void;
  onCopy: () => void;
};

function TextSectionActionButtons({
  field,
  helperText,
  activeAction,
  copied,
  onExplore,
  onEnhance,
  onCopy,
}: TextSectionActionButtonsProps) {
  const meta = TEXT_SECTION_META[field];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {helperText ? <span className="text-muted-foreground text-xs">{helperText}</span> : null}
      <HoverTooltip message={meta.exploreTooltip}>
        <button
          type="button"
          onClick={onExplore}
          className="button-secondary"
          disabled={activeAction !== null}
          title={meta.exploreTooltip}
        >
          {activeAction === "explore" ? "Exploring..." : "Explore"}
        </button>
      </HoverTooltip>
      <button
        type="button"
        onClick={onEnhance}
        className="button-secondary"
        disabled={activeAction !== null}
      >
        {activeAction === "enhance" ? "Enhancing..." : "Enhance"}
      </button>
      <button type="button" onClick={onCopy} className="button-secondary">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>(hydrateProfile(emptyProfile));
  const profileRef = useRef(profile);
  const profileRevisionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [textImportOpen, setTextImportOpen] = useState(false);
  const [textImportValue, setTextImportValue] = useState("");
  const [enhancingProject, setEnhancingProject] = useState<number | null>(null);
  const [enhancingExperience, setEnhancingExperience] = useState<number | null>(null);
  const [copiedProject, setCopiedProject] = useState<number | null>(null);
  const [copiedExperience, setCopiedExperience] = useState<number | null>(null);
  const [activeTextSectionAction, setActiveTextSectionAction] = useState<{
    field: TextSectionField;
    action: TextSectionAction;
  } | null>(null);
  const [copiedTextSection, setCopiedTextSection] = useState<TextSectionField | null>(null);
  const [newProjectDraftIds, setNewProjectDraftIds] = useState<string[]>([]);
  const [newExperienceDraftIds, setNewExperienceDraftIds] = useState<string[]>([]);

  function commitProfile(updater: Profile | ((current: Profile) => Profile)) {
    setProfile((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      profileRef.current = next;
      profileRevisionRef.current += 1;
      return next;
    });
  }

  function updateProject(index: number, updater: (project: Project) => Project) {
    commitProfile((current) => {
      const nextProjects = [...current.projects];
      nextProjects[index] = updater(nextProjects[index]);
      return { ...current, projects: nextProjects };
    });
  }

  function updateExperience(index: number, updater: (experience: Experience) => Experience) {
    commitProfile((current) => {
      const nextExperiences = [...current.experiences];
      nextExperiences[index] = updater(nextExperiences[index]);
      return { ...current, experiences: nextExperiences };
    });
  }

  async function applyImportedData(imported: ImportedProfileData) {
    commitProfile((current) => mergeImportedProfile(current, imported));
    setTextImportValue("");
    setTextImportOpen(false);
  }

  useEffect(() => {
    (async () => {
      const res = await fetch(buildApiUrl("/api/profile"));
      if (res.ok) {
        const data = await res.json();
        commitProfile((current) => hydrateProfile(data.profile || current, current));
      }
      setLoading(false);
    })();
  }, []);

  function up<K extends keyof Profile>(key: K, value: Profile[K]) {
    commitProfile((current) => ({ ...current, [key]: value }));
  }

  function addProject() {
    const clientId = createClientId();
    commitProfile((current) => ({
      ...current,
      projects: [
        {
          name: "",
          description: "",
          _needsSummary: true,
          _clientId: clientId,
          createdAt: new Date().toISOString(),
        },
        ...current.projects,
      ],
    }));
    setNewProjectDraftIds((current) => [clientId, ...current.filter((id) => id !== clientId)]);
  }

  function addExperience() {
    const timestamp = new Date().toISOString();
    const clientId = createClientId();
    commitProfile((current) => ({
      ...current,
      experiences: sortExperiencesByRecency([
        {
          companyName: "",
          role: "",
          timeFrom: "",
          timeTo: "",
          description: "",
          _needsSummary: true,
          _clientId: clientId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        ...current.experiences,
      ]),
    }));
    setNewExperienceDraftIds((current) => [clientId, ...current.filter((id) => id !== clientId)]);
  }

  function deleteProject(index: number) {
    const removedClientId = profile.projects[index]?._clientId;
    commitProfile((current) => ({
      ...current,
      projects: current.projects.filter((_, itemIndex) => itemIndex !== index),
    }));
    if (removedClientId) {
      setNewProjectDraftIds((current) => current.filter((id) => id !== removedClientId));
    }
  }

  function deleteExperience(index: number) {
    const removedClientId = profile.experiences[index]?._clientId;
    commitProfile((current) => ({
      ...current,
      experiences: current.experiences.filter((_, itemIndex) => itemIndex !== index),
    }));
    if (removedClientId) {
      setNewExperienceDraftIds((current) => current.filter((id) => id !== removedClientId));
    }
  }

  /* Motivation: users need one-click explore, enhancement, and copy-to-paste output without duplicating formatting logic across cards.
     Logic: share the text-section metadata and handlers so both narrative fields follow the same editing workflow. */
  function getTextSectionAction(field: TextSectionField) {
    return activeTextSectionAction?.field === field ? activeTextSectionAction.action : null;
  }

  function getTextSectionContent(field: TextSectionField) {
    return (profile[field] || "").trim();
  }

  async function copyTextSection(field: TextSectionField) {
    const formatted = getTextSectionContent(field);
    const meta = TEXT_SECTION_META[field];
    if (!formatted) {
      setError(`Please add ${meta.label} details before copying`);
      return;
    }

    try {
      await navigator.clipboard.writeText(formatted);
      setError(null);
      setCopiedTextSection(field);
      window.setTimeout(() => {
        setCopiedTextSection((current) => (current === field ? null : current));
      }, 1500);
    } catch {
      setError(`Failed to copy ${meta.label} details`);
    }
  }

  async function rewriteTextSection(field: TextSectionField, action: TextSectionAction) {
    const content = getTextSectionContent(field);
    const meta = TEXT_SECTION_META[field];

    if (action === "enhance" && !content) {
      setError(`Please add ${meta.label} details before enhancing`);
      return;
    }

    if (action === "explore" && !hasTextSectionExploreEvidence(profile)) {
      setError(`Please add education, project, or experience details before exploring ${meta.label}`);
      return;
    }

    setActiveTextSectionAction({ field, action });
    setError(null);

    try {
      const res = await fetch(buildApiUrl("/api/enhance"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: meta.apiType,
          name: meta.name,
          description: content,
          mode: action,
          context: action === "explore" ? getTextSectionExploreContext(profile, field) : undefined,
        }),
      });

      if (!res.ok) {
        setError(`Failed to ${action} ${meta.label} content`);
        return;
      }

      const data = await res.json();
      up(field, data.enhancedDescription);
    } catch {
      setError(`Failed to ${action} ${meta.label} content`);
    } finally {
      setActiveTextSectionAction((current) =>
        current?.field === field && current.action === action ? null : current
      );
    }
  }

  function formatProjectForCopy(project: Project) {
    return [
      project.name.trim() ? `Project: ${project.name.trim()}` : null,
      project.description.trim() ? `Description: ${project.description.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  function formatExperienceForCopy(experience: Experience) {
    return [
      experience.companyName.trim() ? `Company: ${experience.companyName.trim()}` : null,
      experience.role.trim() ? `Role: ${experience.role.trim()}` : null,
      experience.timeFrom.trim() ? `Start: ${experience.timeFrom.trim()}` : null,
      experience.timeTo.trim() ? `End: ${experience.timeTo.trim()}` : null,
      experience.description.trim() ? `Description: ${experience.description.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function copyProject(index: number) {
    const formatted = formatProjectForCopy(profile.projects[index]);
    if (!formatted) {
      setError("Please add project details before copying");
      return;
    }

    try {
      await navigator.clipboard.writeText(formatted);
      setError(null);
      setCopiedProject(index);
      window.setTimeout(() => {
        setCopiedProject((current) => (current === index ? null : current));
      }, 1500);
    } catch {
      setError("Failed to copy project details");
    }
  }

  async function copyExperience(index: number) {
    const formatted = formatExperienceForCopy(profile.experiences[index]);
    if (!formatted) {
      setError("Please add experience details before copying");
      return;
    }

    try {
      await navigator.clipboard.writeText(formatted);
      setError(null);
      setCopiedExperience(index);
      window.setTimeout(() => {
        setCopiedExperience((current) => (current === index ? null : current));
      }, 1500);
    } catch {
      setError("Failed to copy experience details");
    }
  }

  async function enhanceProject(index: number) {
    const project = profile.projects[index];
    if (!project.description.trim()) {
      setError("Please add a description before enhancing");
      return;
    }

    setEnhancingProject(index);
    setError(null);

    try {
      const res = await fetch(buildApiUrl("/api/enhance"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "project",
          name: project.name,
          description: project.description,
        }),
      });

      if (!res.ok) {
        setError("Failed to enhance project description");
        return;
      }

      const data = await res.json();
      updateProject(index, (current) => ({
        ...current,
        description: data.enhancedDescription,
        _needsSummary: true,
      }));
    } catch {
      setError("Failed to enhance project description");
    } finally {
      setEnhancingProject(null);
    }
  }

  async function enhanceExperience(index: number) {
    const experience = profile.experiences[index];
    if (!experience.description.trim()) {
      setError("Please add a description before enhancing");
      return;
    }

    setEnhancingExperience(index);
    setError(null);

    try {
      const res = await fetch(buildApiUrl("/api/enhance"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "experience",
          name: `${experience.companyName} - ${experience.role}`,
          description: experience.description,
        }),
      });

      if (!res.ok) {
        setError("Failed to enhance experience description");
        return;
      }

      const data = await res.json();
      updateExperience(index, (current) => ({
        ...current,
        description: data.enhancedDescription,
        _needsSummary: true,
      }));
    } catch {
      setError("Failed to enhance experience description");
    } finally {
      setEnhancingExperience(null);
    }
  }

  async function save() {
    if (saveInFlightRef.current) {
      return;
    }

    saveInFlightRef.current = true;
    setSaving(true);
    setError(null);

    try {
      /* Root Cause vs Logic:
         Root Cause: once we stopped hydrating stale save responses, any edits made while the request was still running stayed
         in local state only, so refreshes could "lose" the newest changes even though the user had already pressed save.
         Logic: keep saving in a loop until the server has persisted the latest draft revision, while still refusing to
         overwrite newer in-memory edits with an older response payload. */
      while (true) {
        const saveRevision = profileRevisionRef.current;
        const payload = stripClientIds(profileRef.current);
        const res = await fetch(buildApiUrl("/api/profile"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to save");
          return;
        }

        const data = await res.json();

        if (saveRevision !== profileRevisionRef.current) {
          continue;
        }

        commitProfile((current) => hydrateProfile(data.profile || current, current));
        setNewProjectDraftIds([]);
        setNewExperienceDraftIds([]);
        return;
      }
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }

  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setOcrLoading(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(buildApiUrl("/api/ocr"), { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to parse file");
        return;
      }

      const data: { data?: ImportedProfileData } = await res.json();
      await applyImportedData(data.data || {});
    } catch {
      setError("Failed to parse file. Please try again.");
    } finally {
      event.target.value = "";
      setOcrLoading(false);
    }
  }

  async function importText() {
    if (!textImportValue.trim()) {
      setError("Paste resume text before importing");
      return;
    }

    setOcrLoading(true);
    setError(null);

    try {
      const res = await fetch(buildApiUrl("/api/ocr"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textImportValue }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to parse text");
        return;
      }

      const data: { data?: ImportedProfileData } = await res.json();
      await applyImportedData(data.data || {});
    } catch {
      setError("Failed to parse text. Please try again.");
    } finally {
      setOcrLoading(false);
    }
  }

  const completeness = useMemo(() => {
    const keyValues = [
      profile.name,
      profile.major,
      profile.school,
      profile.email,
      profile.phone,
      profile.website,
      profile.linkedin,
      profile.languages,
    ];
    const filled = keyValues.filter((value) => value && value.trim()).length;
    return Math.round((filled / keyValues.length) * 100);
  }, [profile]);

  const visibleProjects = useMemo(
    () => prioritizeFreshEntries(profile.projects, newProjectDraftIds),
    [newProjectDraftIds, profile.projects]
  );

  const visibleExperiences = useMemo(
    () =>
      prioritizeFreshEntries(
        profile.experiences,
        newExperienceDraftIds
      ),
    [newExperienceDraftIds, profile.experiences]
  );

  if (loading) {
    return (
      <div className="page-shell flex min-h-[70vh] items-center justify-center">
        <GlassPanel className="flex items-center gap-4 px-6 py-5">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-300/20 border-t-sky-300" />
          <div>
            <p className="text-foreground text-sm font-medium">Loading profile workspace</p>
            <p className="text-muted-foreground text-xs">Preparing your identity and evidence canvas.</p>
          </div>
        </GlassPanel>
      </div>
    );
  }

  return (
    <>
      {textImportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-text-title"
            className="bg-card border-border/60 w-full max-w-2xl rounded-[1.6rem] border p-6 shadow-2xl"
          >
            {/* Motivation vs Logic:
                Motivation: users need a fast no-file import path when they copy resume text from docs, LinkedIn, or notes.
                Logic: open a dedicated modal with one free-form textarea and route its contents through the same parser used
                for file imports so text and file ingestion stay behaviorally aligned. */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="section-kicker">Import Text</p>
                <h2 id="import-text-title" className="text-foreground text-2xl font-semibold">
                  Paste your resume or profile text
                </h2>
                <p className="text-muted-foreground text-sm leading-7">
                  Free-form text is fine. We&apos;ll extract projects, experiences, and profile details into the same JSON shape used by file import.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close import text modal"
                onClick={() => {
                  setTextImportOpen(false);
                  setTextImportValue("");
                }}
                className="text-muted-foreground hover:text-foreground rounded-full border border-white/10 px-3 py-2 text-sm"
              >
                Close
              </button>
            </div>

            <textarea
              className="textarea-premium mt-6 min-h-[18rem] w-full"
              placeholder="Paste your resume, LinkedIn profile, or any structured/unstructured experience text here..."
              value={textImportValue}
              onChange={(event) => setTextImportValue(event.target.value)}
            />

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setTextImportOpen(false);
                  setTextImportValue("");
                }}
                className="button-secondary"
              >
                Cancel
              </button>
              <button type="button" onClick={importText} className="button-primary" disabled={ocrLoading}>
                {ocrLoading ? "Importing..." : "Import Text"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ModuleShell
        eyebrow="Profile Module"
        title="Turn raw details into a sharper professional signal."
        description="Organize the core information that powers both your resume and your cover letter. Think of this as the source of truth for every proof point you want the system to articulate well."
        stats={[
          { label: "Profile completeness", value: `${completeness}%` },
          { label: "Projects captured", value: `${profile.projects.length}` },
          { label: "Experience entries", value: `${profile.experiences.length}` },
        ]}
        aside={
          <div className="space-y-6">
          {/* Root Cause: the profile sidebar mixed white-only copy and translucent white surfaces, so light mode washed out both text and containers.
              Logic: reuse theme-aware foreground tokens and shared surface styling so the sidebar remains readable without forking the layout. */}
            <div className="space-y-3">
            <p className="section-kicker">Signal Strength</p>
            <h2 className="text-foreground font-display text-3xl">Your application foundation</h2>
            <p className="text-muted-foreground text-sm leading-7">
              A stronger profile gives the resume selector and cover letter generator more
              specific proof to work with.
            </p>
            </div>

            <div className="space-y-3">
              <div className="surface-subtle flex items-center justify-between rounded-2xl px-4 py-4">
              <span className="text-muted-foreground text-sm">Completeness</span>
              <span className="text-foreground text-lg font-semibold">{completeness}%</span>
              </div>
              <div className="h-2 rounded-full bg-[hsl(var(--surface-3)/0.72)]">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-sky-300 to-violet-300"
                  style={{ width: `${completeness}%` }}
                />
              </div>
            </div>

            <div className="surface-subtle space-y-3 rounded-[1.4rem] p-4">
              <div>
                <p className="text-foreground text-sm font-medium">Resume import</p>
                <p className="text-muted-foreground mt-1 text-xs leading-6">
                  Pull in projects, experience, and profile details from a PDF, DOCX, or pasted text.
                </p>
              </div>
              <label className="button-secondary flex cursor-pointer items-center justify-center">
                {ocrLoading ? "Parsing file..." : "Import File"}
                <input type="file" accept=".pdf,.docx" className="hidden" onChange={importFile} />
              </label>
              <button type="button" className="button-secondary w-full" onClick={() => setTextImportOpen(true)}>
                Import Text
              </button>
            </div>

            <div className="surface-subtle rounded-[1.4rem] p-4">
              <p className="text-foreground text-sm font-medium">Editorial note</p>
              <p className="text-muted-foreground mt-2 text-xs leading-6">
                Favor proof over adjectives. Specific outcomes, technologies, and scope make the
                rest of the product feel much smarter.
              </p>
            </div>
          </div>
        }
      >
      {error ? (
        <Reveal>
          <GlassPanel className="border-destructive/40 p-4">
            <p className="text-sm text-rose-300 dark:text-rose-200">{error}</p>
          </GlassPanel>
        </Reveal>
      ) : null}

      <Reveal>
        <GlassPanel className="p-6 sm:p-8">
          <SectionHeading
            eyebrow="Identity"
            title="Core profile details"
            description="This section anchors contact credibility and gives the rest of the system the context it needs."
            action={
              <button onClick={save} className="button-primary" disabled={saving}>
                {saving ? "Saving..." : "Save Profile"}
              </button>
            }
          />

          {/* Motivation: the profile form was previously one long utility list with little hierarchy.
              Logic: group the fields into a two-column editorial layout so scanning, editing, and confidence all improve. */}
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <TextField label="Name" value={profile.name} onChange={(value) => up("name", value)} />
            <TextField label="Major" value={profile.major} onChange={(value) => up("major", value)} />
            <TextField label="School" value={profile.school} onChange={(value) => up("school", value)} />
            <TextField
              label="Study Period"
              value={profile.studyPeriod || ""}
              onChange={(value) => up("studyPeriod", value)}
              placeholder="2019 - 2023"
            />
            <TextField label="Email" value={profile.email} onChange={(value) => up("email", value)} type="email" />
            <TextField
              label="Work Email"
              value={profile.workEmail || ""}
              onChange={(value) => up("workEmail", value)}
              placeholder="you@company.com"
              type="email"
              hint="Optional"
            />
            <TextField
              label="Website URL"
              value={profile.website || ""}
              onChange={(value) => up("website", value)}
              placeholder="https://yourwebsite.com"
              hint="Optional"
            />
            <TextField
              label="LinkedIn URL"
              value={profile.linkedin || ""}
              onChange={(value) => up("linkedin", value)}
              placeholder="https://linkedin.com/in/yourprofile"
              hint="Optional"
            />
            <TextField label="Phone Number" value={profile.phone} onChange={(value) => up("phone", value)} />
            <TextField
              label="Languages"
              value={profile.languages || ""}
              onChange={(value) => up("languages", value)}
              placeholder="English, Spanish, French"
              hint="Comma separated"
            />
          </div>

          {/* Motivation vs Logic:
              Motivation: Resume generation needs optional narrative and capability sections that users can refine in one
              place, then reuse downstream without rebuilding the same copy on every screen.
              Logic: Persist both long-form Profile and Skills fields on the profile object, and keep their explore/enhance/copy
              actions on shared helpers so both sections follow the same editing workflow. */}
          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="mb-3">
              <p className="section-kicker">Profile</p>
              <h3 className="text-foreground mt-2 text-lg font-semibold">Context you want resumes to carry forward</h3>
              <p className="text-muted-foreground mt-2 text-sm">
                Optional. Add a short professional profile, personal positioning, or any context that helps explain who you are.
              </p>
            </div>
            <label htmlFor="profile-summary" className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-foreground text-sm font-medium">Profile (Optional)</span>
                <TextSectionActionButtons
                  field="profileSummary"
                  activeAction={getTextSectionAction("profileSummary")}
                  copied={copiedTextSection === "profileSummary"}
                  onExplore={() => rewriteTextSection("profileSummary", "explore")}
                  onEnhance={() => rewriteTextSection("profileSummary", "enhance")}
                  onCopy={() => copyTextSection("profileSummary")}
                />
              </div>
              <textarea
                id="profile-summary"
                className="textarea-premium min-h-[12rem]"
                value={profile.profileSummary || ""}
                placeholder="Product-minded software engineer with experience shipping AI-assisted workflows, translating ambiguity into systems, and collaborating across design, product, and engineering."
                onChange={(event) => up("profileSummary", event.target.value)}
              />
            </label>
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="mb-3">
              <p className="section-kicker">Skills</p>
              <h3 className="text-foreground mt-2 text-lg font-semibold">Capabilities you want resumes to reuse</h3>
              <p className="text-muted-foreground mt-2 text-sm">
                Optional. Add technical skills, tools, frameworks, and domains you want prefilled in Resume Lab.
              </p>
            </div>
            {/* Motivation vs Logic:
                Motivation: the skills textarea should feel generous so people can list full tool stacks without scrolling immediately.
                Logic: raise the minimum height and keep the premium textarea styling responsible for strong contrast in both themes. */}
            <label htmlFor="profile-skills" className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-foreground text-sm font-medium">Skills (Optional)</span>
                <TextSectionActionButtons
                  field="skills"
                  helperText="Comma separated or line separated"
                  activeAction={getTextSectionAction("skills")}
                  copied={copiedTextSection === "skills"}
                  onExplore={() => rewriteTextSection("skills", "explore")}
                  onEnhance={() => rewriteTextSection("skills", "enhance")}
                  onCopy={() => copyTextSection("skills")}
                />
              </div>
              <textarea
                id="profile-skills"
                className="textarea-premium min-h-[12rem]"
                value={profile.skills || ""}
                placeholder="Python, TypeScript, React, Node.js, Docker, RAG, LLM evaluation"
                onChange={(event) => up("skills", event.target.value)}
              />
            </label>
          </div>
        </GlassPanel>
      </Reveal>

      <Reveal delay={0.06}>
        <GlassPanel className="p-6 sm:p-8">
          <SectionHeading
            eyebrow="Experience"
            title="Show scope, ownership, and outcomes"
            description="Write each role so it gives the resume builder and cover letter generator clear achievement material to work with."
            action={
              <button onClick={addExperience} className="button-secondary">
                Add Experience
              </button>
            }
          />

          <StaggerGroup className="mt-8 space-y-4">
            {profile.experiences.length === 0 ? (
              <GlassPanel className="interactive-card p-5">
                <p className="text-muted-foreground text-sm">
                  No experience entries yet. Add internships, freelance work, or employment to widen your evidence base.
                </p>
              </GlassPanel>
            ) : null}

            {visibleExperiences.map(({ item: experience, index }, renderIndex) => (
              <StaggerItem key={experience._id ?? experience._clientId ?? `${experience.companyName}-${experience.role}-${index}`}>
                <div className="interactive-card space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="section-kicker">
                        Experience {String(renderIndex + 1).padStart(2, "0")}
                      </p>
                      <h3 className="text-foreground mt-2 text-lg font-semibold">
                        {experience.companyName || "Company"} · {experience.role || "Role"}
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => enhanceExperience(index)}
                        className="button-secondary"
                        disabled={enhancingExperience === index}
                      >
                        {enhancingExperience === index ? "Enhancing..." : "Enhance"}
                      </button>
                      <button onClick={() => copyExperience(index)} className="button-secondary">
                        {copiedExperience === index ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this experience?")) {
                            deleteExperience(index);
                          }
                        }}
                        className="rounded-full border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-600 hover:border-rose-300/40 hover:bg-rose-400/14 dark:text-rose-100"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField
                      label="Company"
                      value={experience.companyName}
                      onChange={(value) => {
                        updateExperience(index, (current) => ({
                          ...current,
                          companyName: value,
                          _needsSummary: true,
                        }));
                      }}
                    />
                    <TextField
                      label="Role"
                      value={experience.role}
                      onChange={(value) => {
                        updateExperience(index, (current) => ({
                          ...current,
                          role: value,
                          _needsSummary: true,
                        }));
                      }}
                    />
                    <TextField
                      label="Start"
                      value={experience.timeFrom}
                      onChange={(value) => {
                        updateExperience(index, (current) => ({
                          ...current,
                          timeFrom: value,
                          _needsSummary: true,
                        }));
                      }}
                      placeholder="Jan 2023"
                    />
                    <TextField
                      label="End"
                      value={experience.timeTo}
                      onChange={(value) => {
                        updateExperience(index, (current) => ({
                          ...current,
                          timeTo: value,
                          _needsSummary: true,
                        }));
                      }}
                      placeholder="Present"
                    />
                    <div className="md:col-span-2">
                      <TextareaField
                        label="Description"
                        value={experience.description}
                        onChange={(value) => {
                          updateExperience(index, (current) => ({
                            ...current,
                            description: value,
                            _needsSummary: true,
                          }));
                        }}
                        rows={5}
                      />
                    </div>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </GlassPanel>
      </Reveal>

      <Reveal delay={0.1}>
        <GlassPanel className="p-6 sm:p-8">
          <SectionHeading
            eyebrow="Projects"
            title="Keep proof points specific"
            description="Projects should read like compact case studies: what you built, how you built it, and why it mattered."
            action={
              <button onClick={addProject} className="button-secondary">
                Add Project
              </button>
            }
          />

          <StaggerGroup className="mt-8 space-y-4">
            {profile.projects.length === 0 ? (
              <GlassPanel className="interactive-card p-5">
                <p className="text-muted-foreground text-sm">
                  No projects yet. Add a few signature builds to strengthen your application evidence.
                </p>
              </GlassPanel>
            ) : null}

            {visibleProjects.map(({ item: project, index }, renderIndex) => (
              <StaggerItem key={project._id ?? project._clientId ?? `${project.name}-${index}`}>
                <div className="interactive-card space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="section-kicker">
                        Project {String(renderIndex + 1).padStart(2, "0")}
                      </p>
                      <h3 className="text-foreground mt-2 text-lg font-semibold">
                        {project.name || "Untitled Project"}
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => enhanceProject(index)}
                        className="button-secondary"
                        disabled={enhancingProject === index}
                      >
                        {enhancingProject === index ? "Enhancing..." : "Enhance"}
                      </button>
                      <button onClick={() => copyProject(index)} className="button-secondary">
                        {copiedProject === index ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this project?")) {
                            deleteProject(index);
                          }
                        }}
                        className="rounded-full border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-600 hover:border-rose-300/40 hover:bg-rose-400/14 dark:text-rose-100"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
                    <TextField
                      label="Project Name"
                      value={project.name}
                      onChange={(value) => {
                        updateProject(index, (current) => ({
                          ...current,
                          name: value,
                          _needsSummary: true,
                        }));
                      }}
                    />
                    <TextareaField
                      label="Project Description"
                      value={project.description}
                      onChange={(value) => {
                        updateProject(index, (current) => ({
                          ...current,
                          description: value,
                          _needsSummary: true,
                        }));
                      }}
                      rows={5}
                    />
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </GlassPanel>
      </Reveal>
      </ModuleShell>
    </>
  );
}
