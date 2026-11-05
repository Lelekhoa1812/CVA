import assert from 'node:assert/strict';
import { generateJsonSafe, getModel } from '../../src/lib/ai';

type Fetch = typeof globalThis.fetch;
const originalFetch = globalThis.fetch;
const request = (signal?: AbortSignal) => getModel('easy').generateContent({ contents: [{ role: 'user', parts: [{ text: 'hello' }] }], signal });
const makeStream = (chunks: string[]) => new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const ok = () => makeStream(['data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}\n\n', 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n']);
const setKeys = (...keys: string[]) => { for (let i = 1; i <= 9; i++) process.env[`NVIDIA_NIM_API_KEY_${i}`] = keys[i - 1] || ''; };
const keyOf = (init?: RequestInit) => (init?.headers as Record<string, string>).Authorization.slice(7);

async function main() {
  process.env.NVIDIA_NIM_EASY_MODELS = 'model-a,model-b';
  setKeys('fragment');
  globalThis.fetch = (async () => makeStream(['da', 'ta: {"choices":[{"delta":{"content":"hé', 'llo"}}]}\r\n\r\ndata: {"choices":[{"finish_reason":"stop"}]}\r\n\r\ndata: [DO', 'NE]\r\n\r\n'])) as Fetch;
  assert.equal((await request()).response.text(), 'héllo');

  process.env.NVIDIA_NIM_EASY_MODELS = 'model-a';
  setKeys('rate-1', 'rate-2');
  const attempts: string[] = [];
  globalThis.fetch = (async (_url, init) => { const key = keyOf(init); attempts.push(key); return attempts.length === 1 ? new Response('', { status: 429 }) : ok(); }) as Fetch;
  assert.equal((await request()).response.text(), 'hi');
  assert.deepEqual(new Set(attempts), new Set(['rate-1', 'rate-2']));

  process.env.NVIDIA_NIM_EASY_MODELS = 'model-a,model-b';
  setKeys('cascade-1', 'cascade-2');
  const models: string[] = [];
  globalThis.fetch = (async (_url, init) => { const model = JSON.parse(String(init?.body)).model; models.push(model); return model === 'model-a' ? new Response('', { status: 429 }) : ok(); }) as Fetch;
  assert.equal((await request()).response.text(), 'hi');
  assert.deepEqual(models, ['model-a', 'model-b']);

  setKeys('stall-1', 'stall-2');
  process.env.NVIDIA_NIM_FIRST_TOKEN_TIMEOUT_S = '1';
  const stalledModels: string[] = [];
  globalThis.fetch = (async (_url, init) => {
    const model = JSON.parse(String(init?.body)).model;
    stalledModels.push(model);
    if (model === 'model-b') return ok();
    return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  }) as Fetch;
  assert.equal((await request()).response.model, 'model-b');
  assert.deepEqual(stalledModels, ['model-a', 'model-b']);
  delete process.env.NVIDIA_NIM_FIRST_TOKEN_TIMEOUT_S;

  setKeys('parallel-1', 'parallel-2');
  const parallel: string[] = [];
  const releases: Array<() => void> = [];
  globalThis.fetch = (async (_url, init) => { parallel.push(keyOf(init)); await new Promise<void>((resolve) => releases.push(resolve)); return ok(); }) as Fetch;
  const one = request();
  const two = request();
  assert.deepEqual(new Set(parallel), new Set(['parallel-1', 'parallel-2']));
  releases.forEach((release) => release());
  await Promise.all([one, two]);

  setKeys('duplicate', 'duplicate', '');
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response('', { status: 429 }); }) as Fetch;
  await assert.rejects(request());
  assert.equal(calls, 2); // One distinct key, tried once for each model.
  setKeys();
  await assert.rejects(request(), /No NVIDIA NIM API keys/);

  setKeys('cancel');
  const controller = new AbortController();
  globalThis.fetch = (async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))) as Fetch;
  const cancelled = request(controller.signal);
  controller.abort();
  await assert.rejects(cancelled, /cancelled/);

  setKeys('json-cancel');
  const jsonController = new AbortController();
  let jsonCalls = 0;
  globalThis.fetch = (async (_url, init) => {
    jsonCalls++;
    return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  }) as Fetch;
  const jsonRequest = generateJsonSafe('easy', 'return JSON', 2, jsonController.signal);
  jsonController.abort();
  await assert.rejects(jsonRequest, /cancelled/);
  assert.equal(jsonCalls, 1, 'a cancelled request must not start more retries');

  setKeys('truncated');
  globalThis.fetch = (async () => makeStream(['data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n'])) as Fetch;
  await assert.rejects(request(), /did not finish normally/);
  console.log('NVIDIA NIM routing and streaming tests passed');
}
main().finally(() => { globalThis.fetch = originalFetch; }).catch((error) => { console.error(error); process.exitCode = 1; });
