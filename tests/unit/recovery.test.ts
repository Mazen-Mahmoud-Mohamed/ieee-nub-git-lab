import { describe, it, expect } from 'vitest';
import { introductoryCommitWarning } from '../../src/features/terminal/commitWarning';
import { firstAssessment, blankDefinition } from '../../src/features/assessments/model';
import type { RepoView, CommitView } from '../../src/features/git-engine/engine';
const view: RepoView = {
  initialized: true,
  branch: 'main',
  branches: {},
  commits: [],
  config: {},
  status: [
    ['about.txt', 0, 2, 2],
    ['goals.txt', 0, 2, 2],
  ],
};
describe('introductory staging warnings', () => {
  it('warns for multiple staged introductions and one introduction mixed with another change', () => {
    expect(introductoryCommitWarning(firstAssessment, view)).toContain('about.txt, goals.txt');
    expect(introductoryCommitWarning(firstAssessment, view)).toContain('still allowed');
    expect(
      introductoryCommitWarning(firstAssessment, {
        ...view,
        status: [
          ['about.txt', 0, 2, 2],
          ['other.txt', 1, 2, 2],
        ],
      }),
    ).toContain('other.txt');
  });
  it('does not warn for untracked, single focused, ordinary tracked or unrelated assessment work', () => {
    expect(
      introductoryCommitWarning(firstAssessment, {
        ...view,
        status: [
          ['about.txt', 0, 2, 0],
          ['goals.txt', 0, 2, 0],
        ],
      }),
    ).toBe('');
    expect(
      introductoryCommitWarning(firstAssessment, { ...view, status: [['about.txt', 0, 2, 2]] }),
    ).toBe('');
    expect(
      introductoryCommitWarning(firstAssessment, {
        ...view,
        status: [
          ['about.txt', 1, 2, 2],
          ['goals.txt', 1, 2, 2],
        ],
      }),
    ).toBe('');
    expect(introductoryCommitWarning(blankDefinition(), view)).toBe('');
  });
  it('does not mislabel deletion and recreation as a first introduction', () => {
    const commits: CommitView[] = [
      {
        oid: 'old',
        parents: [],
        message: 'Original files',
        author: 'Student',
        files: { 'about.txt': 'a', 'goals.txt': 'g' },
      },
      { oid: 'deleted', parents: ['old'], message: 'Remove files', author: 'Student', files: {} },
    ];
    expect(
      introductoryCommitWarning(firstAssessment, {
        ...view,
        branches: { main: 'deleted' },
        commits,
      }),
    ).toBe('');
  });
});
