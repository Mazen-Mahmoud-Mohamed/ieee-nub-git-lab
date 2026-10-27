export type RecoveryState = {
  code: string;
  canRestart: boolean;
  canRequest: boolean;
  request?: { id: string; status: string; reply: string } | null;
  successor?: string | null;
};
export const recoveryReason = (code: string) =>
  ({
    available: 'You can start a new attempt. Your previous work will be kept.',
    attempt_limit:
      'You’ve used all your available attempts. You can ask your instructor for another one.',
    deadline: 'The deadline has passed. You cannot start over for this assessment.',
    exam: 'You cannot restart during an active exam.',
    closed: 'This assessment is currently locked.',
    finalized: 'This attempt has already been submitted. Your submission and grade are safe.',
    restarted: 'You have already started a new attempt. Open it from My learning.',
    profile: 'Complete your profile before starting another attempt.',
  })[code] || 'Recovery options are unavailable right now. Your work is still saved.';
export function recoveryError(message: string) {
  if (/limit/i.test(message)) return 'No attempts remain. Check your help request below.';
  if (/deadline/i.test(message)) return recoveryReason('deadline');
  if (/exam/i.test(message)) return recoveryReason('exam');
  if (/closed|published|locked/i.test(message)) return recoveryReason('closed');
  if (/finalized|submitted/i.test(message)) return recoveryReason('finalized');
  if (/conflict/i.test(message))
    return 'A newer save exists in another tab. Your work is safe; reload to check that save before continuing.';
  return 'We could not confirm the result. Your work is safe. Try again to recover the same request.';
}
