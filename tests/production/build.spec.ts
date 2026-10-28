import { test, expect } from '@playwright/test';
test('built phone app defers desktop editor and instructor chunks while real Git still works', async ({
  page,
}) => {
  const loaded: string[] = [];
  page.on('request', (r) => loaded.push(r.url()));
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:5176'
      ? route.continue()
      : route.abort(),
  );
  await page.goto('./#/workspace');
  await page.getByRole('tab', { name: 'Terminal', exact: true }).click();
  async function command(cmd: string) {
    await page.getByLabel('Terminal command').fill(cmd);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByLabel('Terminal command')).toBeEnabled();
  }
  for (const cmd of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git config user.name "Build Check"',
    'git config user.email build@example.test',
    'git init',
    'touch about.txt',
  ])
    await command(cmd);
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: /^about.txt/ }).click();
  await page.getByRole('textbox', { name: 'Text file editor' }).fill('Built app mobile editing');
  await expect(page.getByText('File saved locally', { exact: true })).toBeVisible();
  expect(loaded.some((url) => /\/assets\/(editor-|DesktopTextEditor-|Instructor-)/.test(url))).toBe(
    false,
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.cm-content')).toContainText('Built app mobile editing');
  expect(loaded.some((url) => /\/assets\/editor-/.test(url))).toBe(true);
  await command('git add about.txt');
  await command('git commit -m "Verify built history"');
  await command('git log --oneline');
  await expect(page.getByRole('log')).toContainText('Verify built history');
});
