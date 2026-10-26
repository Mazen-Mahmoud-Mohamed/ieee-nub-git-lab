import { test, expect } from '@playwright/test';
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
  await expect(
    page.getByText('A desktop keyboard gives you the best terminal experience.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Repository initialization', exact: true }),
  ).toBeVisible();
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
  await page.getByRole('link', { name: 'Continue to theory' }).click();
  await expect(page.getByRole('heading', { name: 'Understand the why.' })).toBeVisible();
  for (let i = 0; i < 14; i++) {
    await page
      .getByLabel('Your response')
      .fill('My own explanation of the Git concept and the changes I observed in the repository.');
    await page.getByRole('button', { name: 'Next question' }).click();
  }
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.reload();
  await expect(page.getByText('12 of 12 required answers')).toBeVisible();
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
    'about.txt created in this project',
    'goals.txt created in this project',
    'notes.txt created in this project',
  ])
    await expect(req(label)).toHaveAttribute('data-state', 'completed');
  await expect(req('Main branch has its first commit')).toHaveAttribute('data-state', 'incomplete');
  await expect(page.getByText('0 / 8 scored tasks')).toBeVisible();
  await expect(
    page.getByText('The published scored check needs the first commit on main.', { exact: false }),
  ).toBeVisible();
  await command('nano about.txt');
  await expect(page.getByRole('log')).toContainText(
    'To edit about.txt, select it from the Files panel on the left.',
  );
  const texts: Record<string, string> = {
    'about.txt': 'Name: mazen\nUniversity: Nahda University\nDepartment: Engineering',
    'goals.txt': 'My Goals:\n1. Learn Git\n2. Understand version control\n3. Work on team projects',
    'notes.txt': 'Git Course - Session 1\nIEEE NUB Student Branch',
  };
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
  await expect(req('about.txt created in this project')).toHaveAttribute('data-state', 'completed');
  await page.getByRole('button', { name: 'about.txt M', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Text file editor' })).toContainText(
    'An unsaved-to-Git edit',
  );
  await command('git log --oneline');
  await expect(page.getByRole('log')).toContainText('Add personal information');
  await page.screenshot({ path: 'test-results/requirement-progress-preview.png' });
});
