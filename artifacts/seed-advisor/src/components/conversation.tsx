import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { CheckCheck, MessageSquare, Send } from 'lucide-react';
import {
  getGetConversationQueryKey, useCreateConversation, useGetConversation, useMarkConversationRead, useSendConversationMessage,
  type ConversationSummary, type Message, type RecordSummary,
} from '@workspace/api-client-react';
import { CategoryBadge, ContactBadge, ReviewBadge } from '@/components/badges';
import { EmptyState, ErrorState, Feedback, LoadingRows, SimNotice } from '@/components/ui-bits';
import { apiErrorMessage, dateTimeLabel, dayLabel, newId, POLL_MS, recordHref } from '@/lib/format';
import { useDirtyGuard } from '@/lib/dirty';
import { useRefreshWorkspace } from '@/lib/page';

const byChrono = (a: Message, b: Message) => (a.scenarioDate === b.scenarioDate ? a.savedAt.localeCompare(b.savedAt) : a.scenarioDate.localeCompare(b.scenarioDate));

function MessageItem({ m }: { m: Message }) {
  const incoming = m.direction === 'incoming';
  return (
    <article className={`message ${incoming ? 'incoming' : 'outgoing'}`} data-testid={`message-${m.id}`}>
      <header>
        <strong>{incoming ? 'Learner reply' : 'Sent by advisor'}</strong>
        <span>{incoming ? 'From the learner' : m.advisorLabel}</span>
        <time>{dayLabel(m.scenarioDate)}</time>
        {incoming && <span className={`badge ${m.read ? 'b-grey' : 'b-purple'}`}>{m.read ? 'Read' : 'Unread'}</span>}
        {m.syntheticExample && <span className="badge b-slate">Synthetic example</span>}
      </header>
      <h4>{m.subject}</h4>
      <p className="message-body">{m.body}</p>
      <details className="audit">
        <summary>Audit metadata</summary>
        <span>System timestamp saved: {dateTimeLabel(m.savedAt)} (Pacific/Auckland)</span>
      </details>
    </article>
  );
}

export function ReplyForm({ conversationId, defaultSubject }: { conversationId: string; defaultSubject: string }) {
  const send = useSendConversationMessage();
  const refresh = useRefreshWorkspace();
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [fb, setFb] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const clientId = useRef(newId());
  const subjectValue = subject ?? defaultSubject;
  useDirtyGuard(`reply-${conversationId}`, body.trim() !== '' || (subject !== null && subject !== defaultSubject));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFb(null);
    send.mutate(
      { conversationId, data: { subject: subjectValue, body, clientMessageId: clientId.current } },
      {
        onSuccess: () => {
          setBody('');
          setSubject(null);
          clientId.current = newId();
          setFb({ kind: 'success', text: 'Reply saved to the conversation. Contact status is now Awaiting response.' });
          refresh();
        },
        onError: er => setFb({ kind: 'error', text: apiErrorMessage(er, 'The reply could not be saved. Your text is still here; try again.') }),
      },
    );
  };
  return (
    <form className="reply-form" onSubmit={submit} data-testid={`form-reply-${conversationId}`}>
      <h3>Reply as Student Advisor</h3>
      <SimNotice />
      <label className="field-label">Subject
        <input value={subjectValue} maxLength={300} required onChange={e => setSubject(e.target.value)} data-testid="input-reply-subject" />
      </label>
      <label className="field-label">Message
        <textarea value={body} rows={4} maxLength={10000} required onChange={e => setBody(e.target.value)} data-testid="input-reply-body" />
      </label>
      <button className="button primary" type="submit" disabled={send.isPending || !body.trim() || !subjectValue.trim()} data-testid="button-send-reply">
        <Send size={15} aria-hidden="true" /> {send.isPending ? 'Saving…' : 'Send reply'}
      </button>
      {fb && <Feedback kind={fb.kind}>{fb.text}</Feedback>}
    </form>
  );
}

