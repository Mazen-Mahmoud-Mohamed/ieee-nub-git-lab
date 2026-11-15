import { requireBackend } from '../../services/supabase';
import { isLegacyTutorial } from '../learning/teachingSessions';
import { adminRPC } from './adminData';

export type OverviewCounts = {
  students: number;
  started_students: number;
  submitted: number;
  pending_reviews: number;
  graded: number;
  published_assessments: number;
  published_sessions: number;
};
export type ActivitySummary = {
  id: string;
  action: string;
  record_type: string;
  actor_name: string;
  created_at: string;
};
export type PublicationItem = {
  id: string;
  kind: string;
  parent_id: string | null;
  published_version: number;
  archived_at: string | null;
  deleted_at: string | null;
};

// Match student publication visibility: every ancestor must be live and published.
export function publishedSessionCount(items: PublicationItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return items.filter((item) => {
    if (item.kind !== 'lesson' || isLegacyTutorial(item.id)) return false;
    const visited = new Set<string>();
    let current: PublicationItem | undefined = item;
    while (current) {
      if (
        visited.has(current.id) ||
        current.published_version < 1 ||
        current.archived_at ||
        current.deleted_at
      )
        return false;
      visited.add(current.id);
      if (!current.parent_id) return true;
      current = byId.get(current.parent_id);
    }
    return false;
  }).length;
}

export async function loadOverviewCounts(): Promise<OverviewCounts> {
  const [counts, items] = await Promise.all([
    adminRPC<Record<string, number>>('instructor_overview'),
    (async () => {
      const rows: PublicationItem[] = [];
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await requireBackend()
          .from('learning_items')
          .select('id,kind,parent_id,published_version,archived_at,deleted_at')
          .order('id')
          .range(offset, offset + 99);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 100) return rows;
      }
    })(),
  ]);
  for (const key of [
    'students',
    'started_students',
    'submitted_assignments',
    'submitted_exams',
    'pending_reviews',
    'graded',
    'published_assignments',
    'published_exams',
  ]) {
    if (!Number.isFinite(counts[key]))
      throw new Error('Overview statistics could not be verified. Please refresh.');
  }
  return {
    students: counts.students,
    started_students: counts.started_students,
    submitted: counts.submitted_assignments + counts.submitted_exams,
    pending_reviews: counts.pending_reviews,
    graded: counts.graded,
    published_assessments: counts.published_assignments + counts.published_exams,
    published_sessions: publishedSessionCount(items),
  };
}
