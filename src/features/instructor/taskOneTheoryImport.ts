import {
  assertDefinition,
  normalizeGitCommandAnswer,
  type AssessmentQuestion,
  type Definition,
} from '../assessments/model';

export function importTaskOneTheory(raw: string, current: Definition): Definition {
  if (current.courseSlot !== 'task1') throw new Error('Open the Task 1 draft first.');
  const input: unknown = JSON.parse(raw);
  if (!Array.isArray(input) || input.length !== 15)
    throw new Error('Expected 15 Task 1 questions.');

  const questions = input.map((item): AssessmentQuestion => {
    if (!item || typeof item !== 'object') throw new Error('Invalid question.');
    const { id, kind, prompt, points, options, correctAnswers } = item;
    const normalizeKey =
      kind === 'fill-blank' ? normalizeGitCommandAnswer : (answer: string) => answer.trim();
    if (
      !Array.isArray(correctAnswers) ||
      !correctAnswers.length ||
      !Array.isArray(options) ||
      !correctAnswers.every((answer) => typeof answer === 'string' && normalizeKey(answer)) ||
      new Set(correctAnswers.map(normalizeKey)).size !== correctAnswers.length
    ) {
      throw new Error('Each question needs a valid private answer key.');
    }
    if (
      !['single', 'multiple', 'boolean', 'choice-complete', 'fill-blank'].includes(kind) ||
      points !== (kind === 'boolean' ? 2 : 4) ||
      (kind === 'boolean' &&
        (options.length !== 2 || !options.includes('True') || !options.includes('False'))) ||
      (kind === 'fill-blank' && options.length !== 0) ||
      (!['multiple', 'fill-blank'].includes(kind) && correctAnswers.length !== 1) ||
      (kind === 'multiple' && correctAnswers.length < 2) ||
      (['choice-complete', 'fill-blank'].includes(kind) &&
        (typeof prompt !== 'string' || !prompt.includes('____')))
    ) {
      throw new Error('Check the question types, options, blanks, and point values.');
    }
    return {
      id,
      kind,
      prompt,
      points,
      options,
      correctAnswers,
      manual: false,
      required: false,
      ...(kind === 'fill-blank' ? { answerMatching: 'git-command' as const } : {}),
    };
  });

  const count = (...kinds: AssessmentQuestion['kind'][]) =>
    questions.filter(({ kind }) => kinds.includes(kind)).length;
  if (
    count('single', 'multiple') !== 5 ||
    count('boolean') !== 5 ||
    !count('choice-complete') ||
    !count('fill-blank')
  ) {
    throw new Error('Include five MCQs, five True/False questions, and both completion types.');
  }
  const draft = { ...current, questions };
  assertDefinition(draft);
  return draft;
}
