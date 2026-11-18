import { test, expect } from '@playwright/test';
import { emptyTask2Outcomes } from '../../src/features/task2/policy';
for (const width of [1440, 390, 320])
  test('Task 2 correction, theory, partial submission and layout ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let revision = 0;
    let check: any = null;
    let answers: any = {};
    let submits = 0;
    await page.route('**/functions/v1/github-task2', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'status')
        return route.fulfill({
          json: {
            revision,
            configured: true,
            connection: {
              login: 'isolated-student',
              githubId: 100,
              revoked: false,
              authorized: true,
            },
            repository: {
              full_name: 'isolated-student/fork',
              repository_id: 200,
              status: 'verified',
            },
            check,
          },
        });
      expect(body).not.toHaveProperty('evidence');
      if (body.action === 'check') {
        const outcomes = emptyTask2Outcomes();
        outcomes[2].earned = 10;
        outcomes[2].passed = true;
        outcomes[2].status = 'passed';
        outcomes[2].requirements[0].reason = 'Verified from GitHub.';
        check = {
          id: 'synthetic-check',
          created_at: '2026-11-18T00:00:00Z',
          policy_version: 'github-task2-v1',
          evidence: { mainSha: 'a'.repeat(40) },
          outcomes,
        };
      }
      if (body.action === 'save' || body.action === 'submit' || body.action === 'check') {
        expect(body.revision).toBe(revision);
        answers = body.answers;
        revision++;
      }
      if (body.action === 'submit') submits++;
      return route.fulfill({
        json: { revision, ...(body.action === 'submit' ? { receipt: 'synthetic-receipt' } : {}) },
      });
    });
    await page.route('**/rest/v1/released_results*', (r) => r.fulfill({ json: null }));
    await page.route('**/rest/v1/rpc/assessment_state', (r) =>
      r.fulfill({ json: { payload: { answers } } }),
    );
    await page.goto('/ieee-git-lab/tests/browser-fixtures/task2-harness.html');
    await expect(page.getByRole('button', { name: 'Check My Work', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Check My Work', exact: true }).click();
    await expect(page.getByText('10 / 100 independently verified points')).toBeVisible();
    await expect(page.getByText('Passed', { exact: true })).toBeVisible();
    await expect(page.getByText('Install App on selected fork')).toHaveCount(0);
    await expect(page.getByText('Stage 1: Merge the starter branches')).toBeVisible();
    if (width !== 320)
      await page.screenshot({ path: `test-results/task2-practical-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('link', { name: 'Theory', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Theory · 0 / 15 answered' })).toBeVisible();
    await page
      .getByLabel('Both branches changed the same lines differently', { exact: true })
      .check();
    if (width === 390)
      await page.screenshot({ path: 'test-results/task2-theory-mobile.png', fullPage: false });
    await page.getByRole('button', { name: 'Save answers online' }).click();
    await expect(page.getByText('Theory answers saved online.', { exact: true })).toBeVisible();
    expect(answers['t2-q1']).toBe('Both branches changed the same lines differently');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('link', { name: 'Review & Submit', exact: true }).first().click();
    await expect(
      page.getByText('Theory: 1 answered, 14 unanswered.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Submit Task 2', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Submission accepted' })).toBeVisible();
    expect(submits).toBe(1);
    await expect(page.getByText('Your grade is awaiting instructor release.')).toBeVisible();
  });
test('Task 2 accepts zero practical partial work when GitHub sign-in is pending', async ({
  page,
}) => {
  let submitted = false;
  await page.route('**/functions/v1/github-task2', (route) => {
    const p = route.request().postDataJSON();
    if (p.action === 'submit') {
      submitted = true;
      return route.fulfill({ json: { receipt: 'partial-receipt', revision: 1 } });
    }
    return route.fulfill({
      json: { revision: 0, configured: false, connection: null, repository: null, check: null },
    });
  });
  await page.route('**/rest/v1/released_results*', (r) => r.fulfill({ json: null }));
  await page.route('**/rest/v1/rpc/assessment_state', (r) =>
    r.fulfill({ json: { payload: { answers: {} } } }),
  );
  await page.goto('/ieee-git-lab/tests/browser-fixtures/task2-harness.html');
  await expect(
    page.getByText('GitHub sign-in is being configured. Theory and partial submission still work.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect GitHub', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Review & Submit', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit Task 2', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submission accepted' })).toBeVisible();
  expect(submitted).toBe(true);
});
test('Task 2 detects the connected student fork without installation or manual repository fields', async ({
  page,
}) => {
  let repository: any = null;
  await page.route('**/functions/v1/github-task2', (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'check') {
      expect(body).not.toHaveProperty('fullName');
      expect(body).not.toHaveProperty('installationId');
      repository = {
        full_name: 'isolated-student/ieee-nub-git-task2-starter',
        repository_id: 200,
        status: 'verified',
      };
      return route.fulfill({ json: { revision: 1 } });
    }
    return route.fulfill({
      json: {
        revision: repository ? 1 : 0,
        configured: true,
        connection: { login: 'isolated-student', githubId: 100, revoked: false, authorized: true },
        repository,
        check: null,
      },
    });
  });
  await page.goto('/ieee-git-lab/tests/browser-fixtures/task2-harness.html');
  await expect(page.getByRole('button', { name: 'Find My Fork & Check' })).toBeEnabled();
  await expect(page.getByText('Personal fork (owner/repository)')).toHaveCount(0);
  await page.getByRole('button', { name: 'Find My Fork & Check' }).click();
  await expect(page.getByText('Found fork:')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check My Work' })).toBeEnabled();
});
test('Task 2 refuses to advance a stale tab to a newer revision without reloading its answers', async ({
  page,
}) => {
  await page.route('**/functions/v1/github-task2', (r) =>
    r.fulfill({
      json: { revision: 2, configured: true, connection: null, repository: null, check: null },
    }),
  );
  await page.goto('/ieee-git-lab/tests/browser-fixtures/task2-harness.html');
  await expect(page.getByRole('alert')).toContainText('Checkpoint conflict');
  await expect(page.getByRole('button', { name: 'Check My Work', exact: true })).toBeDisabled();
});
test('Task 2 restores accepted answers when another tab finalized while this page was loading', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'task2-answers:synthetic-student:10000000-0000-4000-8000-000000000011',
      JSON.stringify({
        revision: 1,
        answers: { 't2-q1': 'Both branches changed the same lines differently' },
      }),
    ),
  );
  await page.route('**/functions/v1/github-task2', (r) =>
    r.fulfill({
      json: {
        revision: 1,
        receipt: 'other-tab-receipt',
        configured: true,
        connection: null,
        repository: null,
        check: null,
      },
    }),
  );
  await page.route('**/rest/v1/rpc/assessment_state', (r) =>
    r.fulfill({ json: { payload: { answers: { 't2-q1': 'GitHub is offline' } } } }),
  );
  await page.route('**/rest/v1/released_results*', (r) => r.fulfill({ json: null }));
  await page.goto('/ieee-git-lab/tests/browser-fixtures/task2-harness.html');
  await expect(page.getByRole('heading', { name: 'Submission accepted' })).toBeVisible();
  await page.getByRole('link', { name: 'Theory', exact: true }).click();
  await expect(page.getByLabel('GitHub is offline', { exact: true })).toBeChecked();
  await expect(page.getByLabel('GitHub is offline', { exact: true })).toBeDisabled();
});
