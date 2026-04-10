import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { UserModel, Profile } from '@/lib/models/User';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/ai';

type WithCreatedAt = { createdAt?: string | Date };
type WithId = { _id?: unknown };

type IncomingProject = WithCreatedAt &
  WithId & {
    name?: string;
    description?: string;
    summary?: string;
    _needsSummary?: boolean;
  };

type IncomingExperience = WithCreatedAt &
  WithId & {
    companyName?: string;
    role?: string;
    timeFrom?: string;
    timeTo?: string;
    description?: string;
    summary?: string;
    _needsSummary?: boolean;
  };

type IncomingProfile = Partial<Omit<Profile, 'projects' | 'experiences'>> & {
  projects?: IncomingProject[];
  experiences?: IncomingExperience[];
};

type SerializableProfile = Partial<Omit<Profile, 'projects' | 'experiences'>> & {
  projects?: IncomingProject[];
  experiences?: IncomingExperience[];
};

const PROFILE_SCALAR_FIELDS = [
  'name',
  'major',
  'school',
  'studyPeriod',
  'email',
  'workEmail',
  'phone',
  'website',
  'linkedin',
  'skills',
  'languages',
] as const;

function cleanString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function hasOwnField<T extends object>(value: T, field: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function toIdString(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof (value as { toString?: () => string }).toString === 'function') {
    return (value as { toString: () => string }).toString();
  }
  return '';
}

function ensureCreatedAt<T extends WithCreatedAt>(items?: T[]) {
  return (items || []).map((item) => ({
    ...item,
    createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
  }));
}

function sortByCreatedAtDescending<T extends WithCreatedAt>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      (b.createdAt instanceof Date ? b.createdAt.valueOf() : new Date(b.createdAt || 0).valueOf()) -
      (a.createdAt instanceof Date ? a.createdAt.valueOf() : new Date(a.createdAt || 0).valueOf()),
  );
}

function normalizeTimeline<T extends WithCreatedAt>(items?: T[]) {
  return sortByCreatedAtDescending(ensureCreatedAt(items));
}

function serializeProfile<T extends SerializableProfile | null | undefined>(profile: T) {
  if (!profile) return profile;
  return {
    ...profile,
    projects: sortByCreatedAtDescending(profile.projects || []),
    experiences: sortByCreatedAtDescending(profile.experiences || []),
  };
}

function createStableHash(value: Record<string, unknown>) {
  return createHash('sha1').update(JSON.stringify(value)).digest('hex');
}

function getProjectContentHash(project: Pick<IncomingProject, 'name' | 'description'>) {
  return createStableHash({
    name: cleanString(project.name).trim(),
    description: cleanString(project.description).trim(),
  });
}

function getExperienceContentHash(
  experience: Pick<IncomingExperience, 'companyName' | 'role' | 'timeFrom' | 'timeTo' | 'description'>,
) {
  return createStableHash({
    companyName: cleanString(experience.companyName).trim(),
    role: cleanString(experience.role).trim(),
    timeFrom: cleanString(experience.timeFrom).trim(),
    timeTo: cleanString(experience.timeTo).trim(),
    description: cleanString(experience.description).trim(),
  });
}

function normalizeScalarFields(profileInput: IncomingProfile, existingProfile?: SerializableProfile | null) {
  return PROFILE_SCALAR_FIELDS.reduce<Record<string, string>>((accumulator, field) => {
    const hasIncomingField = hasOwnField(profileInput, field);
    accumulator[field] = cleanString(
      hasIncomingField ? profileInput[field] : existingProfile?.[field],
    );
    return accumulator;
  }, {});
}

function normalizeCollectionInput<T extends WithCreatedAt>(
  profileInput: IncomingProfile,
  field: 'projects' | 'experiences',
  existingItems?: T[],
) {
  const hasIncomingField = hasOwnField(profileInput, field);
  const selectedItems = hasIncomingField ? profileInput[field] : existingItems;
  return normalizeTimeline(Array.isArray(selectedItems) ? selectedItems : []);
}

