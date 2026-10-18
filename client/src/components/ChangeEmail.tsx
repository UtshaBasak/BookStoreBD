import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type {
  ApiError,
  EmailChangeRequest,
  EmailChangeResponse,
  EmailConfirmRequest,
  EmailConfirmResponse,
  UserRole,
} from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useToast } from '../hooks/useToast.js';
import { getToken, getUserRole, setSession } from '../utils/auth.js';

const post = (path: string, body: unknown) =>
  apiFetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * Moving the account to another e-mail address: the new address and the
 * password, then the code the shop sends to the new address. Nothing moves
 * until the code is entered, and the old address is told once it has.
 */
export default function ChangeEmail({
  currentEmail,
  passwordSet,
  pendingEmail,
}: {
  currentEmail: string;
  /** False for an account made through Google, which sets a password first. */
  passwordSet: boolean;
  /** An address already waiting for its code. */
  pendingEmail?: string | null;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [waitingFor, setWaitingFor] = useState<string | null>(pendingEmail ?? null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const start = async () => {
    setBusy(true);
    setProblem('');
    try {
      const res = await post('/user/me/email', { newEmail: newEmail.trim(), password } satisfies EmailChangeRequest);
      const data = (await res.json()) as EmailChangeResponse & ApiError;
      if (!res.ok) {
        setProblem(data.errors?.[0]?.message || data.message || 'Could not start the change.');
        return;
      }
      setWaitingFor(data.pendingEmail);
      setPassword('');
      toast.success(data.message);
    } catch {
      setProblem('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setProblem('');
    try {
      const res = await post('/user/me/email/confirm', { code: code.trim() } satisfies EmailConfirmRequest);
      const data = (await res.json()) as EmailConfirmResponse & ApiError;
      if (!res.ok) {
        setProblem(data.errors?.[0]?.message || data.message || 'Could not confirm the new address.');
        return;
      }
      // Signed in as before, under the new address.
      setSession({ token: getToken(), user: { email: data.email, role: (getUserRole() ?? 'user') as UserRole } });
      await queryClient.invalidateQueries();
      setOpen(false);
      setWaitingFor(null);
      setCode('');
      toast.success(data.message);
    } catch {
      setProblem('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <p className="m-0 mt-1 text-xs text-ink-muted">
        {waitingFor ? `Waiting for the code sent to ${waitingFor}. ` : ''}
        <button type="button" className="font-semibold text-brand underline" onClick={() => setOpen(true)}>
          {waitingFor ? 'Enter the code' : 'Change e-mail address'}
        </button>
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-line p-3" aria-label="Change e-mail address" role="group">
      {!passwordSet ? (
        <p className="m-0 text-sm text-ink-soft">
          Your account signs in with Google, so it has no password yet. Choose a password below and save, so you can
          sign in with your new address; then change it here.
        </p>
      ) : waitingFor ? (
        <>
          <p className="m-0 text-sm text-ink-soft">
            We have e-mailed a 6-digit code to <strong>{waitingFor}</strong>. Enter it to move your account from{' '}
            {currentEmail}.
          </p>
          <label htmlFor="up-email-code" className="pf-label">Code</label>
          <input
            id="up-email-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="field sm:max-w-40"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={busy || !/^\d{6}$/.test(code.trim())} onClick={() => void confirm()}>
              Confirm new address
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setWaitingFor(null); setCode(''); setProblem(''); }}>
              Use a different address
            </button>
          </div>
        </>
      ) : (
        <>
          <label htmlFor="up-new-email" className="pf-label">New e-mail address</label>
          <input
            id="up-new-email"
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            className="field"
          />
          <label htmlFor="up-email-password" className="pf-label">Your password</label>
          <input
            id="up-email-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={busy || !newEmail.trim() || !password} onClick={() => void start()}>
              Send a code to the new address
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setProblem(''); }}>
              Cancel
            </button>
          </div>
        </>
      )}
      {problem && (
        <p role="alert" className="m-0 text-sm font-semibold" style={{ color: 'var(--color-danger-ink)' }}>
          {problem}
        </p>
      )}
    </div>
  );
}
