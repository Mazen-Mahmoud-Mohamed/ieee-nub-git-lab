import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const migration = readFileSync(
  'supabase/migrations/20261026171250_normalize_profile_faculty.sql',
  'utf8',
);
async function database() {
  const db = new PGlite();
  await db.exec(
    'create role anon;create role authenticated;create schema private;create table public.profiles(id int primary key,department text not null,full_name text not null);',
  );
  return db;
}
it('safely renames old faculty values and preserves existing identity and submission data', async () => {
  const db = await database();
  try {
    await db.exec(
      "create type old_faculty as enum('engineering','computers_information');alter table public.profiles add column faculty old_faculty default 'computers_information';alter table public.profiles add constraint old_faculty_check check(faculty in ('engineering','computers_information'));insert into public.profiles values(1,'Software Engineering','Student A','computers_information'),(2,'Civil Engineering','Student B','engineering');create table submissions(id int,student_id int references public.profiles(id),grade int);insert into submissions values(7,1,91);",
    );
    await db.exec(migration);
    const rows = (
      await db.query<{ id: number; department: string; full_name: string; faculty: string }>(
        'select * from profiles order by id',
      )
    ).rows;
    expect(rows[0]).toEqual({
      id: 1,
      department: 'Software Engineering',
      full_name: 'Student A',
      faculty: 'computer_science',
    });
    expect(rows[1].faculty).toBe('engineering');
    expect((await db.query('select * from submissions')).rows).toEqual([
      { id: 7, student_id: 1, grade: 91 },
    ]);
    await expect(
      db.exec("update profiles set faculty='computers_information' where id=1"),
    ).rejects.toThrow();
    await expect(db.exec('update profiles set faculty=null where id=1')).rejects.toThrow();
    await db.exec("update profiles set faculty='engineering' where id=1");
  } finally {
    await db.close();
  }
});
it('adds faculty without guessing unrelated departments or changing existing records', async () => {
  const db = await database();
  try {
    await db.exec(
      "insert into profiles values(1,'Engineering','Student A'),(2,'Computer Science','Student B'),(3,'Physics','Student C');",
    );
    await db.exec(migration);
    expect((await db.query('select id,faculty from profiles order by id')).rows).toEqual([
      { id: 1, faculty: 'engineering' },
      { id: 2, faculty: 'computer_science' },
      { id: 3, faculty: null },
    ]);
    await expect(
      db.exec(
        "insert into profiles(id,department,full_name) values(4,'Engineering','New student')",
      ),
    ).rejects.toThrow();
    await db.exec("insert into profiles values(4,'Software','New student','computer_science')");
    expect((await db.query('select department from profiles where id=3')).rows[0]).toEqual({
      department: 'Physics',
    });
  } finally {
    await db.close();
  }
});
