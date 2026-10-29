import type { LearningDocument } from './materials';

// These immutable seed identities are tutorials, even if files were later attached.
// Keep their direct routes, records and versions; do not infer teaching intent from media.
const legacyTutorials = new Set(
  ['011', '012', '013', '014', '015', '016'].map(
    (suffix) => '70000000-0000-4000-8000-000000000' + suffix,
  ),
);
export const isLegacyTutorial = (id: string) => legacyTutorials.has(id);
export type TeachingSession = {
  id: string;
  created_at?: string;
  document?: LearningDocument;
};
export function orderedTeachingSessions<T extends TeachingSession>(items: T[]): T[] {
  return items
    .filter((s) => !isLegacyTutorial(s.id))
    .sort(
      (a, b) =>
        (a.document?.display_order || 0) - (b.document?.display_order || 0) ||
        (a.document?.session_number || 0) - (b.document?.session_number || 0) ||
        (a.created_at || '').localeCompare(b.created_at || '') ||
        a.id.localeCompare(b.id),
    );
}
