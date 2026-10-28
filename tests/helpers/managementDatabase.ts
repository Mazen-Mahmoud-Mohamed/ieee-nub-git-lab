import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
export const ADMIN = '10000000-0000-4000-8000-000000000001';
export const TEACHER = '10000000-0000-4000-8000-000000000002';
export const STUDENT = '10000000-0000-4000-8000-000000000003';
export async function managementDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text,metadata jsonb);
    alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.objects to anon,authenticated;grant all on storage.objects to service_role;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$;
    grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid(),auth.role() to authenticated,service_role;`);
  for (const migration of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const source = readFileSync('supabase/migrations/' + migration, 'utf8');
    try {
      await db.exec(source);
    } catch (error: any) {
      throw Error(
        migration +
          ': ' +
          error.message +
          ' position ' +
          error.position +
          ' ' +
          source.slice(Math.max(0, Number(error.position) - 200), Number(error.position) + 100),
      );
    }
    if (migration.includes('initial_git_lab'))
      await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
  }
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values
    ('${ADMIN}','admin@example.test',now()),('${TEACHER}','teacher@example.test',now()),('${STUDENT}','student@example.test',now());
    insert into private.instructors(user_id) values('${ADMIN}'),('${TEACHER}');
    insert into private.data_administrators(user_id) values('${ADMIN}');`);
  async function asUser(id: string | null, sql: string, args: any[] = []) {
    return db.transaction(async (tx) => {
      await tx.exec(id ? 'set local role authenticated' : 'set local role anon');
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id || '']);
      return tx.query<any>(sql, args);
    });
  }
  for (const [id, name] of [
    [ADMIN, 'Data Administrator'],
    [TEACHER, 'Course Instructor'],
    [STUDENT, 'Student Example'],
  ])
    await asUser(id, 'select public.save_student_profile($1,$2,$3)', [
      name,
      '01012345678',
      'engineering',
    ]);
  async function rpc(id: string | null, name: string, args: Record<string, any> = {}) {
    if (!/^[a-z_]+$/.test(name) || Object.keys(args).some((k) => !/^p_[a-z_]+$/.test(k)))
      throw Error('Invalid test RPC');
    const params = Object.keys(args)
      .map((key, i) => `${key} => $${i + 1}`)
      .join(',');
    const result = await asUser(
      id,
      `select public.${name}(${params}) as result`,
      Object.values(args).map((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v)),
    );
    return result.rows[0].result;
  }
  return { db, asUser, rpc };
}
