import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import {
  saveWorkspace,
  loadWorkspace,
  saveOutbox,
  loadOutbox,
  clearOutbox,
} from '../../src/services/persistence';
import { VirtualFS } from '../../src/features/filesystem/VirtualFS';
it('persists isolated student work, autosaved answers, and a retryable submission', async () => {
  const data = {
    version: 1 as const,
    snapshot: new VirtualFS().snapshot(),
    cwd: '/',
    config: {},
    events: [],
    answers: { q1: 'Git is local version control.' },
    flagged: ['q2'],
    updatedAt: new Date().toISOString(),
  };
  await saveWorkspace('student-a', data);
  expect(await loadWorkspace('student-a')).toEqual(data);
  expect(await loadWorkspace('student-b')).toBeUndefined();
  const payload = { idempotencyKey: 'same-key', answers: data.answers };
  await saveOutbox('attempt-a', payload);
  expect(await loadOutbox('attempt-a')).toEqual(payload);
  await clearOutbox('attempt-a');
  expect(await loadOutbox('attempt-a')).toBeUndefined();
});