function profilesMatch(a: SerializableProfile | null | undefined, b: Record<string, unknown>) {
  if (!a) return false;

  for (const field of PROFILE_SCALAR_FIELDS) {
    if (cleanString(a[field]) !== cleanString(b[field])) {
      return false;
    }
  }

  return (
    createStableHash({
      projects: (a.projects || []).map((item) => ({
        _id: toIdString((item as WithId)._id),
        name: cleanString((item as IncomingProject).name),
        description: cleanString((item as IncomingProject).description),
        summary: cleanString((item as IncomingProject).summary),
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
      })),
      experiences: (a.experiences || []).map((item) => ({
        _id: toIdString((item as WithId)._id),
        companyName: cleanString((item as IncomingExperience).companyName),
        role: cleanString((item as IncomingExperience).role),
        timeFrom: cleanString((item as IncomingExperience).timeFrom),
        timeTo: cleanString((item as IncomingExperience).timeTo),
        description: cleanString((item as IncomingExperience).description),
        summary: cleanString((item as IncomingExperience).summary),
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
      })),
    }) ===
    createStableHash({
      projects: (b.projects as IncomingProject[]).map((item) => ({
        _id: toIdString(item._id),
        name: cleanString(item.name),
        description: cleanString(item.description),
        summary: cleanString(item.summary),
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
      })),
      experiences: (b.experiences as IncomingExperience[]).map((item) => ({
        _id: toIdString(item._id),
        companyName: cleanString(item.companyName),
        role: cleanString(item.role),
        timeFrom: cleanString(item.timeFrom),
        timeTo: cleanString(item.timeTo),
        description: cleanString(item.description),
        summary: cleanString(item.summary),
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
      })),
    })
  );
}

