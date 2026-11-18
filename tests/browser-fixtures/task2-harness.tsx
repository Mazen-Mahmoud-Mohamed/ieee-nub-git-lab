import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Task2Workspace } from '../../src/features/task2/Task2Workspace';
import template from '../../supabase/task2-template.json';
import type { AttemptState, Definition } from '../../src/features/assessments/model';
import '../../src/styles/global.css';
import '../../src/styles/student.css';
const definition = template as unknown as Definition;
const state: AttemptState = {
  id: '10000000-0000-4000-8000-000000000011',
  assignment_id: '10000000-0000-4000-8000-000000000012',
  assignment_version: 1,
  status: 'in_progress',
  receipt: null,
  created_at: '2026-11-18T00:00:00Z',
  deadline_at: null,
  checkpoint_revision: 0,
  auto_submitted: false,
  server_now: '2026-11-18T00:00:00Z',
  definition,
};
document.documentElement.dataset.theme = 'dark';
createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <Task2Workspace
      state={state}
      basePath={'/assessments/' + state.assignment_id + '/attempts/' + state.id}
      userId="synthetic-student"
    />
  </HashRouter>,
);
