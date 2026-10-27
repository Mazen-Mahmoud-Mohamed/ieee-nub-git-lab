import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { requireBackend, supabase, type Profile } from '../../services/supabase';
import { FACULTIES, isFaculty } from './faculty';
import { callbackURL, destination } from './navigation';
import { googleDisplayName, normalizePhone, profileComplete } from './profile';

export function AuthPage() {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const redirectTo = () => callbackURL(window.location.origin, import.meta.env.BASE_URL);
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <span className="eyebrow">IEEE NUB GIT LAB</span>
        <h1>
          Learn Git.
          <br />
          <em>Build confidence.</em>
        </h1>
        <p>Practice, complete assignments, and take your course exams in one place.</p>
        <div className="trust">
          <ShieldCheck size={20} /> Your own saved workspace
        </div>
      </div>
      <form
        className="form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          setMessage('');
          try {
            const client = requireBackend();
            const email = String(data.get('email')).trim();
            const password = String(data.get('password'));
            if (register) {
              const { data: result, error } = await client.auth.signUp({
                email,
                password,
                options: {
                  emailRedirectTo: redirectTo(),
                  data: { full_name: String(data.get('full_name')).trim() },
                },
              });
              if (error) throw error;
              if (result.session) navigate(destination());
              else
                setMessage(
                  'Check your email to confirm your account, then return here to sign in.',
                );
            } else {
              const { error } = await client.auth.signInWithPassword({ email, password });
              if (error) throw error;
              navigate(destination());
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
        <p>
          {register
            ? 'Choose Google or use your email address.'
            : 'Sign in to continue your learning journey.'}
        </p>
        {!supabase && (
          <div className="notice">
            Account services need a dedicated Supabase connection. You can explore local practice
            now.
          </div>
        )}
        <button
          type="button"
          className="outline-button google-signin"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const { error } = await requireBackend().auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: redirectTo() },
              });
              if (error) throw error;
            } catch {
              setError(
                'Google sign-in could not start. Please try again or use email and password.',
              );
              setBusy(false);
            }
          }}
        >
          Continue with Google
        </button>
        <p className="auth-divider">or use email</p>
        {register && (
          <label>
            Full name
            <input
              dir="auto"
              name="full_name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={120}
            />
          </label>
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
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => {
            setRegister(!register);
            setError('');
            setMessage('');
          }}
        >
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
  user,
  onSave,
}: {
  profile: Profile | null;
  user: User;
  onSave: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const complete = profileComplete(profile, user);
  return (
    <div className="page narrow">
      <span className="eyebrow">STUDENT PROFILE</span>
      <h1>{complete ? 'Your profile' : 'Complete your profile'}</h1>
      <p>
        {complete
          ? 'Keep your coursework contact details up to date.'
          : 'Add the missing details before you start or submit coursework. Your saved work and exam timer stay unchanged.'}
      </p>
      <form
        className="form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            const faculty = form.get('faculty');
            if (!isFaculty(faculty)) throw new Error('Select Engineering or Computer Science.');
            const { error } = await requireBackend().rpc('save_student_profile', {
              p_full_name: String(form.get('full_name')).trim(),
              p_phone: normalizePhone(form.get('phone')),
              p_faculty: faculty,
            });
            if (error) throw error;
            await onSave();
            navigate(destination(true));
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Full name
          <input
            dir="auto"
            name="full_name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={120}
            defaultValue={profile?.full_name || googleDisplayName(user)}
          />
        </label>
        <label>
          Email address
          <input type="email" value={user.email || ''} readOnly aria-describedby="account-email" />
        </label>
        <small id="account-email">
          {user.email_confirmed_at
            ? 'Verified account email'
            : 'Account email — confirm it before starting coursework'}
          . Supplied by your sign-in account.
        </small>
        <label>
          Phone number
          <input
            type="tel"
            name="phone"
            autoComplete="tel"
            required
            maxLength={30}
            placeholder="01012345678"
            defaultValue={profile?.phone || ''}
          />
        </label>
        <small>
          Egyptian mobile number. Saved in international format, for example +201012345678.
        </small>
        <fieldset>
          <legend>Faculty</legend>
          {FACULTIES.map((f) => (
            <label className="option" key={f.value}>
              <input
                type="radio"
                name="faculty"
                value={f.value}
                required
                defaultChecked={profile?.faculty === f.value}
              />
              {f.label}
            </label>
          ))}
        </fieldset>
        {profile?.student_id && (
          <details>
            <summary>Existing academic details</summary>
            <p>
              Student ID: {profile.student_id}
              <br />
              {profile.university} · {profile.department}
              {profile.academic_year ? ' · Year ' + profile.academic_year : ''}
            </p>
          </details>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Saving…' : complete ? 'Save profile' : 'Save and continue'}
          <ArrowRight size={16} />
        </button>
      </form>
    </div>
  );
}
