import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  profileComplete,
  googleDisplayName,
} from '../../src/features/auth/profile';
import { safeReturnPath, callbackURL } from '../../src/features/auth/navigation';
import type { User } from '@supabase/supabase-js';
const profile = {
  id: 'id',
  full_name: 'Student Name',
  phone: '+201012345678',
  faculty: 'computer_science' as const,
  student_id: null,
  academic_year: null,
  department: 'Computer Science',
  university: 'Nahda University',
};
describe('student profile and OAuth navigation', () => {
  it.each(['01012345678', '+201012345678', '00201012345678', '(+20) 10-1234-5678'])(
    'normalizes %s',
    (value) => expect(normalizePhone(value)).toBe('+201012345678'),
  );
  it.each(['', '011123', '+1201012345678', '010123456789', '012abc345678', '+201312345678', null])(
    'rejects invalid phone %s',
    (value) => expect(() => normalizePhone(value)).toThrow('Egyptian mobile'),
  );
  it('requires all four account fields, with canonical storage', () => {
    expect(profileComplete(profile, { email: 'student@example.test' })).toBe(true);
    expect(
      profileComplete({ ...profile, phone: '01012345678' }, { email: 'student@example.test' }),
    ).toBe(false);
    expect(profileComplete({ ...profile, faculty: null }, { email: 'student@example.test' })).toBe(
      false,
    );
    expect(profileComplete(profile, { email: '' })).toBe(false);
  });
  it('uses display metadata only for the editable name', () => {
    expect(
      googleDisplayName({
        user_metadata: { full_name: ' Google Student ', email: 'fake@example.test' },
      } as unknown as User),
    ).toBe('Google Student');
  });
  it.each([
    'https://evil.test',
    '//evil.test',
    '/%2fexample.test',
    '/auth',
    '/auth?next=/workspace',
    '/workspace\\evil',
    '/workspace%0aevil',
    '/unknown',
    '%',
  ])('rejects unsafe return %s', (value) => expect(safeReturnPath(value)).toBe('/dashboard'));
  it('preserves the exact assessment attempt route', () => {
    const path = '/assessments/a/attempts/b/theory';
    expect(safeReturnPath(path)).toBe(path);
    expect(safeReturnPath('/learn/70000000-0000-4000-8000-000000000011')).toBe(
      '/learn/70000000-0000-4000-8000-000000000011',
    );
  });
  it('returns to the deployed Pages base path with the PKCE query outside the hash', () => {
    expect(callbackURL('https://example.github.io', '/ieee-git-lab/')).toBe(
      'https://example.github.io/ieee-git-lab/?auth_return=1',
    );
    expect(() => callbackURL('https://example.github.io', 'https://evil.test')).toThrow();
  });
});
