import { writeFileSync } from 'node:fs';
import { assignment, questions } from '../src/features/assignments/assignment.ts';
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
let sql = `-- Generated from the versioned assignment definition. Contains no students, instructor identities, or answer keys.\ninsert into public.assignments(id,version,title,description,objectives,visible) values(${q(assignment.id)},1,${q(assignment.title)},${q(assignment.description)},${q(JSON.stringify(assignment.objectives))}::jsonb,true) on conflict(id) do nothing;\n`;
for (const [i, s] of assignment.sections.entries()) {
  const id = `b6f4b6d0-5fe2-4e4d-b9a5-${String(i + 2).padStart(12, '0')}`;
  sql += `insert into public.assignment_sections(id,assignment_id,position,title,points,bonus) values(${q(id)},${q(assignment.id)},${i + 1},${q(s.title)},${s.points},${s.id === 'bonus'}) on conflict(id) do nothing;\n`;
  for (const [j, step] of s.steps.entries())
    sql += `insert into public.assignment_tasks(id,section_id,task_key,instructions,points) values(${q(`b6f4b6d0-5fe2-4e4d-b9a6-${String((i + 1) * 100 + j).padStart(12, '0')}`)},${q(id)},${q(s.id + '-' + j)},${q(step)},0) on conflict(id) do nothing;\n`;
}
for (const [i, item] of questions.entries())
  sql += `insert into public.questions(id,assignment_id,position,prompt,kind,points) values(${q(item.id)},${q(assignment.id)},${i + 1},${q(item.prompt)},${q(item.kind)},${item.points}) on conflict(id) do nothing;\n`;
sql += 'insert into public.app_settings(id) values(true) on conflict do nothing;\n';
writeFileSync(new URL('../supabase/seed.sql', import.meta.url), sql);
