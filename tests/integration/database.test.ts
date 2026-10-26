import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { ASSIGNMENT_ID } from '../../src/features/assignments/assignment';
let db: PGlite;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const I = '33333333-3333-4333-8333-333333333333';
let attempt: string;
async function asUser(id: string, sql: string) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`,
  );
  return db.query(sql);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated') $$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid(),auth.role() to authenticated,service_role;`,
  );
  await db.exec(readFileSync('supabase/migrations/20261026130655_initial_git_lab.sql', 'utf8'));
  await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
  await db.exec(
    `insert into auth.users values('${A}',now()),('${B}',now()),('${I}',now());insert into private.instructors(user_id) values('${I}');`,
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe.sequential('database authorization and atomic attempt policies', () => {
  it('enables RLS on every application table and rate limits trusted submission requests', async () => {
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'",
    );
    expect(tables.rows.length).toBeGreaterThan(18);
    expect(tables.rows.every((t) => t.relrowsecurity)).toBe(true);
    for (let i = 0; i < 8; i++)
      expect(
        (
          await db.query<{ allowed: boolean }>(
            `select public.check_submission_rate('${A}') as allowed`,
          )
        ).rows[0].allowed,
      ).toBe(true);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          `select public.check_submission_rate('${A}') as allowed`,
        )
      ).rows[0].allowed,
    ).toBe(false);
  });
  it('allows only the owner to write their profile and ignores editable metadata', async () => {
    await asUser(
      A,
      `insert into public.profiles values('${A}','Student A','A001','Nahda University','Engineering','2',now())`,
    );
    await expect(
      asUser(
        A,
        `insert into public.profiles values('${B}','Student B','B001','Nahda University','Science','2',now())`,
      ),
    ).rejects.toThrow();
    await asUser(
      B,
      `insert into public.profiles values('${B}','Student B','B001','Nahda University','Science','2',now())`,
    );
    const result = await asUser(A, 'select * from public.profiles');
    expect(result.rows).toHaveLength(1);
    expect((await asUser(A, 'select public.is_instructor() as allowed')).rows[0]).toEqual({
      allowed: false,
    });
  });
  it('creates only one current attempt for repeated starts', async () => {
    const first = await asUser(A, `select (public.start_attempt('${ASSIGNMENT_ID}')).id`);
    attempt = (first.rows[0] as { id: string }).id;
    const second = await asUser(A, `select (public.start_attempt('${ASSIGNMENT_ID}')).id`);
    expect((second.rows[0] as { id: string }).id).toBe(attempt);
  });
  it('prevents cross-user reads and unauthorized finalization or grade writes', async () => {
    expect(
      (await asUser(B, `select * from public.attempts where id='${attempt}'`)).rows,
    ).toHaveLength(0);
    await expect(
      asUser(A, `update public.attempts set status='graded' where id='${attempt}'`),
    ).rejects.toThrow();
    await expect(
      asUser(A, `select public.grade_attempt('${attempt}','[]','fake',true)`),
    ).rejects.toThrow('Instructor');
    await expect(
      asUser(
        A,
        `select public.finalize_verified('${A}','${attempt}',gen_random_uuid(),'{}','{}','[]','[]',75)`,
      ),
    ).rejects.toThrow();
  });
  it('finalizes atomically with an idempotent receipt and hides unreleased scores', async () => {
    await db.exec('reset role');
    const key = '44444444-4444-4444-8444-444444444444';
    const call = `select public.finalize_verified('${A}','${attempt}','${key}','{}','{}','[]','[]',75) as receipt`;
    const first = await db.query(call);
    const second = await db.query(call);
    expect(first.rows).toEqual(second.rows);
    await expect(
      db.query(
        `select public.finalize_verified('${A}','${attempt}',gen_random_uuid(),'{}','{}','[]','[]',75)`,
      ),
    ).rejects.toThrow('already finalized');
    expect((await asUser(A, 'select * from public.grading_summaries')).rows).toHaveLength(0);
    expect((await asUser(A, 'select * from public.released_results')).rows).toHaveLength(0);
  });
  it('does not overwrite finalized attempts, and requires instructor-approved retakes', async () => {
    const old = await asUser(A, `select (public.start_attempt('${ASSIGNMENT_ID}')).id`);
    expect((old.rows[0] as { id: string }).id).toBe(attempt);
    await expect(asUser(A, `select public.approve_retake('${attempt}')`)).rejects.toThrow();
    await asUser(I, `select public.approve_retake('${attempt}')`);
    const next = await asUser(A, `select (public.start_attempt('${ASSIGNMENT_ID}')).id`);
    expect((next.rows[0] as { id: string }).id).not.toBe(attempt);
    await expect(
      asUser(A, `select public.save_checkpoint('${attempt}','{"version":1}')`),
    ).rejects.toThrow('Open owned');
  });
  it('recalculates bounded grades and only exposes released totals to the owner', async () => {
    const grades = JSON.stringify(
      Array.from({ length: 12 }, (_, i) => ({
        question_id: 'q' + (i + 1),
        points: i === 2 ? 3 : 2,
      })),
    );
    await asUser(I, `select public.grade_attempt('${attempt}','${grades}','Good reasoning',false)`);
    expect((await asUser(A, 'select * from public.released_results')).rows).toHaveLength(0);
    await asUser(I, `select public.grade_attempt('${attempt}','${grades}','Good reasoning',true)`);
    const result = await asUser(A, 'select * from public.released_results');
    expect(result.rows).toHaveLength(1);
    expect(Number((result.rows[0] as { theory_score: number }).theory_score)).toBe(25);
    expect((await asUser(B, 'select * from public.released_results')).rows).toHaveLength(0);
    await expect(
      asUser(
        I,
        `select public.grade_attempt('${attempt}','[{"question_id":"q1","points":100}]','',true)`,
      ),
    ).rejects.toThrow();
  });
});
