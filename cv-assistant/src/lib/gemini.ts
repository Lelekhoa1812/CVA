import { GoogleGenerativeAI } from '@google/generative-ai';

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API;
  if (!key) throw new Error('Missing GEMINI_API in environment');
  return key;
}

let cachedClient: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI {
  if (cachedClient) return cachedClient;
  cachedClient = new GoogleGenerativeAI(getGeminiApiKey());
  return cachedClient;
}

export function getModel(model: 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.5-flash-lite') {
  return getClient().getGenerativeModel({ model });
}

export async function generateJsonSafe(modelName: 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.5-flash-lite', prompt: string, maxRetries = 2) {
  const model = getModel(modelName);
  let lastErr: unknown = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
      const text = result.response.text();
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      const candidate = jsonStart >= 0 && jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;
      const parsed = JSON.parse(candidate);
      return parsed;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('Failed to parse JSON');
}


