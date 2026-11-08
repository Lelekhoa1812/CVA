import assert from 'node:assert/strict';
import { checkDraftClaims } from '../../src/lib/generate/claim-check';

const originalFetch = globalThis.fetch;
const stream = (content: string) => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
const evidence = [{ index: 0, type: 'experience' as const, title: 'Engineer', summary: 'Built an API', description: 'Reduced processing time by 20%.' }];
async function main() {
  process.env.NVIDIA_NIM_EASY_MODELS = 'test-check-model';
  process.env.NVIDIA_NIM_API_KEY_1 = 'check-test-1';
  let prompt = '';
  globalThis.fetch = (async (_url, init) => {
    prompt = JSON.parse(String(init?.body)).messages[0].content;
    return stream(JSON.stringify({ supported: false, issues: ['Led the team', 'Improved reliability'] }));
  }) as typeof fetch;
  const flagged = await checkDraftClaims({ draft: 'I led the team.', evidence, clarificationContext: 'I built the API.' });
  assert.match(flagged.reviewWarning || '', /Led the team/);
  assert.match(prompt, /Reduced processing time by 20%/);
  assert.match(prompt, /I built the API/);

  globalThis.fetch = (async () => stream(JSON.stringify({ supported: true, issues: [] }))) as typeof fetch;
  assert.deepEqual(await checkDraftClaims({ draft: 'I built an API.', evidence }), {});

  globalThis.fetch = (async () => stream('{"unexpected":true}')) as typeof fetch;
  assert.match((await checkDraftClaims({ draft: 'I built an API.', evidence })).reviewWarning || '', /could not complete/i);

  // A failed first attempt is retried once on the second model list before the check is reported unavailable.
  process.env.NVIDIA_NIM_HARD_MODELS = 'test-check-hard-model';
  const models: string[] = [];
  globalThis.fetch = (async (_url, init) => {
    const model = JSON.parse(String(init?.body)).model as string;
    models.push(model);
    return model === 'test-check-hard-model' ? stream(JSON.stringify({ supported: true, issues: [] })) : stream('not json at all');
  }) as typeof fetch;
  assert.deepEqual(await checkDraftClaims({ draft: 'I built an API.', evidence }), {});
  assert.ok(models.includes('test-check-model') && models.includes('test-check-hard-model'), models.join(','));
  delete process.env.NVIDIA_NIM_HARD_MODELS;

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(checkDraftClaims({ draft: 'Text', evidence, signal: controller.signal }), /cancelled/i);
  console.log('Claim check tests passed');
}
main().finally(() => { globalThis.fetch = originalFetch; delete process.env.NVIDIA_NIM_API_KEY_1; delete process.env.NVIDIA_NIM_EASY_MODELS; }).catch((error) => { console.error(error); process.exitCode = 1; });
