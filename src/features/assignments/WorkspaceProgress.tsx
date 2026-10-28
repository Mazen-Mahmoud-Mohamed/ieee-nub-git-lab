import { totals, type Definition } from '../assessments/model';
import type { TaskProgress } from '../assessments/requirements';
export function WorkspaceProgress({
  definition,
  progress,
  taskId,
  status,
  error,
}: {
  definition: Definition;
  progress: TaskProgress[];
  taskId: string;
  status: string;
  error: string;
}) {
  const required = progress.filter((p) => !p.task.bonus),
    done = required.filter((p) => p.passed),
    points = totals(definition);
  const earned = done.reduce((n, p) => n + p.task.points, 0),
    bonus = progress.filter((p) => p.task.bonus && p.passed).reduce((n, p) => n + p.task.points, 0);
  const index = progress.findIndex((p) => p.task.id === taskId);
  return (
    <div className="student-score workspace-progress" aria-label="Task progress">
      <span>
        Task {Math.max(0, index) + 1} / {progress.length} · {status}
      </span>
      {error ? (
        <strong>Progress could not be verified</strong>
      ) : (
        <>
          <strong>
            Provisional: {earned} / {points.practical} points
          </strong>
          {points.bonus > 0 && (
            <span>
              Bonus {bonus} / {points.bonus}
            </span>
          )}
          <small>
            {done.length} / {required.length} scored tasks · {required.length - done.length}{' '}
            remaining · Official score is verified on submission.
          </small>
        </>
      )}
    </div>
  );
}
