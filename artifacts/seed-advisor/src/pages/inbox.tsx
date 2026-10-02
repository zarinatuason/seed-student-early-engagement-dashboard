import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams, useSearch } from 'wouter';
import { Inbox as InboxIcon } from 'lucide-react';
import { getGetConversationQueryKey, getListConversationsQueryKey, useGetConversation, useListConversations } from '@workspace/api-client-react';
import { ConversationThread } from '@/components/conversation';
import { BackLink, EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/ui-bits';
import { currentUrl, usePageMeta, useUrlParams } from '@/lib/page';
import { dayLabel, POLL_MS, recordHref, safeBack } from '@/lib/format';

export function InboxPage() {
  usePageMeta('SEED Inbox', 'Learner replies and conversations for the Student Advisor, with unread and read state.');
  const [pathname] = useLocation();
  const { params, set, search } = useUrlParams('/inbox');
  const unreadOnly = params.get('filter') === 'unread';
  const learnerId = params.get('learnerId') || undefined;
  const url = currentUrl(pathname, search);
  const [lid, setLid] = useState(learnerId ?? '');
  useEffect(() => setLid(params.get('learnerId') ?? ''), [params]);
  const qp = { unreadOnly: unreadOnly || undefined, learnerId };
  const q = useListConversations(qp, { query: { queryKey: getListConversationsQueryKey(qp), refetchInterval: POLL_MS } });
  const submit = (e: FormEvent) => { e.preventDefault(); set({ learnerId: lid.trim() }); };
  const data = q.data;
  return (
    <div className="page-enter">
      <PageHeader title="SEED Inbox">Conversations with learners and their replies. Reading a reply does not complete the academic review.</PageHeader>
      <div className="inbox-bar">
        <div className="segmented" role="group" aria-label="Filter conversations">
          <button type="button" aria-pressed={!unreadOnly} onClick={() => set({ filter: undefined })} data-testid="filter-all">All</button>
          <button type="button" aria-pressed={unreadOnly} onClick={() => set({ filter: 'unread' })} data-testid="filter-unread">Unread{data ? ` (${data.unreadReplies})` : ''}</button>
        </div>
        <form onSubmit={submit} className="inline-form" role="search">
          <label className="field-label">Learner ID<input value={lid} onChange={e => setLid(e.target.value)} data-testid="input-inbox-learner" /></label>
          <button className="button secondary" type="submit">Filter</button>
          {learnerId && <button type="button" className="button ghost" onClick={() => set({ learnerId: undefined })}>Clear</button>}
        </form>
      </div>
      {q.isError ? <ErrorState retry={() => q.refetch()} /> : q.isLoading ? <LoadingRows label="Loading conversations" /> : !data || data.conversations.length === 0 ? (
        <EmptyState title={unreadOnly ? 'No unread replies' : 'No conversations yet'} icon={<InboxIcon size={20} aria-hidden="true" />}>
          {unreadOnly ? 'Every learner reply has been marked as read.' : 'Use Contact learner on an academic record to start one.'}
        </EmptyState>
      ) : (
        <div className="table-card">
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Conversations table, scrollable">
            <table className="inbox-table">
              <thead><tr><th scope="col">Learner ID</th><th scope="col">Subject</th><th scope="col">Papers</th><th scope="col">Received</th><th scope="col">State</th><th scope="col">Open</th></tr></thead>
              <tbody>
                {data.conversations.map(c => (
                  <tr key={c.id} className={c.unreadCount > 0 ? 'unread-row' : ''} data-testid={`row-conversation-${c.id}`}>
                    <th scope="row" className="learner-id">{c.learnerId}</th>
                    <td><span className="strong">{c.subject}</span>{c.syntheticExample && <small>Synthetic example</small>}</td>
                    <td>{c.courseCodes.map((code, i) => <span key={code}>{i > 0 && ', '}<Link href={recordHref(c.learnerId, code, url)} className="text-link">{code}</Link></span>)}</td>
                    <td>{c.lastIncomingDate ? dayLabel(c.lastIncomingDate) : <span className="meta">No reply received</span>}</td>
                    <td><span className={`badge ${c.unreadCount > 0 ? 'b-purple' : 'b-grey'}`}>{c.unreadCount > 0 ? `Unread (${c.unreadCount})` : 'Read'}</span></td>
                    <td><Link href={`/inbox/${encodeURIComponent(c.id)}?back=${encodeURIComponent(url)}`} className="view-link" data-testid={`link-open-${c.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConversationPage() {
  const { conversationId = '' } = useParams<{ conversationId: string }>();
  const search = useSearch();
  const back = safeBack(new URLSearchParams(search).get('back')) || '/inbox';
  const q = useGetConversation(conversationId, { query: { queryKey: getGetConversationQueryKey(conversationId), refetchInterval: POLL_MS } });
  usePageMeta('SEED Inbox conversation', 'A saved conversation between the Student Advisor and a learner, with replies.');
  const here = `/inbox/${encodeURIComponent(conversationId)}`;
  return (
    <div className="page-enter">
      <BackLink href={back.startsWith('/inbox') ? back : '/inbox'} label="Back to SEED Inbox" testId="link-back-inbox" />
      <PageHeader title="SEED Inbox">{q.data ? <>Conversation about learner {q.data.learnerId}: <strong>{q.data.subject}</strong></> : 'Conversation'}</PageHeader>
      {q.isError ? <EmptyState title="Conversation not found">This conversation does not exist in your session.</EmptyState> : <section className="panel"><ConversationThread conversationId={conversationId} back={back.startsWith('/inbox') ? here : back} showLinked /></section>}
    </div>
  );
}
