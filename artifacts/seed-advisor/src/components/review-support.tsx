import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, Pencil, Plus } from 'lucide-react';
import {
  ContactStatus, ReviewOutcome, ReviewStatus, SupportActionType, SupportProgress,
  useCreateSupportAction, useSaveWorkspaceReview, useUpdateSupportAction,
  type RecordWorkspace, type SupportAction, type SupportActionInput,
} from '@workspace/api-client-react';
import { FollowUpBadge, ProgressBadge } from '@/components/badges';
import { EmptyState, Feedback } from '@/components/ui-bits';
import { apiErrorMessage, dayLabel, ymd } from '@/lib/format';
import { useDirtyGuard } from '@/lib/dirty';
import { useRefreshWorkspace } from '@/lib/page';

const reviewOptions = Object.values(ReviewStatus);
const outcomeOptions = Object.values(ReviewOutcome).filter(Boolean) as string[];
type Fb = { kind: 'success' | 'error'; text: string } | null;

type ReviewForm = { reviewStatus: ReviewStatus; advisorNotes: string; outcome: string; nextAction: string; followUpDate: string; followUpCompleted: boolean; noResponse: boolean };

export function ReviewPanel({ ws, today }: { ws: RecordWorkspace; today: string }) {
  const rec = ws.record;
  const key = `${rec.learnerId}/${rec.courseCode}`;
  const save = useSaveWorkspaceReview();
  const refresh = useRefreshWorkspace();
  const initFor = useRef('');
  const [form, setForm] = useState<ReviewForm | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [dateEdited, setDateEdited] = useState(false);
  const [editedDate, setEditedDate] = useState(today);
  const effectiveDate = dateEdited ? editedDate : today;
  const [fb, setFb] = useState<Fb>(null);
  useEffect(() => {
    if (initFor.current === key) return;
    initFor.current = key;
    const r = rec.review;
    const f: ReviewForm = { reviewStatus: r.reviewStatus, advisorNotes: r.advisorNotes || '', outcome: r.outcome || '', nextAction: r.nextAction || '', followUpDate: r.followUpDate ? ymd(r.followUpDate) : '', followUpCompleted: r.followUpCompleted, noResponse: false };
    setForm(f);
    setSavedJson(JSON.stringify(f));
  }, [key, rec.review]);
  const dirty = (form !== null && JSON.stringify(form) !== savedJson) || dateEdited;
  useDirtyGuard(`review-${key}`, dirty);
  const contact = rec.review.contactStatus;
  const set = <K extends keyof ReviewForm>(k: K, v: ReviewForm[K]) => setForm(f => (f ? { ...f, [k]: v } : f));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setFb(null);
    save.mutate(
      {
        learnerId: rec.learnerId, courseCode: rec.courseCode,
        data: {
          reviewStatus: form.reviewStatus, advisorNotes: form.advisorNotes, outcome: (form.outcome || null) as never,
          nextAction: form.nextAction.trim() || null, followUpDate: form.followUpDate || null, followUpCompleted: form.followUpCompleted,
          contactStatus: form.noResponse && contact === ContactStatus.Awaiting_response ? ContactStatus.No_response_recorded : contact, effectiveDate,
        },
      },
      {
        onSuccess: () => {
          const next = { ...form, noResponse: false };
          setForm(next);
          setSavedJson(JSON.stringify(next));
          setDateEdited(false);
          setFb({ kind: 'success', text: 'Review saved and added to the dated history.' });
          refresh();
        },
        onError: er => setFb({ kind: 'error', text: apiErrorMessage(er, 'The review could not be saved. Your changes are still here; try again.') }),
      },
    );
  };
  if (!form) return <div className="field-skeleton" aria-label="Loading review form" role="status" />;
  return (
    <form className="subpanel" onSubmit={submit} data-testid="form-review">
      <div className="subpanel-head"><h3>Advisor review</h3><span className={`save-indicator ${dirty ? 'unsaved' : ''}`} role="status">{save.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}</span></div>
      <div className="field-pair">
        <label className="field-label">Review status
          <select value={form.reviewStatus} onChange={e => set('reviewStatus', e.target.value as ReviewStatus)} data-testid="select-review-status">{reviewOptions.map(x => <option key={x}>{x}</option>)}</select>
        </label>
        <label className="field-label">Review outcome
          <select value={form.outcome} onChange={e => set('outcome', e.target.value)} data-testid="select-review-outcome"><option value="">Not decided</option>{outcomeOptions.map(x => <option key={x}>{x}</option>)}</select>
        </label>
      </div>
      <label className="field-label">Advisor notes
        <textarea rows={4} maxLength={4000} value={form.advisorNotes} onChange={e => set('advisorNotes', e.target.value)} data-testid="input-advisor-notes" />
      </label>
      <label className="field-label">Agreed support or next action
        <textarea rows={2} maxLength={500} value={form.nextAction} onChange={e => set('nextAction', e.target.value)} data-testid="input-next-action" />
      </label>
      <div className="field-pair">
        <label className="field-label">Review follow-up date
          <input type="date" value={form.followUpDate} onChange={e => set('followUpDate', e.target.value)} data-testid="input-review-followup" />
        </label>
        <label className="field-label">Effective date
          <input type="date" required value={effectiveDate} max={today} onChange={e => { setEditedDate(e.target.value); setDateEdited(true); }} data-testid="input-review-effective" />
        </label>
      </div>
      <label className="check-label"><input type="checkbox" checked={form.followUpCompleted} onChange={e => set('followUpCompleted', e.target.checked)} /> <span>Review follow-up completed</span></label>
      {contact === ContactStatus.Awaiting_response && (
        <label className="check-label"><input type="checkbox" checked={form.noResponse} onChange={e => set('noResponse', e.target.checked)} data-testid="check-no-response" /> <span>Record my decision: no response recorded as of {dayLabel(effectiveDate)}</span></label>
      )}
      <button className="button primary" type="submit" disabled={!dirty || save.isPending} data-testid="button-save-review"><Check size={16} aria-hidden="true" /> {save.isPending ? 'Saving…' : 'Save review'}</button>
      {fb && <Feedback kind={fb.kind}>{fb.text}</Feedback>}
      <p className="note">Saving a review never changes the academic category. Review status, contact status and support progress are separate.</p>
    </form>
  );
}

