import { openDB } from 'idb';
import type { Snapshot } from '../features/filesystem/VirtualFS';
import type { Activity } from '../features/git-engine/engine';
export type LocalWorkspace = {
  version: 1;
  snapshot: Snapshot;
  cwd: string;
  config: Record<string, string>;
  events: Activity[];
  answers: Record<string, string>;
  flagged: string[];
  attemptId?: string;
  receipt?: string;
  serverRevision?: number;
  updatedAt: string;
};
const database = () =>
  openDB('ieee-nub-git-lab', 1, {
    upgrade(db) {
      db.createObjectStore('workspaces');
      db.createObjectStore('outbox');
    },
  });
export async function loadWorkspace(key: string): Promise<LocalWorkspace | undefined> {
  return (await database()).get('workspaces', key);
}
export async function saveWorkspace(key: string, value: LocalWorkspace) {
  await (await database()).put('workspaces', value, key);
}
export async function saveOutbox(key: string, value: unknown) {
  await (await database()).put('outbox', value, key);
}
export async function loadOutbox(key: string) {
  return (await database()).get('outbox', key);
}
export async function clearOutbox(key: string) {
  await (await database()).delete('outbox', key);
}
