const KEY = 'ieee-auth-return';
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) return '/dashboard';
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return '/dashboard';
  }
  if (
    !decoded.startsWith('/') ||
    decoded.startsWith('//') ||
    /[\\\x00-\x20]/.test(decoded) ||
    decoded.includes('://') ||
    /^\/auth(?:[/?#]|$)/.test(decoded)
  )
    return '/dashboard';
  if (
    !/^\/(?:dashboard|profile|overview|workspace|theory|review|confirmation|assessments|instructor)(?:[/?#]|$)/.test(
      decoded,
    )
  )
    return '/dashboard';
  return value;
}
export function rememberDestination(value: string) {
  const safe = safeReturnPath(value);
  if (safe !== '/profile') sessionStorage.setItem(KEY, safe);
}
export function destination(consume = false) {
  const path = safeReturnPath(sessionStorage.getItem(KEY));
  if (consume) sessionStorage.removeItem(KEY);
  return path;
}
export function callbackURL(origin: string, base: string) {
  const url = new URL(base, origin);
  if (url.origin !== origin) throw new Error('Authentication callback must use this site');
  url.searchParams.set('auth_return', '1');
  return url.href;
}
