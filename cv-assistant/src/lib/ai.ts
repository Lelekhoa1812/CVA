type ModelPreset = 'easy' | 'hard' | 'document';
type ContentRole = 'user' | 'assistant' | 'model' | string;
type InputPart = {
  text?: string;
  inlineData?: { data: string; mimeType: string; detail?: 'low' | 'high' | 'auto' | 'original' };
};
type GenerateContentPayload = {
  contents: Array<{ role: ContentRole; parts: InputPart[] }>;
  modelOverride?: string;
  previousResponseId?: string;
  tools?: Array<Record<string, unknown>>;
  extraInputItems?: Array<Record<string, unknown>>;
  reasoning?: Record<string, unknown>;
  signal?: AbortSignal;
};
type GenerateContentResult = { response: { text(): string; model: string } };

type KeyState = { key: string; inFlight: number; disabledUntil: number; lastUsed: number };
type ModelKeyState = { cooldownUntil: number; failures: number };

// State is shared by requests within one server process. Serverless instances each have their
// own state, so a provider's rate limit remains the source of truth across instances.
const keyStates = new Map<string, KeyState>();
const modelKeyStates = new Map<string, ModelKeyState>();
let sequence = 0;
function getConfigValue(name: string): string | undefined {
  return process.env[name]?.trim();
}

function positiveInt(name: string, fallback: number): number {
  const value = Number.parseInt(getConfigValue(name) || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function availableKeys(): KeyState[] {
  const keys = Array.from({ length: 9 }, (_, index) => getConfigValue(`NVIDIA_NIM_API_KEY_${index + 1}`))
    .filter((key): key is string => Boolean(key));
  // Duplicate values are one credential and must share their concurrency and cooldown state.
  return [...new Set(keys)].map((key) => {
    let state = keyStates.get(key);
    if (!state) {
      state = { key, inFlight: 0, disabledUntil: 0, lastUsed: -Math.random() };
      keyStates.set(key, state);
    }
    return state;
  });
}

// Safe to log: reports only the number of distinct, nonempty credentials.
export function getNvidiaNimKeyCount(): number {
  return availableKeys().length;
}

const DEFAULT_MODELS: Record<ModelPreset, string[]> = {
  easy: ['poolside/laguna-xs-2.1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 'nvidia/nemotron-3-ultra-550b-a55b'],
  hard: ['nvidia/nemotron-3-ultra-550b-a55b', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 'deepseek-ai/deepseek-v4.1-flash'],
  document: ['nvidia/nemotron-3-ultra-550b-a55b', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 'deepseek-ai/deepseek-v4.1-flash'],
};

function modelList(preset: ModelPreset): string[] {
  const configured = getConfigValue(`NVIDIA_NIM_${preset.toUpperCase()}_MODELS`);
  return configured ? [...new Set(configured.split(',').map((model) => model.trim()).filter(Boolean))] : DEFAULT_MODELS[preset];
}

export function resolveModelName(preset: ModelPreset): string {
  return modelList(preset)[0];
}

export function resolveAutoApplySupervisorModelName(): string {
  return getConfigValue('NVIDIA_NIM_SUPERVISOR_MODEL') || resolveModelName('hard');
}

function mapRole(role: ContentRole): 'user' | 'assistant' | 'system' {
  if (role === 'assistant' || role === 'model') return 'assistant';
  return role === 'system' ? 'system' : 'user';
}

function mapMessages(payload: GenerateContentPayload) {
  if (payload.previousResponseId || payload.tools?.length || payload.extraInputItems?.length) {
    throw new Error('NVIDIA NIM chat completions requires conversation messages; Responses API state and tools are unsupported');
  }
  return payload.contents.map(({ role, parts }) => ({
    role: mapRole(role),
    content: parts.some((part) => part.inlineData)
      ? parts.map((part) => {
        if (!part.inlineData) return { type: 'text', text: part.text || '' };
        const { data, mimeType } = part.inlineData;
        if (!mimeType.startsWith('image/')) throw new Error(`NVIDIA NIM does not accept ${mimeType} as chat input`);
        return { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } };
      })
      : parts.map((part) => part.text || '').join('\n'),
  }));
}

class NimError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs = 0) { super(message); }
}

