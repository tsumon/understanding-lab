import { describe, expect, test } from 'vitest';
import { chapters } from '../../src/course/curriculum';
import { controls } from '../../src/course/experiments/engines';
import type { CourseQuestion } from '../../src/course/types';

const locales = ['zh-CN', 'en'] as const;
const nonempty = (value: string) => expect(value.trim().length).toBeGreaterThan(0);
const checkQuestion = (question: CourseQuestion) => {
  nonempty(question.id); nonempty(question.question);
  expect(question.options.length).toBeGreaterThanOrEqual(3);
  expect(new Set(question.options.map(option => option.id)).size).toBe(question.options.length);
  expect(question.options.filter(option => option.id === question.correctId)).toHaveLength(1);
  for (const option of question.options) {
    nonempty(option.id); nonempty(option.text); nonempty(option.feedback);
  }
};

test('the twelve-chapter course has unique routes, ordered prerequisites and matching real labs', () => {
  expect(chapters).toHaveLength(12);
  expect(new Set(chapters.map(chapter => chapter.id)).size).toBe(12);
  expect(chapters.map(chapter => chapter.order)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
  const byId = new Map(chapters.map(chapter => [chapter.id, chapter]));
  for (const chapter of chapters) {
    expect(chapter.id).toMatch(/^[a-z][a-z0-9-]+$/);
    expect(chapter.minutes).toBeGreaterThan(0);
    expect(controls[chapter.experimentKind].length).toBeGreaterThan(0);
    expect(new Set(chapter.prerequisites).size).toBe(chapter.prerequisites.length);
    for (const prerequisite of chapter.prerequisites) {
      expect(byId.has(prerequisite)).toBe(true);
      // Strictly earlier prerequisites also prove this graph cannot contain a cycle.
      expect(byId.get(prerequisite)!.order).toBeLessThan(chapter.order);
    }
  }
});

describe.each(chapters)('$id content integrity', chapter => {
  test.each(locales)('%s provides teaching, evidence, transfer, feedback and source material', locale => {
    const content = chapter.content[locale];
    nonempty(content.title); nonempty(content.summary);
    expect(content.objectives.length).toBeGreaterThanOrEqual(3);
    content.objectives.forEach(nonempty);
    expect(content.explanation.length).toBeGreaterThanOrEqual(3);
    content.explanation.forEach(section => { nonempty(section.title); nonempty(section.text); });
    nonempty(content.misconception.claim); nonempty(content.misconception.correction);
    checkQuestion(content.prediction);
    nonempty(content.experiment.prompt);
    expect(content.experiment.steps.length).toBeGreaterThanOrEqual(2);
    content.experiment.steps.forEach(nonempty);
    nonempty(content.experiment.interpretation); nonempty(content.experiment.limitation);
    nonempty(content.transfer.prompt); nonempty(content.transfer.sampleAnswer);
    expect(content.transfer.rubric.length).toBeGreaterThanOrEqual(2);
    content.transfer.rubric.forEach(nonempty);
    expect(content.quiz.length).toBeGreaterThanOrEqual(2);
    content.quiz.forEach(checkQuestion);
    const questionIds = [content.prediction.id, ...content.quiz.map(question => question.id)];
    expect(new Set(questionIds).size).toBe(questionIds.length);
    expect(content.reflection.length).toBeGreaterThanOrEqual(2);
    content.reflection.forEach(nonempty);
    expect(content.glossary.length).toBeGreaterThanOrEqual(3);
    content.glossary.forEach(entry => { nonempty(entry.term); nonempty(entry.definition); });
    expect(content.sources.length).toBeGreaterThan(0);
    content.sources.forEach(source => {
      nonempty(source.title); nonempty(source.usedFor);
      const url = new URL(source.url);
      expect(url.protocol).toBe('https:');
      expect(url.username).toBe(''); expect(url.password).toBe('');
    });
  });

  test('switching languages preserves question identities and the meaning of saved selections', () => {
    const identity = (question: CourseQuestion) => ({
      id: question.id, options: question.options.map(option => option.id), correctId: question.correctId,
    });
    const zh = chapter.content['zh-CN'];
    const en = chapter.content.en;
    expect(identity(zh.prediction)).toEqual(identity(en.prediction));
    expect(zh.quiz.map(identity)).toEqual(en.quiz.map(identity));
  });
});
