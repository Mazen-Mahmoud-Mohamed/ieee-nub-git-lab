import { describe, expect, it } from 'vitest';
import {
  publishedSessionCount,
  type PublicationItem,
} from '../../src/features/instructor/overviewData';
const item = (
  id: string,
  kind: string,
  parent_id: string | null,
  extra: Partial<PublicationItem> = {},
): PublicationItem => ({
  id,
  kind,
  parent_id,
  published_version: 1,
  archived_at: null,
  deleted_at: null,
  ...extra,
});
describe('admin published session statistics', () => {
  it('counts actual sessions only when their entire publication hierarchy is visible', () => {
    const rows = [
      item('course', 'course', null),
      item('section', 'section', 'course'),
      item('published', 'lesson', 'section'),
      item('draft', 'lesson', 'section', { published_version: 0 }),
      item('archived', 'lesson', 'section', {
        archived_at: '2026-11-13T00:00:00Z',
      }),
      item('trash', 'lesson', 'section', {
        deleted_at: '2026-11-13T00:00:00Z',
      }),
    ];
    expect(publishedSessionCount(rows)).toBe(1);
    expect(
      publishedSessionCount(
        rows.map((row) => (row.id === 'course' ? { ...row, published_version: 0 } : row)),
      ),
    ).toBe(0);
    expect(
      publishedSessionCount(
        rows.map((row) =>
          row.id === 'section' ? { ...row, archived_at: '2026-11-13T00:00:00Z' } : row,
        ),
      ),
    ).toBe(0);
  });
  it('excludes legacy tutorials, missing parents and cyclic hierarchies', () => {
    expect(
      publishedSessionCount([
        item('70000000-0000-4000-8000-000000000011', 'lesson', null),
        item('orphan', 'lesson', 'missing'),
        item('cycle', 'lesson', 'cycle'),
      ]),
    ).toBe(0);
  });
});
