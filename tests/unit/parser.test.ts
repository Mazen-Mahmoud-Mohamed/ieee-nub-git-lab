import { sanitizeAnswers } from '../../src/features/assessments/model';
import { taskOneDefinition } from '../../src/features/assessments/taskOne';
import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/features/terminal/parser';
import { VirtualFS, normalize } from '../../src/features/filesystem/VirtualFS';
describe('safe command grammar', () => {
  it('tokenizes quoted values and explicit redirection', () => {
    expect(tokenize('git commit -m "Add my information"')).toEqual([
      'git',
      'commit',
      '-m',
      'Add my information',
    ]);
    expect(tokenize('echo "hello world">>notes.txt')).toEqual([
      'echo',
      'hello world',
      '>>',
      'notes.txt',
    ]);
    expect(tokenize("echo 'a;$(b)' > a.txt")).toEqual(['echo', 'a;$(b)', '>', 'a.txt']);
  });
  it.each(['ls;pwd', 'ls | cat', 'echo $(pwd)', 'pwd && ls', 'echo `pwd`', 'echo "oops'])(
    'rejects unsafe or incomplete input %s',
    (s) => expect(() => tokenize(s)).toThrow(),
  );
  it('rejects oversized input', () => expect(() => tokenize('x'.repeat(2001))).toThrow());
});
describe('virtual file system boundaries', () => {
  it('normalizes paths but prevents leaving virtual root', () => {
    expect(normalize('../notes.txt', '/project')).toBe('/notes.txt');
    expect(() => normalize('../../etc', '/project')).toThrow();
    expect(() => normalize('a\\b')).toThrow();
  });
  it('handles directories, files, and non-empty directory removal', async () => {
    const fs = new VirtualFS();
    await fs.promises.mkdir('/project');
    await fs.promises.writeFile('/project/a.txt', 'hello');
    expect(await fs.promises.readdir('/project')).toEqual(['a.txt']);
    expect(await fs.promises.readFile('/project/a.txt', 'utf8')).toBe('hello');
    await expect(fs.promises.rmdir('/project')).rejects.toThrow('ENOTEMPTY');
    await fs.promises.unlink('/project/a.txt');
    await fs.promises.rmdir('/project');
  });
  it('rejects invalid snapshots and excessive file sizes', async () => {
    expect(() => VirtualFS.restore({ version: 2, entries: {} } as never)).toThrow();
    const fs = new VirtualFS();
    await expect(fs.promises.writeFile('/a.txt', 'x'.repeat(256001))).rejects.toThrow('limit');
  });
});
describe('submission answer boundary', () => {
  it('allows partial answers and rejects unknown IDs or oversized responses', () => {
    const definition = taskOneDefinition();
    expect(sanitizeAnswers(definition, { q1: 'Draft answer' })).toEqual({ q1: 'Draft answer' });
    expect(() => sanitizeAnswers(definition, { invented: 'x' })).toThrow();
    expect(() => sanitizeAnswers(definition, { q1: 'x'.repeat(8001) })).toThrow();
  });
});
