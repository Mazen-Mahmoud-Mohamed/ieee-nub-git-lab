export const FACULTIES = [
  { value: 'engineering', label: 'Engineering' },
  { value: 'computer_science', label: 'Computer Science' },
] as const;
export type Faculty = (typeof FACULTIES)[number]['value'];
export function isFaculty(value: unknown): value is Faculty {
  return FACULTIES.some((faculty) => faculty.value === value);
}
export function facultyLabel(value: unknown): string {
  return FACULTIES.find((faculty) => faculty.value === value)?.label || 'Not specified';
}
