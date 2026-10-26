import { supabase } from '../../services/supabase';
let callback: Promise<{ handled: boolean; error?: string }> | undefined;
export function finishAuthCallback(): Promise<{ handled: boolean; error?: string }> {
  if (callback) return callback;
  const query = new URLSearchParams(window.location.search);
  const code = query.get('code');
  const failed = query.has('error') || query.has('error_code');
  if (!code && !failed && !query.has('auth_return')) return Promise.resolve({ handled: false });
  callback = (async () => {
    try {
      if (failed)
        throw new Error(
          'Google sign-in was cancelled or could not be completed. Please try again.',
        );
      if (!code || !supabase)
        throw new Error('This sign-in link is incomplete. Please sign in again.');
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error)
        throw new Error(
          'This sign-in link has expired or belongs to a different browser. Please sign in again.',
        );
      return { handled: true };
    } catch (e) {
      return {
        handled: true,
        error: e instanceof Error ? e.message : 'Sign-in could not be completed.',
      };
    } finally {
      for (const name of ['code', 'error', 'error_code', 'error_description', 'auth_return'])
        query.delete(name);
      const search = query.toString();
      history.replaceState(
        null,
        '',
        location.pathname + (search ? '?' + search : '') + location.hash,
      );
    }
  })();
  return callback;
}
