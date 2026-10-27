import { describe, expect, it } from 'vitest';
import {
  taskGuide,
  taskFeedback,
  courseLessons,
} from '../../src/features/assessments/presentation';
import { recoveryReason, recoveryError } from '../../src/features/assessments/recoveryPresentation';
import { firstAssessment, type Task } from '../../src/features/assessments/model';
import { correctedAssignment } from '../../src/features/assessments/correctedAssignment';
import { GitEngine } from '../../src/features/git-engine/engine';
import { requirementProgress } from '../../src/features/assessments/requirements';
const tasks = (d = firstAssessment) => d.sections.flatMap((s) => s.tasks);
const task = (id: string, corrected = false) =>
  tasks(corrected ? correctedAssignment() : firstAssessment).find((t) => t.id === id)!;
describe('beginner instructions preserve published requirements', () => {
  it('provides a starting point, actions and result for all nine tasks without editing documents', () => {
    const before = JSON.stringify(firstAssessment);
    expect(tasks()).toHaveLength(9);
    for (const t of [...tasks(), ...tasks(correctedAssignment())]) {
      const guide = taskGuide(t);
      expect(guide.before.length).toBeGreaterThan(10);
      expect(guide.steps.length).toBeGreaterThan(0);
      expect(guide.result.length).toBeGreaterThan(10);
    }
    expect(JSON.stringify(firstAssessment)).toBe(before);
    expect(courseLessons).toHaveLength(6);
  });
  it('shows exact messages and version-specific ordering before committing', () => {
    const v1 = taskGuide(task('separate')),
      v2 = taskGuide(task('separate', true));
    expect(v1.message).toBe('Add personal information');
    expect(v2.message).toBe(v1.message);
    expect(v1.steps.join(' ')).toContain('Then do the same for notes.txt');
    expect(v1.steps.join(' ')).toContain('eight characters');
    expect(v2.steps.join(' ')).toContain('any order');
    expect(v2.steps.join(' ')).not.toContain('eight characters');
    expect(v1.warning).toContain('New commits cannot split');
    expect(taskGuide(task('goals')).steps.join(' ')).toContain('numbers 4 and 5');
    expect(taskGuide(task('goals', true)).steps.join(' ')).toContain('two new goals');
  });
  it('keeps custom published instructions and point values intact', () => {
    const custom: Task = {
      id: 'custom',
      title: 'ملف جديد',
      instructions: 'Create readme.txt.\nCommit the required text.',
      points: 17,
      bonus: false,
      rules: [{ type: 'file', path: 'readme.txt', ref: 'main', match: 'contains', value: 'Hello' }],
    };
    expect(taskGuide(custom).steps).toEqual(['Create readme.txt.', 'Commit the required text.']);
    expect(taskGuide(custom).title).toBe(custom.title);
    expect(custom.points).toBe(17);
  });
  it('groups a combined first commit into one realistic explanation while grading still fails', async () => {
    const engine = new GitEngine();
    for (const cmd of [
      'mkdir IEEE-Git-Task',
      'cd IEEE-Git-Task',
      'git init',
      'git config user.name Student',
      'git config user.email student@example.test',
      'touch about.txt goals.txt notes.txt',
      'git add .',
      'git commit -m "Add personal information"',
    ]) {
      const result = await engine.execute(cmd);
      expect(result.success, result.output).toBe(true);
    }
    const view = await engine.inspect();
    const state = requirementProgress(
      firstAssessment,
      view,
      { full_name: 'Student', department: 'Engineering' },
      {},
    ).find((p) => p.task.id === 'separate')!;
    const feedback = taskFeedback(state, view);
    expect(state.passed).toBe(false);
    expect(feedback.history).toBe(true);
    expect(feedback.text).toContain('Adding another commit cannot split');
    expect(feedback.text).not.toMatch(/[a-f0-9]{40}/);
    expect(state.requirements.some((r) => r.status === 'incomplete')).toBe(true);
  });
  it('distinguishes unfinished introductions from genuinely invalid original content in both versions', async () => {
    for (const definition of [firstAssessment, correctedAssignment()]) {
      const engine = new GitEngine();
      for (const cmd of [
        'mkdir IEEE-Git-Task',
        'cd IEEE-Git-Task',
        'git init',
        'git config user.name Student',
        'git config user.email student@example.test',
      ])
        expect((await engine.execute(cmd)).success).toBe(true);
      await engine.write(
        'about.txt',
        'Name: Student\nUniversity: Nahda University\nDepartment: Engineering',
      );
      for (const cmd of ['git add about.txt', 'git commit -m "Add personal information"'])
        expect((await engine.execute(cmd)).success).toBe(true);
      let view = await engine.inspect();
      const progress = () =>
        requirementProgress(
          definition,
          view,
          { full_name: 'Student', department: 'Engineering' },
          {},
        );
      expect(
        taskFeedback(
          progress().find((p) => p.task.id === 'separate')!,
          view,
        ).history,
      ).toBe(false);
      expect(
        taskFeedback(
          progress().find((p) => p.task.id === 'goals')!,
          view,
        ).history,
      ).toBe(false);
      await engine.write('goals.txt', 'Incorrect original text');
      for (const cmd of ['git add goals.txt', 'git commit -m "Add initial goals"'])
        expect((await engine.execute(cmd)).success).toBe(true);
      view = await engine.inspect();
      expect(
        taskFeedback(
          progress().find((p) => p.task.id === 'separate')!,
          view,
        ),
      ).toMatchObject({
        history: true,
        text: expect.stringContaining('first goals.txt commit is missing required text'),
      });
    }
  });
  it('explains actual recovery restrictions without suggesting inappropriate approval', () => {
    expect(recoveryReason('exam')).toContain('active exam');
    expect(recoveryError('Deadline reached')).toBe(recoveryReason('deadline'));
    expect(recoveryError('Exam cannot restart')).not.toContain('instructor');
    expect(recoveryReason('closed')).toContain('locked');
    expect(recoveryError('Attempt limit reached')).toContain('request');
    expect(recoveryError('Network failure')).toContain('could not confirm');
  });
});
