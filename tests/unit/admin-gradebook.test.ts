import { beforeEach, describe, expect, it, vi } from 'vitest';
const testState = vi.hoisted(() => ({
  rows: [] as Array<{ student_id: string }>,
  error: null as null | { message: string },
  pages: [] as number[],
}));
vi.mock('../../src/services/supabase', () => ({
  requireBackend: () => ({
    rpc: () => ({
      order: () => ({
        range: async (first: number, last: number) => {
          testState.pages.push(first);
          return { data: testState.rows.slice(first, last + 1), error: testState.error };
        },
      }),
    }),
  }),
}));
import { loadCourseGradebook } from '../../src/features/instructor/gradebookData';
describe('admin course totals beyond the server row cap', () => {
  beforeEach(() => {
    testState.rows = [];
    testState.pages = [];
    testState.error = null;
  });
  it('retains students beyond 1000 rows using bounded server pages', async () => {
    testState.rows = Array.from({ length: 1305 }, (_, index) => ({
      student_id: String(index).padStart(5, '0'),
    }));
    const rows = await loadCourseGradebook();
    expect(rows).toHaveLength(1305);
    expect(rows.at(-1)?.student_id).toBe('01304');
    expect(testState.pages.at(-1)).toBe(1300);
  });
  it('reports denied or failed RPCs instead of displaying empty totals', async () => {
    testState.error = { message: 'Instructor authorization required' };
    await expect(loadCourseGradebook()).rejects.toEqual(testState.error);
  });
});
