import { test, expect } from '@playwright/test';
test('late released-grade responses cannot cross attempts and decimal score totals remain exact', async ({
  page,
}) => {
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const ready = new Promise<void>((r) => {
    started = r;
  });
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const u = new URL(route.request().url()),
      a = u.searchParams.get('attempt_id')?.includes('11111111');
    if (u.pathname === '/rest/v1/released_results') {
      if (a) {
        started();
        await gate;
      }
      await route.fulfill({
        json: {
          practical_score: a ? 0.1 : 0.2,
          theory_score: 0.2,
          feedback: a ? 'Score A' : 'Score B',
          released: true,
        },
      });
    } else if (u.pathname === '/rest/v1/task_results')
      await route.fulfill({
        json: [
          {
            task_key: 't',
            points: a ? 0.1 : 0.2,
            requirement_results: [
              { id: 't:rule-0-exists', points: a ? 0.1 : 0.2, earned: a ? 0.1 : 0.2 },
            ],
          },
        ],
      });
    else await route.fulfill({ json: null });
  });
  await page.goto('/ieee-git-lab/tests/browser-fixtures/result-harness.html');
  await ready;
  await page.getByRole('button', { name: 'Show B', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Official score: 0.4 / 0.4', exact: true }),
  ).toBeVisible();
  const delayed = page.waitForResponse(
    (r) => r.url().includes('/released_results') && r.url().includes('11111111'),
  );
  release();
  const response = await delayed;
  await response.finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByText('Score B', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Official score: 0.4 / 0.4', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show A', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Official score: 0.3 / 0.3', exact: true }),
  ).toBeVisible();
});
