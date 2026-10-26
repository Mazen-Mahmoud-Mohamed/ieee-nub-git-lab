import { describe, it, expect, vi } from 'vitest';
import {
  assertDefinition,
  blankDefinition,
  firstAssessment,
  gradeObjective,
  outcomesFor,
  type Definition,
} from '../../src/features/assessments/model';
import { createStarter } from '../../src/features/assessments/starter';
import { ServerClock, workspaceKey } from '../../src/features/assessments/clock';
import { verifyAssessment } from '../../src/features/assessments/verify';
const identity = { full_name: 'Student Test', department: 'Engineering' };
describe('shared course assessment definitions', () => {
  it('preserves the complete first assignment and safe validation whitelist', () => {
    expect(() => assertDefinition(firstAssessment)).not.toThrow();
    const d = blankDefinition();
    d.sections = [
      {
        id: 'section',
        title: 'Task',
        description: '',
        steps: [],
        tasks: [
          {
            id: 'task',
            title: 'Unsafe',
            instructions: '',
            points: 10,
            bonus: false,
            rules: [{ type: 'execute', value: 'alert(1)' } as never],
          },
        ],
      },
    ];
    expect(() => assertDefinition(d)).toThrow('Unsupported');
  });
  it('grades objective responses only from a private key, with exact set equality', () => {
    const d = blankDefinition();
    d.questions = [
      {
        id: 'q',
        prompt: 'Choose Git concepts',
        kind: 'multiple',
        points: 5,
        options: ['Commit', 'Branch', 'Payment'],
        manual: false,
        required: true,
      },
    ];
    const keys = { q: { correctAnswers: ['Commit', 'Branch'] } };
    expect(gradeObjective(d, { q: 'Branch\nCommit' }, keys)[0].points).toBe(5);
    expect(gradeObjective(d, { q: 'Commit' }, keys)[0].points).toBe(0);
    expect(gradeObjective(d, { q: 'Branch\nCommit\nPayment' }, keys)[0].points).toBe(0);
    expect(() => gradeObjective(d, {}, {})).toThrow('private');
  });
  it('enforces fields, safe paths and question format', () => {
    const d = blankDefinition();
    d.starter.files['../secret.txt'] = 'bad';
    expect(() => assertDefinition(d)).toThrow();
    const exam = blankDefinition('exam');
    exam.durationMinutes = 0;
    expect(() => assertDefinition(exam)).toThrow('duration');
  });
  it('creates isolated starter repositories and validates a new branch-and-merge exercise', async () => {
    const d: Definition = {
      ...blankDefinition(),
      projectName: 'Assignment-02',
      starter: { files: { 'readme.txt': 'Starter project' }, initialize: true, commit: true },
      sections: [
        {
          id: 'part',
          title: 'Login feature',
          description: '',
          steps: [],
          tasks: [
            {
              id: 'login',
              title: 'Merge login',
              instructions: 'Create feature/login, add login.txt, commit it, merge into main.',
              points: 20,
              bonus: false,
              rules: [
                { type: 'file', path: 'login.txt', ref: 'main', match: 'contains', value: 'Login' },
                { type: 'branch', branch: 'feature/login' },
                { type: 'commits', ref: 'main', min: 2 },
                { type: 'merged', source: 'feature/login', target: 'main' },
              ],
            },
          ],
        },
      ],
    };
    assertDefinition(d);
    const a = await createStarter(d),
      b = await createStarter(d);
    expect(a.fs).not.toBe(b.fs);
    for (const cmd of [
      'git switch -c feature/login',
      'echo "Login is ready" > login.txt',
      'git add login.txt',
      'git commit -m "Add login feature"',
      'git switch main',
      'git merge feature/login',
    ])
      expect((await a.execute(cmd)).success, cmd).toBe(true);
    expect(outcomesFor(d, await a.inspect(), identity)[0].passed).toBe(true);
    expect(outcomesFor(d, await b.inspect(), identity)[0].passed).toBe(false);
    const result = await verifyAssessment(
      d,
      { snapshot: a.fs.snapshot(), answers: {}, events: a.events },
      identity,
      {},
    );
    expect(result.practicalScore).toBe(20);
  });
  it('keeps each assessment and retake persistence key distinct', () => {
    expect(workspaceKey('a', 'one', 'attempt-1', 1)).not.toBe(
      workspaceKey('a', 'two', 'attempt-2', 1),
    );
    expect(workspaceKey('a', 'one', 'attempt-1', 1)).not.toBe(
      workspaceKey('a', 'one', 'attempt-2', 1),
    );
  });
  it('uses server deadlines plus a monotonic clock despite wall-clock manipulation and refresh', () => {
    const clock = new ServerClock('2026-10-26T10:00:00Z', '2026-10-26T10:30:00Z', 100);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    expect(clock.remaining(60100)).toBe(29 * 60000);
    const resumed = new ServerClock('2026-10-26T10:05:00Z', '2026-10-26T10:30:00Z', 0);
    expect(resumed.remaining(0)).toBe(25 * 60000);
    expect(resumed.remaining(26 * 60000)).toBe(0);
    vi.restoreAllMocks();
  });
});