function retryAfterMs(header: string | null): number {
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

async function readStream(response: Response, controller: AbortController, resetIdle: () => void): Promise<string> {
  if (!response.body) throw new NimError('NVIDIA NIM returned no streaming response', 0);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finished = false;
  let finishReason = '';
  const consume = (event: string) => {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data.trim() === '[DONE]') { finished = true; return; }
    let chunk: { error?: unknown; choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }> };
    try { chunk = JSON.parse(data); } catch { throw new NimError('NVIDIA NIM returned malformed streaming data', 0); }
    if (chunk.error) throw new NimError('NVIDIA NIM reported a streaming error', 0);
    const choice = chunk.choices?.[0];
    if (typeof choice?.delta?.content === 'string') text += choice.delta.content;
    if (choice?.finish_reason) finishReason = choice.finish_reason;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      resetIdle();
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      for (const event of events) consume(event);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    if (!finished && !finishReason) throw new NimError('NVIDIA NIM stream ended before completion', 0);
    if (finishReason && finishReason !== 'stop') throw new NimError(`NVIDIA NIM response did not finish normally (${finishReason})`, 0);
    if (!text.trim()) throw new NimError('NVIDIA NIM returned an empty response', 0);
    return text.trim();
  } finally {
    controller.abort();
    reader.releaseLock();
  }
}

