import { Component, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  GitBranch,
  GitCommitHorizontal,
  LayoutDashboard,
  Moon,
  Sun,
  TerminalSquare,
  GraduationCap,
  CheckCircle2,
  LogOut,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase, type Profile, requireBackend } from '../services/supabase';
import { useLab } from '../hooks/useLab';
import { AuthPage, ProfilePage } from '../features/auth/Auth';
import { Workspace } from '../features/assignments/Workspace';
import { ASSIGNMENT_ID } from '../features/assignments/assignment';
import { outcomesFor } from '../features/assessments/model';
import { useAssessmentRoute } from '../hooks/useAssessmentRoute';
import { useAssessmentSession } from '../hooks/useAssessmentSession';
import { workspaceKey } from '../features/assessments/clock';
import { CourseDashboard, AssessmentDetails } from '../features/assessments/CourseDashboard';
import { SessionBar } from '../features/assessments/SessionBar';
import { AssessmentResult } from '../features/assessments/AssessmentResult';
import { Assessment } from '../features/questions/Assessment';
import { Review, Confirmation } from '../features/submissions/Review';
import { Instructor } from '../features/instructor/Instructor';
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="page narrow">
        <h1>Something interrupted the lab.</h1>
        <p role="alert">{this.state.error}</p>
        <button className="primary" onClick={() => location.reload()}>
          Reload saved workspace
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [isInstructor, setIsInstructor] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('ieee-theme') !== 'light');
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState('');
  const course = useAssessmentRoute(user?.id);
  const lab = useLab(
    course.active
      ? workspaceKey(
          user?.id || 'pending',
          course.assessmentId,
          course.attemptId!,
          course.state?.assignment_version || 1,
        )
      : user?.id || 'local-practice',
    course.definition,
    !course.loading && (!course.active || !!course.state),
    course.active && user ? { userId: user.id, attemptId: course.attemptId! } : undefined,
  );
  const session = useAssessmentSession(lab, course.state);
  const navigate = useNavigate();
  const loadProfile = async () => {
    if (!supabase) return;
    const {
      data: { user: current },
    } = await supabase.auth.getUser();
    setUser(current);
    if (current) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', current.id)
        .maybeSingle();
      if (error) setError(error.message);
      setProfile(data);
      const { data: role } = await supabase.rpc('is_instructor');
      setIsInstructor(role === true);
    } else {
      setProfile(null);
      setIsInstructor(false);
    }
  };
  useEffect(() => {
    if (!supabase) return;
    void loadProfile().finally(() => setAuthReady(true));
    const { data } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => void loadProfile(), 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('ieee-theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const identity = profile || {
    full_name: localStorage.getItem('practice-name') || '',
    department: localStorage.getItem('practice-department') || '',
  };
  const working = Object.fromEntries(
    Object.entries(lab.engine.fs.entries)
      .filter(([p, e]) => p.endsWith('.txt') && !p.includes('/.git/') && e.kind === 'file')
      .map(([p, e]) => [
        p.slice(lab.engine.dir.length + 1),
        new TextDecoder().decode(new Uint8Array(e.data)),
      ]),
  );
  const outcomes = outcomesFor(course.definition, lab.view, identity, working);
  const unlocked = outcomes.filter((o) => !o.bonus).every((o) => o.passed);
  async function start() {
    if (!user) {
      navigate('/workspace');
      return;
    }
    if (!profile) {
      navigate('/profile');
      return;
    }
    const { data, error } = await requireBackend().rpc('start_assessment', {
      p_assessment: course.assessmentId || ASSIGNMENT_ID,
    });
    if (error) {
      setError(error.message);
      throw error;
    }
    navigate(
      '/assessments/' +
        course.assessmentId +
        '/attempts/' +
        data.id +
        '/' +
        (course.definition.format === 'theory' ? 'theory' : 'workspace'),
    );
  }
  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="app-header">
        <Link to="/" className="brand">
          <span className="brand-symbol">◇</span>
          <span className="brand-ieee">
            IEEE<span>NAHDA UNIVERSITY</span>
          </span>
          <i />
          <span className="brand-lab">
            Git Lab<span>LEARN. COMMIT. GROW.</span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <NavLink to="/dashboard">
            <LayoutDashboard size={15} />
            My learning
          </NavLink>
          <NavLink to="/overview">
            <BookOpen size={15} />
            Assignment
          </NavLink>
          <NavLink to="/workspace">
            <TerminalSquare size={15} />
            Workspace
          </NavLink>
          {isInstructor && <NavLink to="/instructor">Instructor</NavLink>}
        </nav>
        <div className="header-actions">
          <button
            className="theme-toggle"
            aria-label="Toggle light and dark theme"
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <span className="header-divider" />
          {user ? (
            <>
              <Link className="avatar" title="Student profile" to="/profile">
                {profile?.full_name
                  ?.split(' ')
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join('') || 'ST'}
              </Link>
              <button
                aria-label="Sign out"
                onClick={async () => {
                  await lab.persist();
                  await supabase?.auth.signOut();
                  navigate('/');
                }}
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <Link className="header-signin" to="/auth">
              Sign in
              <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
      </header>
      {!online && (
        <div className="offline" role="status">
          <WifiOff size={15} />
          You’re offline. Work saves on this device; submission needs a connection.
        </div>
      )}
      {error && (
        <div className="error app-error" role="alert">
          {error}
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      )}
      <main id="main">
        {!authReady ? (
          <div className="page">Checking your session…</div>
        ) : (
          <Routes>
            <Route path="/" element={<Landing onStart={start} />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/profile"
              element={user ? <ProfilePage profile={profile} onSave={loadProfile} /> : <AuthPage />}
            />
            <Route path="/dashboard" element={<CourseDashboard profile={profile} />} />
            <Route
              path="/overview"
              element={
                <AssessmentDetails
                  definition={course.definition}
                  onStart={start}
                  authenticated={!!user}
                />
              }
            />
            <Route
              path="/workspace"
              element={
                <Workspace
                  lab={lab}
                  identity={identity}
                  dark={dark}
                  definition={course.definition}
                  basePath={course.basePath}
                />
              }
            />
            <Route
              path="/theory"
              element={
                <Assessment
                  lab={lab}
                  unlocked={unlocked}
                  definition={course.definition}
                  basePath={course.basePath}
                />
              }
            />
            <Route
              path="/review"
              element={
                <Review
                  lab={lab}
                  identity={identity}
                  authenticated={!!user && !!profile && course.active}
                  definition={course.definition}
                  basePath={course.basePath}
                  submit={course.active ? session.submit : undefined}
                />
              }
            />
            <Route path="/confirmation" element={<Confirmation lab={lab} />} />
            <Route
              path="/assessments/:assessmentId"
              element={
                course.loading ? (
                  <div className="page">Loading assessment…</div>
                ) : course.error ? (
                  <div className="page error" role="alert">
                    {course.error}
                  </div>
                ) : (
                  <AssessmentDetails
                    definition={course.definition}
                    onStart={start}
                    authenticated={!!user}
                  />
                )
              }
            />
            <Route
              path="/assessments/:assessmentId/attempts/:attemptId/*"
              element={
                !user ? (
                  <AuthPage />
                ) : course.loading || !course.state || !lab.ready || !session.ready ? (
                  <div className="page">Restoring assessment session…{course.error}</div>
                ) : (
                  <>
                    <SessionBar session={session} state={course.state} />
                    <Routes>
                      <Route
                        path="workspace"
                        element={
                          <Workspace
                            lab={lab}
                            identity={identity}
                            dark={dark}
                            definition={course.definition}
                            basePath={course.basePath}
                          />
                        }
                      />
                      <Route
                        path="theory"
                        element={
                          <Assessment
                            lab={lab}
                            unlocked={unlocked}
                            definition={course.definition}
                            basePath={course.basePath}
                          />
                        }
                      />
                      <Route
                        path="review"
                        element={
                          <Review
                            lab={lab}
                            identity={identity}
                            authenticated={!!profile}
                            definition={course.definition}
                            basePath={course.basePath}
                            submit={session.submit}
                          />
                        }
                      />
                      <Route
                        path="result"
                        element={
                          <AssessmentResult
                            lab={lab}
                            definition={course.definition}
                            state={course.state}
                            basePath={course.basePath}
                          />
                        }
                      />
                    </Routes>
                  </>
                )
              }
            />
            <Route
              path="/instructor/*"
              element={
                user && isInstructor ? (
                  <Instructor />
                ) : (
                  <div className="page narrow">
                    <ShieldCheck size={40} />
                    <h1>Instructor access required.</h1>
                    <p>Your account must be authorized by the application administrator.</p>
                    <Link to="/dashboard">Return to your dashboard</Link>
                  </div>
                )
              }
            />
            <Route
              path="*"
              element={
                <div className="page narrow">
                  <span className="eyebrow">404 / PATH NOT FOUND</span>
                  <h1>Let’s switch back.</h1>
                  <p>This page isn’t part of the current history.</p>
                  <Link className="primary" to="/dashboard">
                    Back to learning
                    <ArrowRight size={16} />
                  </Link>
                </div>
              }
            />
          </Routes>
        )}
      </main>
    </ErrorBoundary>
  );
}
function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing">
      <div className="landing-grid">
        <section>
          <div className="course-pill">
            <i className="live-dot" />
            IEEE NUB · GIT & GITHUB TRAINING
          </div>
          <h1>
            Great things start
            <br />
            with a <em>first commit.</em>
          </h1>
          <p>
            Turn Git from something you’ve heard about into something you understand. A real
            workspace. Hands-on assignments. Your own learning journey.
          </p>
          <div className="landing-actions">
            <button className="primary" onClick={onStart}>
              Open the lab
              <ArrowUpRight size={18} />
            </button>
            <Link to="/overview" className="outline-button">
              Explore the assignment
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="landing-trust">
            <span>
              <CheckCircle2 size={15} />
              No setup needed
            </span>
            <span>
              <CheckCircle2 size={15} />
              Learn at your own pace
            </span>
          </div>
        </section>
        <div className="hero-workspace">
          <div className="hero-window">
            <span className="window-dots">● ● ●</span>
            <span>your-first-repository</span>
            <GitBranch size={15} />
          </div>
          <div className="hero-code">
            <span className="hero-comment"># Every developer starts somewhere.</span>
            <p>
              <b>$</b> git init
            </p>
            <span className="hero-muted">Initialized empty Git repository.</span>
            <p>
              <b>$</b> git add your-potential.txt
            </p>
            <p>
              <b>$</b> git commit -m <em>"Start something great"</em>
            </p>
            <span className="hero-muted">[main a1b2c3d] Start something great</span>
            <div className="hero-commit">
              <GitCommitHorizontal />
              <div>
                <strong>Your first commit</strong>
                <small>A small step. A new possibility.</small>
              </div>
              <span>main</span>
            </div>
          </div>
          <div className="hero-status">
            <span>
              <GitBranch size={13} /> main
            </span>
            <span>Made for learning. Built for you.</span>
          </div>
        </div>
      </div>
      <div className="landing-bottom">
        <div>
          <GraduationCap size={22} />
          <span>
            <strong>Learn by building</strong>
            <small>Put every concept into practice.</small>
          </span>
        </div>
        <div>
          <GitBranch size={22} />
          <span>
            <strong>See the bigger picture</strong>
            <small>Watch your Git history come to life.</small>
          </span>
        </div>
        <div>
          <ShieldCheck size={22} />
          <span>
            <strong>Your progress, verified</strong>
            <small>Real repository checks. Useful feedback.</small>
          </span>
        </div>
      </div>
      <footer className="landing-footer">
        <span>IEEE Nahda University Student Branch</span>
        <span>Advancing technology. Empowering students.</span>
      </footer>
    </div>
  );
}
