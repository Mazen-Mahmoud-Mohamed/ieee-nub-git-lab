import { describe, it, expect } from 'vitest';
import { FACULTIES, isFaculty, facultyLabel } from '../../src/features/auth/faculty';
describe('faculty values and labels', () => {
  it('offers exactly the two requested choices', () => {
    expect(FACULTIES).toEqual([
      { value: 'engineering', label: 'Engineering' },
      { value: 'computer_science', label: 'Computer Science' },
    ]);
  });
  it('accepts only canonical database values', () => {
    expect(isFaculty('engineering')).toBe(true);
    expect(isFaculty('computer_science')).toBe(true);
    for (const value of [
      'computers_information',
      'Computers & Information',
      'Computer Science',
      'science',
      '',
      null,
    ])
      expect(isFaculty(value)).toBe(false);
  });
  it('displays friendly canonical labels', () => {
    expect(facultyLabel('computer_science')).toBe('Computer Science');
    expect(facultyLabel('engineering')).toBe('Engineering');
    expect(facultyLabel(null)).toBe('Not specified');
  });
});
