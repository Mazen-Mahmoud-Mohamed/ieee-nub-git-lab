import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { requireBackend, supabase, type Profile } from '../../services/supabase';
import { FACULTIES, isFaculty } from './faculty';
export function AuthPage() {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <span className="eyebrow">YOUR NEXT COMMIT STARTS HERE</span>
        <h1>
          Build confidence.
          <br />
          One commit
          <br />
          <em>at a time.</em>
        </h1>
        <p>A space to experiment, make mistakes, and understand how Git really works.</p>
        <div className="trust">
          <ShieldCheck size={20} /> Private student workspaces · Verified submissions
        </div>
      </div>
      <form
        className="form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setMessage('');
          const data = new FormData(e.currentTarget);
          try {
            const client = requireBackend();
            const email = String(data.get('email'));
            const password = String(data.get('password'));
            if (register) {
              const { error } = await client.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: window.location.origin + window.location.pathname },
              });
              if (error) throw error;
              setMessage(
                'Check your email to confirm your account, then sign in and complete your academic profile.',
              );
            } else {
              const { error } = await client.auth.signInWithPassword({ email, password });
              if (error) throw error;
              navigate('/dashboard');
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="eyebrow">IEEE NUB GIT LAB</span>
        <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
        <p>
          {register
            ? 'Use an email address you can verify.'
            : 'Sign in to continue your learning journey.'}
        </p>
        {!supabase && (
          <div className="notice">
            Account services need a dedicated Supabase connection. You can explore the local
            practice lab now.
          </div>
        )}
        <label>
          Email address
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@university.edu"
          />
        </label>
        <label>
          Password
          <input
            required
            minLength={12}
            type="password"
            name="password"
            autoComplete={register ? 'new-password' : 'current-password'}
            placeholder="At least 12 characters"
          />
        </label>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="notice">
            {message}
          </div>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
          <ArrowRight size={17} />
        </button>
        <button type="button" className="text-button" onClick={() => setRegister(!register)}>
          {register ? 'Already registered? Sign in' : 'New to the lab? Create an account'}
        </button>
        <Link to="/workspace" className="practice-link">
          Explore local practice without an account →
        </Link>
      </form>
    </div>
  );
}
export function ProfilePage({
  profile,
  onSave,
}: {
  profile: Profile | null;
  onSave: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="page narrow">
      <span className="eyebrow">STUDENT PROFILE</span>
      <h1>Let’s make it yours.</h1>
      <p>
        We collect these details to identify your coursework and provide instructor feedback.
        Student IDs are self-reported; your verified email authenticates your account.
      </p>
      <form
        className="form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const form = new FormData(e.currentTarget);
            const client = requireBackend();
            const {
              data: { user },
            } = await client.auth.getUser();
            if (!user) throw new Error('Sign in first.');
            const faculty = form.get('faculty');
            if (!isFaculty(faculty)) throw new Error('Select Engineering or Computer Science.');
            const fields = Object.fromEntries(
              ['full_name', 'student_id', 'university', 'department', 'academic_year'].map((k) => [
                k,
                String(form.get(k)).trim(),
              ]),
            );
            const { error } = await client
              .from('profiles')
              .upsert({ id: user.id, ...fields, faculty });
            if (error) throw error;
            await onSave();
            navigate('/dashboard');
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {[
          ['full_name', 'Full name'],
          ['student_id', 'Student ID'],
          ['university', 'University'],
          ['department', 'Department'],
          ['academic_year', 'Academic year'],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              required
              maxLength={120}
              defaultValue={
                profile?.[key as keyof Profile] || (key === 'university' ? 'Nahda University' : '')
              }
            />
          </label>
        ))}
        <fieldset>
          <legend>Faculty</legend>
          {FACULTIES.map((faculty) => (
            <label className="option" key={faculty.value}>
              <input
                type="radio"
                name="faculty"
                value={faculty.value}
                required
                defaultChecked={profile?.faculty === faculty.value}
              />
              {faculty.label}
            </label>
          ))}
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          Save profile
          <ArrowRight size={16} />
        </button>
      </form>
    </div>
  );
}
