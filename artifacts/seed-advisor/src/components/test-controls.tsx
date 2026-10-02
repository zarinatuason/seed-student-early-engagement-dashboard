import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, FlaskConical, X } from 'lucide-react';
import {
  getGetSessionQueryKey, useResetSession, useResumeSession, useSetScenarioDate, useStartSession,
  ResetSessionInputValue,
} from '@workspace/api-client-react';
import { useSession, useSessionSwitcher } from '@/components/session-gate';
import { Feedback } from '@/components/ui-bits';
import { apiErrorMessage, dayOptionLabel } from '@/lib/format';
import { confirmDiscard } from '@/lib/dirty';
import { useRefreshWorkspace } from '@/lib/page';

const DAYS = Array.from({ length: 35 }, (_, i) => 29 + i);

export function TestControls() {
  const session = useSession();
  const qc = useQueryClient();
  const refresh = useRefreshWorkspace();
  const switchSession = useSessionSwitcher();
  const setDate = useSetScenarioDate();
  const start = useStartSession();
  const resume = useResumeSession();
  const reset = useResetSession();
  const [open, setOpen] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const day = session.scenarioDate.day;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const changeDay = (next: number) => {
    if (next < 29 || next > 63 || next === day) return;
    setMsg(null);
    setDate.mutate(
      { data: { day: next } },
      {
        onSuccess: d => {
          qc.setQueryData(getGetSessionQueryKey(), (old: typeof session | undefined) => (old ? { ...old, scenarioDate: d } : old));
          refresh();
          setMsg({ kind: 'success', text: `Scenario date set to ${dayOptionLabel(d.day)}. Academic evidence is unchanged.` });
        },
        onError: e => setMsg({ kind: 'error', text: apiErrorMessage(e, 'The scenario date could not be changed. It cannot move before saved events.') }),
      },
    );
  };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(session.resumeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowCode(true);
      setMsg({ kind: 'error', text: 'Copy was blocked. Select the code shown below instead.' });
    }
  };
  const doStart = (e: FormEvent) => {
    e.preventDefault();
    if (!confirmDiscard()) return;
    start.mutate({ data: { label: label.trim() } }, { onSuccess: info => { switchSession(info); setOpen(false); }, onError: er => setMsg({ kind: 'error', text: apiErrorMessage(er, 'Could not start a session.') }) });
  };
  const doResume = (e: FormEvent) => {
    e.preventDefault();
    if (!confirmDiscard()) return;
    resume.mutate({ data: { resumeCode: code.trim() } }, { onSuccess: info => { switchSession(info); setOpen(false); }, onError: er => setMsg({ kind: 'error', text: apiErrorMessage(er, 'That resume code was not recognised.') }) });
  };
  const doReset = () => {
    if (!confirmDiscard()) return;
    reset.mutate({ data: ResetSessionInputValue }, { onSuccess: info => { switchSession(info); setOpen(false); setConfirmReset(false); }, onError: er => setMsg({ kind: 'error', text: apiErrorMessage(er, 'The session could not be reset.') }) });
  };

  return (
    <div className="test-controls">
      <button ref={btnRef} type="button" className="button secondary tc-toggle" aria-expanded={open} aria-controls="test-controls-panel" onClick={() => setOpen(o => !o)} data-testid="button-test-controls">
        <FlaskConical size={16} aria-hidden="true" /> Test controls
      </button>
      {open && (
        <section id="test-controls-panel" className="tc-panel" aria-label="Test controls" data-testid="panel-test-controls">
          <div className="tc-head">
            <h2>Test controls</h2>
            <button type="button" className="icon-button" onClick={() => { setOpen(false); btnRef.current?.focus(); }} aria-label="Close test controls"><X size={16} aria-hidden="true" /></button>
          </div>
          <dl className="tc-session">
            <div><dt>Session</dt><dd data-testid="text-session-label">{session.label}</dd></div>
            <div><dt>Session ID</dt><dd data-testid="text-session-id">{session.id}</dd></div>
          </dl>
          <div className="tc-row">
            <button type="button" className="button secondary" onClick={copyCode} data-testid="button-copy-resume-code">
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied ? 'Copied' : 'Copy resume code'}
            </button>
            <button type="button" className="button ghost" aria-pressed={showCode} onClick={() => setShowCode(s => !s)} data-testid="button-show-resume-code">
              {showCode ? 'Hide code' : 'Show code'}
            </button>
          </div>
          {showCode && (
            <label className="field-label">Resume code (keep private)
              <input readOnly value={session.resumeCode} onFocus={e => e.currentTarget.select()} data-testid="input-current-resume-code" />
            </label>
          )}
          <fieldset className="tc-group">
            <legend>Scenario date</legend>
            <label className="field-label">Present day
              <select value={day} disabled={setDate.isPending} onChange={e => changeDay(Number(e.target.value))} data-testid="select-scenario-day">
                {DAYS.map(d => <option key={d} value={d}>{dayOptionLabel(d)}</option>)}
              </select>
            </label>
            <div className="tc-row">
              <button type="button" className="button secondary" disabled={setDate.isPending || day >= 63} onClick={() => changeDay(Math.min(63, day + 1))} data-testid="button-day-plus-1">+1 day</button>
              <button type="button" className="button secondary" disabled={setDate.isPending || day >= 63} onClick={() => changeDay(Math.min(63, day + 7))} data-testid="button-day-plus-7">+7 days</button>
            </div>
            <p className="hint">Changing the date updates due and overdue follow-ups only. It never refreshes academic evidence.</p>
          </fieldset>
          <fieldset className="tc-group">
            <legend>Session</legend>
            <form onSubmit={doStart} className="stack">
              <label className="field-label">New session label
                <input value={label} maxLength={100} onChange={e => setLabel(e.target.value)} data-testid="input-new-session-label" />
              </label>
              <button className="button secondary" type="submit" disabled={start.isPending || !label.trim()} data-testid="button-new-session">Start new session</button>
            </form>
            <form onSubmit={doResume} className="stack">
              <label className="field-label">Resume another session
                <input value={code} autoComplete="off" spellCheck={false} onChange={e => setCode(e.target.value)} placeholder="Paste resume code" data-testid="input-resume-code-panel" />
              </label>
              <button className="button secondary" type="submit" disabled={resume.isPending || code.trim().length < 20} data-testid="button-resume-panel">Resume session</button>
            </form>
          </fieldset>
          <fieldset className="tc-group danger">
            <legend>Reset current session</legend>
            {!confirmReset ? (
              <button type="button" className="button danger" onClick={() => setConfirmReset(true)} data-testid="button-reset-start">Reset this session…</button>
            ) : (
              <div data-testid="reset-confirmation">
                <p><strong>This will clear, for the current session only:</strong></p>
                <ul className="tc-list">
                  <li>review notes and statuses</li>
                  <li>support actions and follow-ups</li>
                  <li>messages and conversations you created</li>
                  <li>read and unread state</li>
                  <li>dated history</li>
                  <li>the scenario date (back to Day 29)</li>
                </ul>
                <p>The prepared synthetic examples are restored. Other testers’ sessions and the academic data are not changed.</p>
                <div className="tc-row">
                  <button type="button" className="button danger" disabled={reset.isPending} onClick={doReset} data-testid="button-reset-confirm">{reset.isPending ? 'Resetting…' : 'Reset current session'}</button>
                  <button type="button" className="button secondary" onClick={() => setConfirmReset(false)}>Keep my work</button>
                </div>
              </div>
            )}
          </fieldset>
          {msg && <Feedback kind={msg.kind}>{msg.text}</Feedback>}
        </section>
      )}
    </div>
  );
}
