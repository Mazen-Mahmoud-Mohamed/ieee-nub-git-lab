import { test, expect } from '@playwright/test';
test('terminal file creation stays compact; explicit editing can be closed without losing work', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/workspace');
  for (const value of ['mkdir IEEE-Git-Task', 'cd IEEE-Git-Task', 'echo Draft > about.txt']) {
    await page.getByLabel('Terminal command').fill(value);
    await page.getByLabel('Terminal command').press('Enter');
    await expect(page.getByLabel('Terminal command')).toBeEnabled();
  }
  await expect(page.locator('.student-editor')).toBeHidden();
  await expect(page.getByLabel('Command helpers')).toHaveCount(0);
  await page.getByRole('button', { name: /about.txt/ }).click();
  await page
    .getByRole('textbox', { name: 'Text file editor', exact: true })
    .fill('Preserved draft');
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  await page.screenshot({
    path: 'test-results/product-review/local-desktop-terminal.png',
    fullPage: true,
  });
  await expect(page.locator('.student-editor')).toBeHidden();
  await page.getByRole('button', { name: /about.txt/ }).click();
  await expect(page.getByRole('textbox', { name: 'Text file editor', exact: true })).toHaveText(
    'Preserved draft',
  );
  await page.screenshot({
    path: 'test-results/product-review/local-desktop-editor.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Text file editor', exact: true })).toHaveValue(
    'Preserved draft',
  );
  await page.getByRole('tab', { name: 'Terminal', exact: true }).click();
  await page.getByLabel('Terminal command').fill('git status');
  await page.getByRole('tab', { name: 'Task', exact: true }).click();
  await page.getByRole('tab', { name: 'Terminal', exact: true }).click();
  await expect(page.getByLabel('Terminal command')).toHaveValue('git status');
  await expect(page.getByLabel('Terminal command')).toBeInViewport();
  await page.screenshot({
    path: 'test-results/product-review/local-mobile-terminal.png',
    fullPage: false,
  });
});
test('terminal-first desktop and simple phone tabs keep working state across layout changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/workspace');
  await expect(page.getByLabel('Terminal command')).toBeVisible();
  await expect(page.getByLabel('Command helpers')).toBeHidden();
  await expect(page.locator('.student-editor')).toBeHidden();
  const terminal = await page.locator('.terminal').boundingBox();
  const work = await page.getByLabel('Work area').boundingBox();
  const task = await page.locator('.student-task').boundingBox();
  expect(terminal!.height).toBeGreaterThanOrEqual(420);
  expect(work!.width / (work!.width + task!.width)).toBeGreaterThanOrEqual(0.64);
  expect(work!.width / (work!.width + task!.width)).toBeLessThanOrEqual(0.7);
  await page.getByLabel('Terminal command').fill('git status');
  await page.screenshot({ path: 'test-results/terminal-first-desktop.png', fullPage: true });
  for (const [width, height] of [
    [320, 640],
    [360, 800],
    [375, 812],
    [390, 844],
    [414, 896],
    [430, 932],
    [768, 1024],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('tab', { name: 'Task', exact: true }).click();
    await expect(page.getByLabel('Terminal command')).toBeHidden();
    await page.getByRole('button', { name: 'Open Terminal', exact: true }).click();
    await expect(page.getByLabel('Terminal command')).toHaveValue('git status');
    await expect(page.getByLabel('Command helpers')).toBeVisible();
    await expect(page.locator('.student-task')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.getByRole('tab', { name: 'Files', exact: true }).click();
    await expect(page.getByLabel('Terminal command')).toBeHidden();
    await page.getByRole('tab', { name: 'Task', exact: true }).click();
    await page.getByRole('button', { name: 'Check again', exact: true }).click();
  }
});
test('dashboard keeps assignments and exams separate', async ({ page }) => {
  await page.goto('/#/dashboard');
  await expect(page.getByRole('heading', { name: 'Assignments', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Exams', exact: true })).toBeVisible();
  await expect(page.getByText('No published exams available.')).toBeVisible();
  await page.screenshot({ path: 'test-results/course-dashboard-preview.png', fullPage: true });
});
test('student can work with real Git, refresh, and recover the editor and history', async ({
  page,
}) => {
  await page.goto('/#/workspace');
  await expect(page.getByLabel('Terminal command')).toBeVisible();
  async function command(value: string) {
    await page.getByLabel('Terminal command').fill(value);
    await page.getByLabel('Terminal command').press('Enter');
    await expect(page.getByLabel('Terminal command')).toBeEnabled();
  }
  for (const cmd of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git config --global user.name "E2E Student"',
    'git config --global user.email e2e@example.edu',
    'git init',
    'echo "Hello from the browser" > about.txt',
    'git add about.txt',
    'git commit -m "Add personal information"',
  ])
    await command(cmd);
  await page
    .getByRole('button', { name: 'about.txt U', exact: false })
    .or(page.getByRole('button', { name: 'about.txt', exact: true }))
    .first()
    .click();
  await expect(page.getByRole('textbox', { name: 'Text file editor' })).toBeVisible();
  await expect(page.getByText('Hello from the browser', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Terminal command')).toBeVisible();
  await command('git log --oneline');
  await expect(page.getByRole('log')).toContainText('Add personal information');
});
test('unsupported commands fail, and blank theory cannot be submitted', async ({ page }) => {
  await page.goto('/#/workspace');
  await page.getByLabel('Terminal command').fill('git push');
  await page.getByLabel('Terminal command').press('Enter');
  await expect(page.getByRole('log')).toContainText('Not a Git repository');
  await page.goto('/#/review');
  await expect(page.getByRole('button', { name: 'Submit assignment' })).toBeDisabled();
});
test('mobile instructions remain usable and 404 helps students return', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/workspace');
  await page.getByRole('tab', { name: 'Task', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Set up your project',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Terminal', exact: true }).click();
  await expect(page.getByLabel('Terminal command')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.goto('/#/missing');
  await expect(page.getByRole('heading', { name: 'Let’s switch back.' })).toBeVisible();
});
test('instructor route rejects unauthenticated access', async ({ page }) => {
  await page.goto('/#/instructor');
  await expect(page.getByRole('heading', { name: 'Instructor access required.' })).toBeVisible();
});
test('complete Assignment 01 locally, unlock theory, autosave answers, and keep submission honest', async ({
  page,
}) => {
  await page.goto('/#/workspace');
  await page.getByLabel('Practice full name').fill('E2E Student');
  await page.getByLabel('Practice department').fill('Engineering');
  await page.getByRole('button', { name: 'Save on this device' }).click();
  async function command(value: string) {
    await page.getByLabel('Terminal command').fill(value);
    await page.getByLabel('Terminal command').press('Enter');
    await expect(page.getByLabel('Terminal command')).toBeEnabled();
  }
  async function file(name: string, text: string) {
    await command('touch ' + name);
    await page
      .getByRole('button', { name: new RegExp('^' + name.replace('.', '\\.') + '(?: U| M)?$') })
      .click();
    await page.getByRole('textbox', { name: 'Text file editor' }).fill(text);
  }
  for (const cmd of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git --version',
    'git config --global user.name "E2E Student"',
    'git config --global user.email e2e@example.edu',
    'git init -b main',
  ])
    await command(cmd);
  await file(
    'about.txt',
    'Name: E2E Student\nUniversity: Nahda University\nDepartment: Engineering',
  );
  await file(
    'goals.txt',
    'My Goals:\n1. Learn Git\n2. Understand version control\n3. Work on team projects',
  );
  await file('notes.txt', 'Git Course - Session 1\nIEEE NUB Student Branch');
  for (const [name, msg] of [
    ['about.txt', 'Add personal information'],
    ['goals.txt', 'Add learning goals'],
    ['notes.txt', 'Add session notes'],
  ]) {
    await command('git add ' + name);
    await command('git commit -m "' + msg + '"');
  }
  await file(
    'goals.txt',
    'My Goals:\n1. Learn Git\n2. Understand version control\n3. Work on team projects\n4. Review code\n5. Build projects',
  );
  await command('git add goals.txt');
  await command('git commit -m "Expand learning goals"');
  await command('git switch -c feature/skills');
  await file('skills.txt', 'Problem Solving\nCommunication\nTeamwork');
  await command('git add skills.txt');
  await command('git commit -m "Add personal skills"');
  await command('git switch main');
  await expect(page.getByRole('button', { name: 'skills.txt', exact: true })).toHaveCount(0);
  await command('git switch feature/skills');
  await expect(page.getByRole('button', { name: 'skills.txt', exact: true })).toBeVisible();
  await command('git switch main');
  await command('git merge feature/skills');
  await command('git log --oneline');
  await expect(page.getByText('8 / 8 scored tasks')).toBeVisible();
  await page.getByRole('button', { name: 'skills.txt', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Text file editor' })).toContainText(
    'Problem Solving',
  );
  await page.screenshot({ path: 'test-results/workspace-preview.png' });
  await page.getByRole('link', { name: 'Continue to Questions' }).click();
  await expect(page.getByRole('heading', { name: 'Questions', exact: true })).toBeVisible();
  for (let i = 0; i < 14; i++) {
    await page
      .getByLabel('Your response')
      .fill('My own explanation of the Git concept and the changes I observed in the repository.');
    await page.getByRole('button', { name: 'Next question' }).click();
  }
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.reload();
  await expect(page.getByText('14 of 14 required answers')).toBeVisible();
  await page.goto('/#/review');
  await expect(
    page.getByText('This is a local practice workspace.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit assignment' })).toBeDisabled();
});

test('reported sequence shows individual checks, editor progress, dirty state and refresh recovery', async ({
  page,
}) => {
  await page.goto('/#/workspace');
  await page.getByLabel('Practice full name').fill('mazen');
  await page.getByLabel('Practice department').fill('Engineering');
  await page.getByRole('button', { name: 'Save on this device' }).click();
  const input = page.getByLabel('Terminal command');
  const req = (label: string) => page.locator('.requirement-list li').filter({ hasText: label });
  const command = async (value: string) => {
    await expect(input).toBeEnabled();
    await input.fill(value);
    await input.press('Enter');
    await expect(input).toBeEnabled();
  };
  for (const c of [
    'ls',
    'git config --global user.name "mazen"',
    'git config --global user.email "student@example.com"',
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git init',
    'git branch',
    'touch about.txt',
    'touch goals.txt',
    'touch notes.txt',
    'git status',
    'ls -a',
  ])
    await command(c);
  for (const label of [
    'Git repository initialized',
    'Git username configured',
    'Valid Git email configured',
  ])
    await expect(req(label)).toHaveAttribute('data-state', 'completed');
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('files');
  for (const file of ['about.txt', 'goals.txt', 'notes.txt'])
    await expect(req(file + ' created in this project')).toHaveAttribute('data-state', 'completed');
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('repo');
  await expect(req('Main branch has its first commit')).toHaveAttribute('data-state', 'incomplete');
  await expect(page.getByText('0 / 8 scored tasks')).toBeVisible();
  await expect(
    page
      .locator('.student-next')
      .getByText('The published scored check needs the first commit on main.', { exact: false }),
  ).toBeVisible();
  await command('nano about.txt');
  await expect(page.getByRole('log')).toContainText(
    'To edit about.txt, select it from Files above the editor.',
  );
  const texts: Record<string, string> = {
    'about.txt': 'Name: mazen\nUniversity: Nahda University\nDepartment: Engineering',
    'goals.txt': 'My Goals:\n1. Learn Git\n2. Understand version control\n3. Work on team projects',
    'notes.txt': 'Git Course - Session 1\nIEEE NUB Student Branch',
  };
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('files');
  for (const [file, value] of Object.entries(texts)) {
    await page
      .getByRole('button', { name: new RegExp('^' + file.replace('.', '\\.') + '(?: U| M)?$') })
      .click();
    await page.getByRole('textbox', { name: 'Text file editor' }).fill(value);
    await expect(req(file + ' required content written')).toHaveAttribute(
      'data-state',
      'completed',
    );
  }
  await command('git add about.txt');
  await command('git commit -m "Add personal information"');
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('repo');
  await expect(req('Main branch has its first commit')).toHaveAttribute('data-state', 'completed');
  await expect(page.getByText('1 / 8 scored tasks')).toBeVisible();
  await page.getByRole('button', { name: /^about\.txt(?: U| M)?$/ }).click();
  const editor = page.getByRole('textbox', { name: 'Text file editor' });
  await editor.fill(texts['about.txt'] + '\nAn unsaved-to-Git edit');
  await expect(page.getByRole('button', { name: 'about.txt M', exact: true })).toBeVisible();
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.reload();
  await expect(input).toBeEnabled();
  await expect(req('Git username configured')).toHaveAttribute('data-state', 'completed');
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('files');
  await expect(req('about.txt created in this project')).toHaveAttribute('data-state', 'completed');
  await page.getByRole('button', { name: 'about.txt M', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Text file editor' })).toContainText(
    'An unsaved-to-Git edit',
  );
  await command('git log --oneline');
  await expect(page.getByRole('log')).toContainText('Add personal information');
  await page.screenshot({ path: 'test-results/requirement-progress-preview.png' });
});

test('same-size editor changes can be staged and committed again', async ({ page }) => {
  await page.goto('/#/workspace');
  const input = page.getByLabel('Terminal command');
  const command = async (value: string) => {
    await expect(input).toBeEnabled();
    await input.fill(value);
    await input.press('Enter');
    await expect(input).toBeEnabled();
  };
  for (const value of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git config --global user.name "Test Student"',
    'git config --global user.email test@example.test',
    'git init',
    'echo "first version" > about.txt',
    'git add about.txt',
    'git commit -m "Save first version"',
  ])
    await command(value);
  await page.getByRole('button', { name: 'about.txt', exact: true }).click();
  await page.getByRole('textbox', { name: 'Text file editor' }).fill('other version');
  await expect(page.getByRole('button', { name: 'about.txt M', exact: true })).toBeVisible();
  await command('git add about.txt');
  await command('git commit -m "Save other version"');
  await expect(page.getByRole('button', { name: 'about.txt', exact: true })).toBeVisible();
  await command('git log --oneline');
  await expect(page.getByRole('log')).toContainText('Save other version');
  await page.reload();
  await page.getByRole('button', { name: 'about.txt', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Text file editor' })).toContainText(
    'other version',
  );
});

test('restart practice confirms losses, preserves a recovery copy and restores a fresh state after reload', async ({
  page,
}) => {
  await page.goto('/#/workspace');
  const command = async (value: string) => {
    const input = page.getByLabel('Terminal command');
    await expect(input).toBeEnabled();
    await input.fill(value);
    await input.press('Enter');
    await expect(input).toBeEnabled();
  };
  for (const value of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git init',
    'git config user.name "Recovery Student"',
    'git config user.email recovery@example.test',
    'touch about.txt',
    'touch goals.txt',
    'git add .',
  ])
    await command(value);
  await expect(page.getByRole('alert').filter({ hasText: 'History warning:' })).toBeVisible();
  await command('git commit -m "Combined introductory files"');
  await expect(page.getByRole('log')).toContainText('Combined introductory files');
  if (!(await page.getByRole('button', { name: 'Restart Attempt', exact: true }).isVisible()))
    await page.getByText('Help with this attempt', { exact: true }).click();
  await page.getByRole('button', { name: 'Restart Attempt', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('answers and task progress');
  await page.screenshot({ path: 'test-results/restart-confirmation-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/restart-confirmation-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  await expect(dialog).toContainText('Previous submissions and official grades are unchanged');
  await page.getByRole('button', { name: 'Keep current work', exact: true }).click();
  await command('git log --oneline');
  await expect(page.getByRole('log')).toContainText('Combined introductory files');
  if (!(await page.getByRole('button', { name: 'Restart Attempt', exact: true }).isVisible()))
    await page.getByText('Help with this attempt', { exact: true }).click();
  await page.getByRole('button', { name: 'Restart Attempt', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm restart', exact: true }).click();
  await expect(page.getByText('Practice restarted.', { exact: false })).toBeVisible();
  await expect(page.getByText('0 / 8 scored tasks')).toBeVisible();
  await expect(page.getByRole('log')).not.toContainText('Combined introductory files');
  const recovery = await page.evaluate(async () => {
    const open = indexedDB.open('ieee-nub-git-lab');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction('workspaces', 'readonly');
    const store = tx.objectStore('workspaces');
    const request = store.getAllKeys();
    const keys = await new Promise<IDBValidKey[]>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    return keys.map(String).filter((k) => k.includes(':restart-backup:'));
  });
  expect(recovery).toHaveLength(1);
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('goals');
  await page.getByRole('link', { name: 'Questions', exact: true }).click();
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Task', exact: true })).toHaveValue('goals');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Task', exact: true })).toHaveValue('goals');
  await expect(page.getByText('0 / 8 scored tasks')).toBeVisible();
  await command('ls');
  await expect(page.getByRole('log')).not.toContainText('Combined introductory files');
});

test('learning guide leads to focused tasks, exact requirements and keyboard recovery', async ({
  page,
}) => {
  await page.goto('/#/learn');
  await expect(page.getByRole('heading', { name: 'Git, one step at a time' })).toBeVisible();
  await expect(page.locator('.lesson-grid article')).toHaveCount(6);
  await page.getByRole('link', { name: 'Try it in the practice lab', exact: true }).click();
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('separate');
  await expect(page.getByText('Exact commit message', { exact: true })).toBeVisible();
  await expect(page.locator('.required-message code')).toHaveText('Add personal information');
  await expect(page.locator('.task-caution')).toContainText('New commits cannot split');
  await expect(page.locator('.check-evidence')).not.toHaveAttribute('open', '');
  await page.getByRole('link', { name: 'Questions', exact: true }).click();
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Task', exact: true })).toHaveValue('separate');
  await page.getByText('Help with this attempt', { exact: true }).click();
  await page.getByRole('button', { name: 'Restart Attempt', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Start over?', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByText('Help with this attempt', { exact: true })).toBeFocused();
  await page.locator('.student-task').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: 'test-results/redesigned-workspace-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Task', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/redesigned-workspace-mobile.png', fullPage: true });
});

test('shared text colors stay readable in both themes and tablet lessons do not overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/#/learn');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content', exact: true });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page).toHaveURL(/#\/learn$/);
  await expect(skip).not.toBeInViewport();
  for (const theme of ['dark', 'light']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await page.getByRole('button', { name: 'Toggle light and dark theme', exact: true }).click();
    const ratios = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const luminance = (color: string) => {
        const hex = color.trim().replace('#', '');
        const value = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
        const rgb = [0, 2, 4]
          .map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
          .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      return ['--text', '--muted', '--blue', '--green'].flatMap((text) =>
        ['--panel', '--raised', '--bg'].map((bg) => {
          const a = luminance(style.getPropertyValue(text)),
            b = luminance(style.getPropertyValue(bg));
          return { text, bg, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
        }),
      );
    });
    for (const r of ratios)
      expect(r.ratio, `${theme} ${r.text} on ${r.bg}`).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      768,
    );
    await page.screenshot({ path: `test-results/learning-tablet-${theme}.png`, fullPage: true });
  }
});
