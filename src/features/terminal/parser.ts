export function tokenize(input: string): string[] {
  if (input.length > 2000 || /[\x00-\x08\x0b-\x1f]/.test(input))
    throw new Error('Command is invalid or too long');
  const tokens: string[] = [];
  let token = '',
    quote = '',
    active = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      if (c === quote) quote = '';
      else if (c === '\\' && quote === '"' && /["\\]/.test(input[i + 1] ?? '')) token += input[++i];
      else token += c;
      active = true;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      active = true;
    } else if (/\s/.test(c)) {
      if (active) {
        tokens.push(token);
        token = '';
        active = false;
      }
    } else if (c === '>') {
      if (active) {
        tokens.push(token);
        token = '';
        active = false;
      }
      if (input[i + 1] === '>') {
        tokens.push('>>');
        i++;
      } else tokens.push('>');
    } else if (';|&`$<'.includes(c))
      throw new Error(
        'Pipes, chained commands, substitutions and input redirection are not supported. Run one command at a time.',
      );
    else if (c === '\\') {
      if (i + 1 >= input.length) throw new Error('Incomplete escape');
      token += input[++i];
      active = true;
    } else {
      token += c;
      active = true;
    }
  }
  if (quote) throw new Error('Unclosed quote');
  if (active) tokens.push(token);
  return tokens;
}
export const HELP = `This terminal operates only inside your browser workspace.
Shell: pwd · ls [-a] [directory] · cd [directory] · mkdir directory · touch file.txt
cat file.txt · echo "text" [> or >> file.txt] · rm file.txt · clear · help
Git: git --version · git config [--global] user.name/user.email [value] · git config [--global] --list
git init [-b main] · git status [--short] · git add file... / . / -A
git commit -m "Message" · git log [--oneline] [--graph] [--all] [-1]
git branch [name] · git branch -M main · git switch [-c] branch
git checkout [-b] branch · git merge [--ff-only / --no-ff] branch
Branch switches require a clean tracked working tree. Conflicts stop safely without changing your files.
Remotes and advanced Git commands are outside Assignment 01.`;
