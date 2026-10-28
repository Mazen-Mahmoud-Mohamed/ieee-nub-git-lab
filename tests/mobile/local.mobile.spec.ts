import { test, expect } from '@playwright/test';
async function view(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
}
test('phone Git editing, tab state, command helpers, history and refresh preserve actual work', async ({
  page,
}) => {
  await page.goto('/#/workspace');
  await page.getByLabel('Practice full name').fill('Mobile Student');
  await page.getByLabel('Practice department').fill('Engineering');
  await page.getByRole('button', { name: 'Save on this device' }).click();
  await view(page, 'Terminal');
  async function command(cmd: string) {
    await page.getByLabel('Terminal command').fill(cmd);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByLabel('Terminal command')).toBeEnabled();
  }
  for (const cmd of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git config user.name "Mobile Student"',
    'git config user.email mobile@example.test',
    'git init',
    'touch about.txt',
  ])
    await command(cmd);
  await view(page, 'Files');
  await page.getByRole('button', { name: /^about.txt/ }).click();
  const editor = page.getByRole('textbox', { name: 'Text file editor' });
  await editor.fill('Hello mobile\nمرحبا من الهاتف');
  await expect(page.getByText('File saved locally', { exact: true })).toBeVisible();
  await view(page, 'Terminal');
  await page.getByLabel('Terminal command').fill('git status');
  await view(page, 'Task');
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('separate');
  await expect(page.locator('.task-caution')).toContainText('New commits cannot split');
  await view(page, 'Files');
  await expect(editor).toHaveValue('Hello mobile\nمرحبا من الهاتف');
  await view(page, 'Terminal');
  await expect(page.getByLabel('Terminal command')).toHaveValue('git status');
  await command('git add about.txt');
  await command('git commit -m "Add personal information"');
  await page.getByRole('button', { name: 'Previous command', exact: true }).click();
  await expect(page.getByLabel('Terminal command')).toHaveValue(
    'git commit -m "Add personal information"',
  );
  await page.getByRole('button', { name: 'Next command', exact: true }).click();
  await expect(page.getByLabel('Terminal command')).toHaveValue('');
  await page.getByRole('button', { name: 'Insert git ', exact: true }).click();
  await expect(page.getByLabel('Terminal command')).toHaveValue('git ');
  await command('git log --oneline');
  await expect(page.getByRole('log')).toContainText('Add personal information');
  await view(page, 'Files');
  await page.reload();
  await expect(editor).toHaveValue('Hello mobile\nمرحبا من الهاتف');
  await view(page, 'Task');
  await expect(page.getByRole('combobox', { name: 'Task', exact: true })).toHaveValue('separate');
  await page.getByText('Help with this attempt', { exact: true }).click();
  await page.getByRole('button', { name: 'Restart Attempt', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText(
    'Previous submissions and official grades are unchanged',
  );
  await page.getByRole('button', { name: 'Keep current work', exact: true }).click();
  await page.screenshot({
    path: 'test-results/mobile-' + test.info().project.name + '.png',
    fullPage: true,
  });
});
test('all requested phone widths, tablet and landscape avoid horizontal overflow and keep navigation accessible', async ({
  page,
}) => {
  for (const width of [320, 360, 375, 390, 414, 430, 768, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    for (const route of [
      '',
      'auth',
      'dashboard',
      'learn',
      'workspace',
      'theory',
      'review',
      'profile',
    ]) {
      await page.goto('/#/' + route);
      await expect(page.locator('main')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${route} at ${width}px`,
      ).toBeLessThanOrEqual(width);
    }
  }
  await page.goto('/#/workspace');
  await view(page, 'Terminal');
  for (const name of ['Terminal', 'Files', 'Task']) {
    await expect
      .poll(
        async () => (await page.getByRole('tab', { name, exact: true }).boundingBox())?.height ?? 0,
      )
      .toBeGreaterThanOrEqual(44);
  }
  await view(page, 'Task');
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await page.getByRole('button', { name: 'Toggle light and dark theme', exact: true }).click();
    const ratio = await page.getByRole('combobox', { name: 'Task', exact: true }).evaluate((el) => {
      const st = getComputedStyle(el);
      if (st.appearance !== 'none') return 0;
      const lum = (rgb: string) => {
        const v = (rgb.match(/[0-9.]+/g) || [])
          .slice(0, 3)
          .map(Number)
          .map((n) => n / 255)
          .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
        return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
      };
      const a = lum(st.color),
        b = lum(st.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(ratio, theme + ' native select contrast').toBeGreaterThanOrEqual(4.5);
  }
  await view(page, 'Terminal');
  // A smaller visual viewport approximates layout pressure, not a native mobile keyboard.
  await page.setViewportSize({ width: 375, height: 420 });
  await page.getByLabel('Terminal command').focus();
  const input = await page.getByLabel('Terminal command').boundingBox();
  expect(input?.width).toBeGreaterThan(100);
});
