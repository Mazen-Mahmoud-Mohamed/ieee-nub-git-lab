import type { User } from '@supabase/supabase-js';
import type { Profile } from '../../services/supabase';
import { isFaculty } from './faculty';
export function normalizePhone(value: unknown): string {
  if (typeof value !== 'string' || !/^[+\d\s()-]+$/.test(value.trim()))
    throw new Error('Enter a valid Egyptian mobile number, such as 01012345678 or +201012345678.');
  let phone = value.replace(/[\s()-]/g, '');
  if (phone.startsWith('0020')) phone = '+' + phone.slice(2);
  if (/^01[0125]\d{8}$/.test(phone)) phone = '+2' + phone;
  if (!/^\+201[0125]\d{8}$/.test(phone))
    throw new Error('Enter a valid Egyptian mobile number, such as 01012345678 or +201012345678.');
  return phone;
}
export function profileComplete(
  profile: Profile | null,
  user: Pick<User, 'email'> | null,
): boolean {
  if (
    !profile ||
    !user?.email ||
    profile.full_name.trim().length < 2 ||
    !isFaculty(profile.faculty)
  )
    return false;
  try {
    return normalizePhone(profile.phone) === profile.phone;
  } catch {
    return false;
  }
}
export function googleDisplayName(user: User | null) {
  for (const value of [user?.user_metadata?.full_name, user?.user_metadata?.name])
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120);
  return '';
}
