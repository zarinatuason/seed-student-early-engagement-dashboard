import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowDown, ArrowRight, ArrowUp, Search } from 'lucide-react';
import {
  AcademicCategory, ContactStatus, ReviewStatus, getListWorkspaceRecordsQueryKey, useListWorkspaceRecords,
  type ListWorkspaceRecordsParams,
} from '@workspace/api-client-react';
import { CategoryBadge, ContactBadge, ReviewBadge, categoryTone } from '@/components/badges';
import { BackLink, EmptyState, ErrorState, LoadingRows, PageHeader, Pagination } from '@/components/ui-bits';
import { currentUrl, saveScroll, usePageMeta, useRestoreScroll, useUrlParams } from '@/lib/page';
import { recordHref } from '@/lib/format';

const CATS = [
  { value: AcademicCategory.High_Priority, key: 'highPriority' as const },
  { value: AcademicCategory.Review_Recommended, key: 'reviewRecommended' as const },
  { value: AcademicCategory.Insufficient_Evidence, key: 'insufficientEvidence' as const },
  { value: AcademicCategory.No_Current_Concern, key: 'noCurrentConcern' as const },
];
const SORTS = [
  { id: 'learnerId', label: 'Learner ID' }, { id: 'category', label: 'Review category' }, { id: 'paper', label: 'Paper' },
  { id: 'reason', label: 'Reason' }, { id: 'reviewStatus', label: 'Review status' },
] as const;
const pick = <T extends string>(v: string | null, all: readonly T[]) => (v && (all as readonly string[]).includes(v) ? (v as T) : undefined);

