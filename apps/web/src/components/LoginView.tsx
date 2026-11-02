import React, { useEffect, useState } from 'react';
import { AlertCircle, LogIn } from 'lucide-react';
import type { AuthResponse, CreateUserDto, LoginDto, SetupStatus } from '@ar-option/shared-types';
import { apiFetch } from '../lib/api';

interface LoginViewProps {
  apiUrl: string;
  /** Set when an existing session expired, so the login sits over the open screen. */
  expiredEmail?: string;
  onSignedIn: (session: AuthResponse) => void;
}

const inputClass =
  'w-full h-12 touch:text-base px-3 rounded-xl text-sm bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring';

const labelClass =
  'block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1';

export const LoginView: React.FC<LoginViewProps> = ({ apiUrl, expiredEmail, onSignedIn }) => {
  const [needsSetup, setNeedsSetup] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>(expiredEmail ?? '');
  const [password, setPassword] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (expiredEmail) return;
    apiFetch(`${apiUrl}/auth/setup-status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((status: SetupStatus | null) => setNeedsSetup(status?.needs_setup ?? false))
      .catch(() => setErrorMsg('Cannot reach the server. Check your connection and try again.'));
  }, [apiUrl, expiredEmail]);

  const postJson = (path: string, body: LoginDto | CreateUserDto) =>
    apiFetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      if (needsSetup) {
        const created = await postJson('/auth/register', {
          name: name.trim(),
          email: email.trim(),
          password,
          role: 'admin',
        });
        if (!created.ok) {
          const err = await created.json().catch(() => ({}));
          throw new Error(err.message || 'Could not create the admin account.');
        }
      }

      const res = await postJson('/auth/login', { email: email.trim(), password });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Could not sign in.');
      }
      onSignedIn(data as AuthResponse);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not sign in. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-light-surface dark:bg-dark-surface p-6 rounded-2xl border border-light-border dark:border-dark-border shadow-sm space-y-4"
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
            AR
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">AR Option</h1>
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
              {needsSetup
                ? 'Create the first admin account'
                : expiredEmail
                  ? 'Your session ended. Sign in to continue'
                  : 'Sign in to continue'}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger-text-light dark:text-danger text-xs flex items-center space-x-2"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {needsSetup && (
          <div>
            <label htmlFor="login-name" className={labelClass}>
              Full Name
            </label>
            <input
              id="login-name"
              type="text"
              required
              autoComplete="name"
              enterKeyHint="next"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

        <div>
          <label htmlFor="login-email" className={labelClass}>
            Email
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="username"
            enterKeyHint="next"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="login-password" className={labelClass}>
            Password
          </label>
          <input
            id="login-password"
            type="password"
            required
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
            enterKeyHint="done"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-12 flex items-center justify-center space-x-2 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-bold text-sm transition-colors disabled:opacity-50"
        >
          <LogIn className="w-4 h-4" />
          <span>{submitting ? 'Please wait...' : needsSetup ? 'Create Account' : 'Sign In'}</span>
        </button>
      </form>
    </div>
  );
};
