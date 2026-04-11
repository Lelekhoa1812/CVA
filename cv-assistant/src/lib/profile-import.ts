import mammoth from 'mammoth';
import { getModel } from '@/lib/ai';

export type ImportedProject = {
  name?: string;
  description?: string;
};

export type ImportedExperience = {
  companyName?: string;
  role?: string;
  timeFrom?: string;
  timeTo?: string;
  description?: string;
};

export type ImportedProfileData = {
  name?: string;
  major?: string;
  school?: string;
  studyPeriod?: string;
  email?: string;
  workEmail?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  profileSummary?: string;
  skills?: string;
  languages?: string;
  projects?: ImportedProject[];
  experiences?: ImportedExperience[];
};

const PROFILE_IMPORT_PROMPT = `You are a resume/profile parser. Extract the candidate data into the following strict JSON schema:
{
  "name": string,
  "major": string,
  "school": string,
  "studyPeriod": string,
  "email": string,
  "workEmail": string,
  "phone": string,
  "website": string,
  "linkedin": string,
  "profileSummary": string,
  "skills": string,
  "languages": string,
  "projects": [{"name": string, "description": string}],
  "experiences": [{"companyName": string, "role": string, "timeFrom": string, "timeTo": string, "description": string}]
}
Return ONLY JSON with no markdown fences. Use empty strings or empty arrays when data is missing. Preserve the candidate's own facts and avoid inventing details.`;

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function extractJsonPayload(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end >= 0 ? text.slice(start, end + 1) : text;
}

function normalizeImportedProfile(payload: unknown): ImportedProfileData {
  const source = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const projects = Array.isArray(source.projects) ? source.projects : [];
  const experiences = Array.isArray(source.experiences) ? source.experiences : [];

  return {
    name: cleanText(source.name),
    major: cleanText(source.major),
    school: cleanText(source.school),
    studyPeriod: cleanText(source.studyPeriod),
    email: cleanText(source.email),
    workEmail: cleanText(source.workEmail),
    phone: cleanText(source.phone),
    website: cleanText(source.website),
    linkedin: cleanText(source.linkedin),
    profileSummary: cleanText(source.profileSummary),
    skills: cleanText(source.skills),
    languages: cleanText(source.languages),
    projects: projects
      .map((item) => {
        const project = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return {
          name: cleanText(project.name),
          description: cleanText(project.description),
        };
      })
      .filter((item) => item.name || item.description),
    experiences: experiences
      .map((item) => {
        const experience = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return {
          companyName: cleanText(experience.companyName),
          role: cleanText(experience.role),
          timeFrom: cleanText(experience.timeFrom),
          timeTo: cleanText(experience.timeTo),
          description: cleanText(experience.description),
        };
      })
      .filter(
        (item) =>
          item.companyName || item.role || item.timeFrom || item.timeTo || item.description,
      ),
  };
}

async function runProfileImport(parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>) {
  const model = getModel('document');
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: PROFILE_IMPORT_PROMPT }, ...parts] }],
      });
      return normalizeImportedProfile(JSON.parse(extractJsonPayload(res.response.text())));
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Failed to parse profile import JSON: ${String(lastError)}`);
}

function detectImportMimeType(file: File) {
  const uploadedType = (file.type || '').toLowerCase();
  const name = (file as { name?: string }).name || '';
  const lower = name.toLowerCase();

  if (uploadedType === 'application/pdf' || lower.endsWith('.pdf')) {
    return 'application/pdf';
  }

  if (
    uploadedType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  return null;
}

/* Motivation vs Logic:
   Motivation: file upload and pasted-text import should land on one consistent profile schema so the UI can merge results
   without maintaining separate parsing contracts for PDF, DOCX, and free-form text.
   Logic: centralize extraction here, use the document model directly for PDFs, convert DOCX into raw text with Mammoth,
   and send all text-like content through the same JSON-only parser prompt. */
export async function parseProfileImportFromText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('No profile text provided');
  }

  return runProfileImport([{ text: trimmed }]);
}

export async function parseProfileImportFromFile(file: File) {
  const mimeType = detectImportMimeType(file);
  if (!mimeType) {
    throw new Error('Unsupported file type. Please upload a PDF or DOCX file.');
  }

  const fileArrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(fileArrayBuffer);

  if (mimeType === 'application/pdf') {
    return runProfileImport([
      {
        inlineData: {
          data: fileBuffer.toString('base64'),
          mimeType,
        },
      },
    ]);
  }

  const extracted = await mammoth.extractRawText({ buffer: fileBuffer });
  return parseProfileImportFromText(extracted.value);
}