function createSummarizer() {
  const model = getModel('easy');

  return async (text: string) => {
    const res = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Summarize in 1-2 concise sentences, return answer in text-only, no comments, not markdown:
${text}
`,
            },
          ],
        },
      ],
    });

    return res.response.text().trim();
  };
}

async function resolveProjects(
  incomingProjects: IncomingProject[],
  existingProjects: IncomingProject[],
  summarize: (text: string) => Promise<string>,
) {
  const existingById = new Map(
    existingProjects
      .map((item) => [toIdString(item._id), item] as const)
      .filter(([id]) => Boolean(id)),
  );

  return Promise.all(
    incomingProjects.map(async (project) => {
      const existing = existingById.get(toIdString(project._id));
      const shouldRefreshSummary =
        Boolean(project._needsSummary) ||
        !cleanString(existing?.summary) ||
        getProjectContentHash(project) !== getProjectContentHash(existing || {});

      return {
        ...(existing?._id ? { _id: existing._id } : {}),
        name: cleanString(project.name),
        description: cleanString(project.description),
        createdAt: project.createdAt ? new Date(project.createdAt) : existing?.createdAt ? new Date(existing.createdAt) : new Date(),
        summary: shouldRefreshSummary
          ? await summarize(`${cleanString(project.name)}\n${cleanString(project.description)}`)
          : cleanString(existing?.summary) || cleanString(project.summary),
      };
    }),
  );
}

async function resolveExperiences(
  incomingExperiences: IncomingExperience[],
  existingExperiences: IncomingExperience[],
  summarize: (text: string) => Promise<string>,
) {
  const existingById = new Map(
    existingExperiences
      .map((item) => [toIdString(item._id), item] as const)
      .filter(([id]) => Boolean(id)),
  );

  return Promise.all(
    incomingExperiences.map(async (experience) => {
      const existing = existingById.get(toIdString(experience._id));
      const shouldRefreshSummary =
        Boolean(experience._needsSummary) ||
        !cleanString(existing?.summary) ||
        getExperienceContentHash(experience) !== getExperienceContentHash(existing || {});
      const timeframe = `${cleanString(experience.timeFrom)} - ${cleanString(experience.timeTo)}`;

      return {
        ...(existing?._id ? { _id: existing._id } : {}),
        companyName: cleanString(experience.companyName),
        role: cleanString(experience.role),
        timeFrom: cleanString(experience.timeFrom),
        timeTo: cleanString(experience.timeTo),
        description: cleanString(experience.description),
        createdAt: experience.createdAt ? new Date(experience.createdAt) : existing?.createdAt ? new Date(existing.createdAt) : new Date(),
        summary: shouldRefreshSummary
          ? await summarize(
              `${cleanString(experience.companyName)} - ${cleanString(experience.role)} (${timeframe})\n${cleanString(experience.description)}`,
            )
          : cleanString(existing?.summary) || cleanString(experience.summary),
      };
    }),
  );
}

export async function GET(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  return NextResponse.json({ profile: serializeProfile(user?.profile || null) });
}

export async function PUT(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as IncomingProfile;
  await connectToDatabase();

  const existingUser = await UserModel.findById(auth.userId).lean();
  if (!existingUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const existingProfile = serializeProfile(existingUser.profile || null);
  const scalarFields = normalizeScalarFields(body, existingProfile || null);
  /* Root Cause vs Logic:
     Root Cause: the route normalized missing `projects` or `experiences` fields as empty arrays, so any partial PUT payload
     could unintentionally wipe previously saved items and make them disappear on the next refresh.
     Logic: treat omitted collections as "keep the stored value" and only interpret an explicit array payload as a collection update. */
  const normalizedProjects = normalizeCollectionInput(
    body,
    'projects',
    (existingProfile?.projects || []) as IncomingProject[],
  );
  const normalizedExperiences = normalizeCollectionInput(
    body,
    'experiences',
    (existingProfile?.experiences || []) as IncomingExperience[],
  );
  const summarize = createSummarizer();

  /* Root Cause vs Logic:
     Root Cause: the old save path regenerated summaries inline for submitted arrays and then wrote the whole profile object back,
     which made even small edits feel slow and visually disruptive because unchanged items were reprocessed with every save.
     Logic: diff each project and experience against the stored profile using stable content hashes, summarize only the items whose
     meaning changed, and only send Mongo the profile paths whose values actually changed. */
  const [projects, experiences] = await Promise.all([
    resolveProjects(normalizedProjects, (existingProfile?.projects || []) as IncomingProject[], summarize),
    resolveExperiences(
      normalizedExperiences,
      (existingProfile?.experiences || []) as IncomingExperience[],
      summarize,
    ),
  ]);

  const nextProfile = {
    ...scalarFields,
    projects,
    experiences,
  };

  if (profilesMatch(existingProfile || null, nextProfile)) {
    return NextResponse.json({ ok: true, profile: existingProfile });
  }

  const updateDoc: Record<string, unknown> = {};

  for (const field of PROFILE_SCALAR_FIELDS) {
    if (cleanString(existingProfile?.[field]) !== scalarFields[field]) {
      updateDoc[`profile.${field}`] = scalarFields[field];
    }
  }

  if (
    createStableHash({
      projects: (existingProfile?.projects || []).map((item) => ({
        _id: toIdString((item as WithId)._id),
        name: cleanString((item as IncomingProject).name),
        description: cleanString((item as IncomingProject).description),
        summary: cleanString((item as IncomingProject).summary),
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
      })),
    }) !==
    createStableHash({
      projects: projects.map((item) => ({
        _id: toIdString(item._id),
        name: cleanString(item.name),
        description: cleanString(item.description),
        summary: cleanString(item.summary),
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
      })),
    })
  ) {
    updateDoc['profile.projects'] = projects;
  }

  if (
    createStableHash({
      experiences: (existingProfile?.experiences || []).map((item) => ({
        _id: toIdString((item as WithId)._id),
        companyName: cleanString((item as IncomingExperience).companyName),
        role: cleanString((item as IncomingExperience).role),
        timeFrom: cleanString((item as IncomingExperience).timeFrom),
        timeTo: cleanString((item as IncomingExperience).timeTo),
        description: cleanString((item as IncomingExperience).description),
        summary: cleanString((item as IncomingExperience).summary),
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
      })),
    }) !==
    createStableHash({
      experiences: experiences.map((item) => ({
        _id: toIdString(item._id),
        companyName: cleanString(item.companyName),
        role: cleanString(item.role),
        timeFrom: cleanString(item.timeFrom),
        timeTo: cleanString(item.timeTo),
        description: cleanString(item.description),
        summary: cleanString(item.summary),
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
      })),
    })
  ) {
    updateDoc['profile.experiences'] = experiences;
  }

  const updated = await UserModel.findByIdAndUpdate(
    auth.userId,
    { $set: updateDoc },
    { new: true, upsert: false },
  );

  return NextResponse.json({ ok: true, profile: serializeProfile(updated?.profile || nextProfile) });
}