export function ConversationThread({ conversationId, back, showLinked = false }: { conversationId: string; back: string; showLinked?: boolean }) {
  const q = useGetConversation(conversationId, { query: { queryKey: getGetConversationQueryKey(conversationId), refetchInterval: POLL_MS } });
  const markRead = useMarkConversationRead();
  const refresh = useRefreshWorkspace();
  const [fb, setFb] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const messages = useMemo(() => [...(q.data?.messages ?? [])].sort(byChrono), [q.data?.messages]);
  if (q.isLoading) return <LoadingRows label="Loading conversation" />;
  if (q.isError || !q.data) return <ErrorState message="This conversation could not be loaded." retry={() => q.refetch()} />;
  const c = q.data;
  const defaultSubject = /^re:/i.test(c.subject) ? c.subject : `Re: ${c.subject}`;
  return (
    <div className="thread" data-testid={`thread-${c.id}`}>
      <div className="thread-head">
        <div>
          <span className="meta">Recipient: learner {c.learnerId}</span>
          {c.syntheticExample && <span className="badge b-slate">Synthetic example</span>}
          <span className={`badge ${c.unreadCount > 0 ? 'b-purple' : 'b-grey'}`}>{c.unreadCount > 0 ? `${c.unreadCount} unread` : 'All read'}</span>
        </div>
        <button type="button" className="button secondary" disabled={c.unreadCount === 0 || markRead.isPending} data-testid="button-mark-read"
          onClick={() => { setFb(null); markRead.mutate({ conversationId }, { onSuccess: () => { setFb({ kind: 'success', text: 'Marked as read. Review status has not changed.' }); refresh(); }, onError: er => setFb({ kind: 'error', text: apiErrorMessage(er, 'Could not mark as read.') }) }); }}>
          <CheckCheck size={15} aria-hidden="true" /> {markRead.isPending ? 'Marking…' : 'Mark read'}
        </button>
      </div>
      {fb && <Feedback kind={fb.kind}>{fb.text}</Feedback>}
      {showLinked && (
        <section aria-label="Linked papers" className="linked-papers">
          <h3>Papers linked to this conversation</h3>
          <ul>
            {c.linkedRecords.map((r: RecordSummary) => (
              <li key={r.courseCode}>
                <Link href={recordHref(c.learnerId, r.courseCode, back)} data-testid={`link-linked-${r.courseCode}`}>{r.paperTitle} ({r.courseCode})</Link>
                <CategoryBadge category={r.category} /> <ReviewBadge status={r.reviewStatus} /> <ContactBadge status={r.contactStatus} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="messages" role="log" aria-label="Messages in chronological order">
        {messages.length ? messages.map(m => <MessageItem key={m.id} m={m} />) : <EmptyState title="No messages yet" />}
      </div>
      <ReplyForm conversationId={c.id} defaultSubject={defaultSubject} />
    </div>
  );
}

export function ConversationCard({ c, back }: { c: ConversationSummary; back: string }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="conv-card" data-testid={`card-conversation-${c.id}`}>
      <header>
        <MessageSquare size={18} aria-hidden="true" />
        <div>
          <strong>{c.subject}</strong>
          <span className="meta">Papers: {c.courseCodes.join(', ')} · {c.messageCount} message{c.messageCount === 1 ? '' : 's'} · last {dayLabel(c.lastMessageDate)}</span>
        </div>
        {c.syntheticExample && <span className="badge b-slate">Synthetic example</span>}
        <span className={`badge ${c.unreadCount > 0 ? 'b-purple' : 'b-grey'}`}>{c.unreadCount > 0 ? `${c.unreadCount} unread` : 'Read'}</span>
      </header>
      <div className="conv-actions">
        <button type="button" className="button secondary" aria-expanded={open} onClick={() => setOpen(o => !o)} data-testid={`button-toggle-conversation-${c.id}`}>{open ? 'Hide messages' : 'Show messages and reply'}</button>
        <Link href={`/inbox/${encodeURIComponent(c.id)}?back=${encodeURIComponent(back)}`} className="text-link" data-testid={`link-open-conversation-${c.id}`}>Open in SEED Inbox</Link>
      </div>
      {open && <ConversationThread conversationId={c.id} back={back} />}
    </article>
  );
}

export function ContactLearnerForm({ learnerId, courseCode, others }: { learnerId: string; courseCode: string; others: RecordSummary[] }) {
  const create = useCreateConversation();
  const refresh = useRefreshWorkspace();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [extra, setExtra] = useState<string[]>([]);
  const [fb, setFb] = useState<{ kind: 'success' | 'error'; text: string; id?: string } | null>(null);
  const clientId = useRef(newId());
  useDirtyGuard(`contact-${learnerId}-${courseCode}`, subject.trim() !== '' || body.trim() !== '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFb(null);
    create.mutate(
      { data: { learnerId, courseCodes: [courseCode, ...extra], subject, body, clientMessageId: clientId.current } },
      {
        onSuccess: conv => {
          setSubject('');
          setBody('');
          setExtra([]);
          clientId.current = newId();
          setFb({ kind: 'success', text: 'Message saved. It now appears in the conversations below and in SEED Inbox. Contact status is Awaiting response.', id: conv.id });
          refresh();
        },
        onError: er => setFb({ kind: 'error', text: apiErrorMessage(er, 'The message could not be saved. Your subject and message are kept; try again.') }),
      },
    );
  };
  return (
    <form className="contact-form" onSubmit={submit} data-testid="form-contact-learner">
      <h3>Contact learner</h3>
      <SimNotice />
      <p className="recipient">Recipient: <strong data-testid="text-recipient">Learner {learnerId}</strong> <span className="meta">(email addresses are not shown)</span></p>
      <label className="field-label">Subject
        <input value={subject} maxLength={300} required onChange={e => setSubject(e.target.value)} data-testid="input-contact-subject" />
      </label>
      <label className="field-label">Message
        <textarea value={body} rows={5} maxLength={10000} required onChange={e => setBody(e.target.value)} data-testid="input-contact-body" />
      </label>
      <fieldset className="paper-links">
        <legend>Papers this message relates to</legend>
        <label className="check-label"><input type="checkbox" checked disabled /> <span>{courseCode} (this paper)</span></label>
        {others.map(o => (
          <label className="check-label" key={o.courseCode}>
            <input type="checkbox" checked={extra.includes(o.courseCode)} onChange={e => setExtra(x => (e.target.checked ? [...x, o.courseCode] : x.filter(v => v !== o.courseCode)))} data-testid={`check-link-${o.courseCode}`} />
            <span>{o.courseCode} · {o.paperTitle}</span>
          </label>
        ))}
      </fieldset>
      <button className="button primary" type="submit" disabled={create.isPending || !subject.trim() || !body.trim()} data-testid="button-send-contact">
        <Send size={15} aria-hidden="true" /> {create.isPending ? 'Saving…' : 'Send message'}
      </button>
      {fb && (
        <Feedback kind={fb.kind}>
          {fb.text}{' '}
          {fb.id && <Link href={`/inbox/${encodeURIComponent(fb.id)}`} className="text-link">View conversation</Link>}
        </Feedback>
      )}
    </form>
  );
}
