import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { AcademicCategory, getGetWorkspaceSummaryQueryKey, useGetWorkspaceSummary, type AcademicCategories } from '@workspace/api-client-react';
import { categoryTone } from '@/components/badges';
import { ErrorState, LoadingRows, PageHeader } from '@/components/ui-bits';
import { POLL_MS } from '@/lib/format';
import { usePageMeta } from '@/lib/page';

const CATS: { label: AcademicCategory; key: keyof AcademicCategories }[] = [
  { label: AcademicCategory.High_Priority, key: 'highPriority' },
  { label: AcademicCategory.Review_Recommended, key: 'reviewRecommended' },
  { label: AcademicCategory.Insufficient_Evidence, key: 'insufficientEvidence' },
  { label: AcademicCategory.No_Current_Concern, key: 'noCurrentConcern' },
];
const f = (n: number) => n.toLocaleString('en-NZ');

export default function OverviewPage() {
  usePageMeta('Overview', 'Cohort totals, records by review category, review progress, follow-ups and unread learner replies for the Student Advisor.');
  const q = useGetWorkspaceSummary({ query: { queryKey: getGetWorkspaceSummaryQueryKey(), refetchInterval: POLL_MS } });
  const head = <PageHeader title="Overview" />;
  if (q.isLoading) return <div className="page-enter">{head}<LoadingRows label="Loading overview" /></div>;
  if (q.isError || !q.data) return <>{head}<ErrorState retry={() => q.refetch()} /></>;
  const s = q.data;
  const reviewed = s.learnerPaperRecords ? (s.reviewStatuses.reviewed / s.learnerPaperRecords) * 100 : 0;
  const from = 'from=overview';
  return (
    <div className="page-enter">
      {head}
      <div className="stat-row">
        <div className="stat"><span>Learners in cohort</span><strong data-testid="text-total-learners">{f(s.learners)}</strong><small>distinct learners</small></div>
        <div className="stat"><span>Learner–paper records</span><strong data-testid="text-total-records">{f(s.learnerPaperRecords)}</strong><small>one per learner per paper</small></div>
        <Link href="/inbox?filter=unread" className="stat link-stat" data-testid="link-unread-replies"><span>Unread learner replies</span><strong>{s.unreadReplies}</strong><small>open unread in SEED Inbox <ArrowRight size={13} aria-hidden="true" /></small></Link>
      </div>

      <section className="section-block" aria-labelledby="h-cats">
        <h2 id="h-cats">Records by review category</h2>
        <div className="category-grid">
          {CATS.map(c => (
            <Link key={c.label} href={`/records?category=${encodeURIComponent(c.label)}&${from}`} className={`category-summary ${categoryTone(c.label)}`} data-testid={`card-category-${c.key}`}>
              <strong className="cat-name">{c.label}</strong>
              <span className="cat-big">{f(s.academicCategories[c.key])}<small>learner–paper records</small></span>
              <span className="cat-learners">{f(s.academicCategoryLearners[c.key])} distinct learners</span>
            </Link>
          ))}
        </div>
        <p className="note" data-testid="text-overlap-notice">
          A learner can appear in more than one category across papers, so learner counts here do not add up to {f(s.learners)}. {f(s.mixedCategoryLearners)} learners have different categories in different papers.
        </p>
      </section>

      <div className="two-panels">
        <section className="panel" aria-labelledby="h-progress">
          <h2 id="h-progress">Review progress</h2>
          <p className="meta">Counted in learner–paper records</p>
          <div className="mini-progress" aria-hidden="true"><span style={{ width: `${reviewed}%` }} /></div>
          <ul className="link-list">
            <li><Link href={`/records?reviewStatus=Awaiting%20review&${from}`} data-testid="link-awaiting">{f(s.reviewStatuses.awaitingReview)} records awaiting review</Link></li>
            <li><Link href={`/records?reviewStatus=In%20review&${from}`} data-testid="link-in-review">{f(s.reviewStatuses.inReview)} records in review</Link></li>
            <li><Link href={`/records?reviewStatus=Reviewed&${from}`} data-testid="link-reviewed">{f(s.reviewStatuses.reviewed)} records reviewed</Link></li>
          </ul>
        </section>
        <section className="panel" aria-labelledby="h-follow">
          <h2 id="h-follow">Follow-ups</h2>
          <p className="meta">Counted in follow-up items, not records</p>
          {s.scheduledFollowUps === 0 && s.followUpsDueToday === 0 && s.followUpsOverdue === 0 ? (
            <p className="empty-line" data-testid="text-no-followups">No follow-ups scheduled</p>
          ) : (
            <ul className="link-list">
              <li><Link href={`/tracker?followUp=open&${from}`} data-testid="link-scheduled">{s.scheduledFollowUps} outstanding follow-up items</Link></li>
              <li><Link href={`/tracker?followUp=due&${from}`} data-testid="link-due-today">{s.followUpsDueToday} due today</Link></li>
              <li><Link href={`/tracker?followUp=overdue&${from}`} data-testid="link-overdue">{s.followUpsOverdue} overdue</Link></li>
            </ul>
          )}
          <p className="meta">{s.outstandingSupportActions} support actions planned or in progress</p>
          <Link href={`/tracker?${from}`} className="text-link" data-testid="link-all-tracker">Open Review Tracker <ArrowRight size={14} aria-hidden="true" /></Link>
        </section>
      </div>
    </div>
  );
}
