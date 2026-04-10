"use client";

import { useEffect, useMemo, useState } from "react";
import ModuleShell from "@/components/ui/ModuleShell";
import GlassPanel from "@/components/ui/GlassPanel";
import SectionHeading from "@/components/ui/SectionHeading";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion/Reveal";
import { buildApiUrl } from "@/lib/api";

type Project = {
  name: string;
  description: string;
  summary?: string;
  _needsSummary?: boolean;
  _clientId?: string;
  createdAt?: string;
};

type Experience = {
  companyName: string;
  role: string;
  timeFrom: string;
  timeTo: string;
  description: string;
  summary?: string;
  _needsSummary?: boolean;
  _clientId?: string;
  createdAt?: string;
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
  skills?: string;
  projects: Project[];
  experiences: Experience[];
  languages?: string;
};

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

function ensureClientIds<T extends { _clientId?: string }>(items: T[] | undefined, fallback?: T[]) {
  const list = items || [];
  return list.map((item, index) => ({
    ...item,
    _clientId: item._clientId ?? fallback?.[index]?._clientId ?? createClientId(),
  }));
}

const timestampFrom = (value?: string) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};

/* Motivation vs Logic:
   Motivation: newly captured projects and experiences should stay visible at the top of the workspace even after a roundtrip to the API.
   Logic: persist creation timestamps on each item and always rehydrate the list sorted by that timestamp so the freshest proof points float to the top. */
function sortByCreatedAtDescending<T extends { createdAt?: string }>(items: T[]) {
  return [...items].sort((a, b) => timestampFrom(b.createdAt) - timestampFrom(a.createdAt));
}

const hydrateList = <T extends { createdAt?: string; _clientId?: string }>(
  items: T[] | undefined,
  previous?: T[]
) => sortByCreatedAtDescending(ensureClientIds(items, previous));

/* Root Cause vs Logic:
   Root Cause: using editable strings as React keys caused cards to unmount mid-edit when the key value changed.
   Logic: persist per-card IDs on every project and experience so keyboard input updates the card without the key shifting. */
