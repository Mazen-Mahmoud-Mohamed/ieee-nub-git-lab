import { test, expect, type Page } from '@playwright/test';
import {
  blankDefinition,
  type Definition,
  type AttemptState,
} from '../../src/features/assessments/model';
const USER = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  E = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const theory = (title: string, type: 'assignment' | 'exam' = 'assignment'): Definition => ({
  ...blankDefinition(type),
  title,
  format: 'theory',
  questions: [
    {
      id: 'q1',
      prompt: 'Explain how Git saves changes.',
      kind: 'long',
      points: 10,
      options: [],
      manual: true,
      required: true,
    },
  ],
});
async function fixture(page: Page, instructor = false, examSeconds = 120) {
  const definitions: Record<string, Definition> = {
    [A]: {
      ...theory('Assignment A'),
      format: 'mixed',
      projectName: 'Project-A',
      starter: { files: { 'a.txt': 'Only Assignment A' }, initialize: true, commit: true },
    },
    [B]: {
      ...theory('Assignment B'),
      format: 'mixed',
      projectName: 'Project-B',
      starter: { files: { 'b.txt': 'Only Assignment B' }, initialize: true, commit: true },
    },
    [E]: theory('Timed Git exam', 'exam'),
  };
  const attempts: Record<string, AttemptState> = {};
  const saved: Record<string, any>[] = [];
  const requests: string[] = [];
  let uploads = 0;
  let profileFaculty = 'engineering';
  let network = true;
  const authUser = {
    id: USER,
    email: 'fixture@example.test',
    role: 'authenticated',
    aud: 'authenticated',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email' },
    user_metadata: {},
  };
  const token = [
    Buffer.from('{}').toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: USER,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'authenticated',
      }),
    ).toString('base64url'),
    'test-signature',
  ].join('.');
  await page.context().route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    requests.push(path);
    const body = request.postDataJSON() || {};
    let response: any = [];
    if (path === '/auth/v1/token')
      response = {
        access_token: token,
        refresh_token: 'fixture-refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user: authUser,
      };
    else if (path === '/auth/v1/user') response = authUser;
    else if (path === '/rest/v1/profiles') {
      if (request.method() === 'POST') profileFaculty = body.faculty;
      response = {
        id: USER,
        full_name: instructor ? 'Fixture Instructor' : 'Fixture Student',
        student_id: 'TEST-001',
        department: 'Engineering',
        faculty: profileFaculty,
        academic_year: '2',
        university: 'Nahda University',
      };
    } else if (path.endsWith('/rpc/is_instructor')) response = instructor;
    else if (path === '/rest/v1/assignments') {
      const records = Object.entries(definitions).map(([id, d]) => ({
        id,
        title: d.title,
        description: d.description,
        type: d.type,
        version: 1,
        published_version: 1,
        visible: true,
        archived: false,
        assessment_drafts: { document: d },
      }));
      response = url.searchParams.has('id')
        ? records.find((r) => 'eq.' + r.id === url.searchParams.get('id'))
        : records;
    } else if (path === '/rest/v1/assessment_versions') {
      const versions = Object.entries(definitions).map(([assessment_id, document]) => ({
        assessment_id,
        version: 1,
        document,
      }));
      response = url.searchParams.has('assessment_id')
        ? versions.find((v) => 'eq.' + v.assessment_id === url.searchParams.get('assessment_id'))
        : versions;
    } else if (path === '/rest/v1/assessment_drafts') {
      const id = url.searchParams.get('assessment_id')?.slice(3);
      response = id ? { document: definitions[id] } : [];
    } else if (path === '/rest/v1/attempts')
      response = Object.values(attempts).map((a) => ({
        ...a,
        profiles: {
          full_name: 'Fixture Student',
          student_id: 'TEST-001',
          department: 'Engineering',
          faculty: profileFaculty,
          academic_year: '2',
        },
        assignments: { title: a.definition.title, type: a.definition.type },
        grading_summaries: [],
      }));
    else if (path === '/rest/v1/released_results')
      response = url.searchParams.has('attempt_id') ? null : [];
    else if (path.endsWith('/rpc/start_assessment')) {
      let attempt = Object.values(attempts).find((a) => a.assignment_id === body.p_assessment);
      if (!attempt) {
        const d = definitions[body.p_assessment];
        const id = crypto.randomUUID();
        attempt = {
          id,
          assignment_id: body.p_assessment,
          assignment_version: 1,
          status: 'in_progress',
          receipt: null,
          created_at: new Date().toISOString(),
          deadline_at:
            d.type === 'exam' ? new Date(Date.now() + examSeconds * 1000).toISOString() : null,
          checkpoint_revision: 0,
          auto_submitted: false,
          server_now: new Date().toISOString(),
          definition: d,
        };
        attempts[id] = attempt;
      }
      response = { id: attempt.id };
    } else if (path.endsWith('/rpc/assessment_state')) {
      const a = attempts[body.p_attempt];
      if (a.deadline_at && Date.parse(a.deadline_at) <= Date.now() && a.status === 'in_progress') {
        a.status = 'expired';
        a.auto_submitted = true;
        a.receipt = crypto.randomUUID();
      }
      response = { ...a, server_now: new Date().toISOString() };
    } else if (path === '/functions/v1/assessment-attempt') {
      if (!network) {
        await route.abort('failed');
        return;
      }
      uploads++;
      const a = attempts[body.attemptId];
      if (body.revision !== a.checkpoint_revision) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Checkpoint conflict: another tab has saved newer work' }),
        });
        return;
      }
      a.payload = {
        snapshot: body.snapshot,
        answers: body.answers,
        events: body.events,
        cwd: body.cwd,
        config: body.config,
      };
      a.checkpoint_revision++;
      if (body.action === 'submit') {
        a.status = 'pending_review';
        a.receipt = crypto.randomUUID();
      }
      response = { revision: a.checkpoint_revision, receipt: a.receipt, status: a.status };
    } else if (path.endsWith('/rpc/save_assessment')) {
      saved.push(body);
      const id = body.p_id || crypto.randomUUID();
      definitions[id] = body.p_document;
      response = id;
    } else if (
      path.endsWith('/rpc/set_assessment_visibility') ||
      path.endsWith('/rpc/grade_assessment')
    )
      response = null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
  async function login() {
    await page.goto('/#/auth');
    await page.getByLabel('Email address').fill('fixture@example.test');
    await page.getByLabel('Password', { exact: true }).fill('SyntheticFixturePassword');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
  }
  async function start(id: string) {
    await page.goto('/#/assessments/' + id);
    await page.getByRole('checkbox').check();
    await page
      .getByRole('button', {
        name: id === E ? 'Start Exam' : 'Start / Continue assignment',
        exact: true,
      })
      .click();
    await expect(page.getByLabel('Assessment session')).toBeVisible();
  }
  return {
    login,
    start,
    attempts,
    saved,
    requests,
    faculty: () => profileFaculty,
    uploads: () => uploads,
    definitions,
    network: (enabled: boolean) => {
      network = enabled;
    },
  };
}
test('profile faculty choices and saved values use the corrected names', async ({ page }) => {
  const api = await fixture(page);
  await api.login();
  await page.goto('/#/profile');
  const faculty = page.getByRole('group', { name: 'Faculty', exact: true });
  await expect(faculty.getByRole('radio')).toHaveCount(2);
  await expect(faculty.getByRole('radio', { name: 'Engineering', exact: true })).toHaveAttribute(
    'value',
    'engineering',
  );
  await faculty.getByRole('radio', { name: 'Computer Science', exact: true }).check();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  expect(api.faculty()).toBe('computer_science');
  await page.goto('/#/profile');
  await expect(page.getByRole('radio', { name: 'Computer Science', exact: true })).toBeChecked();
});
test('instructor faculty filter has only canonical faculties and an all option', async ({
  page,
}) => {
  const api = await fixture(page, true);
  await api.login();
  await page.goto('/#/instructor');
  const filter = page.getByRole('combobox', { name: 'Faculty filter', exact: true });
  await expect(filter.getByRole('option')).toHaveText([
    'All faculties',
    'Engineering',
    'Computer Science',
  ]);
  await filter.selectOption('computer_science');
  await expect(filter).toHaveValue('computer_science');
});
test('student sees published assignments/exams and each workspace stays isolated', async ({
  page,
}) => {
  const api = await fixture(page);
  await api.login();
  await expect(page.getByRole('heading', { name: 'Assignments', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Exams', exact: true })).toBeVisible();
  await api.start(A);
  await expect(page.getByRole('button', { name: 'a.txt', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'b.txt', exact: true })).toHaveCount(0);
  await api.start(B);
  await expect(page.getByRole('button', { name: 'b.txt', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'a.txt', exact: true })).toHaveCount(0);
  expect(api.uploads()).toBe(0);
});
test('instructor can create and publish a timed exam with an objective private key', async ({
  page,
}) => {
  const api = await fixture(page, true);
  await api.login();
  await page.goto('/#/instructor/assessments/new');
  await page.getByLabel('Title', { exact: true }).fill('New Git checkpoint exam');
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('exam');
  await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('theory');
  await page.getByLabel('Duration (minutes)').fill('20');
  await page.getByLabel('Allowed attempts').fill('2');
  await page.getByRole('button', { name: 'Add question', exact: true }).click();
  await page.getByLabel('Question text').fill('Is git commit local?');
  await page.getByRole('combobox', { name: 'Question type', exact: true }).selectOption('boolean');
  await page.getByRole('radio', { name: 'True', exact: true }).check();
  await page.getByRole('button', { name: 'Publish new version' }).click();
  await expect(page.getByRole('status')).toContainText('Published');
  expect(api.saved[0].p_document.durationMinutes).toBe(20);
  expect(api.saved[0].p_document.questions[0].correctAnswers).toEqual(['True']);
  expect(api.saved[0].p_publish).toBe(true);
});
test('timer survives refresh and browser clock changes; consent gates autosave and expiry locks inputs', async ({
  page,
}) => {
  const api = await fixture(page, false, 8);
  await api.login();
  await api.start(E);
  const attempt = Object.values(api.attempts)[0];
  const deadline = attempt.deadline_at;
  await expect(page.getByRole('timer')).toContainText('remaining');
  await page.getByLabel('Your response').fill('My saved explanation');
  expect(api.uploads()).toBe(0);
  await page.getByRole('button', { name: 'Enable server autosave for this attempt' }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Server autosave accepted' }),
  ).toBeVisible();
  expect(api.uploads()).toBe(1);
  await page.getByLabel('Your response').fill('Unsynced later changes');
  await page.reload();
  await expect(page.getByRole('timer')).toBeVisible();
  expect(Object.values(api.attempts)[0].deadline_at).toBe(deadline);
  await page.evaluate(() => {
    Date.now = () => 0;
  });
  await expect(page.getByLabel('Your response')).toHaveAttribute('readonly', '', {
    timeout: 15000,
  });
  await expect(page.getByRole('status').filter({ hasText: 'Auto-submitted' })).toBeVisible();
  expect(api.attempts[attempt.id].auto_submitted).toBe(true);
  await expect(page.getByLabel('Your response')).toHaveValue('My saved explanation');
});
test('network interruption retains local answers and retries the accepted server revision', async ({
  page,
}) => {
  const api = await fixture(page);
  await api.login();
  await api.start(E);
  await page.getByRole('button', { name: 'Enable server autosave for this attempt' }).click();
  await page.getByLabel('Your response').fill('First accepted answer');
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Server autosave accepted' }),
  ).toBeVisible();
  api.network(false);
  await page.getByLabel('Your response').fill('Work during interruption');
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Failed');
  await expect(page.getByLabel('Your response')).toHaveValue('Work during interruption');
  api.network(true);
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Server autosave accepted' }),
  ).toBeVisible();
  expect(Object.values(api.attempts)[0].payload?.answers.q1).toBe('Work during interruption');
});
test('a stale second tab cannot silently overwrite a newer server checkpoint', async ({
  page,
  context,
}) => {
  const api = await fixture(page);
  await api.login();
  await api.start(E);
  await page.getByRole('button', { name: 'Enable server autosave for this attempt' }).click();
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByLabel('Your response')).toBeVisible();
  await other.getByRole('button', { name: 'Enable server autosave for this attempt' }).click();
  await other.getByLabel('Your response').fill('Stale tab answer');
  await page.getByLabel('Your response').fill('First tab accepted answer');
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Server autosave accepted' }),
  ).toBeVisible();
  await other.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('conflict');
  await expect(other.getByLabel('Your response')).toHaveAttribute('readonly', '');
  expect(Object.values(api.attempts)[0].payload?.answers.q1).toBe('First tab accepted answer');
});

test('manual exam submission returns a receipt and the exact accepted answers', async ({
  page,
}) => {
  const api = await fixture(page);
  await api.login();
  await api.start(E);
  await page
    .getByLabel('Your response')
    .fill('My final explanation of staged snapshots and local commits.');
  await page.goto(page.url().replace('/theory', '/review'));
  await page.getByRole('checkbox', { name: /I confirm this is my own work/ }).check();
  await page.getByRole('button', { name: 'Submit Exam', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Submission received', exact: true }),
  ).toBeVisible();
  const attempt = Object.values(api.attempts)[0];
  expect(attempt.receipt).toBeTruthy();
  expect(attempt.payload?.answers.q1).toBe(
    'My final explanation of staged snapshots and local commits.',
  );
  await expect(page.getByText('Results are pending instructor review or release.')).toBeVisible();
});
