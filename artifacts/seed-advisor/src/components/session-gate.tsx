import { createContext, useCallback, useContext, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sprout } from 'lucide-react';
import {
  getGetSessionQueryKey, useGetSession, useResumeSession, useStartSession,
  type SessionInfo,
} from '@workspace/api-client-react';
import { ErrorState, Feedback, LoadingRows } from '@/components/ui-bits';
import { apiErrorMessage } from '@/lib/format';
import { confirmDiscard } from '@/lib/dirty';
import { usePageMeta } from '@/lib/page';

const SessionContext = createContext<SessionInfo | null>(null);
const ApplyContext = createContext<(info: SessionInfo) => void>(() => undefined);

export const useSession = () => {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside SessionGate');
  return s;
};
export const useApplySession = () => useContext(ApplyContext);

/** Clears every cached query and all stored drafts, then installs the new session. */
export function useSessionSwitcher() {
  const qc = useQueryClient();
  const apply = useApplySession();
  return useCallback(
    (info: SessionInfo) => {
      qc.clear();
      try {
        Object.keys(sessionStorage).filter(k => k.startsWith('seed-')).forEach(k => sessionStorage.removeItem(k));
      } catch {
        /* storage unavailable */
      }
      qc.setQueryData(getGetSessionQueryKey(), info);
      apply(info);
    },
    [qc, apply],
  );
}

export function SessionGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [epoch, setEpoch] = useState(0);
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey(), retry: false, refetchOnWindowFocus: false, staleTime: Infinity } });
  const apply = useCallback(() => setEpoch(e => e + 1), []);
  const retry = useCallback(() => {
    qc.removeQueries({ queryKey: getGetSessionQueryKey() });
    session.refetch();
  }, [qc, session]);
  const value = useMemo(() => session.data ?? null, [session.data]);

  if (session.isLoading) {
    return (
      <div className="gate-wrap" data-testid="session-loading">
        <div className="gate-card">
          <LoadingRows label="Preparing your test session" />
        </div>
      </div>
    );
  }
  if (session.isError || !value) return <ApplyContext.Provider value={apply}><SessionStart onRetry={retry} /></ApplyContext.Provider>;
  return (
    <ApplyContext.Provider value={apply}>
      <SessionContext.Provider value={value}>
        <div key={`${value.id}-${epoch}`}>{children}</div>
      </SessionContext.Provider>
    </ApplyContext.Provider>
  );
}

function SessionStart({ onRetry }: { onRetry: () => void }) {
  usePageMeta('Start a test session', 'Start or resume a SEED test session as a Student Advisor.');
  const switchSession = useSessionSwitcher();
  const start = useStartSession();
  const resume = useResumeSession();
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const submitStart = (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!confirmDiscard()) return;
    start.mutate({ data: { label: label.trim() } }, { onSuccess: switchSession, onError: er => setErr(apiErrorMessage(er, 'Could not start a session. Try again.')) });
  };
  const submitResume = (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    resume.mutate({ data: { resumeCode: code.trim() } }, { onSuccess: switchSession, onError: er => setErr(apiErrorMessage(er, 'That resume code was not recognised.')) });
  };
  return (
    <div className="gate-wrap">
      <main className="gate-card" id="main-content">
        <div className="brand gate-brand">
          <span className="brand-mark"><Sprout size={19} aria-hidden="true" /></span>
          <span>SEED<span className="brand-period">.</span></span>
        </div>
        <h1>Start a test session</h1>
        <p className="page-lede">
          A session keeps your reviews, support actions, messages and scenario date separate from other testers. You act as a Student Advisor. The session code is a test capability, not a university login.
        </p>
        <form onSubmit={submitStart} className="stack">
          <label className="field-label">Session label
            <input value={label} onChange={e => setLabel(e.target.value)} maxLength={100} required placeholder="For example: Advisor walkthrough 1" data-testid="input-session-label" />
          </label>
          <button className="button primary" type="submit" disabled={start.isPending || !label.trim()} data-testid="button-start-session">
            {start.isPending ? 'Starting…' : 'Start new session'}
          </button>
        </form>
        <hr className="gate-rule" />
        <form onSubmit={submitResume} className="stack">
          <label className="field-label">Resume code
            <input value={code} onChange={e => setCode(e.target.value)} minLength={20} maxLength={200} required autoComplete="off" spellCheck={false} placeholder="Paste a saved resume code" data-testid="input-resume-code" />
          </label>
          <button className="button secondary" type="submit" disabled={resume.isPending || code.trim().length < 20} data-testid="button-resume-session">
            {resume.isPending ? 'Resuming…' : 'Resume session'}
          </button>
        </form>
        {err && <Feedback kind="error">{err}</Feedback>}
        <div className="gate-retry">
          <ErrorState message="No active session could be loaded." retry={onRetry} />
        </div>
      </main>
    </div>
  );
}
