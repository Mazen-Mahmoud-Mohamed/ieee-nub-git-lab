import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { task2Rubric, TASK2_POLICY } from '../src/features/task2/policy.ts';
// Local generation only. Private authoring inputs and key imports stay outside public Git history.
const privatePath = 'supabase/.task2-private/template.json';
const authoring = JSON.parse(
  readFileSync(existsSync(privatePath) ? privatePath : 'supabase/task2-template.json', 'utf8'),
);
const template = {
  ...authoring,
  practicalSource: TASK2_POLICY,
  questions: authoring.questions.map(
    ({ correctAnswers: _answers, explanation: _explanation, ...q }) => q,
  ),
  sections: [
    {
      ...authoring.sections[0],
      tasks: task2Rubric.map((c) => ({
        id: c.id,
        title: c.title,
        instructions: c.description + '\nVerification: ' + c.method + '\nCorrection: ' + c.recovery,
        points: c.points,
        bonus: false,
        rules: [{ type: 'github', outcomeId: c.id }],
        requirementWeights: { [`${c.id}:rule-0-github`]: c.points },
      })),
    },
  ],
};
writeFileSync('supabase/task2-template.json', JSON.stringify(template, null, 2) + '\n');
if (existsSync(privatePath)) {
  const keys = Object.fromEntries(
    authoring.questions.map((q) => [
      q.id,
      { correctAnswers: q.correctAnswers, explanation: q.explanation || '' },
    ]),
  );
  if (Object.values(keys).some((k) => !Array.isArray(k.correctAnswers) || !k.correctAnswers.length))
    throw Error('Private authoring keys are incomplete');
  writeFileSync(
    'supabase/.task2-private/seed-keys.sql',
    "-- PRIVATE instructor answer import. Never commit or publish this file.\nupdate private.task2_template set answer_keys='" +
      JSON.stringify(keys).replaceAll("'", "''") +
      "'::jsonb where id;\n",
  );
}
const source = readFileSync('supabase/migrations/20261110000000_independent_task1.sql', 'utf8');
const extract = (name) =>
  source.slice(
    source.indexOf('create or replace function ' + name),
    source.indexOf('end $$;', source.indexOf('create or replace function ' + name)) + 7,
  );
const save = extract('public.save_assessment').replace(
  "'isolation','criterion')",
  "'isolation','criterion','github')",
);
const validate = extract('private.validate_requirement_scoring').replace(
  "when 'criterion' then array['criterion']",
  "when 'github' then array['github'] when 'criterion' then array['criterion']",
);
const base = readFileSync('supabase/task2-migration-base.sql', 'utf8');
writeFileSync(
  'supabase/migrations/20261118000000_real_github_task2.sql',
  '-- Additive Task 2 integration. No publication or changes to existing assessment rows.\nbegin;\n' +
    save +
    '\n' +
    validate +
    '\n' +
    base.replace(
      '/* TASK2_TEMPLATE */',
      "'" + JSON.stringify(template).replaceAll("'", "''") + "'::jsonb",
    ) +
    '\ncommit;\n',
);
