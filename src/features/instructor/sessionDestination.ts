export type LearningItemSummary = {
  id: string;
  kind: 'course' | 'section' | 'lesson';
  parent_id: string | null;
  title: string;
  published_version: number;
  archived_at: string | null;
  deleted_at: string | null;
  created_at?: string;
};
const active = (item: LearningItemSummary) => !item.archived_at && !item.deleted_at;
export function sessionCourses(items: LearningItemSummary[]) {
  return items.filter((i) => i.kind === 'course' && active(i));
}
export function defaultSessionCourse(items: LearningItemSummary[], requested = '') {
  const courses = sessionCourses(items);
  return (
    courses.find((c) => c.id === requested)?.id ||
    courses.find((c) => c.id === '70000000-0000-4000-8000-000000000001')?.id ||
    courses.find((c) => /git fundamentals/i.test(c.title))?.id ||
    (courses.length === 1 ? courses[0].id : '')
  );
}
export function courseSections(items: LearningItemSummary[], courseId: string) {
  if (!sessionCourses(items).some((c) => c.id === courseId)) return [];
  return items.filter((i) => i.kind === 'section' && i.parent_id === courseId && active(i));
}
export function courseSessions(items: LearningItemSummary[], courseId: string) {
  const sections = new Set(courseSections(items, courseId).map((s) => s.id));
  return items.filter(
    (i) => i.kind === 'lesson' && !!i.parent_id && sections.has(i.parent_id) && active(i),
  );
}
