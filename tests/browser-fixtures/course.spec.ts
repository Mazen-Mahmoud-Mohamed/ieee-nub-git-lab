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
  options: {
    newUser?: boolean;
    cancel?: boolean;
    invalidCode?: boolean;
    restartDenied?: boolean;
    restartLostReply?: boolean;
  } = {},
) {
  page.on('dialog', (dialog) => void dialog.accept());
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
  const helpRequests: Record<string, any> = {};
  let uploads = 0;
  let restartReplyLost = false;
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
    } else if (
      path === '/rest/v1/attempts' ||
      path.endsWith('/rpc/instructor_submissions') ||
      path.endsWith('/rpc/instructor_attempts')
    )
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
    else if (path.endsWith('/rpc/instructor_overview'))
      response = {
        students: 1,
        started_students: Object.values(attempts).length ? 1 : 0,
        submitted_assignments: 0,
        submitted_exams: 0,
        in_progress: Object.values(attempts).length,
        pending_reviews: 0,
        graded: 0,
        published_assignments: 2,
        published_exams: 1,
      };
    else if (path.endsWith('/rpc/instructor_students'))
      response = {
        total: 1,
        rows: [
          {
            id: USER,
            full_name: fullName,
            email: authUser.email,
            phone,
            faculty: profileFaculty,
            student_id: 'TEST-001',
            created_at: new Date().toISOString(),
            started: Object.values(attempts).length,
            submissions: 0,
          },
        ],
      };
    else if (path.endsWith('/rpc/instructor_review_context'))
      response = {
        keys: { q1: { explanation: 'Explain the saved history and staging area.' } },
        draft: null,
      };
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
    } else if (path.endsWith('/rpc/attempt_recovery_state')) {
      const a = attempts[body.p_attempt];
      const request = Object.values(helpRequests).find((r) => r.attempt_id === a.id) || null;
      const code =
        a.status === 'restarted'
          ? 'restarted'
          : a.status !== 'in_progress'
            ? 'finalized'
            : a.definition.type === 'exam'
              ? 'exam'
              : options.restartDenied
                ? 'attempt_limit'
                : 'available';
      response = {
        code,
        canRestart: code === 'available',
        canRequest: code === 'attempt_limit' && !request,
        request,
        successor: a.restarted_to,
      };
    } else if (path.endsWith('/rpc/request_attempt_help')) {
      let r = Object.values(helpRequests).find((r) => r.attempt_id === body.p_attempt);
      if (!r) {
        const a = attempts[body.p_attempt];
        r = {
          id: crypto.randomUUID(),
          attempt_id: a.id,
          assignment_id: a.assignment_id,
          full_name: fullName,
          email: authUser.email,
          title: a.definition.title,
          message: body.p_message || 'I need help starting over.',
          status: 'pending',
          reply: '',
          attempt_number: 1,
          created_at: new Date().toISOString(),
          recovery_code: 'attempt_limit',
        };
        helpRequests[r.id] = r;
      }
      response = r;
    } else if (path.endsWith('/rpc/instructor_help_requests')) {
      const list = Object.values(helpRequests).filter(
        (r) => !body.p_status || r.status === body.p_status,
      );
      response = {
        total: list.length,
        rows: list.slice(body.p_offset || 0, (body.p_offset || 0) + (body.p_limit || 25)),
      };
    } else if (path.endsWith('/rpc/resolve_attempt_help')) {
      const r = helpRequests[body.p_request];
      r.status = body.p_approve ? 'approved' : 'rejected';
      r.reply = body.p_reply;
      if (body.p_approve) options.restartDenied = false;
      response = null;
    } else if (path.endsWith('/rpc/restart_assessment')) {
      if (options.restartDenied) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'P0001', message: 'Attempt limit reached' }),
        });
        return;
      }
      const previous = attempts[body.p_attempt];
      if (!previous.restarted_to) {
        const id = crypto.randomUUID();
        attempts[id] = {
          ...previous,
          id,
          status: 'in_progress',
          checkpoint_revision: 0,
          payload: undefined,
          receipt: null,
        };
        previous.status = 'restarted';
        previous.restarted_to = id;
      }
      response = { id: previous.restarted_to };
      if (options.restartLostReply && !restartReplyLost) {
        restartReplyLost = true;
        await route.abort('failed');
        return;
      }
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
    if (path.endsWith('/rpc/instructor_attempts')) {
      const list = (response as any[]).map((r) => ({
        ...r,
        attempt_number: 1,
        practical_score: r.grading_summaries?.practical_score ?? 0,
        theory_score: r.grading_summaries?.theory_score ?? null,
        released: false,
      }));
      response = {
        total: list.length,
        rows: list.slice(body.p_offset || 0, (body.p_offset || 0) + (body.p_limit || 25)),
      };
    }
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
    helpRequests,
    asInstructor: (value: boolean) => {
      instructor = value;
    },
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
  await page.goto('/ieee-git-lab/#/instructor/submissions');
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
  await page.getByRole('button', { name: '3. Questions', exact: true }).click();
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
  await expect(page.getByRole('button', { name: 'Save now', exact: true })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Save now', exact: true })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Save now', exact: true })).toBeVisible();
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
  await page.goto('/ieee-git-lab/#/instructor/submissions');
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
  await page.goto('/ieee-git-lab/#/instructor/submissions');
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toBeVisible();
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
  await page.goto('/ieee-git-lab/#/instructor/submissions');
  await page.getByRole('button', { name: 'Inspect attempt →' }).click();
  await expect(
    page.getByRole('heading', { name: 'Explain how Git saves changes.', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Points (0–10)', { exact: true })).toBeVisible();
  await page.getByLabel('Points (0–10)', { exact: true }).fill('7.5');
  await page.getByLabel('Instructor feedback').fill('Explain the next snapshot.');
  const draft = page.waitForRequest((r) => r.url().endsWith('/rpc/instructor_save_grade_draft'));
  await page.getByRole('button', { name: 'Save draft grade', exact: true }).click();
  expect((await draft).postDataJSON().p_grades[0].points).toBe(7.5);
  await expect(page.getByRole('status')).toContainText('Official marks are unchanged');
  const finalized = page.waitForRequest((r) => r.url().endsWith('/rpc/grade_assessment'));
  await page.getByRole('button', { name: 'Finalize grade privately', exact: true }).click();
  expect((await finalized).postDataJSON().p_release).toBe(false);
  const release = page.waitForRequest((r) => r.url().endsWith('/rpc/grade_assessment'));
  await page.getByRole('button', { name: 'Publish grade', exact: true }).click();
  expect((await release).postDataJSON().p_release).toBe(true);
  await page.getByRole('link', { name: 'Grades', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Results', exact: true })).toBeVisible();
  await expect(page.getByLabel('Assessment filter')).toBeVisible();
});

test('admin navigation loads real-shaped overview, students and dedicated assessment sections', async ({
  page,
}) => {
  const api = await fixture(page, true);
  await api.login();
  await page.getByRole('link', { name: 'Admin Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByText('Registered students', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Students', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'fixture@example.test', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View student', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Student attempts', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Assignments', exact: true }).click();
  await expect(page.getByRole('link', { name: 'New assignment', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Exams', exact: true }).click();
  await page.getByRole('link', { name: 'New exam', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Type', exact: true })).toHaveValue('exam');
  await expect(page.getByLabel('Duration (minutes)', { exact: true })).toHaveValue('30');
  await page.getByRole('link', { name: 'Question Bank', exact: true }).click();
  await expect(page.getByLabel('Search questions')).toBeVisible();
  await page.getByRole('link', { name: 'Grades', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Results', exact: true })).toBeVisible();
});

test('admin submissions paginate, send filters to the server and export every matching row', async ({
  page,
}) => {
  const api = await fixture(page, true);
  let last: any = {};
  const rows = Array.from({ length: 31 }, (_, i) => ({
    id: 'row-' + i,
    student_id: USER,
    assignment_id: A,
    assignment_version: 1,
    attempt_number: i + 1,
    status: 'graded',
    created_at: '2026-10-01T00:00:00Z',
    submitted_at: '2026-10-02T00:00:00Z',
    practical_score: 4,
    theory_score: 6,
    released: false,
    feedback: 'Useful feedback',
    profiles: {
      full_name: i === 0 ? '=SUM(A1)' : 'Student ' + i,
      email: 'student' + i + '@example.test',
      phone: '+201012345678',
      faculty: 'engineering',
    },
    assignments: { title: 'Assignment A', type: 'assignment' },
  }));
  await page.route('**/rpc/instructor_attempts', (route) => {
    last = route.request().postDataJSON();
    return route.fulfill({
      json: { total: 31, rows: rows.slice(last.p_offset, last.p_offset + last.p_limit) },
    });
  });
  await api.login();
  await page.goto('/ieee-git-lab/#/instructor/submissions');
  await expect(page.getByRole('button', { name: 'Inspect attempt →' })).toHaveCount(25);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect attempt →' })).toHaveCount(6);
  await expect(
    page.getByRole('cell', { name: 'student30@example.test', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Faculty filter').selectOption('engineering');
  await expect.poll(() => last.p_offset).toBe(0);
  await page.getByLabel('Assessment type filter').selectOption('assignment');
  await page.getByLabel('From date').fill('2026-10-01');
  await expect.poll(() => last.p_from).toBe('2026-10-01T00:00:00Z');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const file = await download;
  const fs = await import('node:fs/promises');
  const csv = await fs.readFile((await file.path())!, 'utf8');
  expect(csv).toContain('student30@example.test');
  expect(csv).toContain('"\'=SUM(A1)"');
  expect(csv).toContain('"4","6","10"');
  await page.screenshot({ path: 'test-results/admin-submissions-preview.png', fullPage: true });
});

test('draft editing survives bank search and student preview runs real Git without starting an attempt', async ({
  page,
}) => {
  const api = await fixture(page, true);
  await api.login();
  await page.goto('/ieee-git-lab/#/instructor/assessments/' + A);
  await page.getByLabel('Title', { exact: true }).fill('Unsaved title');
  await page.getByRole('button', { name: '3. Questions', exact: true }).click();
  await page.getByLabel('Search bank to reuse').fill('staging');
  await page.getByRole('button', { name: '1. Details', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved title');
  await page.getByRole('button', { name: 'Preview as student', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Student preview · Unsaved title', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Terminal command').fill('git status');
  await page.getByLabel('Terminal command').press('Enter');
  await expect(page.getByRole('log')).toContainText('working tree clean');
  await page.getByRole('button', { name: 'Question preview', exact: true }).click();
  await expect(page.getByLabel('Your response')).toBeVisible();
  expect(Object.keys(api.attempts)).toHaveLength(0);
  expect(api.uploads()).toBe(0);
  await page.getByRole('button', { name: 'Back to editor', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved title');
});

test('all published question types are answerable, restore after refresh and submit once', async ({
  page,
}) => {
  const api = await fixture(page);
  const types = [
    'single',
    'multiple',
    'boolean',
    'short',
    'long',
    'interpretation',
    'scenario',
  ] as const;
  api.definitions[A].questions = types.map((kind, i) => ({
    id: 'journey-' + i,
    prompt: 'Question type ' + kind,
    kind,
    points: 1,
    options:
      kind === 'single'
        ? ['Commit', 'Branch']
        : kind === 'multiple'
          ? ['Tree', 'Index', 'Server']
          : kind === 'boolean'
            ? ['True', 'False']
            : [],
    required: true,
    manual: !['single', 'multiple', 'boolean'].includes(kind),
  }));
  api.definitions[A].requireComplete = true;
  await api.login();
  await api.start(A);
  await page.getByRole('link', { name: 'Questions', exact: true }).click();
  await page.getByRole('radio', { name: 'Commit', exact: true }).check();
  await page.getByRole('button', { name: 'Next question', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Tree', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Index', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Tree', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Tree', exact: true }).check();
  await page.getByRole('button', { name: 'Next question', exact: true }).click();
  await page.getByRole('radio', { name: 'False', exact: true }).check();
  for (let i = 3; i < 7; i++) {
    await page.getByRole('button', { name: 'Next question', exact: true }).click();
    await page.getByLabel('Your response').fill('My ' + types[i] + ' response.');
  }
  await page.getByRole('button', { name: 'Previous question', exact: true }).click();
  await expect(page.getByLabel('Your response')).toHaveValue('My interpretation response.');
  await expect(page.getByText('7 of 7 required answers')).toBeVisible();
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Commit', exact: true })).toBeChecked();
  await page.getByLabel('Choose question').selectOption('1');
  await expect(page.getByRole('checkbox', { name: 'Tree', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Index', exact: true })).toBeChecked();
  await page.getByLabel('Choose question').selectOption('3');
  await expect(page.getByLabel('Your response')).toHaveValue('My short response.');
  await page.getByRole('link', { name: 'Review & submit', exact: true }).click();
  await page.getByRole('checkbox', { name: /I confirm this is my own work/ }).check();
  await page.getByRole('button', { name: 'Submit assignment', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Submission received', exact: true }),
  ).toBeVisible();
  const uploads = api.uploads();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Submission received', exact: true }),
  ).toBeVisible();
  expect(api.uploads()).toBe(uploads);
});

test('a definite rejected submission can be corrected and retried with fresh answers', async ({
  page,
}) => {
  const api = await fixture(page);
  api.definitions[A].requireComplete = true;
  let reject = true;
  let submitted: any;
  await page.route('**/functions/v1/assessment-attempt', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'submit') {
      submitted = body;
      if (reject) {
        await route.fulfill({ status: 400, json: { error: 'Required work is incomplete' } });
        return;
      }
    }
    await route.fallback();
  });
  await api.login();
  await api.start(A);
  await page.getByRole('link', { name: 'Questions', exact: true }).click();
  await page.getByLabel('Your response').fill('Initial response');
  await page.getByRole('link', { name: 'Review & submit', exact: true }).click();
  await page.getByRole('checkbox', { name: /I confirm this is my own work/ }).check();
  await page.getByRole('button', { name: 'Submit assignment', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText('Required work is incomplete');
  reject = false;
  await page.getByRole('link', { name: 'Questions', exact: true }).click();
  await page.getByLabel('Your response').fill('Corrected response after rejection');
  await page.getByRole('link', { name: 'Review & submit', exact: true }).click();
  await page.getByRole('checkbox', { name: /I confirm this is my own work/ }).check();
  await page.getByRole('button', { name: 'Submit assignment', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Submission received', exact: true }),
  ).toBeVisible();
  expect(submitted.answers.q1).toBe('Corrected response after rejection');
});

test('assessed restart changes attempt keys, clears answers and keeps previous work read only', async ({
  page,
}) => {
  const api = await fixture(page);
  await api.login();
  await api.start(A);
  const old = Object.values(api.attempts)[0].id;
  await page.getByRole('link', { name: 'Questions', exact: true }).click();
  await page.getByLabel('Your response').fill('Previous attempt explanation');
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'a.txt', exact: true }).click();
  await page.getByRole('textbox', { name: 'Text file editor' }).fill('Accepted old work');
  await expect(page.getByRole('button', { name: 'Save now', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.getByText('Server autosave accepted', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Text file editor' }).fill('Old attempt local edit');
  await page.getByText('Help with this attempt', { exact: true }).click();
  await page.getByRole('button', { name: 'Restart Attempt', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('instructor’s attempt limits');
  await page.getByRole('button', { name: 'Confirm restart', exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(old));
  const next = api.attempts[old].restarted_to!;
  await expect(page).toHaveURL(new RegExp(next));
  await expect(
    page.getByRole('button', { name: 'Enable server autosave for this attempt' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'a.txt', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Text file editor' })).toContainText(
    'Only Assignment A',
  );
  await page.getByRole('link', { name: 'Questions', exact: true }).click();
  await expect(page.getByLabel('Your response')).toHaveValue('');
  await page.reload();
  await expect(page.getByLabel('Your response')).toHaveValue('');
  await page.goto(`/ieee-git-lab/#/assessments/${A}/attempts/${old}/workspace`);
  await expect(page.getByLabel('Terminal command')).toBeDisabled();
  await page.getByRole('button', { name: 'a.txt M', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Text file editor' })).toContainText(
    'Old attempt local edit',
  );
  await page.getByRole('link', { name: 'Questions', exact: true }).click();
  await expect(page.getByLabel('Your response')).toHaveValue('Previous attempt explanation');
  await expect(page.getByLabel('Your response')).toHaveJSProperty('readOnly', true);
  expect(api.uploads()).toBe(1);
});

test('limits show a real help request instead of a restart that will be denied', async ({
  page,
}) => {
  const api = await fixture(page, false, 120, { restartDenied: true });
  await api.login();
  await api.start(A);
  await page.getByRole('button', { name: 'a.txt', exact: true }).click();
  await page.getByRole('textbox', { name: 'Text file editor' }).fill('Keep this work');
  await page.getByText('Help with this attempt', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restart Attempt', exact: true })).toHaveCount(0);
  await expect(
    page.getByText('You’ve used all your available attempts.', { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel('Tell your instructor what happened (optional)')
    .fill('I committed files together.');
  await page.getByRole('button', { name: 'Request another attempt', exact: true }).click();
  await expect(
    page.getByText('Request sent · waiting for your instructor', { exact: true }),
  ).toBeVisible();
  expect(Object.keys(api.helpRequests)).toHaveLength(1);
  await page.reload();
  await page.getByText('Help with this attempt', { exact: true }).click();
  await expect(
    page.getByText('Request sent · waiting for your instructor', { exact: true }),
  ).toBeVisible();
  await api.start(E);
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
  await page.getByText('Help with this attempt', { exact: true }).click();
  await expect(
    page.getByText('You cannot restart during an active exam.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restart Attempt', exact: true })).toHaveCount(0);
});

test('lost restart response locks old work and retry recovers the same new attempt', async ({
  page,
}) => {
  const api = await fixture(page, false, 120, { restartLostReply: true });
  await api.login();
  await api.start(A);
  const old = Object.values(api.attempts)[0].id;
  await page.getByText('Help with this attempt', { exact: true }).click();
  await page.getByRole('button', { name: 'Restart Attempt', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm restart', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open the new attempt', exact: true })).toBeVisible();
  await expect(page.getByLabel('Terminal command')).toBeDisabled();
  await page.getByRole('link', { name: 'Open the new attempt', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(api.attempts[old].restarted_to!));
  await expect(page.getByLabel('Terminal command')).toBeEnabled();
  expect(Object.values(api.attempts)).toHaveLength(2);
});

for (const approve of [true, false]) {
  test(`student help request is ${approve ? 'approved and used' : 'declined with a reply'}`, async ({
    page,
  }) => {
    const api = await fixture(page, false, 120, { restartDenied: true });
    await api.login();
    await api.start(A);
    const old = Object.values(api.attempts)[0].id;
    const workspace = page.url();
    await page.getByRole('button', { name: 'a.txt', exact: true }).click();
    await page.getByRole('textbox', { name: 'Text file editor' }).fill('Preserve my work');
    await page.getByRole('button', { name: 'Save now', exact: true }).click();
    await expect.poll(() => api.attempts[old].checkpoint_revision).toBeGreaterThan(0);
    const oldPayload = JSON.stringify(api.attempts[old].payload);
    await page.getByText('Help with this attempt', { exact: true }).click();
    await page
      .getByLabel('Tell your instructor what happened (optional)')
      .fill('Combined my introductory files.');
    await page.getByRole('button', { name: 'Request another attempt', exact: true }).click();
    await expect(
      page.getByText('Request sent · waiting for your instructor', { exact: true }),
    ).toBeVisible();
    api.asInstructor(true);
    await page.goto('/ieee-git-lab/#/instructor/requests');
    await page.reload();
    await expect(page.getByText('Combined my introductory files.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Respond to request', exact: true }).click();
    const response = page.getByRole('alertdialog', { name: 'Respond to help request' });
    await response
      .getByLabel('Response to the student (optional)')
      .fill(approve ? 'Try each file separately.' : 'Please continue your current work.');
    await response
      .getByRole('button', {
        name: approve ? 'Approve another attempt' : 'Decline request',
        exact: true,
      })
      .click();
    await expect(
      page.getByText(
        approve
          ? 'Approved. The student can start over while the assessment is open.'
          : 'Request declined. The student can read your response.',
        { exact: true },
      ),
    ).toBeVisible();
    api.asInstructor(false);
    await page.goto(workspace);
    await page.reload();
    await page.getByText('Help with this attempt', { exact: true }).click();
    await expect(
      page.getByText(approve ? 'Try each file separately.' : 'Please continue your current work.', {
        exact: true,
      }),
    ).toBeVisible();
    if (approve) {
      await page.getByRole('button', { name: 'Restart Attempt', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm restart', exact: true }).click();
      await expect(page).not.toHaveURL(workspace);
      expect(api.attempts[old].status).toBe('restarted');
      expect(JSON.stringify(api.attempts[old].payload)).toBe(oldPayload);
      expect(api.attempts[old].receipt).toBeNull();
      await expect(page.getByLabel('Terminal command')).toBeEnabled();
    } else {
      await expect(
        page.getByText('Your instructor did not approve another attempt', { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Restart Attempt', exact: true })).toHaveCount(
        0,
      );
      expect(api.attempts[old].status).toBe('in_progress');
      expect(Object.values(api.attempts)).toHaveLength(1);
    }
  });
}

test('instructor builds a task with plain forms, verifies real Git in preview and publishes its criteria', async ({
  page,
}) => {
  const api = await fixture(page, true);
  await api.login();
  await page.goto('/ieee-git-lab/#/instructor/assessments/new');
  await page.getByLabel('Title', { exact: true }).fill('First file lesson');
  await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('practical');
  await page.getByRole('button', { name: '2. Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Add section', exact: true }).click();
  await page.getByRole('button', { name: 'Add practical task', exact: true }).click();
  await page.getByLabel('Task title', { exact: true }).fill('إنشاء greeting.txt');
  await page
    .getByLabel('Task instructions', { exact: true })
    .fill('Create greeting.txt.\nWrite Hello Git in the editor.');
  await page
    .getByRole('combobox', { name: 'Check completion by', exact: true })
    .selectOption('file');
  await page.getByLabel('Expected file path', { exact: true }).fill('greeting.txt');
  await page.getByLabel('Branch / snapshot', { exact: true }).fill('working');
  await page.getByRole('combobox', { name: 'Content rule', exact: true }).selectOption('contains');
  await page.getByLabel('Expected text', { exact: true }).fill('Hello Git');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/redesigned-instructor-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Preview as student', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'إنشاء greeting.txt', exact: true }),
  ).toHaveAttribute('dir', 'auto');
  await expect(page.locator('.required-text pre')).toHaveText('Hello Git');
  for (const cmd of ['mkdir Git-Exercise', 'cd Git-Exercise', 'git init', 'touch greeting.txt']) {
    await page.getByLabel('Terminal command').fill(cmd);
    await page.getByLabel('Terminal command').press('Enter');
    await expect(page.getByLabel('Terminal command')).toBeEnabled();
  }
  await page.getByRole('button', { name: 'greeting.txt U', exact: true }).click();
  await page.getByRole('textbox', { name: 'Text file editor' }).fill('Hello Git');
  await expect(page.locator('.task-status')).toHaveText('Complete');
  expect(Object.values(api.attempts)).toHaveLength(0);
  await page.screenshot({ path: 'test-results/redesigned-instructor-preview.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to editor', exact: true }).click();
  await page.getByRole('button', { name: 'Publish new version', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Published');
  expect(api.saved[0].p_document.sections[0].tasks[0].rules[0]).toEqual({
    type: 'file',
    path: 'greeting.txt',
    ref: 'working',
    match: 'contains',
    value: 'Hello Git',
  });
  expect(api.saved[0].p_publish).toBe(true);
});