async function requestModel(model: string, state: KeyState, messages: ReturnType<typeof mapMessages>, deadline: number, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const total = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
  let idle: ReturnType<typeof setTimeout>;
  const resetIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => controller.abort(), positiveInt('NVIDIA_NIM_IDLE_TIMEOUT_S', 90) * 1000);
  };
  const defaultFirstTokenSeconds = model === 'stepfun-ai/step-5-preview' ? 55 : model === 'deepseek-ai/deepseek-v4.1-flash' ? 75 : 20;
  idle = setTimeout(() => controller.abort(), positiveInt('NVIDIA_NIM_FIRST_TOKEN_TIMEOUT_S', defaultFirstTokenSeconds) * 1000);
  try {
    const base = (getConfigValue('NVIDIA_NIM_BASE_URL') || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.key}`, Accept: 'text/event-stream' },
      body: JSON.stringify({ model, messages, stream: true, max_tokens: Math.min(positiveInt('NVIDIA_NIM_MAX_TOKENS', 65536), model === 'poolside/laguna-xs-2.1' ? 16384 : model === 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning' ? 65536 : model === 'stepfun-ai/step-5-preview' || model === 'deepseek-ai/deepseek-v4.1-flash' ? 1048576 : 32768) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new NimError(`NVIDIA NIM request failed (HTTP ${response.status})`, response.status, retryAfterMs(response.headers.get('retry-after')));
    }
    return await readStream(response, controller, resetIdle);
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof NimError)) throw new NimError('NVIDIA NIM request timed out or disconnected', 0);
    if (error instanceof NimError) throw error;
    throw new NimError('NVIDIA NIM network request failed', 0);
  } finally {
    clearTimeout(total);
    clearTimeout(idle!);
    signal?.removeEventListener('abort', abort);
  }
}

async function createResponse(preset: ModelPreset, payload: GenerateContentPayload): Promise<GenerateContentResult> {
  const keys = availableKeys();
  if (!keys.length) throw new Error('No NVIDIA NIM API keys configured (NVIDIA_NIM_API_KEY_1 through NVIDIA_NIM_API_KEY_9)');
  const messages = mapMessages(payload);
  const hasImages = payload.contents.some((content) => content.parts.some((part) => part.inlineData?.mimeType.startsWith('image/')));
  const visionModels = (getConfigValue('NVIDIA_NIM_VISION_MODELS') || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning,stepfun-ai/step-5-preview').split(',').map((model) => model.trim()).filter(Boolean);
  const models = payload.modelOverride ? [payload.modelOverride] : hasImages ? visionModels : modelList(preset);
  let lastError: unknown;
  const deadline = Date.now() + positiveInt('NVIDIA_NIM_TIMEOUT_S', 240) * 1000;
  const tried = new Map(models.map((model) => [model, new Set<KeyState>()]));
  const rejectedModels = new Set<string>();
  // Try each model before returning to a second key for the same model. This prevents
  // one slow or rate-limited model from consuming the whole request deadline.
  for (let round = 0; round < keys.length; round++) {
    for (const model of models) {
      if (rejectedModels.has(model)) continue;
      if (payload.signal?.aborted) throw new Error('NVIDIA NIM request cancelled');
      if (Date.now() >= deadline) throw new Error('NVIDIA NIM request timed out');
      const now = Date.now();
      const triedForModel = tried.get(model)!;
      const eligible = keys.filter((state) => !triedForModel.has(state) && state.disabledUntil <= now && (modelKeyStates.get(`${model}\0${state.key}`)?.cooldownUntil || 0) <= now);
      eligible.sort((a, b) => a.inFlight - b.inFlight || a.lastUsed - b.lastUsed);
      const state = eligible[0];
      if (!state) continue;
      triedForModel.add(state);
      state.inFlight += 1;
      state.lastUsed = ++sequence;
      const modelKey = `${model}\0${state.key}`;
      try {
        const text = await requestModel(model, state, messages, deadline, payload.signal);
        modelKeyStates.delete(modelKey);
        return { response: { text: () => text, model } };
      } catch (error) {
        if (payload.signal?.aborted) throw new Error('NVIDIA NIM request cancelled');
        lastError = error;
        const failure = error instanceof NimError ? error : new NimError('NVIDIA NIM request failed', 0);
        if (failure.status === 401 || failure.status === 402) {
          state.disabledUntil = Date.now() + Math.max(failure.retryAfterMs, 5 * 60_000);
        } else if (failure.status === 403 || failure.status === 404 || failure.status === 429 || failure.status === 0 || failure.status >= 500) {
          const previous = modelKeyStates.get(modelKey)?.failures || 0;
          const delay = failure.retryAfterMs || Math.min(60_000, (failure.status === 429 ? 10_000 : 3_000) * 2 ** Math.min(previous, 4));
          modelKeyStates.set(modelKey, { failures: previous + 1, cooldownUntil: Date.now() + delay });
        } else {
          rejectedModels.add(model);
        }
      } finally {
        state.inFlight -= 1;
      }
    }
  }
  throw lastError || new Error('All configured NVIDIA NIM keys are temporarily unavailable for the selected models');
}

export function getModel(preset: ModelPreset) {
  return { generateContent: (payload: GenerateContentPayload) => createResponse(preset, payload) };
}

export function getAutoApplySupervisorModel() {
  return { generateContent: (payload: GenerateContentPayload) => createResponse('hard', {
    ...payload,
    modelOverride: payload.modelOverride || (payload.contents.some((content) => content.parts.some((part) => part.inlineData?.mimeType.startsWith('image/'))) ? undefined : getConfigValue('NVIDIA_NIM_SUPERVISOR_MODEL')) || undefined,
  }) };
}

export async function generateJsonSafe(preset: ModelPreset, prompt: string, maxRetries = 2) {
  const model = getModel(preset);
  let lastErr: unknown = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
      const text = result.response.text();
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      const candidate = jsonStart >= 0 && jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;
      return JSON.parse(candidate);
    } catch (error) { lastErr = error; }
  }
  throw lastErr ?? new Error('Failed to parse JSON');
}
