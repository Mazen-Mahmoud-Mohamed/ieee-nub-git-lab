import { describe, it, expect } from 'vitest';
import { prepareFundamentalsScoring } from '../../src/features/assessments/fundamentalsScoring';
import { firstAssessment, totals, sumPoints } from '../../src/features/assessments/model';
import { correctedAssignment } from '../../src/features/assessments/correctedAssignment';
import { requirementCatalog } from '../../src/features/assessments/requirements';

describe('explicit Git Fundamentals proposal', () => {
  for (const source of [firstAssessment, correctedAssignment()]) {
    it(`preserves the source rules, maxima, questions and policy for revision ${source.sections[0].tasks[0].rules[0].revision || 1}`, () => {
      const before = structuredClone(source);
      const draft = prepareFundamentalsScoring(source);
      expect(source).toEqual(before);
      expect(draft.gradingPolicy).toBe('requirements-v1');
      expect(draft.gateTheory).toBe(false);
      expect(draft.requireComplete).toBe(false);
      expect(totals(draft)).toEqual(totals(source));
      expect(draft.questions).toEqual(source.questions);
      for (const [i, task] of draft.sections.flatMap((s) => s.tasks).entries()) {
        const original = source.sections.flatMap((s) => s.tasks)[i];
        expect(task.rules).toEqual(original.rules);
        expect(sumPoints(Object.values(task.requirementWeights!))).toBe(task.points);
        expect(Object.keys(task.requirementWeights!)).toEqual(
          requirementCatalog(task).map((c) => c.id),
        );
      }
    });
  }
  it('refuses changed criteria or maxima instead of assigning misleading points', () => {
    const changed = structuredClone(firstAssessment);
    changed.sections[0].tasks[0].points += 1;
    expect(() => prepareFundamentalsScoring(changed)).toThrow(/maximum points/);
    changed.sections[0].tasks[0].rules = [{ type: 'file', path: 'other.txt' }];
    expect(() => prepareFundamentalsScoring(changed)).toThrow(/rules differ/);
  });
});
