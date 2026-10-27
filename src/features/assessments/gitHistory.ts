import type { CommitView } from '../git-engine/engine.ts';

/** Graph evidence only: array order, timestamps and terminal logs are not evidence. */
export function gitHistory(commits: CommitView[]) {
  const byId = new Map(commits.map((c) => [c.oid, c]));
  const ancestors = (oid: string): CommitView[] => {
    const seen = new Set<string>();
    const result: CommitView[] = [];
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const c = byId.get(id);
      if (!c) return;
      result.push(c);
      c.parents.forEach(visit);
    };
    visit(oid);
    return result;
  };
  const reaches = (descendant: string, ancestor: string) =>
    ancestors(descendant).some((c) => c.oid === ancestor);
  const before = (ancestor: string, descendant: string) =>
    ancestor !== descendant && reaches(descendant, ancestor);
  const introduces = (c: CommitView, file: string) =>
    file in c.files && c.parents.every((p) => byId.has(p) && !(file in byId.get(p)!.files));
  const introduction = (tip: string, file: string) => {
    const candidates = ancestors(tip).filter((c) => introduces(c, file));
    const earliest = candidates.filter(
      (c) => !candidates.some((other) => before(other.oid, c.oid)),
    );
    // Independent introductions on divergent histories have no unique first commit.
    return earliest.length === 1 ? earliest[0] : undefined;
  };
  const changedPaths = (c: CommitView) => {
    const previous = byId.get(c.parents[0])?.files || {};
    return [...new Set([...Object.keys(previous), ...Object.keys(c.files)])].filter(
      (p) => previous[p] !== c.files[p],
    );
  };
  const focused = (c: CommitView | undefined, file: string) =>
    !!c && introduces(c, file) && changedPaths(c).length === 1;
  const diverged = (a: string, b: string) =>
    !reaches(a, b) && !reaches(b, a) && ancestors(a).some((c) => reaches(b, c.oid));
  return {
    byId,
    ancestors,
    reaches,
    before,
    introduces,
    introduction,
    changedPaths,
    focused,
    diverged,
  };
}
