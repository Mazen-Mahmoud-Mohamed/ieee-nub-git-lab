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
  ChevronRight,
  Clock,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase, type Profile, requireBackend } from '../services/supabase';
import { useLab } from '../hooks/useLab';
import { AuthPage, ProfilePage } from '../features/auth/Auth';
import { Workspace } from '../features/assignments/Workspace';
import { assignment, ASSIGNMENT_ID, validateRepository } from '../features/assignments/assignment';
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
  const lab = useLab(user?.id || 'local-practice');
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
  const outcomes = validateRepository(lab.view, identity);
  const unlocked = outcomes.filter((o) => !o.bonus).every((o) => o.passed);
  async function start() {
    try {
      if (!user) {
        navigate('/workspace');
        return;
      }
      if (!profile) {
        navigate('/profile');
        return;
      }
      const client = requireBackend();
      const { data, error } = await client.rpc('start_attempt', { p_assignment: ASSIGNMENT_ID });
      if (error) throw error;
      if (lab.attemptId && lab.attemptId !== data.id) await lab.newAttempt(data.id);
      else lab.setAttemptId(data.id);
      if (data.receipt) lab.setReceipt(data.receipt);
      navigate('/workspace');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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
            <Route
              path="/dashboard"
              element={<Dashboard profile={profile} lab={lab} onStart={start} />}
            />
            <Route path="/overview" element={<Overview onStart={start} />} />
            <Route
              path="/workspace"
              element={<Workspace lab={lab} identity={identity} dark={dark} />}
            />
            <Route path="/theory" element={<Assessment lab={lab} unlocked={unlocked} />} />
            <Route
              path="/review"
              element={<Review lab={lab} identity={identity} authenticated={!!user && !!profile} />}
            />
            <Route path="/confirmation" element={<Confirmation lab={lab} />} />
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
function Dashboard({
  profile,
  lab,
  onStart,
}: {
  profile: Profile | null;
  lab: ReturnType<typeof useLab>;
  onStart: () => void;
}) {
  const [attempts, setAttempts] = useState<
    Array<{
      id: string;
      status: string;
      receipt: string | null;
      practical_score: number | null;
      theory_score: number | null;
      feedback: string | null;
      released: boolean;
    }>
  >([]);
  useEffect(() => {
    if (profile && supabase)
      void supabase
        .from('attempts')
        .select('id,status,receipt')
        .order('created_at', { ascending: false })
        .then(async ({ data }) => {
          if (!data) return;
          const results = await supabase!.from('released_results').select('*');
          setAttempts(
            data.map((a) => ({ ...a, ...results.data?.find((r) => r.attempt_id === a.id) })),
          );
          const current = data.find((a) => a.status === 'in_progress');
          if (current && !lab.attemptId) lab.setAttemptId(current.id);
        });
  }, [profile]);
  return (
    <div className="page dashboard">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR LEARNING JOURNEY</span>
          <h1>
            {profile
              ? `Welcome back, ${profile.full_name.split(' ')[0]}.`
              : 'A little practice goes a long way.'}
          </h1>
          <p>
            {profile
              ? `${profile.department} · Year ${profile.academic_year}`
              : 'Explore the lab locally, or sign in to save assessed submissions.'}
          </p>
        </div>
        <span className="course-pill">
          <i className="live-dot" />
          SESSION 01 · LOCAL GIT
        </span>
      </div>
      <div className="dashboard-feature">
        <div>
          <span className="eyebrow">YOUR NEXT CHALLENGE</span>
          <h2>
            Small commits.
            <br />
            Big understanding.
          </h2>
          <p>{assignment.description}</p>
          <button className="primary" onClick={onStart}>
            {lab.view.initialized ? 'Resume assignment' : 'Start Assignment 01'}
            <ArrowUpRight size={17} />
          </button>
        </div>
        <div className="feature-numbers">
          <GitBranch size={76} strokeWidth={1} />
          <span>01</span>
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="form-card assignment-card">
          <div className="assignment-label">
            ASSIGNMENT 01 <span>BEGINNER</span>
          </div>
          <h2>{assignment.title}</h2>
          <p>Practice the essentials of local version control in your own virtual workspace.</p>
          <div className="assignment-stats">
            <span>
              <BookOpen size={16} />4 practical sections
            </span>
            <span>
              <Clock size={16} />
              Self paced
            </span>
            <span>100 pts + 10 bonus</span>
          </div>
          <Link to="/overview">
            View assignment details
            <ArrowRight size={15} />
          </Link>
        </section>
        <section className="form-card">
          <span className="eyebrow">YOUR SUBMISSIONS</span>
          <h3>Your progress has a home.</h3>
          {attempts.length ? (
            attempts.map((a) => (
              <div className="submission-row" key={a.id}>
                <strong>Assignment 01</strong>
                <span className="badge">{a.status.replace('_', ' ')}</span>
                {a.receipt && <code>{a.receipt}</code>}
                {a.released && (
                  <p>
                    Score: {(a.practical_score || 0) + (a.theory_score || 0)} / 100 + 10
                    <br />
                    {a.feedback}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="muted">
              {profile
                ? 'No submissions yet. Your first one starts in the lab.'
                : 'Sign in to create assessed attempts and receive instructor feedback.'}
            </p>
          )}
          {!profile && (
            <Link className="practice-link" to="/auth">
              Sign in or create an account →
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
function Overview({ onStart }: { onStart: () => void }) {
  return (
    <div className="page overview">
      <Link className="breadcrumb" to="/dashboard">
        My learning
        <ChevronRight size={14} />
        Assignment 01
      </Link>
      <span className="eyebrow">SESSION 01 · BEGINNER</span>
      <h1>{assignment.title}</h1>
      <p className="lead">{assignment.description}</p>
      <div className="overview-meta">
        <span>100 points + 10 bonus</span>
        <span>Plain text files</span>
        <span>Local Git only</span>
        <span>Written assessment</span>
      </div>
      <div className="overview-grid">
        <section>
          <h2>What you’ll build</h2>
          <p>
            A personal text-file repository with a clear commit history, an isolated skills branch,
            and a successful merge into main.
          </p>
          {assignment.sections.map((s) => (
            <article className="overview-section" key={s.id}>
              <span className="mission-number">{s.tag}</span>
              <div>
                <h3>
                  {s.title}
                  <small>
                    {s.points} pts{s.id === 'bonus' ? ' · Optional' : ''}
                  </small>
                </h3>
                <p>{s.description}</p>
                <ul>
                  {s.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
          <article className="overview-section">
            <span className="mission-number">05</span>
            <div>
              <h3>
                Theory assessment<small>25 pts</small>
              </h3>
              <p>
                Twelve written questions and practical reflections. Your instructor reviews your
                reasoning.
              </p>
            </div>
          </article>
        </section>
        <aside className="form-card sticky-card">
          <BookOpen size={25} />
          <h3>Before you begin</h3>
          <p>
            Use the name and department in your student profile for about.txt. Verify your identity
            details before your assessed attempt.
          </p>
          <p>
            You’ll use only the topics through slide 27 of the course. Remote repositories and
            conflict resolution are not required.
          </p>
          <p>
            Work saves in this browser. Export a backup before changing devices or clearing browser
            data.
          </p>
          <button className="primary" onClick={onStart}>
            Enter the workspace
            <ArrowUpRight size={16} />
          </button>
        </aside>
      </div>
    </div>
  );
}
