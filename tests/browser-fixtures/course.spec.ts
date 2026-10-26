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
async function fixture(
  page: Page,
  instructor = false,
  examSeconds = 120,
  options: { newUser?: boolean; cancel?: boolean; invalidCode?: boolean } = {},
) {
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
  let profileExists = !options.newUser;
  const authCalls: Array<{ path: string; body: any; query: string }> = [];
  let profileFaculty = 'engineering';
  let phone: string | null = '+201012345678';
  let fullName = instructor ? 'Fixture Instructor' : 'Fixture Student';
  let network = true;
  const authUser = {
    id: USER,
    email: 'fixture@example.test',
    role: 'authenticated',
    aud: 'authenticated',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email' },
    user_metadata: { full_name: 'Google Student' },
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
    if (path.startsWith('/auth/')) authCalls.push({ path, body, query: url.search });
    if (path === '/auth/v1/authorize') {
      const callback = new URL(url.searchParams.get('redirect_to')!);
      if (options.cancel) callback.searchParams.set('error', 'access_denied');
      else callback.searchParams.set('code', 'fixture-code');
      await route.fulfill({ status: 302, headers: { location: callback.href } });
      return;
    }
    if (path === '/auth/v1/signup') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: authUser, session: null }),
      });
      return;
    }
    if (path === '/auth/v1/token' && options.invalidCode) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid fixture code' }),
      });
      return;
    }
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
      response = profileExists
        ? {
            id: USER,
            full_name: fullName,
            phone,
            student_id: 'TEST-001',
            department: 'Engineering',
            faculty: profileFaculty,
            academic_year: '2',
            university: 'Nahda University',
          }
        : null;
    } else if (path.endsWith('/rpc/save_student_profile')) {
      profileExists = true;
      profileFaculty = body.p_faculty;
      phone = body.p_phone;
      fullName = body.p_full_name;
      response = { id: USER, full_name: fullName, phone, faculty: profileFaculty };
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
    } else if (path === '/rest/v1/attempts' || path.endsWith('/rpc/instructor_submissions'))
      response = Object.values(attempts).map((a) => ({
        ...a,
        profiles: {
          full_name: fullName,
          email: authUser.email,
          phone,
          student_id: 'TEST-001',
          department: 'Engineering',
          faculty: profileFaculty,
          academic_year: '2',
        },
        assignments: { title: a.definition.title, type: a.definition.type },
        grading_summaries:
          a.status === 'in_progress'
            ? null
            : {
                id: '99999999-9999-4999-8999-999999999999',
                attempt_id: a.id,
                practical_score: 0,
                theory_score: null,
                released: false,
                feedback: '',
              },
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
    await page.goto('/ieee-git-lab/#/auth');
    await page.getByLabel('Email address').fill('fixture@example.test');
    await page.getByLabel('Password', { exact: true }).fill('SyntheticFixturePassword');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
  }
  async function start(id: string) {
    await page.goto('/ieee-git-lab/#/assessments/' + id);
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
    incomplete: () => {
      phone = null;
    },
    user: authUser,
    authCalls,
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
  await page.goto('/ieee-git-lab/#/profile');
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
  await page.goto('/ieee-git-lab/#/profile');
  await expect(page.getByRole('radio', { name: 'Computer Science', exact: true })).toBeChecked();
});
test('instructor faculty filter has only canonical faculties and an all option', async ({
  page,
}) => {
  const api = await fixture(page, true);
  await api.login();
  await page.goto('/ieee-git-lab/#/instructor');
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
  await page.goto('/ieee-git-lab/#/instructor/assessments/new');
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

test('first Google login completes only missing profile fields and restores the assessment destination', async ({
  page,
}) => {
  const api = await fixture(page, false, 120, { newUser: true });
  await page.goto('/ieee-git-lab/#/assessments/' + E);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible();
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Google Student');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await page.screenshot({
    path: 'test-results/fixtures/google-profile-mobile.png',
    fullPage: true,
  });
  await expect(page.getByLabel('Email address')).toHaveValue('fixture@example.test');
  await expect(page.getByLabel('Email address')).toHaveJSProperty('readOnly', true);
  await expect(page.getByText('Verified account email.', { exact: false })).toBeVisible();
  await page.getByLabel('Phone number').fill('010123');
  await page.getByRole('radio', { name: 'Computer Science', exact: true }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Egyptian mobile');
  await page.getByLabel('Phone number').fill('01012345678');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page).toHaveURL(new RegExp('/assessments/' + E + '$'));
  expect(api.authCalls.filter((r) => r.path === '/auth/v1/token')).toHaveLength(1);
  expect(api.authCalls.find((r) => r.path === '/auth/v1/token')?.body.auth_code).toBe(
    'fixture-code',
  );
  expect(api.faculty()).toBe('computer_science');
  await page.goto('/ieee-git-lab/#/dashboard');
  await expect(page.getByRole('heading', { name: /Welcome back, Google/ })).toBeVisible();
});

test('returning Google user resumes the same active exam after signing out and back in', async ({
  page,
}) => {
  const api = await fixture(page);
  await api.login();
  await api.start(E);
  const attempt = Object.values(api.attempts)[0];
  const url = page.url();
  const deadline = attempt.deadline_at;
  await page.getByLabel('Your response').fill('Local answer survives authentication');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await page.goto(url);
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page).toHaveURL(url);
  expect(Object.keys(api.attempts)).toHaveLength(1);
  expect(attempt.deadline_at).toBe(deadline);
  await expect(page.getByLabel('Your response')).toHaveValue(
    'Local answer survives authentication',
  );
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/fixtures/exam-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('timer')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('cancelled and incomplete OAuth returns explain recovery without retaining callback parameters', async ({
  page,
}) => {
  await fixture(page, false, 120, { cancel: true });
  await page.goto('/ieee-git-lab/#/auth');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('alert')).toContainText('cancelled');
  await expect(page).not.toHaveURL(/error=|auth_return/);
  await page.goto('/ieee-git-lab/?auth_return=1#/auth');
  await expect(page.getByRole('alert')).toContainText('incomplete');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});

test('email registration collects a name and requests verified email confirmation', async ({
  page,
}) => {
  const api = await fixture(page);
  await page.goto('/ieee-git-lab/#/auth');
  await page
    .getByRole('button', { name: 'New to the lab? Create an account', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await page.getByLabel('Full name', { exact: true }).fill('Email Student');
  await page.getByLabel('Email address').fill('student@example.test');
  await page.getByLabel('Password', { exact: true }).fill('SyntheticFixturePassword');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  expect(api.authCalls.find((r) => r.path === '/auth/v1/signup')?.body.data.full_name).toBe(
    'Email Student',
  );
});

test('instructor sees authenticated contact details and can search by email', async ({ page }) => {
  const api = await fixture(page, true);
  await api.login();
  await api.start(E);
  await page.goto('/ieee-git-lab/#/instructor');
  await expect(page.getByRole('cell', { name: 'fixture@example.test', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '+201012345678', exact: true })).toBeVisible();
  await page.getByLabel('Search student name, email or ID').fill('fixture@example.test');
  await expect(page.getByRole('button', { name: 'Inspect attempt →' })).toHaveCount(1);
});

test('expired or invalid OAuth code allows recovery without a session', async ({ page }) => {
  await fixture(page, false, 120, { invalidCode: true });
  await page.goto('/ieee-git-lab/?auth_return=1&code=expired#/auth');
  await expect(page.getByRole('alert')).toContainText('expired or belongs to a different browser');
  await expect(page).not.toHaveURL(/code=|auth_return/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});

test('authorized instructor access remains available without a student profile', async ({
  page,
}) => {
  await fixture(page, true, 120, { newUser: true });
  await page.goto('/ieee-git-lab/#/instructor');
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: 'A clearer view of learning.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toHaveCount(0);
});

test('instructor review preserves the attempt ID when the grading summary has its own ID', async ({
  page,
}) => {
  const api = await fixture(page, true);
  await api.login();
  await api.start(E);
  await page.getByLabel('Your response').fill('Staging selects the next committed snapshot.');
  await page.goto(page.url().replace('/theory', '/review'));
  await page.getByRole('checkbox', { name: /I confirm this is my own work/ }).check();
  await page.getByRole('button', { name: 'Submit Exam', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Submission received', exact: true }),
  ).toBeVisible();
  await page.goto('/ieee-git-lab/#/instructor');
  await page.getByRole('button', { name: 'Inspect attempt →' }).click();
  await expect(
    page.getByRole('heading', { name: 'Explain how Git saves changes.', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Points (0–10)', { exact: true })).toBeVisible();
});
