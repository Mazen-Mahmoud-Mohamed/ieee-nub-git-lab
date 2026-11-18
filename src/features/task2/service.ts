import { requireBackend } from '../../services/supabase';
export async function task2Request<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireBackend().functions.invoke('github-task2', { body });
  if (error) {
    let detail = error.message;
    try {
      detail = (await error.context?.json())?.error || detail;
    } catch {}
    throw Object.assign(new Error(detail), { status: error.context?.status });
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export function browserVerifier() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
