import { test, expect } from '@playwright/test';
const state = async (page: import('@playwright/test').Page) =>
  JSON.parse(await page.getByLabel('lab-state').innerText());

test('server restore refreshes the inspected files, identity and answers and locks edits', async ({
  page,
}) => {
  await page.goto('/ieee-git-lab/tests/browser-fixtures/lab-harness.html');
  await expect(page.getByRole('button', { name: 'Restore server evidence' })).toBeEnabled();
  await page.getByRole('button', { name: 'Restore server evidence' }).click();
  await expect(page.getByRole('status', { name: 'queue-status' })).toHaveText(
    'Server evidence restored',
  );
  const restored = await state(page);
  expect(restored.working['a.txt']).toBe('accepted server content');
  expect(restored.config['user.name']).toBe('Restored Student');
  expect(restored.answers.reflection).toBe('accepted answer');
  expect(restored.readOnly).toBe(true);
  await page.getByRole('button', { name: 'Queue rapid operations and capture' }).click();
  await expect(page.getByRole('status', { name: 'queue-status' })).toHaveText('Queue finished');
  expect((await state(page)).working['a.txt']).toBe('accepted server content');
});
test('actual useLab serializes queued edits/Git and captures the finished snapshot', async ({
  page,
}) => {
  await page.goto('/ieee-git-lab/tests/browser-fixtures/lab-harness.html');
  await expect(
    page.getByRole('button', { name: 'Queue rapid operations and capture' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Queue rapid operations and capture' }).click();
  await expect(page.getByRole('status', { name: 'queue-status' })).toHaveText('Queue finished');
  const value = await state(page);
  expect(value.working['a.txt']).toBe('later working version');
  expect(value.commits[0].files['a.txt']).toBe('staged version');
  const captured = JSON.parse(await page.getByLabel('captured-state').innerText());
  expect(
    new TextDecoder().decode(new Uint8Array(captured.snapshot.entries['/Project-A/a.txt'].data)),
  ).toBe('later working version');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Queue rapid operations and capture' }),
  ).toBeEnabled();
  expect((await state(page)).working['a.txt']).toBe('later working version');
});
test('a delayed old inspection cannot replace the new attempt or its persisted state', async ({
  page,
}) => {
  await page.goto('/ieee-git-lab/tests/browser-fixtures/lab-harness.html');
  await expect(page.getByRole('button', { name: 'Delay an inspection' })).toBeEnabled();
  await page.getByRole('button', { name: 'Delay an inspection' }).click();
  await expect.poll(async () => (await state(page)).busy).toBe(true);
  await page.getByRole('button', { name: 'Switch attempt' }).click();
  await expect(page.getByRole('heading', { name: 'Project-B' })).toBeVisible();
  await expect.poll(async () => (await state(page)).ready).toBe(true);
  await page.getByRole('button', { name: 'Release old inspection' }).click();
  await expect(page.getByRole('status', { name: 'queue-status' })).toHaveText(
    'Delayed inspection finished',
  );
  expect((await state(page)).working).toEqual({ 'b.txt': 'starter' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch attempt' })).toBeEnabled();
  expect((await state(page)).working['a.txt']).toBe('late old-attempt value');
  await page.getByRole('button', { name: 'Switch attempt' }).click();
  await expect.poll(async () => (await state(page)).ready).toBe(true);
  expect((await state(page)).working).toEqual({ 'b.txt': 'starter' });
});
