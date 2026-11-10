import { test, expect } from '@playwright/test';
for (const [label, width] of [
  ['desktop', 1440],
  ['mobile', 390],
] as const) {
  test('Task 1 recovery and reload ' + label, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/rest/v1/rpc/course_gradebook', (r) => r.fulfill({ json: [] }));
    await page.goto('/ieee-git-lab/tests/browser-fixtures/task1-harness.html');
    await expect(page.getByRole('button', { name: 'Fixture: create late goals' })).toBeEnabled();
    await page.getByRole('button', { name: 'Fixture: create late goals' }).click();
    await expect(page.getByLabel('Task progress')).toContainText('6 / 100');
    await page.reload();
    await expect(page.getByLabel('Task progress')).toContainText('6 / 100');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page
      .getByRole('combobox', { name: 'Task', exact: true })
      .selectOption('t1-goals-content');
    await expect(
      page.getByRole('heading', { name: '8. Write the original goals', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: 'test-results/task1-' + label + '.png', fullPage: true });
    await page.getByRole('button', { name: 'Theory', exact: true }).click();
    await expect(page.getByText('What is the difference between Git and GitHub?')).toBeVisible();
    await page.screenshot({ path: 'test-results/task1-theory-' + label + '.png', fullPage: true });
  });
}

test('all objective inputs persist on mobile, distinguish manual grading and show pending certificate', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/rest/v1/rpc/course_gradebook', (r) =>
    r.fulfill({
      json: [
        {
          student_id: 'fixture',
          full_name: 'Preview Student',
          task1: 100,
          task2: 0,
          final: 0,
          total: 100,
          eligible: false,
          completed_components: 1,
        },
      ],
    }),
  );
  await page.goto('/ieee-git-lab/tests/browser-fixtures/task1-harness.html?objective=1');
  await expect(page.getByText('Certificate eligibility pending', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Theory', exact: true }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByLabel('Choose question').selectOption(String(i));
    await expect(
      page.getByText('Automatically graded on submission.', { exact: false }),
    ).toBeVisible();
    if (i < 3)
      await page.getByRole('radio', { name: i === 1 ? 'True' : 'Option A', exact: true }).check();
    else await page.getByLabel('Your response').fill('git status');
  }
  await page.screenshot({ path: 'test-results/task1-objective-mobile.png', fullPage: true });
  await page.getByLabel('Choose question').selectOption('4');
  await expect(page.getByText('Marked by your instructor.', { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Theory', exact: true }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByLabel('Choose question').selectOption(String(i));
    if (i < 3)
      await expect(
        page.getByRole('radio', { name: i === 1 ? 'True' : 'Option A', exact: true }),
      ).toBeChecked();
    else await expect(page.getByLabel('Your response')).toHaveValue('git status');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
