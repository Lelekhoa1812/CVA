import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildCoverLetterPrompt, buildEmployerQuestionPrompt, type CoverLetterItem } from '../../src/lib/cover-letter';

const evidence: CoverLetterItem[] = [{
  index: 0,
  type: 'experience',
  title: 'Example role',
  summary: 'Led a migration.',
  description: 'Reduced build time by 30%.',
}];
const answers = 'Availability: Two weeks\nPriority: Technical problem solving';
const letter = buildCoverLetterPrompt({
  company: 'Example Co', jobDescription: 'Platform engineer', contactLines: [], prioritizedItems: evidence,
  clarificationContext: answers,
});
const answer = buildEmployerQuestionPrompt({
  company: 'Example Co', jobDescription: 'Platform engineer', question: 'When can you start?',
  idealWordCount: '30', answerStyle: 'Direct', prioritizedItems: evidence, clarificationContext: answers,
});

for (const prompt of [letter, answer]) {
  assert.match(prompt, /Led a migration\./, 'summary should be available to the writer');
  assert.match(prompt, /Reduced build time by 30%\./, 'details should not disappear when a summary exists');
  assert.match(prompt, /Availability: Two weeks/, 'candidate decisions should reach the writer');
  assert.match(prompt, /Technical problem solving/);
  assert.match(prompt, /Unselected options are not facts/);
  assert.match(prompt, /at most twice/);
  assert.match(prompt, /screening system/);
  assert.match(prompt, /Never invent or upgrade facts/);
  assert.equal(prompt.includes('Harry the Hirer'), false, 'unrelated example facts must not contaminate applications');
  assert.equal(prompt.includes('\u2014'), false, 'the prompt should not model an em dash');
}

assert.match(letter, /first sentence must name the target role/);
assert.match(letter, /250 to 350 words/);
assert.match(letter, /I am writing to/);
assert.match(letter, /lead proof or emphasis/);
assert.match(letter, /calling it adjacent/);
assert.match(letter, /Example Co/);
assert.match(letter, /Platform engineer/);

assert.match(answer, /When can you start\?/);
assert.match(answer, /Ideal Word Count:\n30/);
assert.match(answer, /Answer Style:\nDirect/);
assert.match(answer, /first sentence is the answer/);
assert.match(answer, /information has not been provided/);
assert.match(answer, /hard ceiling/);
assert.match(answer, /Great question/);
assert.match(answer, /80 to 180 words/);
assert.match(answer, /do not imply a yes or no/);
assert.equal(answer.includes('Situation, Task, Action, or Result'), true);

const bareLetter = buildCoverLetterPrompt({
  company: 'Example Co', jobDescription: 'Platform engineer', contactLines: ['Ada'], prioritizedItems: evidence,
});
assert.match(bareLetter, /None supplied/);
assert.match(bareLetter, /Do not invent a motivation/);
assert.match(bareLetter, /Ada/);

const bareAnswer = buildEmployerQuestionPrompt({
  company: '', jobDescription: '', question: 'Are you authorised to work here?', prioritizedItems: [],
});
assert.match(bareAnswer, /Not provided/);
assert.match(bareAnswer, /Are you authorised to work here\?/);
assert.match(bareAnswer, /say that it has not been provided/);

const advanced = readFileSync(path.join(__dirname, '../../src/lib/cover-letter-advanced.ts'), 'utf8');
for (const phrase of [
  'follow that decision ahead of this planning brief',
  'The first sentence must name the role',
  'The first sentence must be the direct answer',
  'Score below 70 and set approved to false if the opening fails',
  'Do not lower the score because an unsupported requirement was omitted',
  'put the direct answer in the first sentence',
  'say that the information has not been provided',
]) {
  assert.equal(advanced.includes(phrase), true, `advanced prompts should keep: ${phrase}`);
}

console.log('Generation prompt context tests passed');
