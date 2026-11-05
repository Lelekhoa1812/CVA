/* eslint-disable @typescript-eslint/no-require-imports -- register the TSX loader before the component is loaded */
import assert from 'node:assert/strict';

process.env.SUCRASE_OPTIONS = JSON.stringify({ jsxRuntime: 'automatic' });
require('sucrase/register/tsx');

const { createElement } = require('react') as typeof import('react');
const { renderToString } = require('react-dom/server') as typeof import('react-dom/server');
const ClarificationQuestions = require('../../src/components/generate/ClarificationQuestions.tsx').default as typeof import('../../src/components/generate/ClarificationQuestions.tsx').default;
const questions = [
  {
    id: 'q1',
    decision: 'Lead proof',
    prompt: 'Which proof should open the letter?',
    why: 'The opening is the line a recruiter reads first.',
    type: 'single' as const,
    options: [
      { id: 'o1', label: 'Platform role', detail: 'Cut deploy time' },
      { id: 'o2', label: 'Support tooling', detail: '' },
    ],
  },
  {
    id: 'q2',
    decision: 'Requirements',
    prompt: 'Which requirements should the letter mirror?',
    why: 'These phrases are the ones a screening system can match.',
    type: 'multiple' as const,
    options: [
      { id: 'o1', label: 'Kubernetes', detail: '' },
      { id: 'o2', label: 'Incident response', detail: '' },
    ],
  },
];

const html = renderToString(createElement(ClarificationQuestions, {
  questions,
  onSubmit: () => {},
  onCancel: () => {},
})).replace(/<!-- -->/g, '');

assert.match(html, /Decision 1 of 2/);
assert.match(html, /Lead proof/);
assert.match(html, /Which proof should open the letter\?/);
assert.match(html, /The opening is the line a recruiter reads first\./);
assert.match(html, /Choose one\./);
assert.match(html, /Platform role/);
assert.match(html, /Cut deploy time/);
assert.match(html, /Write my own answer/);
assert.match(html, /0 of 2 decided/);
assert.match(html, />Continue</);
assert.match(html, /Skip this decision/);
assert.match(html, /Generate without these decisions/);
assert.match(html, /Cancel/);
assert.equal(html.includes('Which requirements should the letter mirror?'), false, 'later decisions stay hidden until the user continues');
assert.match(html, /type="radio"/);
assert.equal(html.includes('type="checkbox"'), false);
assert.match(html, /aria-current="step"/);

console.log('Clarification decision UI tests passed');
