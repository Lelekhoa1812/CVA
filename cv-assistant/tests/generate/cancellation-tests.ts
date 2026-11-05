import assert from 'node:assert/strict';
import { generateAdvancedCoverLetter, generateAdvancedEmployerAnswer } from '../../src/lib/cover-letter-advanced';

async function main() {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { requests++; throw new Error('Unexpected network request'); }) as typeof fetch;
  process.env.NVIDIA_NIM_API_KEY_1 = 'test-key';
  try {
    const common = { company: 'Example', jobDescription: 'Engineer', allItems: [], initialItems: [], signal: controller.signal };
    await assert.rejects(generateAdvancedCoverLetter({ ...common, contactLines: [] }));
    await assert.rejects(generateAdvancedEmployerAnswer({ ...common, question: 'Why?' }));
    assert.equal(requests, 0, 'cancelled requests should not start additional provider calls');
    console.log('Advanced generation cancellation tests passed');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NVIDIA_NIM_API_KEY_1;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
