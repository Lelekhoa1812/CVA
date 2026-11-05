import assert from 'node:assert/strict';
import { buildClarificationsPrompt, formatClarificationAnswers, normalizeClarificationAnswers, normalizeClarificationQuestions, sanitizeClarificationQuestions } from '../../src/lib/generate/clarifications';
import type { CoverLetterItem } from '../../src/lib/cover-letter';

const good = { questions: [
  { decision: 'Lead proof', prompt: 'Which proof should open the letter', why: 'The opening is what a recruiter reads first.', type: 'single', options: ['Website', { label: 'Dashboard', detail: 'Cut load time' }] },
  { prompt: 'Which requirements should the letter mirror?', type: 'multiple', options: [{ label: 'Mentoring' }, { label: 'Product impact' }, 'Mentoring'] },
] };

const normalized = normalizeClarificationQuestions(good);
assert.equal(normalized.length, 2);
assert.equal(normalized[0].id, 'q1');
assert.equal(normalized[0].decision, 'Lead proof');
assert.equal(normalized[0].prompt, 'Which proof should open the letter?');
assert.equal(normalized[0].why, 'The opening is what a recruiter reads first.');
assert.deepEqual(normalized[0].options, [
  { id: 'o1', label: 'Website', detail: '' },
  { id: 'o2', label: 'Dashboard', detail: 'Cut load time' },
]);
assert.equal(normalized[1].options.length, 2, 'duplicate option labels are collapsed');

assert.equal(normalizeClarificationQuestions({ questions: [good.questions[0]] }).length, 0, 'a single question is not enough of a decision set');
assert.equal(normalizeClarificationQuestions({ questions: [{ prompt: 'Invalid?', type: 'single', options: ['Only one'] }] }).length, 0);
assert.equal(normalizeClarificationQuestions({ questions: [{ prompt: 'Bad type?', type: 'multi', options: ['A', 'B'] }, good.questions[0]] }).length, 0);
assert.equal(normalizeClarificationQuestions({ questions: Array(9).fill(good.questions[0]) }).length, 0, 'duplicate prompts cannot pad the set');

const six = Array.from({ length: 6 }, (_, index) => ({
  prompt: `Decision ${index}?`,
  type: 'single',
  options: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'],
}));
const capped = normalizeClarificationQuestions({ questions: six });
assert.equal(capped.length, 5);
assert.equal(capped[4].options.length, 5);
assert.equal(capped[0].id, 'q1');

assert.equal(normalizeClarificationQuestions({ questions: [
  { prompt: 'Which proof?', type: 'single', options: ['Platform role', 'Other', 'Something else', 'None of the above', 'Prefer not to say'] },
  { prompt: 'Which emphasis?', type: 'multiple', options: ['Delivery', 'Not sure', 'All of the above'] },
  good.questions[1],
] }).length, 0, 'filler removal that leaves one real option drops the question, and one question is not a set');

const keptAfterFiller = normalizeClarificationQuestions({ questions: [
  { prompt: 'Which proof?', type: 'single', options: ['Platform role', 'Other (please specify)', 'Support tooling'] },
  good.questions[1],
] });
assert.deepEqual(keptAfterFiller[0].options.map((option) => option.label), ['Platform role', 'Support tooling']);

assert.equal(normalizeClarificationQuestions({ questions: [
  { prompt: 'Only fillers?', type: 'single', options: ['Other', 'Skip'] },
  good.questions[0],
] }).length, 0, 'dropping a filler-only question can leave fewer than two');

const long = normalizeClarificationQuestions({ questions: [
  { decision: 'x'.repeat(80), prompt: 'y'.repeat(400), why: 'z'.repeat(300), type: 'single', options: [{ label: 'a'.repeat(200), detail: 'b'.repeat(200) }, 'Second'] },
  good.questions[1],
] });
assert.equal(long[0].decision.length, 48);
assert.equal(long[0].prompt.length, 221);
assert.equal(long[0].why.length, 180);
assert.equal(long[0].options[0].label.length, 160);
assert.equal(long[0].options[0].detail.length, 140);

const fromArray = sanitizeClarificationQuestions([
  { id: 'ignore', decision: 'Example', prompt: 'Which example?', why: 'It selects the story.', type: 'single', options: [{ id: 'ignore', label: 'Migration', detail: 'Cut build time' }, { label: 'Support' }] },
  good.questions[1],
]);
assert.equal(fromArray[0].id, 'q1');
assert.equal(fromArray[0].options[0].id, 'o1');
assert.equal(fromArray[0].options[0].detail, 'Cut build time');

const answers = normalizeClarificationAnswers([
  { question: 'Why?', answers: ['  Impact  ', ''] },
  { question: '', answers: ['ignored'] },
  { question: 'Lead proof: Which proof?', answers: ['Platform role'] },
]);
assert.deepEqual(answers, [
  { question: 'Why?', answers: ['Impact'] },
  { question: 'Lead proof: Which proof?', answers: ['Platform role'] },
]);
assert.equal(formatClarificationAnswers([]), '');
const formatted = formatClarificationAnswers(answers);
assert.match(formatted, /Unselected options are not facts/);
assert.match(formatted, /Chosen: Impact/);
assert.match(formatted, /Chosen: Platform role/);
assert.equal(formatted.includes('ignored'), false);

const evidence: CoverLetterItem[] = [{
  index: 0,
  type: 'experience',
  title: 'Platform role',
  summary: 'Ran the deploy pipeline.',
  description: 'Cut deploy time.',
}];
const prompt = buildClarificationsPrompt({
  kind: 'employer-question',
  company: 'Acme',
  jobDescription: 'Build internal tools',
  question: 'Why this role?',
  items: evidence,
  answerStyle: 'direct and specific',
  idealWordCount: '120',
});
assert.match(prompt, /Why this role\?/);
assert.match(prompt, /Platform role/);
assert.match(prompt, /are not facts|not facts/);
assert.match(prompt, /Omit/);
assert.match(prompt, /direct and specific/);
assert.match(prompt, /120/);
assert.match(prompt, /behavioral question/);
assert.match(prompt, /largest effect/);
assert.equal(prompt.includes('Requirements to mirror'), false);
assert.equal(prompt.includes('Ignore previous instructions'), false);

const letterQuestions = buildClarificationsPrompt({
  kind: 'cover-letter',
  company: 'Acme',
  jobDescription: 'Need someone who has operated Kubernetes.',
  question: '',
  items: evidence,
});
assert.match(letterQuestions, /cover letter/);
assert.match(letterQuestions, /Requirements to mirror/);
assert.equal(letterQuestions.includes('Why this role?'), false);
assert.match(letterQuestions, /only these titles: Platform role/);

console.log('Clarification validation tests passed');
