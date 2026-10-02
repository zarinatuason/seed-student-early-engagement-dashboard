import { Link, useParams, useSearch } from 'wouter';
import { getGetRecordWorkspaceQueryKey, useGetRecordWorkspace } from '@workspace/api-client-react';
import { CategoryBadge, ContactBadge, ProgressBadge, ReviewBadge } from '@/components/badges';
import { ContactLearnerForm, ConversationCard } from '@/components/conversation';
import { EvidenceSection, Figures } from '@/components/evidence';
import { ReviewPanel, SupportPlan } from '@/components/review-support';
import { useSession } from '@/components/session-gate';
import { BackLink, EmptyState, ErrorState, LoadingRows } from '@/components/ui-bits';
import { backLabelFor, dateTimeLabel, dayLabel, POLL_MS, recordHref, safeBack, ymd } from '@/lib/format';
import { usePageMeta } from '@/lib/page';

export default function RecordPage() {
  const { learnerId = '', courseCode = '' } = useParams<{ learnerId: string; courseCode: string }>();
  const search = useSearch();
  const back = safeBack(new URLSearchParams(search).get('back'));
  const today = ymd(useSession().scenarioDate.date);
  const q = useGetRecordWorkspace(learnerId, courseCode, { query: { queryKey: getGetRecordWorkspaceQueryKey(learnerId, courseCode), refetchInterval: POLL_MS } });
  usePageMeta(`Record ${learnerId} · ${courseCode}`, `Academic evidence, review and support plan for learner ${learnerId} in paper ${courseCode}.`);
  const backHref = back || '/records';
  const backEl = <BackLink href={backHref} label={backLabelFor(back)} testId="link-back-origin" />;
  if (q.isLoading) return <>{backEl}<LoadingRows label="Loading record" /></>;
  if (q.isError || !q.data) {
    const notFound = (q.error as { status?: number } | null)?.status === 404;
    return <>{backEl}{notFound ? <EmptyState title="Record not found">No verified record exists for learner {learnerId} in paper {courseCode}.</EmptyState> : <ErrorState message="This learner–paper record could not be loaded." retry={() => q.refetch()} />}</>;
  }
  const ws = q.data;
  const d = ws.record;
  const here = `/records/${encodeURIComponent(learnerId)}/${encodeURIComponent(courseCode)}${back ? `?back=${encodeURIComponent(back)}` : ''}`;
  const latest = [...ws.supportActions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const others = ws.otherPapers.filter(p => p.courseCode !== d.courseCode);
  const history = [...d.history].sort((a, b) => (ymd(a.effectiveDate) === ymd(b.effectiveDate) ? a.savedAt.localeCompare(b.savedAt) : ymd(a.effectiveDate).localeCompare(ymd(b.effectiveDate))));
  return (
    <div className="page-enter record-page">
      {backEl}
      <h1 className="record-title">Learner {d.learnerId}</h1>

      <section className="panel" aria-labelledby="sec-a">
        <h2 id="sec-a">Learner and paper</h2>
        <div className="learner-paper">
          <dl className="kv">
            <div><dt>Learner ID</dt><dd data-testid="text-learner-id">{d.learnerId}</dd></div>
            <div><dt>Paper</dt><dd>{d.paperTitle} ({d.courseCode})</dd></div>
            <div><dt>Faculty / department</dt><dd>{d.facultySchool} · {d.department}</dd></div>
            <div><dt>Registration context</dt><dd>Level {d.courseLevel} · {d.paperStructureType} · {d.offeringPeriod}; registered Day {d.registrationDay}, {d.opportunityDays} days of opportunity</dd></div>
          </dl>
          <div className="status-stack">
            <div><span className="meta">Academic category</span><CategoryBadge category={d.category} /></div>
            <div><span className="meta">Review status</span><ReviewBadge status={d.review.reviewStatus} /></div>
            <div><span className="meta">Contact status</span><ContactBadge status={d.review.contactStatus} /></div>
            <div><span className="meta">Latest support progress</span>{latest ? <ProgressBadge progress={latest.progress} /> : <span className="meta">No support action</span>}</div>
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="sec-b">
        <h2 id="sec-b">Reason for review</h2>
        <p className="reason-text" data-testid="text-reason">{d.reason || 'No reason was supplied.'}</p>
        {d.concernDomains.length > 0 && <p className="domain-row"><span className="meta">Concerns:</span> {d.concernDomains.map(x => <span className="domain-tag" key={x}>{x}</span>)}</p>}
        <Figures d={d} />
        <p className="note">The category and reason are supplied indicators for human review, not conclusions about the learner.</p>
      </section>

      <section className="panel" aria-labelledby="sec-c">
        <h2 id="sec-c">Other enrolled papers</h2>
        <p className="note">All verified papers for learner {d.learnerId}. Each paper keeps its own calculated category.</p>
        <ul className="paper-list" data-testid="list-other-papers">
          {ws.otherPapers.map(p => {
            const current = p.courseCode === d.courseCode;
            return (
              <li key={p.courseCode} className={current ? 'current' : ''} data-testid={`paper-${p.courseCode}`}>
                <div className="paper-top">
                  <strong>{p.paperTitle} ({p.courseCode})</strong>
                  <CategoryBadge category={p.category} />
                  {current && <span className="badge b-teal">Current paper</span>}
                </div>
                <p>{p.reason}</p>
                <div className="badge-row"><ReviewBadge status={p.reviewStatus} /><ContactBadge status={p.contactStatus} />
                  {!current && <Link href={recordHref(p.learnerId, p.courseCode, back)} className="text-link" data-testid={`link-paper-${p.courseCode}`}>Open this paper</Link>}</div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel wide-panel" aria-labelledby="sec-d">
        <h2 id="sec-d">Academic evidence</h2>
        <EvidenceSection d={d} />
      </section>

      <section className="panel" aria-labelledby="sec-e">
        <h2 id="sec-e">Review and support plan</h2>
        <div className="two-col">
          <ReviewPanel ws={ws} today={today} />
          <SupportPlan ws={ws} today={today} />
        </div>
      </section>

      <section className="panel" aria-labelledby="sec-f">
        <h2 id="sec-f">Conversation and history</h2>
        <div className="two-col">
          <ContactLearnerForm learnerId={d.learnerId} courseCode={d.courseCode} others={others} />
          <div>
            <h3>Conversations</h3>
            {ws.conversations.length ? ws.conversations.map(c => <ConversationCard key={c.id} c={c} back={here} />) : <EmptyState title="No conversations yet">Use Contact learner to send a first message.</EmptyState>}
          </div>
        </div>
        <h3 className="history-h">Dated review and support history</h3>
        {history.length ? (
          <ol className="history" data-testid="list-history">
            {history.map(h => (
              <li key={h.id}>
                <time>{dayLabel(h.effectiveDate)}</time>
                <div>
                  <strong>{h.summary}</strong>
                  <span className="meta">{h.actionType}{h.method ? ` · ${h.method}` : ''}</span>
                  {h.note && <p className="pre">{h.note}</p>}
                  <details className="audit"><summary>Audit metadata</summary><span>System timestamp saved: {dateTimeLabel(h.savedAt)} (Pacific/Auckland)</span></details>
                </div>
              </li>
            ))}
          </ol>
        ) : <EmptyState title="No dated actions yet">Saved reviews and support actions will appear here in order.</EmptyState>}
      </section>
    </div>
  );
}