export default function RecordsPage() {
  usePageMeta('Academic Records', 'Search and filter learner–paper academic records by review category, review status and contact status.', false);
  const [pathname] = useLocation();
  const { params, set, search } = useUrlParams('/records');
  const url = currentUrl(pathname, search);
  const fromOverview = params.get('from') === 'overview';
  const sortBy = pick(params.get('sortBy'), SORTS.map(s => s.id)) ?? 'category';
  const sortDirection = params.get('sortDirection') === 'desc' ? 'desc' : 'asc';
  const pageSize = pick(params.get('pageSize'), ['10', '25', '50']) ?? '10';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const query: ListWorkspaceRecordsParams = {
    search: params.get('search') || undefined, paper: params.get('paper') || undefined, department: params.get('department') || undefined,
    category: pick(params.get('category'), Object.values(AcademicCategory)), reviewStatus: pick(params.get('reviewStatus'), Object.values(ReviewStatus)),
    contactStatus: pick(params.get('contactStatus'), Object.values(ContactStatus)),
    sortBy, sortDirection, page, pageSize: Number(pageSize) as ListWorkspaceRecordsParams['pageSize'],
  };
  const q = useListWorkspaceRecords(query, { query: { queryKey: getListWorkspaceRecordsQueryKey(query) } });
  useRestoreScroll(url, !!q.data);

  const [text, setText] = useState({ search: query.search ?? '', paper: query.paper ?? '', department: query.department ?? '' });
  useEffect(() => setText({ search: params.get('search') ?? '', paper: params.get('paper') ?? '', department: params.get('department') ?? '' }), [params]);
  const submit = (e: FormEvent) => { e.preventDefault(); set({ search: text.search.trim(), paper: text.paper.trim(), department: text.department.trim(), page: undefined }); };
  const sortBtn = (id: string) => set({ sortBy: id, sortDirection: sortBy === id && sortDirection === 'asc' ? 'desc' : 'asc', page: undefined });
  const anyFilter = !!(query.search || query.paper || query.department || query.category || query.reviewStatus || query.contactStatus);
  const data = q.data;

  return (
    <div className="page-enter">
      {fromOverview && <BackLink href="/" label="Back to Overview" testId="link-back-overview" />}
      <PageHeader title="Academic Records">Search learner–paper records and open one to review its evidence.</PageHeader>
      <section aria-label="Records by review category" className="counts-panel">
        <h2 className="h-compact">Records by review category</h2>
        <div className="count-chips">
          {CATS.map(c => (
            <button key={c.value} type="button" className={`count-chip ${categoryTone(c.value)}`} aria-pressed={query.category === c.value}
              onClick={() => set({ category: query.category === c.value ? undefined : c.value, page: undefined })} data-testid={`chip-${c.key}`}>
              <span>{c.value}</span>
              <strong>{data ? data.categoryCounts[c.key].toLocaleString('en-NZ') : '—'} records</strong>
              <small>{data ? data.categoryLearnerCounts[c.key].toLocaleString('en-NZ') : '—'} distinct learners</small>
            </button>
          ))}
        </div>
        <p className="meta" data-testid="text-count-scope">{data?.countScope || 'Counts respect the other active filters.'}{data ? ` · ${data.totalDistinctLearners.toLocaleString('en-NZ')} distinct learners in the current results` : ''}</p>
      </section>

      <form className="filter-panel" onSubmit={submit} role="search" aria-label="Filter records">
        <div className="filters-grid">
          <label className="field-label">Search<input value={text.search} onChange={e => setText(t => ({ ...t, search: e.target.value }))} placeholder="Learner ID, paper or reason" data-testid="input-record-search" /></label>
          <label className="field-label">Paper<input value={text.paper} onChange={e => setText(t => ({ ...t, paper: e.target.value }))} placeholder="Title or code" data-testid="input-filter-paper" /></label>
          <label className="field-label">Department<input value={text.department} onChange={e => setText(t => ({ ...t, department: e.target.value }))} data-testid="input-filter-department" /></label>
          <label className="field-label">Review category
            <select value={query.category ?? ''} onChange={e => set({ category: e.target.value, page: undefined })} data-testid="select-filter-category"><option value="">All categories</option>{Object.values(AcademicCategory).map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="field-label">Review status
            <select value={query.reviewStatus ?? ''} onChange={e => set({ reviewStatus: e.target.value, page: undefined })} data-testid="select-filter-review"><option value="">All review statuses</option>{Object.values(ReviewStatus).map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="field-label">Contact status
            <select value={query.contactStatus ?? ''} onChange={e => set({ contactStatus: e.target.value, page: undefined })} data-testid="select-filter-contact"><option value="">All contact statuses</option>{Object.values(ContactStatus).map(x => <option key={x}>{x}</option>)}</select></label>
        </div>
        <div className="filter-actions">
          <button type="submit" className="button primary" data-testid="button-apply-filters"><Search size={15} aria-hidden="true" /> Apply search</button>
          {anyFilter && <button type="button" className="button ghost" data-testid="button-clear-filters" onClick={() => set({ search: undefined, paper: undefined, department: undefined, category: undefined, reviewStatus: undefined, contactStatus: undefined, page: undefined })}>Clear filters</button>}
        </div>
      </form>

      {q.isError ? <ErrorState retry={() => q.refetch()} /> : q.isLoading ? <LoadingRows label="Loading records" /> : !data || data.records.length === 0 ? (
        <EmptyState title="No matching records" icon={<Search size={20} aria-hidden="true" />}>Broaden the search or clear a filter.</EmptyState>
      ) : (
        <div className="table-card" aria-busy={q.isFetching}>
          <div className="table-meta"><span><strong>{data.total.toLocaleString('en-NZ')}</strong> learner–paper records</span><span>Page {data.page} of {data.totalPages}</span></div>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Academic records table, scrollable">
            <table className="records-table">
              <thead>
                <tr>
                  <SortTh id="learnerId" label="Learner ID" sortBy={sortBy} dir={sortDirection} onSort={sortBtn} />
                  <SortTh id="category" label="Review category" sortBy={sortBy} dir={sortDirection} onSort={sortBtn} />
                  <SortTh id="paper" label="Paper" sortBy={sortBy} dir={sortDirection} onSort={sortBtn} />
                  <SortTh id="reason" label="Reason" sortBy={sortBy} dir={sortDirection} onSort={sortBtn} />
                  <SortTh id="reviewStatus" label="Review status" sortBy={sortBy} dir={sortDirection} onSort={sortBtn} />
                  <th scope="col">Contact status</th>
                  <th scope="col">View record</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map(r => (
                  <tr key={`${r.learnerId}-${r.courseCode}`} data-testid={`row-record-${r.learnerId}-${r.courseCode}`}>
                    <th scope="row" className="learner-id">{r.learnerId}</th>
                    <td><CategoryBadge category={r.category} /></td>
                    <td><span className="strong">{r.paperTitle}</span><small>{r.courseCode}</small></td>
                    <td className="reason-cell">{r.reason}</td>
                    <td><ReviewBadge status={r.reviewStatus} /></td>
                    <td><ContactBadge status={r.contactStatus} /></td>
                    <td>
                      <Link href={recordHref(r.learnerId, r.courseCode, url)} onClick={() => saveScroll(url)} className="view-link" aria-label={`View record for ${r.learnerId}, ${r.paperTitle} ${r.courseCode}`} data-testid={`link-view-${r.learnerId}-${r.courseCode}`}>
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

function SortTh({ id, label, sortBy, dir, onSort }: { id: string; label: string; sortBy: string; dir: string; onSort: (id: string) => void }) {
  const active = sortBy === id;
  return (
    <th scope="col" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-btn" onClick={() => onSort(id)} data-testid={`sort-${id}`}>
        {label}{active && (dir === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />)}
      </button>
    </th>
  );
}
