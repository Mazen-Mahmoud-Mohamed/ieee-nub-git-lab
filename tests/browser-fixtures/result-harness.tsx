import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AssessmentResult } from '../../src/features/assessments/AssessmentResult';
import { blankDefinition, type AttemptState } from '../../src/features/assessments/model';
import type { Lab } from '../../src/hooks/useLab';
function Harness() {
  const [which, setWhich] = useState('a');
  const id =
    which === 'a' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222';
  const points = which === 'a' ? 0.1 : 0.2;
  const definition = {
    ...blankDefinition(),
    title: 'Result ' + which,
    sections: [
      {
        id: 's',
        title: 'S',
        description: '',
        steps: [],
        tasks: [
          {
            id: 't',
            title: 'File',
            instructions: 'Create file.',
            points,
            bonus: false,
            rules: [{ type: 'file' as const, path: 'a.txt', ref: 'working' }],
            requirementWeights: { 't:rule-0-exists': points },
          },
        ],
      },
    ],
    questions: [
      {
        id: 'q',
        prompt: 'Q',
        points: 0.2,
        kind: 'long' as const,
        manual: true,
        required: true,
        options: [],
      },
    ],
  };
  return (
    <MemoryRouter>
      <button onClick={() => setWhich('a')}>Show A</button>
      <button onClick={() => setWhich('b')}>Show B</button>
      <AssessmentResult
        lab={{ receipt: id, answers: {} } as Lab}
        state={{ id, status: 'graded' } as AttemptState}
        definition={definition}
        basePath={'/attempts/' + id}
      />
    </MemoryRouter>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
