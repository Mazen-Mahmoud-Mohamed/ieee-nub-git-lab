import { supabase } from '../../services/supabase';
import { PublishedCourses } from './PublishedCourses';
import { Link } from 'react-router-dom';
import { courseLessons } from './presentation';
export function LearningGuide() {
  return (
    <div className="page learning-guide">
      <Link to="/dashboard" className="breadcrumb">
        My learning
      </Link>
      <h1>Git, one step at a time</h1>
      <p className="lead">
        Read a short lesson, then try it in the practice lab. Your assessed work stays separate.
      </p>
      {!supabase && (
        <div className="lesson-grid">
          {courseLessons.map((lesson, i) => (
            <article key={lesson.id} id={lesson.id}>
              <span className="eyebrow">Lesson {i + 1}</span>
              <h2>{lesson.title}</h2>
              <p>{lesson.text}</p>
              <pre dir="ltr">
                <code>{lesson.command}</code>
              </pre>
            </article>
          ))}
        </div>
      )}
      {!!supabase && <PublishedCourses />}
      <Link className="primary" to="/workspace">
        Try it in the practice lab
      </Link>
    </div>
  );
}
