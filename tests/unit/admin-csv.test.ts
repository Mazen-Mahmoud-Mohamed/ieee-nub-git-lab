import { describe, it, expect } from 'vitest';
import { csvCell, resultsCSV, type Attempt } from '../../src/features/instructor/adminData';
describe('instructor CSV export', () => {
  it('quotes commas, newlines and quotes and neutralizes spreadsheet formulas including whitespace prefixes', () => {
    for (const value of ['=1+1', '+201012345678', '-1', '@SUM(A1)', '  =HYPERLINK("bad")', '\tcmd'])
      expect(csvCell(value)).toMatch(/^"'/);
    expect(csvCell('Student, "A"')).toBe('"Student, ""A"""');
    expect(csvCell(0)).toBe('"0"');
  });
  it('exports separate and total marks with proper headings', () => {
    const csv = resultsCSV([
      {
        profiles: { full_name: 'Student', email: 's@example.test' },
        assignments: { title: 'Git', type: 'exam' },
        practical_score: 4,
        theory_score: 6,
        status: 'graded',
        released: true,
        attempt_number: 2,
      } as Attempt,
    ]);
    expect(csv).toContain('"Practical","Theory","Total"');
    expect(csv).toContain('"4","6","10"');
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });
});
