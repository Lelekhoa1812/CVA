import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type ModelPreset = 'easy' | 'hard' | 'document';
type ContentRole = 'user' | 'assistant' | 'model' | string;
type InputPart = {
  text?: string;
  inlineData?: {
    data: string;
    mimeType: string;
  };
};
type GenerateContentPayload = {
  contents: Array<{
    role: ContentRole;
    parts: InputPart[];
  }>;
};
type GenerateContentResult = {
  response: {
    text(): string;
  };
};

const DEFAULT_API_VERSION = '2024-12-01-preview';
const DEFAULT_TIMEOUT_S = 360;
const DEFAULT_MAX_TOKENS = 16384;
const DEFAULT_HARD_MODEL = 'gpt-5.4-mini';
const DEFAULT_EASY_MODEL = 'gpt-5-nano';

let cachedDotEnvValues: Record<string, string> | null = null;

function parseDotEnvFile(filePath: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value.trim();
  }

  return parsed;
}

function getDotEnvValues(): Record<string, string> {
  if (cachedDotEnvValues) return cachedDotEnvValues;

  const candidatePaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
  ];

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      cachedDotEnvValues = parseDotEnvFile(candidatePath);
      return cachedDotEnvValues;
    }
  }

  cachedDotEnvValues = {};
  return cachedDotEnvValues;
}

function getConfigValue(name: string): string | undefined {
  const runtimeValue = process.env[name]?.trim();
  if (runtimeValue) return runtimeValue;
  return getDotEnvValues()[name];
}

function getRequiredConfigValue(name: string): string {
  const value = getConfigValue(name);
  if (!value) throw new Error(`Missing ${name} in environment`);
  return value;
}

function normalizeBaseUrl(endpoint: string): string {
  const normalizedEndpoint = endpoint.trim().replace(/\/+$/, '');

  if (normalizedEndpoint.endsWith('/openai/v1')) {
    return `${normalizedEndpoint}/`;
  }

  if (normalizedEndpoint.endsWith('/models')) {
    return `${normalizedEndpoint.slice(0, -'/models'.length)}/openai/v1/`;
  }

  return `${normalizedEndpoint}/openai/v1/`;
}

function getTimeoutMs(): number {
  const rawTimeout = Number.parseInt(
    getConfigValue('AZURE_AI_FOUNDRY_TIMEOUT_S') || `${DEFAULT_TIMEOUT_S}`,
    10,
  );

  return (Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_TIMEOUT_S) * 1000;
}

function getMaxOutputTokens(): number {
  const rawMaxTokens = Number.parseInt(
    getConfigValue('AZURE_AI_FOUNDRY_MAX_TOKENS') || `${DEFAULT_MAX_TOKENS}`,
    10,
  );

  return Number.isFinite(rawMaxTokens) && rawMaxTokens > 0
    ? rawMaxTokens
    : DEFAULT_MAX_TOKENS;
}

function resolveModelName(preset: ModelPreset): string {
  // Motivation vs Logic:
  // Motivation: We want one global Azure model switch that preserves the app's old "lightweight vs stronger"
  // behavior without scattering provider-specific choices across routes.
  // Logic: `easy` is pinned to `gpt-5-nano`, `hard` reads the configured Azure model with a
  // `gpt-5.4-mini` fallback, and document-heavy OCR/PDF extraction always stays on `gpt-5.4-mini`.
  if (preset === 'easy') return DEFAULT_EASY_MODEL;
  if (preset === 'document') return DEFAULT_HARD_MODEL;
  return getConfigValue('AZURE_AI_FOUNDRY_MODEL') || DEFAULT_HARD_MODEL;
}

function mapRole(role: ContentRole): 'user' | 'assistant' | 'system' {
  if (role === 'assistant' || role === 'model') return 'assistant';
  if (role === 'system') return 'system';
  return 'user';
}

function mapPart(part: InputPart) {
  if (part.inlineData) {
    const { mimeType, data } = part.inlineData;

    if (mimeType === 'application/pdf') {
      return {
        type: 'input_file' as const,
        filename: 'upload.pdf',
        file_data: `data:${mimeType};base64,${data}`,
      };
    }

    return {
      type: 'input_image' as const,
      image_url: `data:${mimeType};base64,${data}`,
    };
  }

  return {
    type: 'input_text' as const,
    text: part.text || '',
  };
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';

  const directText = (payload as { output_text?: unknown }).output_text;
  if (typeof directText === 'string' && directText.trim()) {
    return directText;
  }

  const output = (payload as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }).output;
  if (!Array.isArray(output)) return '';

  return output
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text || '')
    .join('')
    .trim();
}

async function createResponse(
  preset: ModelPreset,
  payload: GenerateContentPayload,
): Promise<GenerateContentResult> {
  const endpoint = getRequiredConfigValue('AZURE_AI_FOUNDRY_ENDPOINT');
  const apiKey = getRequiredConfigValue('AZURE_AI_FOUNDRY_API_KEY');
  const apiVersion = getConfigValue('AZURE_AI_FOUNDRY_API_VERSION') || DEFAULT_API_VERSION;
  const baseUrl = normalizeBaseUrl(endpoint);
  const url = new URL('responses', baseUrl);

  // Azure Foundry's OpenAI v1 endpoints accept the normalized `/openai/v1/` path directly and reject
  // preview `api-version` query parameters on this route, so we keep the configured value for diagnostics.

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      model: resolveModelName(preset),
      input: payload.contents.map((content) => ({
        role: mapRole(content.role),
        content: content.parts.map(mapPart),
      })),
      max_output_tokens: getMaxOutputTokens(),
    }),
    signal: AbortSignal.timeout(getTimeoutMs()),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Azure AI Foundry request failed (${response.status}, configured api version ${apiVersion}): ${detail}`,
    );
  }

  const data = await response.json();
  const text = extractOutputText(data);

  if (!text) {
    throw new Error('Azure AI Foundry returned an empty response');
  }

  return {
    response: {
      text: () => text,
    },
  };
}

export function getModel(preset: ModelPreset) {
  return {
    generateContent: (payload: GenerateContentPayload) => createResponse(preset, payload),
  };
}

export async function generateJsonSafe(
  preset: ModelPreset,
  prompt: string,
  maxRetries = 2,
) {
  const model = getModel(preset);
  let lastErr: unknown = null;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      const text = result.response.text();
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      const candidate = jsonStart >= 0 && jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;
      return JSON.parse(candidate);
    } catch (error) {
      lastErr = error;
    }
  }

  throw lastErr ?? new Error('Failed to parse JSON');
}
