import { describe, expect, it } from 'vitest';
import {
  isLegacyTutorial,
  orderedTeachingSessions,
} from '../../src/features/learning/teachingSessions';
const doc = (title: string, order = 0, number = 0) => ({
  title,
  body: '',
  links: [],
  display_order: order,
  session_number: number,
});
describe('teaching session classification and order', () => {
  it('excludes exactly the six seeded tutorials, independently of their title or attached files', () => {
    for (let n = 11; n <= 16; n++)
      expect(isLegacyTutorial('70000000-0000-4000-8000-0000000000' + n)).toBe(true);
    const legacy = {
      id: '70000000-0000-4000-8000-000000000011',
      document: {
        ...doc('Instructor saved title'),
        video_url: 'https://drive.google.com/file/d/abcdefghij123/view',
        presentation_id: 'retained-file',
      },
    };
    const real = { id: 'new-instructor-item', document: doc('Files and the editor') };
    expect(orderedTeachingSessions([legacy, real])).toEqual([real]);
    expect(isLegacyTutorial('70000000-0000-4000-8000-000000000001')).toBe(false);
  });
  it('uses saved order, supports a third and further sessions, and does not mutate the catalog', () => {
    const rows = [
      { id: 'c', document: doc('Third', 30, 3) },
      { id: 'b', document: doc('Second', 20, 2) },
      { id: 'a', document: doc('First', 10, 1) },
    ];
    expect(orderedTeachingSessions(rows).map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(rows[0].id).toBe('c');
    expect(
      orderedTeachingSessions([
        { id: 'b', document: doc('B', 1, 2) },
        { id: 'a', document: doc('A', 1, 1) },
      ]).map((s) => s.id),
    ).toEqual(['a', 'b']);
  });
});
