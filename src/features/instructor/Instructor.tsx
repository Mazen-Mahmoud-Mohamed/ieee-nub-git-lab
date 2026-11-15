import { useEffect, useRef, useState } from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { AssessmentManager, AssessmentEditor, QuestionBank } from './AssessmentEditor';
import { Overview, Students, Attempts } from './AdminPages';
import { LearningContent } from './LearningContent';
import { LearningSessions } from './LearningSessions';
import { HelpRequests } from './HelpRequests';
import { Administration } from './Administration';
import { AdminGradebook } from './AdminGradebook';
import '../../styles/admin.css';

const sections = [
  {
    path: '',
    label: 'Overview',
    description: 'A clear view of your students, assessments and teaching activity.',
    icon: LayoutDashboard,
  },
  {
    path: 'students',
    label: 'Students',
    description: 'Find students and follow their assessment progress.',
    icon: Users,
  },
  {
    path: 'assessments',
    label: 'Assessments',
    description: 'Manage drafts, published versions and assessment availability.',
    icon: ClipboardCheck,
  },
  {
    path: 'submissions',
    label: 'Submissions & grading',
    description: 'Review work, release grades and help students recover.',
    icon: GraduationCap,
  },
  {
    path: 'courses',
    label: 'Courses & sessions',
    description: 'Organize your teaching, recordings and presentation materials.',
    icon: BookOpen,
  },
  {
    path: 'administration',
    label: 'Administration',
    description: 'Manage retained records, review activity and check account access.',
    icon: ShieldCheck,
  },
];
export function SectionTabs({ base, tabs }: { base: string; tabs: Array<[string, string]> }) {
  const [query] = useSearchParams();
  const current = query.get('tab') || '';
  return (
    <nav className="admin-section-tabs" aria-label="Page sections">
      {tabs.map(([value, label]) => (
        <Link
          key={value}
          to={base + (value ? '?tab=' + value : '')}
          aria-current={current === value ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
function AssessmentsArea() {
  const [query] = useSearchParams();
  return (
    <>
      <SectionTabs
        base="/instructor/assessments"
        tabs={[
          ['', 'Assessment catalog'],
          ['questions', 'Question bank'],
        ]}
      />
      {query.get('tab') === 'questions' ? <QuestionBank /> : <AssessmentManager />}
    </>
  );
}
function SubmissionsArea() {
  const [query] = useSearchParams();
  return (
    <>
      <SectionTabs
        base="/instructor/submissions"
        tabs={[
          ['', 'Submissions'],
          ['help', 'Help requests'],
          ['totals', 'Course totals'],
        ]}
      />
      {query.get('tab') === 'help' ? (
        <HelpRequests />
      ) : query.get('tab') === 'totals' ? (
        <AdminGradebook />
      ) : (
        <Attempts />
      )}
    </>
  );
}
function CoursesArea() {
  const [query] = useSearchParams();
  return (
    <>
      <SectionTabs
        base="/instructor/courses"
        tabs={[
          ['', 'Learning sessions'],
          ['structure', 'Courses & sections'],
        ]}
      />
      {query.get('tab') === 'structure' ? <LearningContent /> : <LearningSessions />}
    </>
  );
}
function LegacyRoute({ to, params = {} }: { to: string; params?: Record<string, string> }) {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  if (to.endsWith('/courses') && query.has('open')) query.delete('tab');
  return <Navigate replace to={to + (query.size ? '?' + query.toString() : '')} />;
}
export function Instructor({
  name,
  dark,
  toggleTheme,
  signOut,
}: {
  name: string;
  dark: boolean;
  toggleTheme: () => void;
  signOut: () => Promise<void>;
}) {
  const location = useLocation();
  const current =
    sections.find((s) => s.path && location.pathname.startsWith('/instructor/' + s.path)) ||
    sections[0];
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null),
    menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
      if (event.key === 'Tab') {
        const controls = sidebar.current?.querySelectorAll<HTMLElement>('a, button');
        if (!controls?.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);
  return (
    <div className="admin-shell instructor">
      {menuOpen && (
        <button
          className="admin-menu-backdrop"
          aria-label="Close navigation"
          onClick={() => {
            setMenuOpen(false);
            menuButton.current?.focus();
          }}
        />
      )}
      <aside
        id="admin-sidebar"
        ref={sidebar}
        className={'admin-sidebar' + (menuOpen ? ' is-open' : '')}
        role={menuOpen ? 'dialog' : undefined}
        aria-modal={menuOpen || undefined}
        aria-label="Administration navigation"
      >
        <div className="admin-brand">
          <Link to="/instructor">
            <span className="admin-brand-mark">IEEE</span>
            <span>
              <strong>NUB Git Lab</strong>
              <small>ADMINISTRATION</small>
            </span>
          </Link>
          <button
            aria-label="Close menu"
            className="admin-close-menu"
            onClick={() => {
              setMenuOpen(false);
              menuButton.current?.focus();
            }}
          >
            <X size={20} />
          </button>
        </div>
        <span className="admin-nav-label">WORKSPACE</span>
        <nav className="admin-sidebar-nav" aria-label="Instructor navigation">
          {sections.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} end={!path} to={'/instructor' + (path ? '/' + path : '')}>
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              <ChevronRight className="admin-nav-chevron" size={14} />
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <Link to="/learn">
            <BookOpen size={17} />
            View course content
            <ChevronRight size={15} />
          </Link>
          <div className="admin-sidebar-note">
            <ShieldCheck size={17} />
            <span>
              Authorized workspace<small>IEEE Nahda University</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-breadcrumb">
            <button
              ref={menuButton}
              className="admin-menu-button"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              aria-controls="admin-sidebar"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </button>
            <PanelLeftClose size={18} className="admin-desktop-icon" />
            <span>Admin Dashboard</span>
            <ChevronRight size={14} />
            <strong>{current.label}</strong>
          </div>
          <div className="admin-topbar-actions">
            <button aria-label="Toggle light and dark theme" onClick={toggleTheme}>
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <span className="admin-topbar-divider" />
            <div className="admin-account">
              <span className="admin-avatar">
                {name
                  .split(' ')
                  .filter(Boolean)
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join('') || 'IN'}
              </span>
              <span>
                {name || 'Instructor'}
                <small>Instructor workspace</small>
              </span>
            </div>
            <button aria-label="Sign out" onClick={() => void signOut()}>
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <div id="admin-content" className="admin-content" tabIndex={-1}>
          <div className="admin-page-heading">
            <span className="eyebrow">IEEE NUB · MANAGEMENT</span>
            <h1>{current.label}</h1>
            <p>{current.description}</p>
          </div>
          <Routes>
            <Route index element={<Overview />} />
            <Route path="students" element={<Students />} />
            <Route path="assessments" element={<AssessmentsArea />} />
            <Route path="assessments/:id" element={<AssessmentEditor />} />
            <Route path="submissions" element={<SubmissionsArea />} />
            <Route path="courses" element={<CoursesArea />} />
            <Route path="administration" element={<Administration name={name} />} />
            <Route
              path="assignments"
              element={<LegacyRoute to="/instructor/assessments" params={{ type: 'assignment' }} />}
            />
            <Route
              path="exams"
              element={<LegacyRoute to="/instructor/assessments" params={{ type: 'exam' }} />}
            />
            <Route
              path="questions"
              element={<LegacyRoute to="/instructor/assessments" params={{ tab: 'questions' }} />}
            />
            <Route
              path="results"
              element={<LegacyRoute to="/instructor/submissions" params={{ status: 'graded' }} />}
            />
            <Route
              path="course-grades"
              element={<LegacyRoute to="/instructor/submissions" params={{ tab: 'totals' }} />}
            />
            <Route
              path="requests"
              element={<LegacyRoute to="/instructor/submissions" params={{ tab: 'help' }} />}
            />
            <Route path="sessions" element={<LegacyRoute to="/instructor/courses" />} />
            <Route
              path="content"
              element={<LegacyRoute to="/instructor/courses" params={{ tab: 'structure' }} />}
            />
            <Route
              path="records"
              element={<LegacyRoute to="/instructor/administration" params={{ tab: 'records' }} />}
            />
            <Route
              path="activity"
              element={<LegacyRoute to="/instructor/administration" params={{ tab: 'activity' }} />}
            />
            <Route
              path="settings"
              element={<LegacyRoute to="/instructor/administration" params={{ tab: 'settings' }} />}
            />
            <Route path="*" element={<Navigate replace to="/instructor" />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
