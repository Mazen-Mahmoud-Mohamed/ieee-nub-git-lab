import { describe, it, expect } from 'vitest';
import {
  defaultSessionCourse,
  courseSessions,
  courseSections,
  type LearningItemSummary,
} from '../../src/features/instructor/sessionDestination';
const item = (
  id: string,
  kind: LearningItemSummary['kind'],
  parent_id: string | null = null,
  extra: Partial<LearningItemSummary> = {},
): LearningItemSummary => ({
  id,
  kind,
  parent_id,
  title: id,
  published_version: 1,
  archived_at: null,
  deleted_at: null,
  ...extra,
});
describe('direct session destination', () => {
  it('prefers the existing Fundamentals course, while respecting an explicit active course', () => {
    const items = [
      item('other', 'course'),
      item('git', 'course', null, { title: 'Git Fundamentals' }),
    ];
    expect(defaultSessionCourse(items)).toBe('git');
    expect(defaultSessionCourse(items, 'other')).toBe('other');
    expect(
      defaultSessionCourse([
        item('other', 'course'),
        item('70000000-0000-4000-8000-000000000001', 'course'),
      ]),
    ).toBe('70000000-0000-4000-8000-000000000001');
  });
  it('does not choose an unrelated course arbitrarily or expose sessions under inactive parents', () => {
    expect(defaultSessionCourse([item('a', 'course'), item('b', 'course')])).toBe('');
    const items = [
      item('c', 'course'),
      item('s', 'section', 'c'),
      item('live', 'lesson', 's'),
      item('old', 'section', 'c', { archived_at: '2026-01-01' }),
      item('hidden', 'lesson', 'old'),
      item('trash', 'lesson', 's', { deleted_at: '2026-01-01' }),
    ];
    expect(courseSessions(items, 'c').map((i) => i.id)).toEqual(['live']);
    expect(courseSections(items, 'c').map((i) => i.id)).toEqual(['s']);
    items[0].archived_at = '2026-01-01';
    expect(courseSessions(items, 'c')).toEqual([]);
  });
});
