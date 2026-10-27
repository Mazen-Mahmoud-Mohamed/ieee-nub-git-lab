import { taskGuide } from '../assessments/presentation';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, ArrowUp, ArrowDown, Copy, Save, Trash2 } from 'lucide-react';
import { requireBackend } from '../../services/supabase';
import {
  assertDefinition,
  blankDefinition,
  totals,
  type Definition,
  type Task,
  type Rule,
  type AssessmentQuestion,
} from '../assessments/model';
import { Pagination } from './AdminPages';
import { StudentPreview } from './StudentPreview';
import { inspectVerifiedSnapshot } from '../submissions/verify';
const id = () => crypto.randomUUID();
const newQuestion = (): AssessmentQuestion => ({
  id: id(),
  prompt: 'New question',
  kind: 'long',
  points: 5,
  options: [],
  manual: true,
  required: true,
  correctAnswers: [],
  explanation: '',
});
function move<T>(items: T[], i: number, delta: number) {
  const next = [...items];
  const j = i + delta;
  if (j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
export function AssessmentManager({ type }: { type?: 'assignment' | 'exam' }) {
  const [page, setPage] = useState(0),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    setError('');
    let query = requireBackend()
      .from('assignments')
      .select('*,assessment_drafts(document)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(page * 25, page * 25 + 24);
    if (type) query = query.eq('type', type);
    const { data, error, count } = await query;
    if (error) setError(error.message);
    else {
      setRows(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [type, page]);
  const action = async (fn: () => PromiseLike<any>) => {
    if (
      !window.confirm(
        'Apply this assessment change? Active attempts retain their published version.',
      )
    )
      return;
    try {
      const r = await fn();
      if (r.error) throw r.error;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section>
      <div className="page-heading">
        <div>
          <h2>
            {type === 'exam'
              ? 'Exams'
              : type === 'assignment'
                ? 'Assignments'
                : 'Assignments & exams'}
          </h2>
          <p>
            Create a draft, configure tasks and questions, then publish it for students. Current
            attempts keep their original instructions.
          </p>
        </div>
        <Link
          className="primary"
          to={'/instructor/assessments/new' + (type ? '?type=' + type : '')}
        >
          <Plus size={16} />
          {type === 'exam'
            ? 'New exam'
            : type === 'assignment'
              ? 'New assignment'
              : 'New assessment'}
        </Link>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading assessments…</p>}
      <div className="course-grid">
        {rows.map((r) => (
          <article className="form-card assessment-card" key={r.id}>
            <span className="eyebrow">
              {r.type} ·{' '}
              {r.archived
                ? 'Archived'
                : r.visible
                  ? 'Published · v' + r.published_version
                  : 'Draft / unpublished'}
            </span>
            <h3>{r.assessment_drafts?.document?.title || r.title}</h3>
            <p>{r.description}</p>
            <div className="assessment-card-actions">
              <Link className="primary" to={'/instructor/assessments/' + r.id}>
                Edit
              </Link>
              <button
                className="outline-button"
                onClick={() =>
                  void action(() => requireBackend().rpc('duplicate_assessment', { p_id: r.id }))
                }
              >
                <Copy size={14} />
                Duplicate
              </button>
              <button
                className="text-button"
                onClick={() =>
                  void action(() =>
                    requireBackend().rpc('set_assessment_visibility', {
                      p_id: r.id,
                      p_visible: !r.visible,
                      p_archive: false,
                    }),
                  )
                }
              >
                {r.visible ? 'Unpublish' : 'Restore visibility'}
              </button>
              <button
                className="text-button"
                onClick={() =>
                  void action(() =>
                    requireBackend().rpc('set_assessment_visibility', {
                      p_id: r.id,
                      p_visible: false,
                      p_archive: !r.archived,
                    }),
                  )
                }
              >
                {r.archived ? 'Unarchive' : 'Archive'}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!loading && !rows.length && !error && <p>No assessments yet. Create your first draft.</p>}
      <Pagination page={page} total={total} onPage={setPage} />
    </section>
  );
}
export function AssessmentEditor() {
  const { id: assessmentId } = useParams();
  const creating = assessmentId === 'new';
  const [searchParams] = useSearchParams();
  const [preview, setPreview] = useState(false);
  const [editorTab, setEditorTab] = useState('details');
  const [previewError, setPreviewError] = useState('');
  const [definition, setDefinition] = useState<Definition>(
    blankDefinition(searchParams.get('type') === 'exam' ? 'exam' : 'assignment'),
  );
  useEffect(() => {
    if (
      (definition.format === 'theory' && ['tasks', 'starter'].includes(editorTab)) ||
      (definition.format === 'practical' && editorTab === 'questions')
    )
      setEditorTab('details');
  }, [definition.format, editorTab]);
  const [loading, setLoading] = useState(!creating);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState<Array<{ id: string; document: AssessmentQuestion }>>([]);
  const [bankSearch, setBankSearch] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    let live = true;
    if (!creating)
      void requireBackend()
        .from('assessment_drafts')
        .select('document')
        .eq('assessment_id', assessmentId)
        .single()
        .then(({ data, error }) => {
          if (!live) return;
          if (error) setError(error.message);
          else setDefinition(data.document);
          setLoading(false);
        });
    return () => {
      live = false;
    };
  }, [assessmentId]);
  useEffect(() => {
    let live = true;
    void requireBackend()
      .from('question_bank')
      .select('id,document')
      .eq('archived', false)
      .ilike('document->>prompt', '%' + bankSearch + '%')
      .order('updated_at', { ascending: false })
      .order('id')
      .limit(100)
      .then(({ data, error }) => {
        if (live) {
          if (error) setError(error.message);
          else setBank(data || []);
        }
      });
    return () => {
      live = false;
    };
  }, [bankSearch]);
  const update = (patch: Partial<Definition>) => setDefinition({ ...definition, ...patch });
  const sections = definition.sections;
  const setTask = (sectionIndex: number, index: number, task: Task) =>
    update({
      sections: sections.map((s, i) =>
        i === sectionIndex ? { ...s, tasks: s.tasks.map((t, j) => (j === index ? task : t)) } : s,
      ),
    });
  const save = async (publish: boolean) => {
    if (
      publish &&
      !window.confirm('Publish a new immutable version and make it available to students?')
    )
      return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      assertDefinition(definition);
      if (definition.starter.snapshot)
        await inspectVerifiedSnapshot(definition.starter.snapshot, definition.projectName);
      const { data, error } = await requireBackend().rpc('save_assessment', {
        p_id: creating ? null : assessmentId,
        p_document: definition,
        p_publish: publish,
      });
      if (error) throw error;
      setNotice(
        publish
          ? 'Published a new immutable version. Active attempts keep their previous version.'
          : 'Draft saved. Published attempts are unchanged.',
      );
      if (creating) navigate('/instructor/assessments/' + data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const points = totals(definition);
  if (loading) return <p>Loading draft…</p>;
  if (preview) return <StudentPreview definition={definition} close={() => setPreview(false)} />;
  return (
    <div className="assessment-editor">
      <Link className="text-button" to="/instructor/assessments">
        ← All assessments
      </Link>
      <div className="page-heading">
        <div>
          <h2>{creating ? 'Create assessment' : 'Edit assessment draft'}</h2>
          <p>
            Total marks: {points.practical + points.theory} · {points.bonus} bonus. Set marks on
            each task and question below.
          </p>
        </div>
        <div className="editor-actions">
          <button
            className="outline-button"
            onClick={() => {
              try {
                assertDefinition(definition);
                setPreviewError('');
                setPreview(true);
              } catch (e) {
                setPreviewError(String(e));
              }
            }}
          >
            Preview as student
          </button>
          <button className="outline-button" disabled={busy} onClick={() => void save(false)}>
            <Save size={15} />
            Save draft
          </button>
          <button className="primary" disabled={busy} onClick={() => void save(true)}>
            Publish new version
          </button>
        </div>
      </div>
      {previewError && (
        <p role="alert" className="error">
          {previewError}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <nav className="editor-section-tabs" aria-label="Assessment editor sections">
        {['details', 'tasks', 'questions', 'starter']
          .filter(
            (tab) =>
              !(definition.format === 'theory' && ['tasks', 'starter'].includes(tab)) &&
              !(definition.format === 'practical' && tab === 'questions'),
          )
          .map((tab) => (
            <button
              key={tab}
              aria-current={editorTab === tab ? 'page' : undefined}
              className={editorTab === tab ? 'primary' : 'outline-button'}
              onClick={() => setEditorTab(tab)}
            >
              {
                {
                  details: '1. Details',
                  tasks: '2. Tasks',
                  questions: '3. Questions',
                  starter: 'Starting files',
                }[tab]
              }
            </button>
          ))}
      </nav>
      <section hidden={editorTab !== 'details'} className="form-card editor-fields">
        <h3>Assessment details</h3>
        <div className="field-grid">
          <label>
            Title
            <input
              maxLength={180}
              value={definition.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          </label>
          <label>
            Type
            <select
              value={definition.type}
              onChange={(e) =>
                update({
                  type: e.target.value as Definition['type'],
                  durationMinutes: e.target.value === 'exam' ? 30 : 0,
                })
              }
            >
              <option value="assignment">Assignment</option>
              <option value="exam">Timed exam</option>
            </select>
          </label>
          <label>
            Format
            <select
              value={definition.format}
              onChange={(e) => update({ format: e.target.value as Definition['format'] })}
            >
              <option value="mixed">Practical + theory</option>
              <option value="practical">Practical Git only</option>
              <option value="theory">Theory only</option>
            </select>
          </label>
          <label>
            Project directory
            <input
              value={definition.projectName}
              onChange={(e) => update({ projectName: e.target.value })}
            />
          </label>
          <label>
            Allowed attempts
            <input
              type="number"
              min={1}
              max={20}
              value={definition.attemptLimit}
              onChange={(e) => update({ attemptLimit: Number(e.target.value) })}
            />
          </label>
          {definition.type === 'exam' && (
            <label>
              Duration (minutes)
              <input
                type="number"
                min={1}
                max={1440}
                value={definition.durationMinutes}
                onChange={(e) => update({ durationMinutes: Number(e.target.value) })}
              />
            </label>
          )}
          {(['startsAt', 'endsAt', 'deadline'] as const).map((key) => (
            <label key={key}>
              {key === 'startsAt'
                ? 'Available from'
                : key === 'endsAt'
                  ? 'Available until'
                  : 'Deadline (optional)'}
              <input
                type="datetime-local"
                value={localDate(definition[key])}
                onChange={(e) =>
                  update({ [key]: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
              />
            </label>
          ))}
        </div>
        <label>
          Description
          <textarea
            rows={2}
            maxLength={8000}
            value={definition.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </label>
        <label>
          Instructions
          <textarea
            rows={5}
            maxLength={8000}
            value={definition.instructions}
            onChange={(e) => update({ instructions: e.target.value })}
          />
        </label>
        <div className="field-grid">
          {(
            [
              ['releaseImmediately', 'Release immediately when no manual grading remains'],
              ['reviewAnswers', 'Allow response review after submission'],
              ['gateTheory', 'Unlock theory after practical tasks pass'],
              ['requireComplete', 'Require all mandatory work before manual submission'],
            ] as const
          ).map(([key, label]) => (
            <label className="checkbox-label" key={key}>
              <input
                type="checkbox"
                checked={definition[key]}
                onChange={(e) => update({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
        <small>
          At exam expiry, partial work is always finalized from the last accepted save. Published
          versions cannot be edited in place.
        </small>
      </section>
      {definition.format !== 'theory' && (
        <>
          <section hidden={editorTab !== 'starter'} className="form-card editor-fields">
            <h3>Starting files (optional)</h3>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={definition.starter.initialize}
                onChange={(e) =>
                  update({ starter: { ...definition.starter, initialize: e.target.checked } })
                }
              />
              Initialize a repository on main
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={definition.starter.commit}
                onChange={(e) =>
                  update({
                    starter: {
                      ...definition.starter,
                      commit: e.target.checked,
                      initialize: e.target.checked || definition.starter.initialize,
                    },
                  })
                }
              />
              Commit starter files
            </label>
            {Object.entries(definition.starter.files).map(([path, text], i) => (
              <div className="starter-file" key={i}>
                <label>
                  Starter file path
                  <input
                    value={path}
                    onChange={(e) => {
                      const files = { ...definition.starter.files };
                      delete files[path];
                      files[e.target.value] = text;
                      update({ starter: { ...definition.starter, files } });
                    }}
                  />
                </label>
                <label>
                  Starter file content
                  <textarea
                    rows={3}
                    value={text}
                    onChange={(e) =>
                      update({
                        starter: {
                          ...definition.starter,
                          files: { ...definition.starter.files, [path]: e.target.value },
                        },
                      })
                    }
                  />
                </label>
                <button
                  className="text-button"
                  onClick={() => {
                    const files = { ...definition.starter.files };
                    delete files[path];
                    update({ starter: { ...definition.starter, files } });
                  }}
                >
                  Remove file
                </button>
              </div>
            ))}
            <button
              className="outline-button"
              onClick={() =>
                update({
                  starter: {
                    ...definition.starter,
                    files: {
                      ...definition.starter.files,
                      ['starter-' + (Object.keys(definition.starter.files).length + 1) + '.txt']:
                        '',
                    },
                  },
                })
              }
            >
              Add starter text file
            </button>
            <label>
              Or import a starter repository backup
              <input
                type="file"
                accept=".json"
                onChange={async (e) => {
                  try {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 900000)
                      throw new Error('Starter backup must be smaller than 900 KB');
                    const json = JSON.parse(await f.text());
                    const snapshot = json.snapshot || json;
                    await inspectVerifiedSnapshot(snapshot, definition.projectName);
                    update({ starter: { ...definition.starter, snapshot } });
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              />
            </label>
            {definition.starter.snapshot && (
              <button
                className="text-button"
                onClick={() => {
                  const starter = { ...definition.starter };
                  delete starter.snapshot;
                  update({ starter });
                }}
              >
                Remove imported starter repository
              </button>
            )}
          </section>
          <section hidden={editorTab !== 'tasks'} className="form-card editor-fields">
            <div className="page-heading">
              <h3>Practical tasks</h3>
              <button
                className="outline-button"
                onClick={() =>
                  update({
                    sections: [
                      ...sections,
                      { id: id(), title: 'New section', description: '', steps: [], tasks: [] },
                    ],
                  })
                }
              >
                Add section
              </button>
            </div>
            {sections.map((section, si) => (
              <div className="builder-section" key={section.id}>
                <div className="builder-heading">
                  <label>
                    Section title
                    <input
                      value={section.title}
                      onChange={(e) =>
                        update({
                          sections: sections.map((s, i) =>
                            i === si ? { ...s, title: e.target.value } : s,
                          ),
                        })
                      }
                    />
                  </label>
                  <OrderButtons
                    index={si}
                    count={sections.length}
                    onMove={(delta) => update({ sections: move(sections, si, delta) })}
                    onRemove={() => update({ sections: sections.filter((_, i) => i !== si) })}
                  />
                </div>
                <label>
                  Section instructions
                  <textarea
                    rows={2}
                    value={section.description}
                    onChange={(e) =>
                      update({
                        sections: sections.map((s, i) =>
                          i === si ? { ...s, description: e.target.value } : s,
                        ),
                      })
                    }
                  />
                </label>
                {section.tasks.map((task, ti) => (
                  <div className="builder-task" key={task.id}>
                    <div className="builder-heading">
                      <h4>Task {ti + 1}</h4>
                      <OrderButtons
                        index={ti}
                        count={section.tasks.length}
                        onMove={(delta) =>
                          update({
                            sections: sections.map((s, i) =>
                              i === si ? { ...s, tasks: move(s.tasks, ti, delta) } : s,
                            ),
                          })
                        }
                        onRemove={() =>
                          update({
                            sections: sections.map((s, i) =>
                              i === si ? { ...s, tasks: s.tasks.filter((_, j) => j !== ti) } : s,
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="field-grid">
                      <label>
                        Task title
                        <input
                          value={task.title}
                          onChange={(e) => setTask(si, ti, { ...task, title: e.target.value })}
                        />
                      </label>
                      <label>
                        Points
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          value={task.points}
                          onChange={(e) =>
                            setTask(si, ti, { ...task, points: Number(e.target.value) })
                          }
                        />
                      </label>
                    </div>
                    <h5>What the student sees</h5>
                    <label>
                      Task instructions
                      <textarea
                        rows={3}
                        value={task.instructions}
                        onChange={(e) => setTask(si, ti, { ...task, instructions: e.target.value })}
                      />
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={task.bonus}
                        onChange={(e) => setTask(si, ti, { ...task, bonus: e.target.checked })}
                      />
                      Optional bonus task
                    </label>
                    <h5>What earns the points</h5>
                    <p className="muted">
                      Describe the required result, then choose how to check it. All checks must
                      pass for this task’s points.
                    </p>
                    {task.rules.map((rule, ri) => (
                      <RuleEditor
                        key={ri}
                        rule={rule}
                        onChange={(next) =>
                          setTask(si, ti, {
                            ...task,
                            rules: task.rules.map((r, i) => (i === ri ? next : r)),
                          })
                        }
                        onRemove={() =>
                          setTask(si, ti, { ...task, rules: task.rules.filter((_, i) => i !== ri) })
                        }
                      />
                    ))}
                    <button
                      className="text-button"
                      onClick={() =>
                        setTask(si, ti, {
                          ...task,
                          rules: [
                            ...task.rules,
                            { type: 'file', path: 'file.txt', ref: 'main', match: 'exists' },
                          ],
                        })
                      }
                    >
                      + Add a completion check
                    </button>
                  </div>
                ))}
                <button
                  className="outline-button"
                  onClick={() =>
                    update({
                      sections: sections.map((s, i) =>
                        i === si
                          ? {
                              ...s,
                              tasks: [
                                ...s.tasks,
                                {
                                  id: id(),
                                  title: 'New practical task',
                                  instructions: '',
                                  points: 10,
                                  bonus: false,
                                  rules: [{ type: 'repository', branch: 'main', clean: true }],
                                },
                              ],
                            }
                          : s,
                      ),
                    })
                  }
                >
                  Add practical task
                </button>
              </div>
            ))}
          </section>
        </>
      )}
      {definition.format !== 'practical' && (
        <section hidden={editorTab !== 'questions'} className="form-card editor-fields">
          <div className="page-heading">
            <h3>Questions</h3>
            <button
              className="outline-button"
              onClick={() => update({ questions: [...definition.questions, newQuestion()] })}
            >
              Add question
            </button>
          </div>
          <label>
            Search the question bank
            <input
              aria-label="Search bank to reuse"
              value={bankSearch}
              onChange={(e) => setBankSearch(e.target.value)}
            />
            <small>
              Shows up to 100 matching questions. Refine the search to find another question.
            </small>
          </label>
          {bank.length > 0 && (
            <label>
              Reuse a question from the bank
              <select
                defaultValue=""
                onChange={(e) => {
                  const found = bank.find((q) => q.id === e.target.value);
                  if (found)
                    update({
                      questions: [
                        ...definition.questions,
                        { ...structuredClone(found.document), id: id() },
                      ],
                    });
                  e.target.value = '';
                }}
              >
                <option value="">Choose a saved question…</option>
                {bank.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.document.prompt}
                  </option>
                ))}
              </select>
            </label>
          )}
          {definition.questions.map((question, qi) => (
            <div className="builder-question" key={question.id}>
              <div className="builder-heading">
                <h4>Question {qi + 1}</h4>
                <OrderButtons
                  index={qi}
                  count={definition.questions.length}
                  onMove={(delta) => update({ questions: move(definition.questions, qi, delta) })}
                  onRemove={() =>
                    update({ questions: definition.questions.filter((_, i) => i !== qi) })
                  }
                />
              </div>
              <QuestionEditor
                value={question}
                onChange={(next) =>
                  update({ questions: definition.questions.map((q, i) => (i === qi ? next : q)) })
                }
              />
              <button
                className="text-button"
                onClick={async () => {
                  const { error } = await requireBackend().rpc('save_bank_question', {
                    p_id: null,
                    p_document: question,
                  });
                  if (error) setError(error.message);
                  else setNotice('Question saved to the private reusable question bank.');
                }}
              >
                Save a copy to question bank
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
function localDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function OrderButtons({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (n: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="order-buttons">
      <button aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
        <ArrowUp size={15} />
      </button>
      <button aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
        <ArrowDown size={15} />
      </button>
      <button aria-label="Remove from draft" onClick={onRemove}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}
function RuleEditor({
  rule: r,
  onChange,
  onRemove,
}: {
  rule: Rule;
  onChange: (r: Rule) => void;
  onRemove: () => void;
}) {
  const types = [
    'repository',
    'file',
    'branch',
    'commits',
    'message',
    'merged',
    'isolation',
  ] as const;
  return (
    <div className="rule-editor">
      <label>
        Check completion by
        <select value={r.type} onChange={(e) => onChange({ type: e.target.value as Rule['type'] })}>
          {r.type === 'legacy' && (
            <option value="legacy">
              Course task:{' '}
              {
                taskGuide({
                  id: 'guide',
                  title: 'Course check',
                  instructions: '',
                  points: 0,
                  bonus: false,
                  rules: [r],
                }).title
              }
            </option>
          )}
          {types.map((t) => (
            <option key={t} value={t}>
              {
                {
                  repository: 'Git setup and clean files',
                  file: 'File content',
                  branch: 'A saved branch',
                  commits: 'Number of commits',
                  message: 'A commit message',
                  merged: 'Merged branch history',
                  isolation: 'A file added on a branch',
                }[t]
              }
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        {
          {
            repository:
              'Checks that Git is initialized, with the selected current branch and optional clean working files.',
            file: 'Checks the named file in working files or the committed history of the selected branch.',
            branch: 'Checks that the named branch has committed history.',
            commits: 'Counts commits reachable from the selected branch.',
            message: 'Finds the required message in the selected branch history.',
            merged:
              'Checks source history is included in the receiving branch, with an optional merge commit.',
            isolation: 'Checks that the file was introduced by a new commit on the source branch.',
            legacy: 'Preserves the original Assignment 01 scoring rule.',
          }[r.type]
        }
      </p>
      <small>
        Rules in one task must all pass to earn its points. Add a separate scored task for each
        requirement that should earn partial credit.
      </small>
      {(r.type === 'repository' || r.type === 'branch') && (
        <label>
          Required branch
          <input
            value={r.branch || ''}
            onChange={(e) => onChange({ ...r, branch: e.target.value })}
          />
        </label>
      )}
      {r.type === 'repository' && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={!!r.clean}
            onChange={(e) => onChange({ ...r, clean: e.target.checked })}
          />
          Require clean working tree
        </label>
      )}
      {['file', 'isolation'].includes(r.type) && (
        <label>
          Expected file path
          <input
            placeholder="login.txt"
            value={r.path || ''}
            onChange={(e) => onChange({ ...r, path: e.target.value })}
          />
        </label>
      )}
      {['file', 'commits', 'message'].includes(r.type) && (
        <label>
          Branch / snapshot
          <input
            placeholder="main (or working for a file rule)"
            value={r.ref || 'main'}
            onChange={(e) => onChange({ ...r, ref: e.target.value })}
          />
        </label>
      )}
      {r.type === 'file' && (
        <label>
          Content rule
          <select
            value={r.match || 'exists'}
            onChange={(e) => onChange({ ...r, match: e.target.value as Rule['match'] })}
          >
            <option value="exists">File exists</option>
            <option value="contains">Contains text</option>
            <option value="exact">Exact text (normalized whitespace)</option>
            <option value="lines">Minimum non-empty lines</option>
          </select>
        </label>
      )}
      {(r.type === 'message' ||
        (r.type === 'file' && ['contains', 'exact'].includes(r.match || ''))) && (
        <label>
          Expected text
          <textarea
            rows={2}
            placeholder="Supports {{name}} and {{department}}"
            value={r.value || ''}
            onChange={(e) => onChange({ ...r, value: e.target.value })}
          />
        </label>
      )}
      {(r.type === 'commits' || r.match === 'lines') && (
        <label>
          Minimum count
          <input
            type="number"
            min={1}
            max={150}
            value={r.min || 1}
            onChange={(e) => onChange({ ...r, min: Number(e.target.value) })}
          />
        </label>
      )}
      {['merged', 'isolation'].includes(r.type) && (
        <>
          <label>
            Feature / source branch
            <input
              placeholder="feature/login"
              value={r.source || ''}
              onChange={(e) => onChange({ ...r, source: e.target.value })}
            />
          </label>
          {r.type === 'merged' && (
            <>
              <label>
                Receiving branch
                <input
                  value={r.target || 'main'}
                  onChange={(e) => onChange({ ...r, target: e.target.value })}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!r.mergeCommit}
                  onChange={(e) => onChange({ ...r, mergeCommit: e.target.checked })}
                />
                Require a merge commit
              </label>
            </>
          )}
        </>
      )}
      <button className="text-button" onClick={onRemove}>
        Remove rule
      </button>
    </div>
  );
}
export function QuestionEditor({
  value: q,
  onChange,
}: {
  value: AssessmentQuestion;
  onChange: (q: AssessmentQuestion) => void;
}) {
  const objective = ['single', 'multiple', 'boolean'].includes(q.kind);
  return (
    <div className="question-fields">
      <label>
        Question text
        <textarea
          rows={3}
          maxLength={8000}
          value={q.prompt}
          onChange={(e) => onChange({ ...q, prompt: e.target.value })}
        />
      </label>
      <div className="field-grid">
        <label>
          Question type
          <select
            value={q.kind}
            onChange={(e) => {
              const kind = e.target.value as AssessmentQuestion['kind'];
              onChange({
                ...q,
                kind,
                manual: !['single', 'multiple', 'boolean'].includes(kind),
                options: kind === 'boolean' ? ['True', 'False'] : q.options,
                correctAnswers: [],
              });
            }}
          >
            {[
              ['single', 'Multiple Choice'],
              ['multiple', 'Multiple Select'],
              ['boolean', 'True / False'],
              ['short', 'Short Answer'],
              ['long', 'Long Written Answer'],
              ['interpretation', 'Terminal Output Interpretation'],
              ['scenario', 'Scenario'],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Question points
          <input
            type="number"
            min={0}
            max={1000}
            value={q.points}
            onChange={(e) => onChange({ ...q, points: Number(e.target.value) })}
          />
        </label>
      </div>
      {objective && (
        <>
          <label>
            Options (one per line)
            <textarea
              rows={4}
              value={q.options.join('\n')}
              onChange={(e) =>
                onChange({ ...q, options: e.target.value.split('\n'), correctAnswers: [] })
              }
            />
          </label>
          <fieldset>
            <legend>Private correct answer{q.kind === 'multiple' ? 's' : ''}</legend>
            {q.options.map((option, i) => (
              <label className="option" key={i}>
                <input
                  type={q.kind === 'multiple' ? 'checkbox' : 'radio'}
                  name={'key-' + q.id}
                  checked={q.correctAnswers?.includes(option) || false}
                  onChange={(e) =>
                    onChange({
                      ...q,
                      correctAnswers:
                        q.kind === 'multiple'
                          ? e.target.checked
                            ? [...(q.correctAnswers || []), option]
                            : (q.correctAnswers || []).filter((a) => a !== option)
                          : [option],
                    })
                  }
                />
                {option || '(empty option)'}
              </label>
            ))}
          </fieldset>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={q.manual}
              onChange={(e) => onChange({ ...q, manual: e.target.checked })}
            />
            Require manual grading instead
          </label>
        </>
      )}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={q.required}
          onChange={(e) => onChange({ ...q, required: e.target.checked })}
        />
        Required question
      </label>
      <label>
        Private explanation / rubric
        <textarea
          rows={3}
          maxLength={5000}
          value={q.explanation || ''}
          onChange={(e) => onChange({ ...q, explanation: e.target.value })}
        />
      </label>
      <small>
        Correct answers and explanations are stored only in the instructor draft and private
        published answer key.
      </small>
    </div>
  );
}

export function QuestionBank() {
  const [rows, setRows] = useState<
      Array<{ id: string; document: AssessmentQuestion; archived: boolean }>
    >([]),
    [editing, setEditing] = useState<AssessmentQuestion | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState(''),
    [kind, setKind] = useState(''),
    [page, setPage] = useState(0),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      let query = requireBackend()
        .from('question_bank')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .order('id')
        .range(page * 25, page * 25 + 24);
      if (search) query = query.ilike('document->>prompt', '%' + search + '%');
      if (kind) query = query.eq('document->>kind', kind);
      void query.then(({ data, error, count }) => {
        if (!live) return;
        if (error) setError(error.message);
        else {
          setRows(data || []);
          setTotal(count || 0);
        }
        setLoading(false);
      });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, kind, page, refresh]);
  return (
    <section className="form-card editor-fields">
      <div className="page-heading">
        <h2>Reusable question bank</h2>
        <button
          className="primary"
          onClick={() => {
            setEditing(newQuestion());
            setSelected(null);
            setError('');
          }}
        >
          Create question
        </button>
      </div>
      <p>
        Private answer keys and rubrics remain available only to instructors. Archiving never
        changes published assessments.
      </p>
      <div className="table-toolbar">
        <input
          aria-label="Search questions"
          placeholder="Search question text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Question type filter"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All question types</option>
          {['single', 'multiple', 'boolean', 'short', 'long', 'scenario', 'interpretation'].map(
            (t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ),
          )}
        </select>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {editing && (
        <div className="builder-question">
          <QuestionEditor value={editing} onChange={setEditing} />
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                assertDefinition({ ...blankDefinition(), format: 'theory', questions: [editing] });
                const { error } = await requireBackend().rpc('save_bank_question', {
                  p_id: selected,
                  p_document: editing,
                });
                if (error) throw error;
                setEditing(null);
                setNotice('Question saved.');
                setRefresh((n) => n + 1);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save question
          </button>
          <button className="text-button" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading questions…</p>
      ) : (
        <>
          {rows.map((q) => (
            <article className="bank-row" key={q.id}>
              <div>
                <strong>{q.document.prompt}</strong>
                <small>
                  {q.document.kind} · {q.document.points} points {q.archived ? '· Archived' : ''}
                </small>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setSelected(q.id);
                  setEditing(structuredClone(q.document));
                  setError('');
                }}
              >
                Edit
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  if (
                    !window.confirm(
                      q.archived
                        ? 'Restore this bank question?'
                        : 'Archive this bank question? Published versions remain unchanged.',
                    )
                  )
                    return;
                  setBusy(true);
                  const { error } = await requireBackend().rpc('archive_bank_question', {
                    p_id: q.id,
                    p_archived: !q.archived,
                  });
                  if (error) setError(error.message);
                  else setRefresh((n) => n + 1);
                  setBusy(false);
                }}
              >
                {q.archived ? 'Restore' : 'Archive question'}
              </button>
            </article>
          ))}
          {!rows.length && !error && <p>No questions match your filters.</p>}
          <Pagination page={page} total={total} onPage={setPage} />
        </>
      )}
    </section>
  );
}
