import assert from 'node:assert/strict';
import { validateGenerationInput } from '../../src/lib/generate/validation';

const valid = { kind: 'cover-letter' as const, company: 'Example', jobDescription: 'Role', indices: [0, 2] };
assert.equal(validateGenerationInput(valid), null);
assert.equal(validateGenerationInput({ ...valid, indices: null }), null);
assert.equal(validateGenerationInput({ ...valid, indices: undefined }), null);
assert.equal(validateGenerationInput({ ...valid, indices: [] }), null);
assert.equal(validateGenerationInput({ ...valid, company: '' }), 'Missing inputs');
assert.equal(validateGenerationInput({ ...valid, jobDescription: 'x'.repeat(18_001) }), 'Input too long');
for (const indices of [[-1], [1.5], ['1'], [Number.MAX_SAFE_INTEGER + 1], Array(31).fill(0), '0']) {
  assert.equal(validateGenerationInput({ ...valid, indices }), 'Invalid evidence selection');
}
assert.equal(validateGenerationInput({ kind: 'employer-question', company: '', jobDescription: '', question: 'Why?', indices: undefined }), null);
assert.equal(validateGenerationInput({ kind: 'employer-question', company: '', jobDescription: '', question: '', indices: undefined }), 'Missing question');
assert.equal(validateGenerationInput({ kind: 'employer-question', company: '', jobDescription: '', question: 'x'.repeat(4001), indices: [] }), 'Input too long');
assert.equal(validateGenerationInput({ ...valid, answerStyle: 'x'.repeat(301) }), 'Input too long');
console.log('Generation validation tests passed');