function hydrateProfile(profile: Profile | null | undefined, previous?: Profile): Profile {
  const base = profile || emptyProfile;
  const projects = hydrateList(base.projects, previous?.projects);
  const experiences = hydrateList(base.experiences, previous?.experiences);
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

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>(hydrateProfile(emptyProfile));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [enhancingProject, setEnhancingProject] = useState<number | null>(null);
  const [enhancingExperience, setEnhancingExperience] = useState<number | null>(null);
  const [copiedProject, setCopiedProject] = useState<number | null>(null);
  const [copiedExperience, setCopiedExperience] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(buildApiUrl("/api/profile"));
      if (res.ok) {
        const data = await res.json();
        setProfile((current) => hydrateProfile(data.profile || current, current));
      }
      setLoading(false);
    })();
  }, []);

  function up<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function addProject() {
    setProfile((current) => ({
      ...current,
      projects: [
        {
          name: "",
          description: "",
          _needsSummary: true,
          _clientId: createClientId(),
          createdAt: new Date().toISOString(),
        },
        ...current.projects,
      ],
    }));
  }

  function addExperience() {
    setProfile((current) => ({
      ...current,
      experiences: [
        {
          companyName: "",
          role: "",
          timeFrom: "",
          timeTo: "",
          description: "",
          _needsSummary: true,
          _clientId: createClientId(),
          createdAt: new Date().toISOString(),
        },
        ...current.experiences,
      ],
    }));
  }

  function deleteProject(index: number) {
    setProfile((current) => ({
      ...current,
      projects: current.projects.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function deleteExperience(index: number) {
    setProfile((current) => ({
      ...current,
      experiences: current.experiences.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  /* Motivation: users need one-click enhancement and one-click copy-to-paste output without duplicating formatting logic across cards.
     Logic: build the formatted text in shared helpers and keep clipboard feedback local to each card type. */
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
      const nextProjects = [...profile.projects];
      nextProjects[index].description = data.enhancedDescription;
      setProfile((current) => ({ ...current, projects: nextProjects }));
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
      const nextExperiences = [...profile.experiences];
      nextExperiences[index].description = data.enhancedDescription;
      setProfile((current) => ({ ...current, experiences: nextExperiences }));
    } catch {
      setError("Failed to enhance experience description");
    } finally {
      setEnhancingExperience(null);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);

    const payload = stripClientIds(profile);
    const res = await fetch(buildApiUrl("/api/profile"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save");
    } else {
      const data = await res.json();
      setProfile((current) => hydrateProfile(data.profile || current, current));
    }

    setSaving(false);
  }

  async function uploadResume(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setOcrLoading(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(buildApiUrl("/api/ocr"), { method: "POST", body: form });
      if (!res.ok) {
        setError("Failed to parse resume");
        return;
      }

      const data: {
        data?: {
          projects?: Array<{ name?: string; description?: string }>;
          experiences?: Array<{
            companyName?: string;
            role?: string;
            timeFrom?: string;
            timeTo?: string;
            description?: string;
          }>;
        };
      } = await res.json();

      const parsed = data.data || {};
      setProfile((current) => ({
        ...current,
        projects: [
          ...(current.projects || []),
          ...((parsed.projects || []).map((item) => ({
            name: item.name || "",
            description: item.description || "",
                createdAt: new Date().toISOString(),
            _clientId: createClientId(),
            _needsSummary: true,
          })) as Project[]),
        ],
        experiences: [
          ...(current.experiences || []),
          ...((parsed.experiences || []).map((item) => ({
            companyName: item.companyName || "",
            role: item.role || "",
            timeFrom: item.timeFrom || "",
            timeTo: item.timeTo || "",
            description: item.description || "",
                createdAt: new Date().toISOString(),
            _clientId: createClientId(),
            _needsSummary: true,
          })) as Experience[]),
        ],
      }));
    } catch {
      setError("Failed to parse resume. Please try again.");
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
                Pull in projects and experience from an existing resume, then refine what matters.
              </p>
            </div>
            <label className="button-secondary cursor-pointer">
              {ocrLoading ? "Parsing resume..." : "Import from Resume PDF"}
              <input type="file" accept=".pdf" className="hidden" onChange={uploadResume} />
            </label>
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
              Motivation: Resume generation needed a real profile-level skills source so users can keep languages separate
              from technical capabilities and still have a sensible default in Resume Lab.
              Logic: Add one optional long-form skills field below identity, persist it on the profile object, and let
              downstream resume surfaces hydrate their editable Skills input from this value. */}
          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="mb-3">
              <p className="section-kicker">Skills</p>
              <h3 className="text-foreground mt-2 text-lg font-semibold">Capabilities you want resumes to reuse</h3>
              <p className="text-muted-foreground mt-2 text-sm">
                Optional. Add technical skills, tools, frameworks, and domains you want prefilled in Resume Lab.
              </p>
            </div>
            <label htmlFor="profile-skills" className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-foreground text-sm font-medium">Skills (Optional)</span>
                <span className="text-muted-foreground text-xs">Comma separated or line separated</span>
              </div>
              <textarea
                id="profile-skills"
                className="textarea-premium min-h-28"
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

            {profile.experiences.map((experience, index) => (
              <StaggerItem
                key={
                  experience._clientId ||
                  `${experience.companyName}-${experience.role}-${index}`
                }
              >
                <div className="interactive-card space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="section-kicker">Experience {String(index + 1).padStart(2, "0")}</p>
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
                        const nextExperiences = [...profile.experiences];
                        nextExperiences[index].companyName = value;
                        nextExperiences[index]._needsSummary = true;
                        setProfile((current) => ({ ...current, experiences: nextExperiences }));
                      }}
                    />
                    <TextField
                      label="Role"
                      value={experience.role}
                      onChange={(value) => {
                        const nextExperiences = [...profile.experiences];
                        nextExperiences[index].role = value;
                        nextExperiences[index]._needsSummary = true;
                        setProfile((current) => ({ ...current, experiences: nextExperiences }));
                      }}
                    />
                    <TextField
                      label="Start"
                      value={experience.timeFrom}
                      onChange={(value) => {
                        const nextExperiences = [...profile.experiences];
                        nextExperiences[index].timeFrom = value;
                        nextExperiences[index]._needsSummary = true;
                        setProfile((current) => ({ ...current, experiences: nextExperiences }));
                      }}
                      placeholder="Jan 2023"
                    />
                    <TextField
                      label="End"
                      value={experience.timeTo}
                      onChange={(value) => {
                        const nextExperiences = [...profile.experiences];
                        nextExperiences[index].timeTo = value;
                        nextExperiences[index]._needsSummary = true;
                        setProfile((current) => ({ ...current, experiences: nextExperiences }));
                      }}
                      placeholder="Present"
                    />
                    <div className="md:col-span-2">
                      <TextareaField
                        label="Description"
                        value={experience.description}
                        onChange={(value) => {
                          const nextExperiences = [...profile.experiences];
                          nextExperiences[index].description = value;
                          nextExperiences[index]._needsSummary = true;
                          setProfile((current) => ({ ...current, experiences: nextExperiences }));
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

            {profile.projects.map((project, index) => (
              <StaggerItem key={project._clientId ?? `${project.name}-${index}`}>
                <div className="interactive-card space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="section-kicker">Project {String(index + 1).padStart(2, "0")}</p>
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
                        const nextProjects = [...profile.projects];
                        nextProjects[index].name = value;
                        nextProjects[index]._needsSummary = true;
                        setProfile((current) => ({ ...current, projects: nextProjects }));
                      }}
                    />
                    <TextareaField
                      label="Project Description"
                      value={project.description}
                      onChange={(value) => {
                        const nextProjects = [...profile.projects];
                        nextProjects[index].description = value;
                        nextProjects[index]._needsSummary = true;
                        setProfile((current) => ({ ...current, projects: nextProjects }));
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
  );
}
