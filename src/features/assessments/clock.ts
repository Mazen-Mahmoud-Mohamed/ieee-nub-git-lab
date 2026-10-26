// Monotonic elapsed time resists wall-clock changes; only server timestamps set the deadline.
export class ServerClock {
  private deadline: number;
  private start: number;
  constructor(serverNow: string, deadline: string | null, monotonicNow: number) {
    this.deadline = deadline ? Math.max(0, Date.parse(deadline) - Date.parse(serverNow)) : Infinity;
    this.start = monotonicNow;
  }
  remaining(monotonicNow: number) {
    return Math.max(0, this.deadline - Math.max(0, monotonicNow - this.start));
  }
}
export function workspaceKey(user: string, assessment: string, attempt: string, version: number) {
  return `assessment:${user}:${assessment}:v${version}:${attempt}`;
}