const typeOptions = Object.values(SupportActionType);
const progressOptions = Object.values(SupportProgress);

export function SupportActionForm({ id, initial, today, onSubmit, pending, fb, onCancel }: {
  id: string; initial: SupportAction | null; today: string; pending: boolean; fb: Fb;
  onSubmit: (d: SupportActionInput, reset: () => void) => void; onCancel?: () => void;
}) {
  const base = useMemo(() => ({
    actionType: (initial?.actionType ?? SupportActionType.Seek_further_context) as string,
    destination: initial?.destination ?? '', details: initial?.details ?? '', progress: (initial?.progress ?? SupportProgress.Planned) as string,
    followUpDate: initial?.followUpDate ? ymd(initial.followUpDate) : '', followUpCompleted: initial?.followUpCompleted ?? false,
  }), [initial]);
  const [dateEdited, setDateEdited] = useState(false);
  const [editedDate, setEditedDate] = useState(today);
  const effDate = dateEdited ? editedDate : today;
  const [v, setV] = useState(base);
  const [baseJson, setBaseJson] = useState(JSON.stringify(base));
  const dirty = JSON.stringify(v) !== baseJson || dateEdited;
  useDirtyGuard(`support-${id}`, dirty);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV(x => ({ ...x, [k]: val }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(
      { actionType: v.actionType as SupportActionType, destination: v.destination.trim() || null, details: v.details.trim() || null, progress: v.progress as SupportProgress, followUpDate: v.followUpDate || null, followUpCompleted: v.followUpCompleted, effectiveDate: effDate },
      () => { const next = initial ? v : base; setDateEdited(false); setV(next); setBaseJson(JSON.stringify(next)); },
    );
  };
  return (
    <form className="action-form" onSubmit={submit} data-testid={`form-support-${id}`}>
      <div className="field-pair">
        <label className="field-label">Support or next action
          <select value={v.actionType} onChange={e => set('actionType', e.target.value)} data-testid={`select-action-type-${id}`}>{typeOptions.map(x => <option key={x}>{x}</option>)}</select>
        </label>
        <label className="field-label">Progress
          <select value={v.progress} onChange={e => set('progress', e.target.value)} data-testid={`select-action-progress-${id}`}>{progressOptions.map(x => <option key={x}>{x}</option>)}</select>
        </label>
      </div>
      <label className="field-label">Service or destination (editable)
        <input value={v.destination} maxLength={300} onChange={e => set('destination', e.target.value)} placeholder="For example: a generic support service; no official names are supplied" data-testid={`input-action-destination-${id}`} />
      </label>
      <label className="field-label">Details
        <textarea rows={3} maxLength={4000} value={v.details} onChange={e => set('details', e.target.value)} data-testid={`input-action-details-${id}`} />
      </label>
      <div className="field-pair">
        <label className="field-label">Follow-up date
          <input type="date" value={v.followUpDate} onChange={e => set('followUpDate', e.target.value)} data-testid={`input-action-followup-${id}`} />
        </label>
        <label className="field-label">Effective date
          <input type="date" required value={effDate} max={today} onChange={e => { setEditedDate(e.target.value); setDateEdited(true); }} data-testid={`input-action-effective-${id}`} />
        </label>
      </div>
      <label className="check-label"><input type="checkbox" checked={v.followUpCompleted} onChange={e => set('followUpCompleted', e.target.checked)} /> <span>This action’s follow-up is completed</span></label>
      <div className="tc-row">
        <button className="button primary" type="submit" disabled={pending || (!!initial && !dirty)} data-testid={`button-save-action-${id}`}>{pending ? 'Saving…' : initial ? 'Save changes' : 'Add support action'}</button>
        {onCancel && <button type="button" className="button secondary" onClick={onCancel}>Close</button>}
      </div>
      {fb && <Feedback kind={fb.kind}>{fb.text}</Feedback>}
    </form>
  );
}

function ActionCard({ a, today }: { a: SupportAction; today: string }) {
  const update = useUpdateSupportAction();
  const refresh = useRefreshWorkspace();
  const [editing, setEditing] = useState(false);
  const [fb, setFb] = useState<Fb>(null);
  const toInput = (over: Partial<SupportActionInput>): SupportActionInput => ({
    actionType: a.actionType, destination: a.destination, details: a.details, progress: a.progress,
    followUpDate: a.followUpDate ? ymd(a.followUpDate) : null, followUpCompleted: a.followUpCompleted, effectiveDate: today, ...over,
  });
  const run = (data: SupportActionInput, ok: string, done?: () => void) => {
    setFb(null);
    update.mutate({ actionId: a.id, data }, {
      onSuccess: () => { setFb({ kind: 'success', text: ok }); done?.(); refresh(); },
      onError: er => setFb({ kind: 'error', text: apiErrorMessage(er, 'The support action could not be saved. Try again.') }),
    });
  };
  const open = a.progress === SupportProgress.Planned || a.progress === SupportProgress.In_progress;
  const outstanding = open && !!a.followUpDate && !a.followUpCompleted;
  return (
    <li className="action-card" data-testid={`card-action-${a.id}`}>
      <div className="action-top">
        <strong>{a.actionType}</strong>
        <span className="badge-row"><span className="meta">Support progress</span><ProgressBadge progress={a.progress} />{outstanding && a.followUpDate && <FollowUpBadge date={a.followUpDate} today={today} />}</span>
      </div>
      {a.destination && <p><span className="meta">Destination:</span> {a.destination}</p>}
      {a.details && <p className="pre">{a.details}</p>}
      <p className="meta">Effective {dayLabel(a.effectiveDate)}{a.followUpDate ? ` · follow-up ${dayLabel(a.followUpDate)}${a.followUpCompleted ? ' (completed)' : ''}` : ''}</p>
      <div className="tc-row">
        <button type="button" className="button secondary" onClick={() => setEditing(e => !e)} aria-expanded={editing} data-testid={`button-edit-action-${a.id}`}><Pencil size={14} aria-hidden="true" /> {editing ? 'Close editor' : 'Edit'}</button>
        {open && <button type="button" className="button secondary" disabled={update.isPending} onClick={() => run(toInput({ progress: SupportProgress.Completed, followUpCompleted: a.followUpDate ? true : a.followUpCompleted }), 'Action marked completed. Academic category and other follow-ups are unchanged.')} data-testid={`button-complete-action-${a.id}`}>Mark completed</button>}
        {open && <button type="button" className="button secondary" disabled={update.isPending} onClick={() => run(toInput({ progress: SupportProgress.Cancelled }), 'Action cancelled.')} data-testid={`button-cancel-action-${a.id}`}>Cancel action</button>}
      </div>
      {fb && !editing && <Feedback kind={fb.kind}>{fb.text}</Feedback>}
      {editing && <SupportActionForm id={a.id} initial={a} today={today} pending={update.isPending} fb={fb} onCancel={() => setEditing(false)} onSubmit={(d, reset) => run(d, 'Support action saved.', reset)} />}
    </li>
  );
}

export function SupportPlan({ ws, today }: { ws: RecordWorkspace; today: string }) {
  const create = useCreateSupportAction();
  const refresh = useRefreshWorkspace();
  const [adding, setAdding] = useState(false);
  const [fb, setFb] = useState<Fb>(null);
  const actions = useMemo(() => [...ws.supportActions].sort((a, b) => ymd(a.effectiveDate).localeCompare(ymd(b.effectiveDate)) || a.createdAt.localeCompare(b.createdAt)), [ws.supportActions]);
  return (
    <div className="subpanel" data-testid="support-plan">
      <div className="subpanel-head"><h3>Support actions</h3>
        <button type="button" className="button secondary" onClick={() => setAdding(a => !a)} aria-expanded={adding} data-testid="button-add-action"><Plus size={15} aria-hidden="true" /> {adding ? 'Close' : 'Add support action'}</button>
      </div>
      {adding && (
        <SupportActionForm id="new" initial={null} today={today} pending={create.isPending} fb={fb} onCancel={() => setAdding(false)}
          onSubmit={(data, reset) => {
            setFb(null);
            create.mutate({ learnerId: ws.record.learnerId, courseCode: ws.record.courseCode, data }, {
              onSuccess: () => { reset(); setFb({ kind: 'success', text: 'Support action added.' }); refresh(); },
              onError: er => setFb({ kind: 'error', text: apiErrorMessage(er, 'The support action could not be saved. Your entries are kept; try again.') }),
            });
          }} />
      )}
      {actions.length ? <ul className="action-list">{actions.map(a => <ActionCard key={a.id} a={a} today={today} />)}</ul> : <EmptyState title="No support actions yet">Add an action when you decide what support to offer for this paper.</EmptyState>}
    </div>
  );
}
