import { RecordManager, AdminActivity } from './RecordManagement';
import { LearningContent } from './LearningContent';
import { LearningSessions } from './LearningSessions';
import { HelpRequests } from './HelpRequests';
import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { requireBackend } from '../../services/supabase';
import { AssessmentManager, AssessmentEditor, QuestionBank } from './AssessmentEditor';
import { Overview, Students, Attempts } from './AdminPages';
export function Instructor() {
  return (
    <div className="page instructor">
      <div className="page-heading">
        <div>
          <span className="eyebrow">INSTRUCTOR CONSOLE</span>
          <h1>Admin Dashboard</h1>
        </div>
        <span className="badge">AUTHORIZED INSTRUCTOR</span>
      </div>
      <nav className="instructor-nav" aria-label="Instructor navigation">
        {[
          ['', 'Overview'],
          ['sessions', 'Learning Sessions'],
          ['content', 'Courses & lessons'],
          ['students', 'Students'],
          ['submissions', 'Submissions'],
          ['assignments', 'Assignments'],
          ['exams', 'Exams'],
          ['questions', 'Question Bank'],
          ['results', 'Grades'],
          ['requests', 'Help requests'],
          ['records', 'Archive & Trash'],
          ['activity', 'Activity'],
          ['settings', 'Settings'],
        ].map(([path, label]) => (
          <NavLink key={path} end={!path} to={'/instructor' + (path ? '/' + path : '')}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="content" element={<LearningContent />} />
        <Route path="sessions" element={<LearningSessions />} />
        <Route path="records" element={<RecordManager />} />
        <Route path="activity" element={<AdminActivity />} />
        <Route path="students" element={<Students />} />
        <Route path="submissions" element={<Attempts key="submissions" />} />
        <Route path="results" element={<Attempts key="results" results />} />
        <Route
          path="assignments"
          element={<AssessmentManager key="assignments" type="assignment" />}
        />
        <Route path="exams" element={<AssessmentManager key="exams" type="exam" />} />
        <Route path="assessments" element={<AssessmentManager key="all" />} />
        <Route path="assessments/:id" element={<AssessmentEditor />} />
        <Route path="questions" element={<QuestionBank />} />
        <Route path="requests" element={<HelpRequests />} />
        <Route path="settings" element={<Settings />} />
      </Routes>
    </div>
  );
}
function Settings() {
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void requireBackend()
      .from('app_settings')
      .select('accessibility_paste')
      .eq('id', true)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setEnabled(data.accessibility_paste);
      });
  }, []);
  return (
    <section className="form-card narrow">
      <h2>Assessment accessibility</h2>
      <p>
        Enable paste access for the class when assistive technology, language tools, or an
        accommodation requires it. This does not affect repository verification.
      </p>
      <label className="checkbox-label">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Allow paste in protected answer fields
      </label>
      <button
        className="primary"
        onClick={async () => {
          const { error } = await requireBackend().rpc('update_settings', { p_paste: enabled });
          if (error) setError(error.message);
          else setNotice('Accessibility setting saved and audited.');
        }}
      >
        Save settings
      </button>
      {error && <p className="error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <hr />
      <h3>Data retention</h3>
      <p>
        Use the documented privileged retention procedure after the institution’s appeal period.
        Export required records first. Student data is private and is never used to train this
        application.
      </p>
    </section>
  );
}
