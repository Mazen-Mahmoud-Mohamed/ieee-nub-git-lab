import { taskOneDefinition } from '../assessments/taskOne';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Lab } from '../../hooks/useLab';
import { totals, answerPresent, type Definition } from '../assessments/model';
import { supabase } from '../../services/supabase';
import { StudentSteps } from '../assessments/StudentSteps';

const questionType = {
  single: 'Multiple choice',
  multiple: 'Multiple select',
  boolean: 'True or false',
  'choice-complete': 'Complete the sentence',
  'fill-blank': 'Fill in the blank',
} as const;
export function Assessment({
  lab,
  definition = taskOneDefinition(),
  basePath = '',
}: {
  lab: Lab;
  definition?: Definition;
  basePath?: string;
}) {
  const [index, setIndex] = useState(0),
    [notice, setNotice] = useState(''),
    [pasteAllowed, setPasteAllowed] = useState(false);
  const all = definition.questions,
    question = all[index],
    required = all.filter((q) => q.required),
    answered = required.filter((q) => answerPresent(q, lab.answers[q.id])).length,
    questionIds = all.map((q) => q.id).join('|');
  useEffect(() => {
    setIndex(0);
    setNotice('');
  }, [lab.key, questionIds]);
  useEffect(() => {
    let live = true;
    if (supabase)
      void supabase
        .from('app_settings')
        .select('accessibility_paste')
        .eq('id', true)
        .single()
        .then(({ data }) => {
          if (live && data) setPasteAllowed(data.accessibility_paste);
        });
    return () => {
      live = false;
    };
  }, []);
  const block = (e: React.SyntheticEvent) => {
    if (!pasteAllowed) {
      e.preventDefault();
      setNotice(
        'Write your own response. Ask your instructor if you need paste accessibility support.',
      );
    }
  };
  const setAnswer = (value: string) =>
    lab.setAnswers((previous) => ({ ...previous, [question.id]: value }));
  const objectiveType = questionType[question?.kind as keyof typeof questionType];
  const hasObjective = all.some((q) => Object.hasOwn(questionType, q.kind));
  const answeredTotal = all.filter((q) => answerPresent(q, lab.answers[q.id])).length;
  return (
    <div className="page student-questions lab-questions">
      <StudentSteps basePath={basePath} />
      <header className="questions-heading lab-page-heading">
        <div>
          <span className="lab-kicker">Theory</span>
          <h1>Questions</h1>
          <p>
            {definition.title} · {totals(definition).theory} points
          </p>
        </div>
        <span className="save-state" role="status">
          {lab.saving}
        </span>
      </header>
      {!question ? (
        <section className="form-card">
          <h2>No questions in this assessment.</h2>
          <Link className="primary" to={basePath + '/review'}>
            Review submission
          </Link>
        </section>
      ) : (
        <section className="simple-question lab-question-card">
          <div className="question-position">
            <label>
              Question
              <select
                aria-label="Choose question"
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
              >
                {all.map((q, i) => (
                  <option key={q.id} value={i}>
                    {i + 1}. {answerPresent(q, lab.answers[q.id]) ? 'Answered' : 'Unanswered'}
                    {q.required ? ' · Required' : q.points === 0 ? ' · Optional' : ''}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {required.length || !hasObjective
                ? `${answered} of ${required.length} required answers`
                : `${answeredTotal} of ${all.length} answered`}
            </span>
          </div>
          {(required.length > 0 || hasObjective) && (
            <progress
              className="lab-question-progress"
              value={required.length ? answered : answeredTotal}
              max={required.length || all.length}
              aria-label={required.length ? 'Required questions answered' : 'Questions answered'}
            />
          )}
          <div className="question-meta">
            <span>
              QUESTION {index + 1} / {all.length}
            </span>
            {objectiveType && <span>{objectiveType}</span>}
            <span>
              {question.points ? question.points + ' points' : 'Practical reflection'}
              {question.required ? ' · Required' : question.points === 0 ? ' · Optional' : ''}
            </span>
          </div>
          <h2 dir="auto" className="written-answer">
            {question.prompt}
          </h2>
          <div
            key={question.id}
            onPaste={block}
            onDrop={block}
            onContextMenu={block}
            onKeyDown={(e) => {
              if (
                !pasteAllowed &&
                (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') ||
                  (e.shiftKey && e.key === 'Insert'))
              )
                block(e);
            }}
          >
            {['single', 'multiple', 'boolean', 'choice-complete'].includes(question.kind) ? (
              <fieldset className="question-choices">
                <legend>
                  {question.kind === 'multiple'
                    ? 'Select all that apply'
                    : question.kind === 'choice-complete'
                      ? 'Choose what belongs in the blank'
                      : 'Choose one answer'}
                </legend>
                {question.options.map((option) => (
                  <label className="option" key={option}>
                    <input
                      type={question.kind === 'multiple' ? 'checkbox' : 'radio'}
                      name={question.id}
                      disabled={lab.readOnly}
                      checked={
                        question.kind === 'multiple'
                          ? (lab.answers[question.id] || '').split('\n').includes(option)
                          : lab.answers[question.id] === option
                      }
                      onChange={(e) => {
                        const checked = e.target.checked;
                        lab.setAnswers((previous) => {
                          const selected = (previous[question.id] || '')
                            .split('\n')
                            .filter(Boolean);
                          return {
                            ...previous,
                            [question.id]:
                              question.kind !== 'multiple'
                                ? option
                                : checked
                                  ? [...new Set([...selected, option])].join('\n')
                                  : selected.filter((s) => s !== option).join('\n'),
                          };
                        });
                      }}
                    />
                    <span dir="auto">{option}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <label className="answer-label">
                Your response
                {['short', 'fill-blank'].includes(question.kind) ? (
                  <>
                    <input
                      dir="auto"
                      maxLength={8000}
                      autoCapitalize={question.kind === 'fill-blank' ? 'none' : undefined}
                      autoCorrect={question.kind === 'fill-blank' ? 'off' : undefined}
                      aria-label={question.kind === 'fill-blank' ? 'Your response' : undefined}
                      spellCheck={question.kind !== 'fill-blank'}
                      aria-describedby={
                        question.kind === 'fill-blank' ? 'typed-answer-format' : undefined
                      }
                      readOnly={lab.readOnly}
                      value={lab.answers[question.id] || ''}
                      onChange={(e) => setAnswer(e.target.value)}
                    />
                    {question.kind === 'fill-blank' && (
                      <small id="typed-answer-format">
                        {question.answerMatching === 'git-command'
                          ? 'Type the missing Git command. Use the exact capitalization for the command and branch name. Extra spaces between words are accepted.'
                          : 'Type only the missing command or term. Capitalization and extra spaces are accepted.'}
                      </small>
                    )}
                  </>
                ) : (
                  <textarea
                    dir="auto"
                    rows={6}
                    maxLength={8000}
                    readOnly={lab.readOnly}
                    value={lab.answers[question.id] || ''}
                    placeholder="Write your response…"
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                )}
              </label>
            )}
          </div>
          <p className="question-answer-state">
            {answerPresent(question, lab.answers[question.id]) ? 'Answered' : 'Unanswered'}
            {question.manual ||
            !['single', 'multiple', 'boolean', 'choice-complete', 'fill-blank'].includes(
              question.kind,
            )
              ? ' · Marked by your instructor.'
              : ' · Automatically graded on submission.'}
          </p>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <div className="question-navigation">
            <button
              className="outline-button"
              disabled={index === 0}
              onClick={() => {
                setIndex((i) => i - 1);
                setNotice('');
              }}
            >
              Previous question
            </button>
            {index < all.length - 1 ? (
              <button
                className="primary"
                onClick={() => {
                  setIndex((i) => i + 1);
                  setNotice('');
                }}
              >
                Next question
              </button>
            ) : (
              <Link className="primary" to={basePath + '/review'}>
                Review submission
              </Link>
            )}
          </div>
          <details className="question-integrity">
            <summary>Answer-field accessibility</summary>
            <p>
              {pasteAllowed
                ? 'Your instructor has enabled paste accessibility support.'
                : 'Paste and drop are restricted in answer fields. Ask your instructor for an accessibility exception.'}
            </p>
          </details>
        </section>
      )}
    </div>
  );
}
