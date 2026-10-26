import { useMemo, useState } from 'react';
import { useLab } from '../../hooks/useLab';
import type { Definition } from '../assessments/model';
import { Workspace } from '../assignments/Workspace';
import { Assessment } from '../questions/Assessment';
export function StudentPreview({
  definition,
  close,
}: {
  definition: Definition;
  close: () => void;
}) {
  const [key] = useState(() => crypto.randomUUID()),
    [mode, setMode] = useState('practical');
  const sanitized = useMemo(
    () => ({
      ...definition,
      questions: definition.questions.map((q) => ({
        ...q,
        correctAnswers: undefined,
        explanation: undefined,
      })),
    }),
    [definition],
  );
  const lab = useLab('instructor-preview:' + key, sanitized);
  return (
    <section className="student-preview">
      <div className="preview-toolbar">
        <h2>Student preview · {definition.title}</h2>
        <p>
          Isolated local sandbox. No student attempt starts and no work is uploaded. Duration:{' '}
          {definition.durationMinutes || 'Untimed'}
          {definition.durationMinutes ? ' minutes' : ''}.
        </p>
        <button className="outline-button" onClick={close}>
          Back to editor
        </button>
        {definition.format !== 'theory' && (
          <button className="outline-button" onClick={() => setMode('practical')}>
            Practical preview
          </button>
        )}
        <button className="outline-button" onClick={() => setMode('questions')}>
          Question preview
        </button>
      </div>
      <div
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest('a')) {
            e.preventDefault();
            setMode('questions');
          }
        }}
      >
        {definition.format !== 'theory' && mode === 'practical' ? (
          <Workspace
            lab={lab}
            definition={sanitized}
            identity={{ full_name: 'Preview Student', department: 'Engineering' }}
            dark
          />
        ) : (
          <Assessment lab={lab} definition={{ ...sanitized, gateTheory: false }} unlocked />
        )}
      </div>
    </section>
  );
}
