import git from 'isomorphic-git';
import { VirtualFS, normalize } from '../filesystem/VirtualFS.ts';
import { HELP, tokenize } from '../terminal/parser.ts';
export type Activity = {
  sequence: number;
  timestamp: string;
  command: string;
  success: boolean;
  branch: string;
  head: string;
  output: string;
};
export type CommitView = {
  oid: string;
  message: string;
  parents: string[];
  files: Record<string, string>;
  author: string;
};
export type RepoView = {
  initialized: boolean;
  branch: string;
  branches: Record<string, string>;
  commits: CommitView[];
  status: Array<[string, number, number, number]>;
  config: Record<string, string>;
};
export class GitEngine {
  cwd = '/';
  events: Activity[] = [];
  globalConfig: Record<string, string> = {};
  constructor(
    public fs = new VirtualFS(),
    public dir = '/IEEE-Git-Task',
  ) {}
  get options() {
    return { fs: this.fs, dir: this.dir };
  }
  textPath(path: string) {
    const p = normalize(path, this.cwd);
    if (p.split('/').some((x) => x === '.git') || !p.endsWith('.txt'))
      throw new Error('Edit plain .txt files outside .git only');
    return p;
  }
  async write(path: string, content: string) {
    await this.fs.promises.writeFile(this.textPath(path), content);
  }
  async read(path: string): Promise<string> {
    return this.fs.promises.readFile(this.textPath(path), 'utf8');
  }
  async branch() {
    try {
      return (await git.currentBranch(this.options)) || 'main';
    } catch {
      return 'main';
    }
  }
  async head() {
    try {
      return await git.resolveRef({ ...this.options, ref: 'HEAD' });
    } catch {
      return '';
    }
  }
  async initialized() {
    return Boolean(this.fs.entries[this.dir + '/.git/HEAD']);
  }
  async files(oid: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const walk = async (tree: string, prefix: string, depth: number) => {
      if (depth > 8) throw new Error('Tree nesting exceeds limit');
      for (const e of (await git.readTree({ ...this.options, oid: tree })).tree) {
        if (e.type === 'tree') await walk(e.oid, prefix + e.path + '/', depth + 1);
        else if (e.type === 'blob')
          result[prefix + e.path] = new TextDecoder().decode(
            (await git.readBlob({ ...this.options, oid: e.oid })).blob,
          );
      }
    };
    const commit = await git.readCommit({ ...this.options, oid });
    await walk(commit.commit.tree, '', 0);
    return result;
  }
  async inspect(): Promise<RepoView> {
    const view: RepoView = {
      initialized: await this.initialized(),
      branch: await this.branch(),
      branches: {},
      commits: [],
      status: [],
      config: { ...this.globalConfig },
    };
    if (!view.initialized) return view;
    for (const key of ['user.name', 'user.email'])
      view.config[key] = String(
        (await git.getConfig({ ...this.options, path: key })) || this.globalConfig[key] || '',
      );
    const seen = new Set<string>();
    const visit = async (oid: string) => {
      if (seen.has(oid)) return;
      seen.add(oid);
      if (seen.size > 150) throw new Error('Commit limit: 150');
      const { commit } = await git.readCommit({ ...this.options, oid });
      view.commits.push({
        oid,
        message: commit.message.trim(),
        parents: commit.parent,
        files: await this.files(oid),
        author: commit.author.name,
      });
      for (const parent of commit.parent) await visit(parent);
    };
    const head = await this.head();
    if (head) await visit(head);
    for (const ref of await git.listBranches(this.options)) {
      const oid = await git.resolveRef({ ...this.options, ref });
      view.branches[ref] = oid;
      await visit(oid);
    }
    view.status = await git.statusMatrix(this.options);
    return view;
  }
  async execute(command: string) {
    let output = '',
      success = true;
    try {
      output = await this.run(tokenize(command));
    } catch (e) {
      success = false;
      output = e instanceof Error ? e.message : String(e);
    }
    const sensitive =
      /\b(password|passwd|token|secret|authorization|credential|service[_-]?role)\b|https?:\/\/\S+@/i.test(
        command,
      );
    const event: Activity = {
      sequence: (this.events.at(-1)?.sequence || 0) + 1,
      timestamp: new Date().toISOString(),
      command: sensitive ? '[Sensitive command redacted]' : command,
      success,
      branch: await this.branch(),
      head: await this.head(),
      output: sensitive
        ? '[Output omitted for privacy]'
        : output.length > 20000
          ? output.slice(0, 19960) + '\n[Output truncated to 20,000 characters]'
          : output,
    };
    if (this.events.length >= 1000) this.events.shift();
    this.events.push(event);
    return event;
  }
  private async clean() {
    const dirty = (await git.statusMatrix(this.options)).some(
      ([, h, w, s]) => h !== 0 && (h !== w || h !== s),
    );
    if (dirty) throw new Error('Commit your tracked changes before switching or merging.');
  }
  private async run(t: string[]): Promise<string> {
    if (!t.length) return '';
    const [cmd, ...args] = t;
    const usage = (s: string): never => {
      throw new Error('Usage: ' + s);
    };
    if (cmd !== 'echo' && t.some((x) => x === '>' || x === '>>'))
      return usage('only echo supports output redirection');
    switch (cmd) {
      case 'help':
        if (args.length) return usage('help');
        return HELP;
      case 'clear':
        if (args.length) return usage('clear');
        return '\x1bCLEAR';
      case 'pwd':
        if (args.length) return usage('pwd');
        return this.cwd;
      case 'ls': {
        if (
          args.filter((x) => x !== '-a').length > 1 ||
          args.some((x) => x.startsWith('-') && x !== '-a')
        )
          return usage('ls [-a] [directory]');
        const path = normalize(args.find((x) => x !== '-a') || '.', this.cwd);
        if (path.split('/').includes('.git')) throw new Error('Git internals are read-only');
        return (await this.fs.promises.readdir(path))
          .filter((x) => args.includes('-a') || !x.startsWith('.'))
          .map((x) => x + (this.fs.entries[normalize(x, path)].kind === 'dir' ? '/' : ''))
          .join('  ');
      }
      case 'cd': {
        if (args.length > 1) return usage('cd [directory]');
        const p = normalize(args[0] || '/', this.cwd);
        if (p.split('/').includes('.git')) throw new Error('Git internals are read-only');
        if (!(await this.fs.promises.stat(p)).isDirectory()) throw new Error('Not a directory');
        this.cwd = p;
        return '';
      }
      case 'mkdir': {
        if (args.length !== 1 || args[0].startsWith('-')) return usage('mkdir directory');
        const p = normalize(args[0], this.cwd);
        if (p.split('/').includes('.git')) throw new Error('Reserved directory');
        await this.fs.promises.mkdir(p);
        return '';
      }
      case 'touch':
        if (!args.length) return usage('touch file.txt...');
        for (const p of args) {
          const path = this.textPath(p);
          if (!this.fs.entries[path]) await this.write(p, '');
        }
        return '';
      case 'nano':
      case 'vim':
      case 'vi':
      case 'notepad':
        throw new Error(
          `${cmd} is not available in this browser terminal. To edit ${args[0] || 'a text file'}, select it from Files above the editor. The built-in Text Editor saves changes automatically.`,
        );
      case 'rm':
        if (args.length !== 1 || args[0].startsWith('-')) return usage('rm file.txt');
        await this.fs.promises.unlink(this.textPath(args[0]));
        return '';
      case 'cat':
        if (args.length !== 1) return usage('cat file.txt');
        return this.read(args[0]);
      case 'echo': {
        const i = args.findIndex((x) => x === '>' || x === '>>');
        if (i < 0) return args.join(' ');
        if (i !== args.length - 2 || args.slice(i + 1).some((x) => x === '>' || x === '>>'))
          return usage('echo "text" > file.txt');
        const p = args[i + 1];
        let before = '';
        if (args[i] === '>>' && this.fs.entries[this.textPath(p)]) before = await this.read(p);
        await this.write(p, before + args.slice(0, i).join(' ') + '\n');
        return '';
      }
      case 'git':
        break;
      default:
        throw new Error(`${cmd}: command not supported. Type help for the supported grammar.`);
    }
    const [sub, ...a] = args;
    if (sub === '--version' && !a.length)
      return `git version ${git.version()} (isomorphic-git · browser)`;
    if (sub === 'config') {
      const b = a.filter((x) => x !== '--global');
      const global = a.includes('--global');
      if (b.length === 1 && ['--list', '-l'].includes(b[0])) {
        const v = { ...this.globalConfig };
        if (await this.initialized())
          for (const key of ['user.name', 'user.email'])
            v[key] = String((await git.getConfig({ ...this.options, path: key })) || v[key] || '');
        return Object.entries(v)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n');
      }
      if (
        b.length < 1 ||
        b.length > 2 ||
        !['user.name', 'user.email', 'init.defaultBranch'].includes(b[0])
      )
        return usage('git config [--global] user.name/user.email [value]');
      if (b.length === 1)
        return global
          ? this.globalConfig[b[0]] || ''
          : String(
              (await git.getConfig({ ...this.options, path: b[0] })) ||
                this.globalConfig[b[0]] ||
                '',
            );
      if (!b[1].trim() || b[1].length > 150) throw new Error('Invalid configuration value');
      if (global) {
        this.globalConfig[b[0]] = b[1];
        if (await this.initialized())
          await git.setConfig({ ...this.options, path: b[0], value: b[1] });
      } else {
        if (!(await this.initialized()))
          throw new Error('Not a Git repository. Use --global or initialize first.');
        await git.setConfig({ ...this.options, path: b[0], value: b[1] });
      }
      return '';
    }
    if (sub === 'init') {
      if (
        a.length &&
        !(a.length === 2 && ['-b', '--initial-branch'].includes(a[0]) && a[1] === 'main')
      )
        return usage('git init [-b main]');
      if (this.cwd !== this.dir)
        throw new Error(`Initialize inside ${this.dir} for this assessment.`);
      if (await this.initialized()) return 'Reinitialized existing Git repository';
      await git.init({ ...this.options, defaultBranch: 'main' });
      for (const [path, value] of Object.entries(this.globalConfig))
        await git.setConfig({ ...this.options, path, value });
      return `Initialized empty Git repository in ${this.dir}/.git/`;
    }
    if (
      !(await this.initialized()) ||
      !(this.cwd === this.dir || this.cwd.startsWith(this.dir + '/'))
    )
      throw new Error(
        `Not a Git repository. Create and enter ${this.dir.slice(1)}, then initialize it.`,
      );
    if (sub === 'status') {
      if (a.length > 1 || a.some((x) => !['--short', '-s'].includes(x)))
        return usage('git status [--short]');
      const matrix = await git.statusMatrix(this.options);
      if (a.length)
        return matrix
          .filter(([, h, w, s]) => h !== w || h !== s)
          .map(([p, h, w, s]) => {
            if (h === 0 && s === 0) return `?? ${p}`;
            const staged = h === s ? ' ' : h === 0 ? 'A' : s === 0 ? 'D' : 'M';
            const unstaged = w === s ? ' ' : w === 0 ? 'D' : 'M';
            return `${staged}${unstaged} ${p}`;
          })
          .join('\n');
      const groups = {
        staged: [] as string[],
        unstaged: [] as string[],
        untracked: [] as string[],
      };
      for (const [p, h, w, s] of matrix) {
        if (h === 0 && s === 0) groups.untracked.push(p);
        else {
          if (h !== s)
            groups.staged.push(`${h === 0 ? 'new file' : s === 0 ? 'deleted' : 'modified'}: ${p}`);
          if (w !== s) groups.unstaged.push(`${w === 0 ? 'deleted' : 'modified'}: ${p}`);
        }
      }
      return (
        `On branch ${await this.branch()}\n${!(await this.head()) ? 'No commits yet\n' : ''}` +
        (Object.values(groups).every((x) => !x.length)
          ? 'nothing to commit, working tree clean'
          : `${groups.staged.length ? '\nChanges to be committed:\n  ' + groups.staged.join('\n  ') : ''}${groups.unstaged.length ? '\nChanges not staged for commit:\n  ' + groups.unstaged.join('\n  ') : ''}${groups.untracked.length ? '\nUntracked files:\n  ' + groups.untracked.join('\n  ') : ''}`)
      );
    }
    if (sub === 'add') {
      if (!a.length || a.some((x) => x.startsWith('-') && x !== '-A'))
        return usage('git add file.txt... / . / -A');
      const matrix = await git.statusMatrix(this.options);
      const paths = new Set<string>();
      for (const item of a) {
        if (item === '-A' || item === '.') {
          const prefix = item === '-A' ? '' : this.cwd.slice(this.dir.length + 1);
          for (const [p] of matrix) if (!prefix || p.startsWith(prefix + '/')) paths.add(p);
        } else {
          const full = this.textPath(item);
          if (!full.startsWith(this.dir + '/')) throw new Error('File must be inside repository');
          const p = full.slice(this.dir.length + 1);
          if (!matrix.some(([name]) => name === p))
            throw new Error(`pathspec '${item}' did not match any files`);
          paths.add(p);
        }
      }
      for (const filepath of paths) {
        if (this.fs.entries[this.dir + '/' + filepath])
          await git.add({ ...this.options, filepath });
        else await git.remove({ ...this.options, filepath });
      }
      return '';
    }
    if (sub === 'commit') {
      if (a.length !== 2 || a[0] !== '-m' || !a[1].trim())
        return usage('git commit -m "Meaningful message"');
      if ((await this.inspect()).commits.length >= 150)
        throw new Error('This workspace supports up to 150 commits.');
      const matrix = await git.statusMatrix(this.options);
      if (!matrix.some(([, h, , s]) => h !== s))
        throw new Error('No changes staged for commit. Stage your changes with git add.');
      const author = await this.author();
      const oid = await git.commit({ ...this.options, message: a[1], author });
      return `[${await this.branch()} ${oid.slice(0, 7)}] ${a[1]}`;
    }
    if (sub === 'branch') {
      if (!a.length) {
        const current = await this.branch();
        return (
          (await git.listBranches(this.options))
            .map((b) => `${b === current ? '*' : ' '} ${b}`)
            .join('\n') || `* ${current} (no commits yet)`
        );
      }
      if (a.length === 2 && a[0] === '-M' && a[1] === 'main') {
        const old = await this.branch();
        if (old !== 'main')
          await git.renameBranch({ ...this.options, oldref: old, ref: 'main', checkout: true });
        return '';
      }
      if (a.length !== 1 || a[0].startsWith('-')) return usage('git branch [name]');
      await git.branch({ ...this.options, ref: a[0] });
      return '';
    }
    if (sub === 'switch' || sub === 'checkout') {
      const flag = sub === 'switch' ? '-c' : '-b';
      const create = a[0] === flag;
      if (!((a.length === 1 && !a[0].startsWith('-')) || (create && a.length === 2)))
        return usage(`git ${sub} [${flag}] branch`);
      await this.clean();
      const ref = a[create ? 1 : 0];
      if (create) await git.branch({ ...this.options, ref });
      await git.checkout({ ...this.options, ref });
      return `Switched to ${create ? 'a new ' : ''}branch '${ref}'`;
    }
    if (sub === 'merge') {
      const flags = a.filter((x) => x.startsWith('-'));
      const ref = a.filter((x) => !x.startsWith('-'));
      if (
        ref.length !== 1 ||
        flags.length > 1 ||
        flags.some((x) => !['--ff-only', '--no-ff'].includes(x))
      )
        return usage('git merge [--ff-only / --no-ff] branch');
      await this.clean();
      if ((await git.statusMatrix(this.options)).some(([, h, w, s]) => h !== w || h !== s))
        throw new Error('Commit or remove all untracked changes before merging.');
      const result = await git.merge({
        ...this.options,
        theirs: ref[0],
        author: await this.author(),
        fastForwardOnly: flags.includes('--ff-only'),
        fastForward: !flags.includes('--no-ff'),
        abortOnConflict: true,
      });
      await git.checkout({ ...this.options, ref: await this.branch(), force: true });
      return result.alreadyMerged
        ? 'Already up to date.'
        : result.fastForward
          ? `Fast-forward\nUpdated ${await this.branch()} to ${result.oid?.slice(0, 7)}. No merge commit created.`
          : `Merge made by the three-way strategy.\nMerge commit ${result.oid?.slice(0, 7)} created.`;
    }
    if (sub === 'log') {
      if (a.some((x) => !['--oneline', '--graph', '--all', '-1'].includes(x)))
        return usage('git log [--oneline] [--graph] [--all] [-1]');
      if (!(await this.head()))
        throw new Error('Your current branch does not have any commits yet.');
      const view = await this.inspect();
      const commits = a.includes('--all')
        ? view.commits
        : (await git.log({ ...this.options, depth: a.includes('-1') ? 1 : 150 })).map((x) =>
            view.commits.find((c) => c.oid === x.oid)!,
          );
      return commits
        .slice(0, a.includes('-1') ? 1 : undefined)
        .map(
          (c) =>
            `${a.includes('--graph') ? (c.parents.length > 1 ? '* | ' : '* ') : ''}${a.includes('--oneline') ? c.oid.slice(0, 7) + ' ' + c.message : 'commit ' + c.oid + '\nAuthor: ' + c.author + '\n\n    ' + c.message}`,
        )
        .join('\n');
    }
    throw new Error(`git ${sub || ''}: not supported. Type help for available commands.`);
  }
  private async author() {
    const name = String(
      (await git.getConfig({ ...this.options, path: 'user.name' })) ||
        this.globalConfig['user.name'] ||
        '',
    );
    const email = String(
      (await git.getConfig({ ...this.options, path: 'user.email' })) ||
        this.globalConfig['user.email'] ||
        '',
    );
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error('Configure user.name and a valid user.email before committing.');
    return { name, email };
  }
}
