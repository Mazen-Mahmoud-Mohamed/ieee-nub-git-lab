import { describe, expect, it } from 'vitest';
import { taskOneDefinition } from '../../src/features/assessments/taskOne';
import { gradeObjective, totals } from '../../src/features/assessments/model';
import { importTaskOneTheory } from '../../src/features/instructor/taskOneTheoryImport';

function fixture() {
  return Array.from({ length: 15 }, (_, index) => {
    const kind =
      index < 5 ? 'single' : index < 10 ? 'boolean' : index < 12 ? 'choice-complete' : 'fill-blank';
    return {
      id: 'fixture-' + index,
      kind,
      prompt: 'Fixture ____ ' + index,
      points: kind === 'boolean' ? 2 : 4,
      options:
        kind === 'boolean' ? ['True', 'False'] : kind === 'fill-blank' ? [] : ['Alpha', 'Beta'],
      correctAnswers:
        kind === 'boolean' ? ['True'] : kind === 'fill-blank' ? ['git example'] : ['Alpha'],
      strayPrivateField: 'Synthetic author-only metadata',
    };
  });
}

describe('Task 1 theory import', () => {
  it('replaces only the questions and retains only supported question fields', () => {
    const original = taskOneDefinition();
    const draft = importTaskOneTheory(JSON.stringify(fixture()), original);
    expect(draft.sections).toBe(original.sections);
    expect(totals(draft)).toMatchObject({ practical: 100, theory: 50 });
    expect(draft.questions).toHaveLength(15);
    expect(draft.questions.every((q) => !q.manual && !q.required)).toBe(true);
    expect(draft.questions[0]).not.toHaveProperty('strayPrivateField');
  });

  it('rejects missing question types and malformed private answers', () => {
    const original = taskOneDefinition();
    const questions = fixture();
    questions[10].kind = questions[11].kind = 'fill-blank';
    questions[10].options = questions[11].options = [];
    questions[10].correctAnswers = questions[11].correctAnswers = ['git example'];
    expect(() => importTaskOneTheory(JSON.stringify(questions), original)).toThrow(
      'both completion types',
    );
    const invalid = fixture();
    invalid[14].correctAnswers = ['git example', ' git  example '];
    expect(() => importTaskOneTheory(JSON.stringify(invalid), original)).toThrow(
      'private answer key',
    );
  });

  it('uses exact Git tokens for imported commands and retains legacy matching for older versions', () => {
    const draft = importTaskOneTheory(JSON.stringify(fixture()), taskOneDefinition());
    const question = draft.questions[14];
    const keys = { [question.id]: { correctAnswers: ['git example Sample/Branch'] } };
    const score = (answer: string) =>
      gradeObjective({ ...draft, questions: [question] }, { [question.id]: answer }, keys)[0]
        .points;
    expect(score('  git\t example Sample/Branch  ')).toBe(4);
    expect(score('git Example Sample/Branch')).toBe(0);
    expect(score('git example sample/branch')).toBe(0);
    expect(score('git example\nSample/Branch')).toBe(0);
    delete question.answerMatching;
    expect(score('  GIT EXAMPLE sample/branch  ')).toBe(4);
  });
});
