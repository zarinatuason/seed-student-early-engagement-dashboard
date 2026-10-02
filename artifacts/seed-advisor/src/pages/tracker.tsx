import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, CheckCircle2, Search } from 'lucide-react';
import {
  ContactStatus, ListWorkspaceTrackerFollowUp, ReviewStatus, SupportProgress, getListWorkspaceTrackerQueryKey, useListWorkspaceTracker,
  type ListWorkspaceTrackerParams,
} from '@workspace/api-client-react';
import { CategoryBadge, ContactBadge, FollowUpBadge, ProgressBadge, ReviewBadge } from '@/components/badges';
import { useSession } from '@/components/session-gate';
import { BackLink, EmptyState, ErrorState, LoadingRows, PageHeader, Pagination } from '@/components/ui-bits';
import { dayLabel, recordHref, ymd } from '@/lib/format';
import { currentUrl, saveScroll, usePageMeta, useRestoreScroll, useUrlParams } from '@/lib/page';

const pick = <T extends string>(v: string | null, all: readonly T[]) => (v && (all as readonly string[]).includes(v) ? (v as T) : undefined);

export default function TrackerPage() {
  usePageMeta('Review Tracker', 'Track review status, contact status, support progress and outstanding follow-ups by learner–paper record.', false);
  const [pathname] = useLocation();
  const { params, set, search } = useUrlParams('/tracker');
  const today = ymd(useSession().scenarioDate.date);
  const url = currentUrl(pathname, search);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = pick(params.get('pageSize'), ['10', '25', '50']) ?? '10';
  const query: ListWorkspaceTrackerParams = {
    search: params.get('search') || undefined, reviewStatus: pick(params.get('reviewStatus'), Object.values(ReviewStatus)),
    contactStatus: pick(params.get('contactStatus'), Object.values(ContactStatus)),
    followUp: pick(params.get('followUp'), Object.values(ListWorkspaceTrackerFollowUp)) ?? 'all',
    supportProgress: pick(params.get('supportProgress'), Object.values(SupportProgress)),
    page, pageSize: Number(pageSize) as ListWorkspaceTrackerParams['pageSize'],
  };
  const q = useListWorkspaceTracker(query, { query: { queryKey: getListWorkspaceTrackerQueryKey(query) } });
  useRestoreScroll(url, !!q.data);
  const [term, setTerm] = useState(query.search ?? '');
  useEffect(() => setTerm(params.get('search') ?? ''), [params]);
  const data = q.data;
  const submit = (e: FormEvent) => { e.preventDefault(); set({ search: term.trim(), page: undefined }); };

  return (
    <div className="page-enter">
      {params.get('from') === 'overview' && <BackLink href="/" label="Back to Overview" testId="link-back-overview" />}
      <PageHeader title="Review Tracker">Saved reviews, support progress and outstanding follow-ups for each learner–paper record.</PageHeader>
      <form className="filter-panel" onSubmit={submit} role="search" aria-label="Filter tracker">
        <div className="filters-grid">
          <label className="field-label">Search<input value={term} onChange={e => setTerm(e.target.value)} placeholder="Learner, paper or support action" data-testid="input-tracker-search" /></label>
          <label className="field-label">Review status
            <select value={query.reviewStatus ?? ''} onChange={e => set({ reviewStatus: e.target.value, page: undefined })} data-testid="select-tracker-review"><option value="">All review statuses</option>{Object.values(ReviewStatus).map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="field-label">Contact status
            <select value={query.contactStatus ?? ''} onChange={e => set({ contactStatus: e.target.value, page: undefined })} data-testid="select-tracker-contact"><option value="">All contact statuses</option>{Object.values(ContactStatus).map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="field-label">Support progress
            <select value={query.supportProgress ?? ''} onChange={e => set({ supportProgress: e.target.value, page: undefined })} data-testid="select-tracker-progress"><option value="">Any support progress</option>{Object.values(SupportProgress).map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="field-label">Follow-up
            <select value={query.followUp} onChange={e => set({ followUp: e.target.value === 'all' ? undefined : e.target.value, page: undefined })} data-testid="select-tracker-followup">
              <option value="all">Any follow-up</option><option value="due">Due today</option><option value="overdue">Overdue</option><option value="open">Due, overdue or upcoming outstanding</option>
            </select></label>
        </div>
        <div className="filter-actions">
          <button className="button primary" type="submit" data-testid="button-tracker-search"><Search size={15} aria-hidden="true" /> Apply search</button>
          <button type="button" className="button ghost" onClick={() => set({ search: undefined, reviewStatus: undefined, contactStatus: undefined, supportProgress: undefined, followUp: undefined, page: undefined })} data-testid="button-tracker-clear">Clear filters</button>
        </div>
      </form>
      {q.isError ? <ErrorState retry={() => q.refetch()} /> : q.isLoading ? <LoadingRows label="Loading tracker" /> : !data || data.records.length === 0 ? (
        <EmptyState title="Nothing in this view" icon={<CheckCircle2 size={20} aria-hidden="true" />}>No records match these filters. Saved reviews and support actions appear here as you create them.</EmptyState>
      ) : (
        <div className="table-card" aria-busy={q.isFetching}>
          <div className="table-meta"><span><strong>{data.total.toLocaleString('en-NZ')}</strong> records in this view</span><span>Page {data.page} of {data.totalPages}</span></div>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Review tracker table, scrollable">
            <table className="tracker-table">
              <thead><tr>
                <th scope="col">Learner ID</th><th scope="col">Paper</th><th scope="col">Academic category</th><th scope="col">Review status</th><th scope="col">Contact status</th>
                <th scope="col">Latest support for this paper</th><th scope="col">Outstanding follow-up</th><th scope="col">Last updated</th><th scope="col">View record</th>
              </tr></thead>
              <tbody>
                {data.records.map(r => (
                  <tr key={`${r.learnerId}-${r.courseCode}`} data-testid={`row-tracker-${r.learnerId}-${r.courseCode}`}>
                    <th scope="row" className="learner-id">{r.learnerId}</th>
                    <td><span className="strong">{r.paperTitle}</span><small>{r.courseCode}</small></td>
                    <td><CategoryBadge category={r.category} /></td>
                    <td><ReviewBadge status={r.reviewStatus} /></td>
                    <td><ContactBadge status={r.contactStatus} /></td>
                    <td>{r.latestSupportAction ? <><span className="strong">{r.latestSupportAction}</span>{r.supportProgress && <ProgressBadge progress={r.supportProgress} />}<small>{r.supportActionCount} action{r.supportActionCount === 1 ? '' : 's'}</small></> : <span className="meta">No support action</span>}</td>
                    <td>{r.nextFollowUpDate ? <><FollowUpBadge date={r.nextFollowUpDate} today={today} /><small>{r.outstandingFollowUpCount} outstanding</small></> : <span className="meta">None outstanding</span>}</td>
                    <td className="meta">{dayLabel(r.lastUpdatedAt)}</td>
                    <td>
                      <Link href={recordHref(r.learnerId, r.courseCode, url)} onClick={() => saveScroll(url)} className="view-link" aria-label={`View record for ${r.learnerId}, ${r.courseCode}`} data-testid={`link-view-${r.learnerId}-${r.courseCode}`}>
                        View record <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} pageSize={data.pageSize} total={data.total} onPage={p => set({ page: p === 1 ? undefined : String(p) })} onPageSize={n => set({ pageSize: n === 10 ? undefined : String(n), page: undefined })} />
        </div>
      )}
    </div>
  );
}
