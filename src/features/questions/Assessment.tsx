import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Flag, ShieldCheck, Check } from 'lucide-react';
import type { Lab } from '../../hooks/useLab';
import { questions, reflectionQuestions, type Question } from '../assignments/assignment';
import { supabase } from '../../services/supabase';
export function Assessment({ lab, unlocked }: { lab: Lab; unlocked: boolean }) {
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const [pasteAllowed, setPasteAllowed] = useState(false);
  const [configured, setConfigured] = useState<Question[]>(questions);
  useEffect(() => {
    if (!supabase) return;
    void supabase
      .from('app_settings')
      .select('accessibility_paste')
      .eq('id', true)
      .single()
      .then(({ data }) => {
        if (data) setPasteAllowed(data.accessibility_paste);
      });
    void supabase
      .from('questions')
      .select('id,prompt,kind,points,options')
      .eq('assignment_id', 'b6f4b6d0-5fe2-4e4d-b9a5-000000000001')
      .order('position')
      .then(({ data }) => {
        if (data?.length) setConfigured(data as Question[]);
      });
  }, []);
  const all = [...configured, ...reflectionQuestions];
  const question = all[index];
  if (!unlocked && !lab.receipt)
    return (
      <div className="page narrow">
        <h1>A little more practice first.</h1>
        <p>Complete the required repository outcomes to unlock theory. Bonus work is optional.</p>
        <Link className="primary" to="/workspace">
          Return to workspace
        </Link>
      </div>
    );
  const block = (e: React.SyntheticEvent) => {
    if (!pasteAllowed) {
      e.preventDefault();
      setNotice(
        'Please write your own response. Contact your instructor if you need a paste accessibility exception.',
      );
    }
  };
  return (
    <div className="page assessment">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ASSIGNMENT 01 / THEORY</span>
          <h1>Understand the why.</h1>
          <p>12 written questions · 25 points · Instructor reviewed</p>
        </div>
        <span className="save-state">
          <i className="live-dot" />
          {lab.saving}
        </span>
      </div>
      <div className="assessment-grid">
        <aside className="form-card">
          <h3>Your questions</h3>
          <div className="question-grid">
            {all.map((q, i) => (
              <button
                key={q.id}
                aria-label={`Question ${i + 1}${lab.answers[q.id] ? ' answered' : ''}${lab.flagged.includes(q.id) ? ' flagged' : ''}`}
                className={
                  (index === i ? 'active ' : '') +
                  (lab.answers[q.id] ? 'answered ' : '') +
                  (lab.flagged.includes(q.id) ? 'flagged' : '')
                }
                onClick={() => setIndex(i)}
              >
                {lab.answers[q.id] ? <Check size={13} /> : i + 1}
              </button>
            ))}
          </div>
          <p>
            {configured.filter((q) => lab.answers[q.id]?.trim()).length} of {configured.length}{' '}
            required answers
          </p>
          <small>
            Questions 13–14 are practical reflections. Question 15 is optional bonus reflection.
          </small>
          <hr />
          <ShieldCheck size={22} />
          <p>Assessment integrity</p>
          <small>
            {pasteAllowed
              ? 'Your instructor has enabled paste accessibility support.'
              : 'Paste, drop insertion, and the context menu are restricted in answer fields. This is a deterrent, not a guarantee against cheating. Ask your instructor for an accessibility exception.'}
          </small>
          <Link to="/workspace" className="practice-link">
            ← Back to workspace
          </Link>
        </aside>
        <section className="form-card question-card">
          <div className="question-meta">
            <span>
              QUESTION {String(index + 1).padStart(2, '0')} / {all.length}
            </span>
            <span>{question.points ? question.points + ' points' : 'Practical reflection'}</span>
          </div>
          <h2>{question.prompt}</h2>
          <button
            className="text-button flag-button"
            onClick={() =>
              lab.setFlagged(
                lab.flagged.includes(question.id)
                  ? lab.flagged.filter((id) => id !== question.id)
                  : [...lab.flagged, question.id],
              )
            }
          >
            <Flag size={14} />
            {lab.flagged.includes(question.id) ? 'Flagged for review' : 'Flag for review'}
          </button>
          <div
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
            {['single', 'multiple'].includes(question.kind) ? (
              <fieldset>
                <legend>Select your answer{question.kind === 'multiple' ? 's' : ''}</legend>
                {question.options?.map((option) => (
                  <label className="option" key={option}>
                    <input
                      type={question.kind === 'single' ? 'radio' : 'checkbox'}
                      disabled={!!lab.receipt}
                      name={question.id}
                      checked={
                        question.kind === 'single'
                          ? lab.answers[question.id] === option
                          : (lab.answers[question.id] || '').split('\n').includes(option)
                      }
                      onChange={(e) => {
                        const previous = (lab.answers[question.id] || '')
                          .split('\n')
                          .filter(Boolean);
                        lab.setAnswers({
                          ...lab.answers,
                          [question.id]:
                            question.kind === 'single'
                              ? option
                              : e.target.checked
                                ? [...previous, option].join('\n')
                                : previous.filter((x) => x !== option).join('\n'),
                        });
                      }}
                    />
                    {option}
                  </label>
                ))}
              </fieldset>
            ) : (
              <label className="answer-label">
                Your response
                <textarea
                  maxLength={8000}
                  readOnly={!!lab.receipt}
                  value={lab.answers[question.id] || ''}
                  placeholder="Explain your reasoning in your own words…"
                  rows={11}
                  onChange={(e) =>
                    lab.setAnswers({ ...lab.answers, [question.id]: e.target.value })
                  }
                />
              </label>
            )}
          </div>
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          <div className="question-navigation">
            <button
              className="outline-button"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              <ArrowLeft size={15} />
              Previous
            </button>
            {index < all.length - 1 ? (
              <button className="primary" onClick={() => setIndex(index + 1)}>
                Next question
                <ArrowRight size={15} />
              </button>
            ) : (
              <Link className="primary" to="/review">
                Review submission
                <ArrowRight size={15} />
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
