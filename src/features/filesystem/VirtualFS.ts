export type Entry = { kind: 'file' | 'dir'; data: number[] };
export type Snapshot = { version: 1; entries: Record<string, Entry> };
const fail = (code: string, path: string): never => {
  throw Object.assign(new Error(`${code}: ${path}`), { code });
};
export function normalize(path: string, cwd = '/') {
  if (/[\x00-\x1f\\]/.test(path)) throw new Error('Invalid virtual path');
  const parts: string[] = [];
  for (const part of (path.startsWith('/') ? path : `${cwd}/${path}`).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error('Cannot leave the virtual workspace');
      parts.pop();
    } else {
      if (part.length > 100) throw new Error('Name is too long');
      parts.push(part);
    }
  }
  return '/' + parts.join('/');
}
export class VirtualFS {
  // Git compares whole-second stat values. Logical ticks prevent same-size writes
  // in one wall-clock second from aliasing its index cache. These are filesystem
  // metadata only; assessment deadlines always use the server clock.
  private clock = Math.floor(Date.now() / 1000) * 1000;
  private stamps = new Map<string, number>();
  private touch(path: string) {
    this.clock += 1000;
    this.stamps.set(normalize(path), this.clock);
    return this.clock;
  }
  entries: Record<string, Entry> = { '/': { kind: 'dir', data: [] } };
  promises = {
    readFile: async (path: string, options?: unknown): Promise<any> => {
      const entry = this.get(path);
      if (entry.kind !== 'file') fail('EISDIR', path);
      const encoding =
        typeof options === 'string' ? options : (options as { encoding?: string })?.encoding;
      return encoding
        ? new TextDecoder().decode(new Uint8Array(entry.data))
        : new Uint8Array(entry.data);
    },
    writeFile: async (path: string, data: string | Uint8Array) => {
      path = normalize(path);
      this.parent(path);
      if (this.entries[path]?.kind === 'dir') fail('EISDIR', path);
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      if (bytes.length > 256_000) throw new Error('Virtual file limit: 256 KB');
      const total =
        Object.values(this.entries).reduce((sum, e) => sum + e.data.length, 0) -
        (this.entries[path]?.data.length || 0) +
        bytes.length;
      if (total > 2_000_000)
        throw new Error(
          'Virtual workspace limit: 2 MB. Export a backup before making more changes.',
        );
      if (!this.entries[path] && Object.keys(this.entries).length >= 3000)
        throw new Error('Workspace file limit reached');
      this.entries[path] = { kind: 'file', data: Array.from(bytes) };
      this.touch(path);
    },
    mkdir: async (path: string) => {
      path = normalize(path);
      if (this.entries[path]) fail('EEXIST', path);
      this.parent(path);
      this.entries[path] = { kind: 'dir', data: [] };
      this.touch(path);
    },
    rmdir: async (path: string) => {
      path = normalize(path);
      if ((await this.promises.readdir(path)).length) fail('ENOTEMPTY', path);
      delete this.entries[path];
    },
    readdir: async (path: string) => {
      path = normalize(path);
      if (this.get(path).kind !== 'dir') fail('ENOTDIR', path);
      const prefix = path === '/' ? '/' : path + '/';
      return Object.keys(this.entries)
        .filter((p) => p !== path && p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .map((p) => p.slice(prefix.length))
        .sort();
    },
    stat: async (path: string) => this.stat(path),
    lstat: async (path: string) => this.stat(path),
    unlink: async (path: string) => {
      path = normalize(path);
      if (this.get(path).kind !== 'file') fail('EISDIR', path);
      delete this.entries[path];
    },
    readlink: async (path: string): Promise<string> => fail('EINVAL', path),
    symlink: async (): Promise<void> => {
      throw new Error('Symlinks are disabled');
    },
    chmod: async () => {},
    rename: async (from: string, to: string) => {
      const e = this.get(from);
      this.parent(to);
      this.entries[normalize(to)] = e;
      delete this.entries[normalize(from)];
      this.touch(to);
    },
  };
  private get(path: string) {
    return this.entries[normalize(path)] ?? fail('ENOENT', path);
  }
  private parent(path: string) {
    const p = path.slice(0, path.lastIndexOf('/')) || '/';
    if (this.get(p).kind !== 'dir') fail('ENOTDIR', p);
  }
  private stat(path: string) {
    const e = this.get(path);
    const stamp = this.stamps.get(normalize(path)) ?? this.touch(path);
    return {
      type: e.kind,
      mode: e.kind === 'dir' ? 0o40755 : 0o100644,
      size: e.data.length,
      ino: 0,
      uid: 0,
      gid: 0,
      dev: 0,
      mtimeMs: stamp,
      ctimeMs: stamp,
      isFile: () => e.kind === 'file',
      isDirectory: () => e.kind === 'dir',
      isSymbolicLink: () => false,
    };
  }
  snapshot(): Snapshot {
    return { version: 1, entries: structuredClone(this.entries) };
  }
  static restore(snapshot: Snapshot) {
    if (snapshot.version !== 1 || !snapshot.entries || Object.keys(snapshot.entries).length > 3000)
      throw new Error('Unsupported or oversized snapshot');
    const fs = new VirtualFS();
    let total = 0;
    for (const [path, entry] of Object.entries(snapshot.entries)) {
      if (
        normalize(path) !== path ||
        !['file', 'dir'].includes(entry.kind) ||
        !Array.isArray(entry.data) ||
        entry.data.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
      )
        throw new Error('Invalid snapshot entry');
      total += entry.data.length;
      if (entry.data.length > 256_000 || total > 2_000_000)
        throw new Error('Workspace exceeds 2 MB');
      fs.entries[path] = structuredClone(entry);
    }
    if (fs.entries['/']?.kind !== 'dir') throw new Error('Missing workspace root');
    for (const path of Object.keys(fs.entries)) if (path !== '/') fs.parent(path);
    return fs;
  }
}
