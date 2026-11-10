import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { taskOneDefinition } from '../../src/features/assessments/taskOne';
import { useLab } from '../../src/hooks/useLab';
import { Workspace } from '../../src/features/assignments/Workspace';
import { Assessment } from '../../src/features/questions/Assessment';
import { CourseGrades } from '../../src/features/assessments/CourseGrades';
import '../../src/styles/global.css';
import '../../src/styles/product.css';
const d = taskOneDefinition();
if (new URLSearchParams(location.search).has('objective')) {
  d.questions = (['single', 'boolean', 'choice-complete', 'fill-blank'] as const).map(
    (kind, i) => ({
      id: 'objective-' + i,
      prompt: 'Fixture question ' + (i + 1),
      kind,
      points: i === 3 ? 20 : 10,
      options:
        kind === 'fill-blank'
          ? []
          : kind === 'boolean'
            ? ['True', 'False']
            : ['Option A', 'Option B'],
      manual: false,
      required: false,
    }),
  );
  d.questions.push({
    id: 'manual',
    prompt: 'Explain your reasoning',
    kind: 'long',
    points: 0,
    options: [],
    manual: true,
    required: false,
  });
}
function Harness() {
  const lab = useLab('task1-browser-fixture', d);
  const [theory, setTheory] = useState(false);
  return (
    <main className="page">
      <h1>Task 1 · 150 points</h1>
      <CourseGrades />
      <button onClick={() => setTheory(!theory)}>{theory ? 'Practical' : 'Theory'}</button>
      <button
        disabled={!lab.ready || lab.busy}
        onClick={() =>
          void (async () => {
            await lab.command('mkdir IEEE-Git-Task');
            await lab.write(
              '/IEEE-Git-Task/goals.txt',
              'My Goals:\n1. Learn Git\n2. Understand version control\n3. Work on team projects',
            );
          })()
        }
      >
        Fixture: create late goals
      </button>
      {theory ? (
        <Assessment lab={lab} definition={d} />
      ) : (
        <Workspace
          lab={lab}
          identity={{ full_name: 'Preview Student', department: 'Engineering' }}
          definition={d}
          dark
        />
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <Harness />
  </MemoryRouter>,
);
