import { createClient } from '@supabase/supabase-js';
import type { Faculty } from '../features/auth/faculty';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export type Profile = {
  id: string;
  full_name: string;
  student_id: string;
  university: string;
  department: string;
  faculty: Faculty | null;
  academic_year: string;
};
export function requireBackend() {
  if (!supabase)
    throw new Error(
      'Connect a dedicated Supabase project using .env to enable accounts and submissions. Your local practice workspace remains available.',
    );
  return supabase;
}
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw last;
}
