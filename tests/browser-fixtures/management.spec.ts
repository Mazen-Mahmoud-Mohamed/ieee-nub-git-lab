import { createServer, type Server } from 'node:http';
import { handleMaterial } from '../../supabase/functions/learning-material/handler';
import { verifyAssessment } from '../../src/features/assessments/verify';
import { pptxBytes } from '../helpers/presentation';
import { PPTX_MIME } from '../../src/features/learning/materials';
import { readFile } from 'node:fs/promises';
import { test, expect, devices, type Page } from '@playwright/test';
import { managementDatabase, ADMIN, TEACHER, STUDENT } from '../helpers/managementDatabase';
import { blankDefinition } from '../../src/features/assessments/model';
let h: Awaited<ReturnType<typeof managementDatabase>>;
let uploadServer: Server;
let uploadedObjects: Map<string, Uint8Array>;
test.beforeEach(async () => {
  h = await managementDatabase();
  uploadedObjects = new Map();
  uploadServer = createServer(async (req, res) => {
    try {
      if (
        req.method === 'GET' &&
        req.url?.startsWith('/storage/v1/object/sign/learning-presentations/')
      ) {
        const path = new URL(req.url, 'http://127.0.0.1').pathname.split(
          '/learning-presentations/',
        )[1];
        if (
          !(await h.rpc(null, 'can_read_learning_material', { p_path: path })) ||
          !uploadedObjects.has(path)
        ) {
          res.writeHead(403);
          res.end('Published material unavailable');
          return;
        }
        res.writeHead(200, {
          'Content-Type': PPTX_MIME,
          'Content-Disposition': 'attachment; filename="Slides.pptx"',
        });
        res.end(Buffer.from(uploadedObjects.get(path)!));
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      const encoded = (headers.get('Authorization') || '').split('.')[1];
      const actor = encoded
        ? JSON.parse(Buffer.from(encoded, 'base64url').toString()).sub
        : STUDENT;
      const response = await handleMaterial(
        new Request('http://127.0.0.1/' + (req.url || ''), {
          method: req.method,
          headers,
          ...(req.method !== 'OPTIONS' ? { body: new Uint8Array(Buffer.concat(chunks)) } : {}),
        }),
        'http://127.0.0.1:5174',
        materialServices(actor),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(await response.text());
    } catch {
      res.writeHead(500);
      res.end('Local upload fixture failed');
    }
  });
  await new Promise<void>((resolve, reject) => {
    uploadServer.once('error', reject);
    uploadServer.listen(54321, '127.0.0.1', resolve);
  });
});
test.afterEach(async () => {
  await new Promise<void>((resolve) => uploadServer?.close(() => resolve()));
  await h?.db.close();
});
function materialServices(
  actor: string,
): import('../../supabase/functions/learning-material/handler').UploadServices {
  return {
    authorize: async () => ((await h.rpc(actor, 'is_instructor')) ? actor : null),
    upload: async (path, bytes) => {
      uploadedObjects.set(path, new Uint8Array(bytes));
      await h.db.query(
        "insert into storage.objects(bucket_id,name)values('learning-presentations',$1)",
        [path],
      );
    },
    register: async (user, id, item, name, size) => {
      await h.db.transaction(async (tx) => {
        await tx.exec('set local role service_role');
        await tx.query("select set_config('request.jwt.claim.role','service_role',true)");
        await tx.query('select public.register_learning_material($1,$2,$3,$4,$5)', [
          user,
          id,
          item,
          name,
          size,
        ]);
      });
    },
    remove: async (path) => {
      await h.db.query('delete from storage.objects where name=$1', [path]);
    },
  };
}
async function backend(page: Page, actor = ADMIN) {
  const user = {
    id: actor,
    email: actor === STUDENT ? 'student@example.test' : 'admin@example.test',
    email_confirmed_at: new Date().toISOString(),
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'email' },
    user_metadata: {},
  };
  const token =
    Buffer.from('{}').toString('base64url') +
    '.' +
    Buffer.from(
      JSON.stringify({
        sub: actor,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'authenticated',
      }),
    ).toString('base64url') +
    '.test-signature';
  await page.context().route(
    (url) =>
      url.origin === 'http://127.0.0.1:54321' &&
      url.pathname !== '/functions/v1/learning-material' &&
      !(url.pathname.startsWith('/storage/v1/object/sign/') && url.searchParams.has('token')),
    async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        body =
          req.method() === 'POST' && req.headers()['content-type']?.includes('application/json')
            ? req.postDataJSON() || {}
            : {};
      try {
        if (u.pathname.startsWith('/storage/v1/object/sign/learning-presentations/')) {
          const path = u.pathname.split('/learning-presentations/')[1];
          if (!(await h.rpc(actor, 'can_read_learning_material', { p_path: path })))
            throw Error('Material access denied');
          if (req.method() === 'POST')
            await route.fulfill({
              json: {
                signedURL:
                  '/object/sign/learning-presentations/' + path + '?token=synthetic-local-only',
              },
            });
          else
            await route.fulfill({
              body: Buffer.from(uploadedObjects.get(path) || pptxBytes()),
              contentType: PPTX_MIME,
              headers: { 'Content-Disposition': 'attachment; filename="Slides.pptx"' },
            });
          return;
        }
        if (u.pathname === '/functions/v1/assessment-attempt') {
          const context = await h.db.transaction(async (tx) => {
            await tx.exec('set local role service_role');
            return (
              await tx.query<any>(
                'select public.assessment_verification_context($1,$2) as result',
                [body.attemptId, actor],
              )
            ).rows[0].result;
          });
          const verified = await verifyAssessment(
            context.definition,
            body,
            context.identity,
            context.keys,
          );
          const result = await h.db.transaction(async (tx) => {
            await tx.exec('set local role service_role');
            return (
              await tx.query<any>(
                'select public.accept_assessment_checkpoint($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result',
                [
                  actor,
                  body.attemptId,
                  body.revision,
                  JSON.stringify(verified.payload),
                  JSON.stringify(verified.outcomes),
                  JSON.stringify(verified.grades),
                  verified.practicalScore,
                  verified.objectiveScore,
                  body.action === 'submit',
                  body.idempotencyKey,
                ],
              )
            ).rows[0].result;
          });
          await route.fulfill({ json: result });
          return;
        }
        let result: any = [];
        if (u.pathname === '/auth/v1/token')
          result = {
            access_token: token,
            refresh_token: 'local-test',
            expires_in: 3600,
            token_type: 'bearer',
            user,
          };
        else if (u.pathname === '/auth/v1/user') result = user;
        else if (u.pathname.includes('/rpc/'))
          result = await h.rpc(actor, u.pathname.split('/rpc/')[1], body);
        else if (u.pathname === '/rest/v1/profiles')
          result = (await h.asUser(actor, 'select * from public.profiles where id=$1', [actor]))
            .rows[0];
        else if (u.pathname === '/rest/v1/assessment_drafts')
          result = (
            await h.asUser(
              actor,
              'select document from public.assessment_drafts where assessment_id=$1',
              [u.searchParams.get('assessment_id')?.slice(3)],
            )
          ).rows[0];
        else if (u.pathname === '/rest/v1/assessment_courses')
          result =
            (
              await h.asUser(
                actor,
                'select course_id from public.assessment_courses where assessment_id=$1',
                [u.searchParams.get('assessment_id')?.slice(3)],
              )
            ).rows[0] || null;
        else if (u.pathname === '/rest/v1/question_bank')
          result = (await h.asUser(actor, 'select * from public.question_bank')).rows;
        else if (u.pathname === '/rest/v1/assessment_versions') {
          const id = u.searchParams.get('assessment_id')?.slice(3),
            version = u.searchParams.get('version')?.slice(3);
          const rows = (
            await h.asUser(
              actor,
              'select * from public.assessment_versions where ($1::uuid is null or assessment_id=$1) and ($2::int is null or version=$2)',
              [id || null, version || null],
            )
          ).rows;
          result = req.headers().accept?.includes('application/vnd.pgrst.object+json')
            ? rows[0]
            : rows;
        } else if (u.pathname === '/rest/v1/attempts')
          result = (
            await h.asUser(actor, 'select * from public.attempts where student_id=$1', [actor])
          ).rows;
        else if (u.pathname === '/rest/v1/released_results')
          result = (await h.asUser(actor, 'select * from public.released_results')).rows;
        else if (u.pathname === '/rest/v1/assignments') {
          const id = u.searchParams.get('id')?.slice(3);
          const rows = (
            await h.asUser(
              actor,
              'select * from public.assignments where ($1::uuid is null or id=$1)',
              [id || null],
            )
          ).rows;
          result = req.headers().accept?.includes('application/vnd.pgrst.object+json')
            ? rows[0]
            : rows;
        }
        await route.fulfill({ json: result });
      } catch (error) {
        await route.fulfill({
          status: 400,
          json: { message: error instanceof Error ? error.message : String(error), code: 'P0001' },
        });
      }
    },
  );
  await page.goto('/ieee-git-lab/#/auth');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('IsolatedLocalFixturePassword');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Welcome back, / })).toBeVisible();
  await expect(page).toHaveURL(/#\/dashboard$/);
}
async function draft(title: string) {
  return h.rpc(TEACHER, 'save_assessment', {
    p_id: null,
    p_document: { ...blankDefinition(), title },
    p_publish: false,
  });
}
async function confirm(page: Page, phrase: string) {
  const dialog = page.getByRole('alertdialog');
  await dialog.getByLabel('Reason (required)').fill('Isolated UI management check');
  await dialog.getByLabel('Type ' + phrase + ' to confirm').fill(phrase);
  await dialog.getByRole('button', { name: /^Confirm / }).click();
  await expect(dialog).toHaveCount(0);
}
test('real database backs bulk archive, Trash, typed deletion, empty states and retained activity', async ({
  page,
}) => {
  const first = await draft('Admin UI draft one');
  await draft('Admin UI draft two');
  await backend(page);
  await page.goto('/ieee-git-lab/#/instructor/records');
  for (const name of ['Admin UI draft one', 'Admin UI draft two'])
    await page.getByRole('checkbox', { name: 'Select ' + name, exact: true }).check();
  await page.getByRole('button', { name: 'Archive selected (2)', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('2 records');
  await expect(page.getByRole('button', { name: 'Confirm Archive', exact: true })).toBeDisabled();
  await confirm(page, 'ARCHIVE 2');
  await page.getByRole('combobox', { name: 'Show records', exact: true }).selectOption('archived');
  const row = page
    .locator('.managed-row')
    .filter({ has: page.getByText('Admin UI draft one', { exact: true }) });
  await row.getByRole('button', { name: 'Manage record', exact: true }).click();
  await row.getByRole('button', { name: 'Move to Trash', exact: true }).click();
  await confirm(page, 'TRASH 1');
  await page.getByRole('combobox', { name: 'Show records', exact: true }).selectOption('trash');
  await page.getByRole('button', { name: 'Manage record', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/admin-delete-mobile.png', fullPage: true });
  await confirm(page, 'DELETE 1');
  await expect(page.getByText('No records match these filters.', { exact: true })).toBeVisible();
  expect(
    (await h.db.query('select id from public.assignments where id=$1', [first])).rows,
  ).toHaveLength(0);
  await page.goto('/ieee-git-lab/#/instructor/activity');
  await expect(page.getByText('Deleted permanently', { exact: true })).toBeVisible();
  expect(
    (
      await h.db.query(
        "select id from public.admin_activity where record_id=$1 and action='purge'",
        [first],
      )
    ).rows,
  ).toHaveLength(1);
});
test('an instructor publishes a real course, section and lesson and students read only published content', async ({
  page,
  browser,
}) => {
  await backend(page, TEACHER);
  await page.goto('/ieee-git-lab/#/instructor/content');
  for (const [kind, title] of [
    ['course', 'Git course from instructor'],
    ['section', 'First steps'],
    ['lesson', 'أساسيات Git'],
  ]) {
    await page.getByRole('button', { name: 'New ' + kind, exact: true }).click();
    await page.getByLabel('Content title', { exact: true }).fill(title);
    await page
      .getByLabel('Lesson or overview text', { exact: true })
      .fill('Clear learning material.');
    if (kind === 'lesson') {
      await page.getByRole('button', { name: 'Add resource link', exact: true }).click();
      await page.getByLabel('Resource 1 title', { exact: true }).fill('Official Git reference');
      await page.getByLabel('Resource 1 URL', { exact: true }).fill('https://git-scm.com/docs');
    }
    await page.getByRole('button', { name: 'Publish content version', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: kind === 'course' ? title : kind === 'section' ? title : title,
        exact: true,
      }),
    ).toBeVisible();
    if (kind !== 'lesson')
      await page
        .locator('.managed-row')
        .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
        .getByRole('button', { name: 'Open content', exact: true })
        .click();
  }
  const lesson = (
    await h.db.query<{ id: string }>(
      "select id from public.learning_items where title='أساسيات Git'",
    )
  ).rows[0].id;
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  const student = await context.newPage();
  await backend(student, STUDENT);
  await student.goto('/ieee-git-lab/#/learn/' + lesson);
  await expect(student.getByRole('heading', { name: 'أساسيات Git', exact: true })).toHaveAttribute(
    'dir',
    'auto',
  );
  await expect(
    student.getByRole('link', { name: 'Official Git reference ↗', exact: true }),
  ).toHaveAttribute('href', 'https://git-scm.com/docs');
  await student.screenshot({ path: 'test-results/published-course-student.png', fullPage: true });
  await context.close();
});
test('only an explicit data administrator can invalidate; an open student workspace locks without deleting history', async ({
  page,
  browser,
}) => {
  const definition = {
    ...blankDefinition(),
    title: 'Managed student assignment',
    questions: [
      {
        id: 'q',
        prompt: 'Explain Git',
        kind: 'long',
        manual: true,
        points: 5,
        required: true,
        options: [],
      },
    ],
  };
  const id = await h.rpc(TEACHER, 'save_assessment', {
    p_id: null,
    p_document: definition,
    p_publish: true,
  });
  const attempt = (await h.rpc(STUDENT, 'start_assessment', { p_assessment: id })).id;
  const sc = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  const student = await sc.newPage();
  await backend(student, STUDENT);
  await student.goto(`/ieee-git-lab/#/assessments/${id}/attempts/${attempt}/workspace`);
  await expect(student.getByLabel('Terminal command')).toBeEnabled();
  await backend(page);
  await page.goto('/ieee-git-lab/#/instructor/records?kind=attempt');
  await page.getByRole('button', { name: 'Manage record', exact: true }).click();
  await page.getByRole('button', { name: 'Invalidate attempt', exact: true }).click();
  await confirm(page, 'INVALIDATE 1');
  await expect(student.getByLabel('Terminal command')).toBeDisabled({ timeout: 22000 });
  await expect(
    student.getByText('This attempt was invalidated by a data administrator.', { exact: true }),
  ).toBeVisible();
  await student.reload();
  await expect(student.getByLabel('Terminal command')).toBeDisabled();
  const tc = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  const teacher = await tc.newPage();
  await backend(teacher, TEACHER);
  await teacher.goto('/ieee-git-lab/#/instructor/records?kind=attempt');
  await teacher.getByRole('button', { name: 'Manage record', exact: true }).click();
  await expect(
    teacher
      .getByText('Student-record changes require explicit data-administrator permission.', {
        exact: true,
      })
      .last(),
  ).toBeVisible();
  await expect(teacher.getByRole('button', { name: 'Move to Trash', exact: true })).toHaveCount(0);
  expect(
    (await h.db.query('select id from public.attempts where id=$1', [attempt])).rows,
  ).toHaveLength(1);
  await sc.close();
  await tc.close();
});

test('a concurrent admin edit makes a confirmation stale and the UI reports the rejected operation', async ({
  page,
}) => {
  const id = await draft('Stale confirmation draft');
  await backend(page);
  await page.goto('/ieee-git-lab/#/instructor/records');
  const row = page.locator('.managed-row').filter({ hasText: 'Stale confirmation draft' });
  await row.getByRole('button', { name: 'Manage record', exact: true }).click();
  await row.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Archive · 1 record', exact: true }),
  ).toBeFocused();
  await h.rpc(TEACHER, 'save_assessment', {
    p_id: id,
    p_document: { ...blankDefinition(), title: 'Changed by another instructor' },
    p_publish: false,
  });
  await page.getByRole('button', { name: 'Confirm Archive', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Record changed');
  expect((await h.rpc(ADMIN, 'manage_preview', { p_kind: 'assessment', p_id: id })).archived).toBe(
    false,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh records', exact: true }).click();
  await expect(
    page.getByText('Changed by another instructor', { exact: true }).first(),
  ).toBeVisible();
});

test('draft task deletion identifies its scope, supports cancellation and keeps the published version intact', async ({
  page,
}) => {
  const doc = {
    ...blankDefinition(),
    title: 'Protected task history',
    format: 'practical',
    sections: [
      {
        id: 'setup',
        title: 'Setup',
        description: '',
        steps: [],
        tasks: [
          {
            id: 'repository',
            title: 'Create a repository',
            instructions: 'Initialize Git.',
            points: 10,
            bonus: false,
            rules: [{ type: 'repository', branch: 'main' }],
          },
        ],
      },
    ],
  };
  const id = await h.rpc(TEACHER, 'save_assessment', {
    p_id: null,
    p_document: doc,
    p_publish: true,
  });
  await backend(page, TEACHER);
  await page.goto('/ieee-git-lab/#/instructor/assessments/' + id);
  await page.getByRole('button', { name: '2. Tasks', exact: true }).click();
  const remove = page
    .locator('.builder-task')
    .getByRole('button', { name: 'Remove from draft', exact: true });
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Create a repository');
    expect(dialog.message()).toContain('Published versions');
    await dialog.dismiss();
  });
  await remove.click();
  await expect(page.locator('.builder-task')).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.accept());
  await remove.click();
  await expect(page.locator('.builder-task')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved' })).toBeVisible();
  const current = (
    await h.db.query<{ document: any }>(
      'select document from public.assessment_versions where assessment_id=$1',
      [id],
    )
  ).rows[0].document;
  expect(current.sections[0].tasks).toHaveLength(1);
  expect(
    (
      await h.db.query<{ document: any }>(
        'select document from public.assessment_drafts where assessment_id=$1',
        [id],
      )
    ).rows[0].document.sections[0].tasks,
  ).toHaveLength(0);
});

test('mobile learning journey uploads slides, publishes a session, downloads and completes real assessed Git work', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await backend(page, TEACHER);
  const definition = {
    ...blankDefinition(),
    title:
      'Session mobile practice — A long assessment title with Arabic محتوى الدورة and Git history requirements for smartphone students',
    gateTheory: true,
    requireComplete: true,
    projectName: 'Mobile-Git',
    starter: { files: { 'about.txt': '' }, initialize: true, commit: false },
    sections: [
      {
        id: 's',
        title: 'Mobile task',
        description: '',
        steps: [],
        tasks: [
          {
            id: 't',
            title: 'Write and commit about.txt',
            instructions: 'Write Hello mobile in about.txt. Commit it on main.',
            points: 5,
            bonus: false,
            rules: [
              {
                type: 'file',
                path: 'about.txt',
                ref: 'main',
                match: 'exact',
                value: 'Hello mobile',
              },
              { type: 'commits', ref: 'main', min: 1 },
            ],
          },
        ],
      },
    ],
    questions: [
      {
        id: 'q',
        prompt: 'Git keeps history?',
        kind: 'boolean',
        options: ['True', 'False'],
        correctAnswers: ['True'],
        required: true,
        manual: false,
        points: 2,
      },
    ],
  };
  const assessment = await h.rpc(TEACHER, 'save_assessment', {
    p_id: null,
    p_document: definition,
    p_publish: true,
  });
  await page.goto('/ieee-git-lab/#/instructor/content?parent=70000000-0000-4000-8000-000000000002');
  await page.getByRole('button', { name: 'New lesson', exact: true }).click();
  await page.getByLabel('Content title', { exact: true }).fill('Mobile session with slides');
  await page
    .getByLabel('Lesson or overview text')
    .fill('Study the slides and practice on your phone.');
  await page.getByLabel('Session number', { exact: true }).fill('3');
  await page.getByLabel('Display order', { exact: true }).fill('30');
  await page
    .getByLabel('Google Drive video link')
    .fill('https://drive.google.com/open?id=abcdefghij123');
  await page.getByLabel('Related assessment (optional)').selectOption(assessment);
  await page
    .getByLabel(/Upload PowerPoint/)
    .setInputFiles({ name: 'Slides.pptx', mimeType: PPTX_MIME, buffer: Buffer.from(pptxBytes()) });
  await expect(page.getByText(/Uploaded and validated/)).toBeVisible();
  await page.getByRole('button', { name: 'Publish content version', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published. Students' })).toBeVisible();
  const lesson = (
    await h.db.query<{ id: string }>(
      "select id from public.learning_items where title='Mobile session with slides'",
    )
  ).rows[0].id;
  const student = await browser.newPage({
    ...devices[test.info().project.name.includes('iPhone') ? 'iPhone 13' : 'Pixel 7'],
    viewport: { width: 390, height: 844 },
  });
  await backend(student, STUDENT);
  await student.goto('/ieee-git-lab/#/learn/' + lesson);
  await expect(student.locator('h1')).toContainText('Mobile session with slides');
  await expect(
    student.getByRole('heading', { name: 'Mobile session with slides', exact: true }),
  ).toBeVisible();
  for (const width of [320, 390]) {
    await student.setViewportSize({ width, height: 844 });
    expect(
      await student.evaluate(() => document.documentElement.scrollWidth),
      'Published session with a long related assessment title at ' + width + 'px',
    ).toBeLessThanOrEqual(width);
  }
  await expect(student.locator('iframe')).toHaveCount(0);
  await expect(student.getByRole('link', { name: 'Open in Google Drive' })).toHaveAttribute(
    'href',
    'https://drive.google.com/file/d/abcdefghij123/view',
  );
  // Simulate restricted Drive access; never contact an actual external video in this fixture.
  await student.route('https://drive.google.com/**', (r) =>
    r.fulfill({
      status: 403,
      contentType: 'text/html',
      body: '<p>Request access in Google Drive</p>',
    }),
  );
  await student.getByRole('button', { name: 'Load recorded lecture', exact: true }).click();
  await expect(student.getByTitle('Recorded lecture on Google Drive')).toHaveAttribute(
    'src',
    'https://drive.google.com/file/d/abcdefghij123/preview',
  );
  const player = await student.getByTitle('Recorded lecture on Google Drive').boundingBox();
  expect(Math.abs(player!.width / player!.height - 16 / 9)).toBeLessThan(0.03);
  await expect(student.getByRole('link', { name: 'Open in Google Drive' })).toBeVisible();
  // External playback is deliberately not represented as verified by this localhost test.
  await student.screenshot({ path: 'test-results/mobile-learning-session.png', fullPage: true });
  await student.getByRole('button', { name: 'Get presentation links' }).click();
  const download = student.waitForEvent('download');
  await student.getByRole('link', { name: 'Download PowerPoint' }).click();
  const downloaded = await download;
  expect(await readFile((await downloaded.path())!)).toEqual(Buffer.from(pptxBytes()));
  await student.getByRole('link', { name: /Practice What You Learned/ }).click();
  await student
    .getByRole('checkbox', { name: /Save my files, answers and command activity/ })
    .check();
  await student.getByRole('button', { name: 'Start / Continue assignment', exact: true }).click();
  await student.getByRole('tab', { name: 'Files', exact: true }).click();
  await student.getByRole('button', { name: /^about.txt/ }).click();
  await student.getByRole('textbox', { name: 'Text file editor' }).fill('Hello mobile');
  await expect(student.getByText('File saved locally', { exact: true })).toBeVisible();
  await student.getByRole('tab', { name: 'Terminal', exact: true }).click();
  for (const cmd of [
    'git config user.name "Mobile Student"',
    'git config user.email mobile@example.test',
    'git add about.txt',
    'git commit -m "Add mobile introduction"',
  ]) {
    await student.getByLabel('Terminal command').fill(cmd);
    await student.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(student.getByLabel('Terminal command')).toBeEnabled();
  }
  await student.getByRole('tab', { name: 'Task', exact: true }).click();
  await expect(student.getByText('Provisional: 5 / 5 points', { exact: true })).toBeVisible();
  await student.getByRole('link', { name: 'Continue to Questions', exact: true }).click();
  await student.getByRole('radio', { name: 'True', exact: true }).check();
  await student.getByRole('link', { name: 'Review & submit', exact: true }).click();
  await student.getByRole('checkbox', { name: /I confirm this is my own work/ }).check();
  await student.getByRole('button', { name: 'Submit assignment', exact: true }).click();
  await expect(
    student.getByRole('heading', { name: 'Submission received', exact: true }),
  ).toBeVisible();
  const grade = (
    await h.db.query<any>(
      'select * from public.grading_summaries join public.attempts on attempts.id=attempt_id where student_id=$1 and assignment_id=$2',
      [STUDENT, assessment],
    )
  ).rows[0];
  expect(Number(grade.practical_score)).toBe(5);
  expect(Number(grade.theory_score)).toBe(2);
  expect(grade.receipt).toBeTruthy();
  await student.reload();
  await expect(
    student.getByRole('heading', { name: 'Submission received', exact: true }),
  ).toBeVisible();
  await student.screenshot({ path: 'test-results/mobile-session-submission.png', fullPage: true });
  await student.close();
});

test('session editor rejects invalid and failed uploads, confirms replacement, and unpublishes without deleting retained material', async ({
  page,
  browser,
}) => {
  await backend(page, TEACHER);
  const id = await h.rpc(TEACHER, 'manage_learning_save', {
    p_id: null,
    p_kind: 'lesson',
    p_parent: '70000000-0000-4000-8000-000000000002',
    p_revision: null,
    p_document: { title: 'Slides replacement session', body: '', links: [] },
    p_publish: false,
  });
  const open = async () => {
    await page.goto('/ieee-git-lab/#/instructor/content?open=' + id);
    await expect(page.getByLabel('Content title', { exact: true })).toHaveValue(
      'Slides replacement session',
    );
  };
  await open();
  await page.getByLabel('Lesson or overview text').fill('Draft survived reload');
  await page.reload();
  await expect(page.getByLabel('Lesson or overview text')).toHaveValue('Draft survived reload');
  const upload = page.getByLabel(/Upload PowerPoint/);
  await upload.setInputFiles({
    name: 'fake.pptx',
    mimeType: PPTX_MIME,
    buffer: Buffer.from('not a presentation'),
  });
  await expect(page.getByRole('alert')).toContainText(/valid PPTX|supported PPTX|PowerPoint/);
  expect(
    (await h.db.query('select id from public.learning_materials where item_id=$1', [id])).rows,
  ).toHaveLength(0);
  await page.route('**/functions/v1/learning-material', (r) =>
    r.fulfill({ status: 503, json: { error: 'Storage temporarily unavailable' } }),
  );
  await upload.setInputFiles({
    name: 'Slides.pptx',
    mimeType: PPTX_MIME,
    buffer: Buffer.from(pptxBytes()),
  });
  await expect(page.getByRole('alert')).toContainText('Storage temporarily unavailable');
  await page.unroute('**/functions/v1/learning-material');
  await upload.setInputFiles({
    name: 'Original.pptx',
    mimeType: PPTX_MIME,
    buffer: Buffer.from(pptxBytes()),
  });
  await expect(page.getByText(/Uploaded and validated/)).toBeVisible();
  await page.getByRole('button', { name: 'Publish content version', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published. Students' })).toBeVisible();
  const first = (
    await h.db.query<any>(
      'select document from public.learning_versions where item_id=$1 and version=1',
      [id],
    )
  ).rows[0].document.presentation_id;
  await open();
  page.once('dialog', (d) => d.dismiss());
  await upload.setInputFiles({
    name: 'Cancelled.pptx',
    mimeType: PPTX_MIME,
    buffer: Buffer.from(pptxBytes()),
  });
  expect(
    (await h.db.query('select id from public.learning_materials where item_id=$1', [id])).rows,
  ).toHaveLength(1);
  page.once('dialog', (d) => d.accept());
  await upload.setInputFiles({
    name: 'Replacement.pptx',
    mimeType: PPTX_MIME,
    buffer: Buffer.from(pptxBytes()),
  });
  await expect(page.getByText(/Uploaded and validated/)).toBeVisible();
  await page.getByRole('button', { name: 'Publish content version', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await h.db.query('select version from public.learning_versions where item_id=$1', [id]))
          .rows.length,
    )
    .toBe(2);
  expect(
    (
      await h.db.query<any>(
        'select document from public.learning_versions where item_id=$1 and version=1',
        [id],
      )
    ).rows[0].document.presentation_id,
  ).toBe(first);
  expect(
    (await h.db.query('select id from public.learning_materials where item_id=$1', [id])).rows,
  ).toHaveLength(2);
  await open();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Unpublish content', exact: true }).click();
  await expect(
    page.getByText('Content unpublished. Retained versions are unchanged.', { exact: true }),
  ).toBeVisible();
  const student = await browser.newPage();
  await backend(student, STUDENT);
  await student.goto('/ieee-git-lab/#/learn/' + id);
  await expect(student.getByRole('alert')).toContainText('could not be loaded');
  await student.close();
  expect(
    (await h.db.query('select version from public.learning_versions where item_id=$1', [id])).rows,
  ).toHaveLength(2);
});
