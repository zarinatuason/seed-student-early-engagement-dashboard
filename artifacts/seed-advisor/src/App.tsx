import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, Router as WouterRouter, useLocation as useWouterLocation, useSearch, useParams } from 'wouter';
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, FileText, Filter, Leaf, Search, Send, Sprout, Users,
} from 'lucide-react';
import {
  AcademicCategory, ContactStatus, ListRecordsSortBy, ListTrackerFollowUp, ListRecordsSortDirection,
  ReviewOutcome, ReviewStatus, getHealthCheckQueryKey, getGetAdvisorSummaryQueryKey,
  getListRecordsQueryKey, getGetRecordQueryKey, getListTrackerQueryKey, getGetDemoDateQueryKey,
  getGetReferenceGuideQueryKey, useHealthCheck, useGetAdvisorSummary, useListRecords, useGetRecord,
  useSaveReview, useLogContact, useLogResponse, useListTracker, useGetDemoDate, useSetDemoDate,
  useGetReferenceGuide,
} from '@workspace/api-client-react';
import type { AcademicCategory as AcademicCategoryType, ContactStatus as ContactStatusType, ReviewStatus as ReviewStatusType, ReviewOutcome as ReviewOutcomeType, RecordSummary, ListRecordsParams, ListTrackerParams, ReviewInput } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();
const categoryOptions = Object.values(AcademicCategory) as AcademicCategoryType[];
const reviewOptions = Object.values(ReviewStatus) as ReviewStatusType[];
const contactOptions = Object.values(ContactStatus) as ContactStatusType[];
const outcomeOptions = Object.values(ReviewOutcome).filter(Boolean) as Exclude<ReviewOutcomeType, null>[];
const empty = '—';
const unavailable = 'Unavailable';
const dateLabel = (value?: string | null) => value ? new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Pacific/Auckland' }).format(new Date(value)) : empty;
const dateTimeLabel = (value?: string | null) => value ? new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland' }).format(new Date(value)) : empty;
const pct = (value?: number | null) => value == null ? unavailable : `${Number(value.toFixed(1))}%`;
const demoDayOption = (day: number) => `Day ${day} · ${dateLabel(new Date(Date.UTC(2026, 6, 20) + (day - 1) * 86_400_000).toISOString())}`;
function useLocation() {
  const [pathname, navigate] = useWouterLocation();
  const search = useSearch();
  return [`${pathname}${search ? `?${search}` : ''}`, navigate] as const;
}
function apiErrorMessage(error: unknown, fallback: string) {
  const value = error as { data?: unknown; response?: { data?: unknown } };
  for (const candidate of [value?.data, value?.response?.data]) {
    if (candidate && typeof candidate === 'object' && 'error' in candidate && typeof candidate.error === 'string') return candidate.error;
  }
  return fallback;
}
const categoryStyle = (value: string) => value === AcademicCategory.High_Priority ? 'urgent' : value === AcademicCategory.Review_Recommended ? 'review' : value === AcademicCategory.Insufficient_Evidence ? 'limited' : 'clear';
const reviewTone = (value: string) => value === ReviewStatus.Reviewed ? 'tone-green' : value === ReviewStatus.In_review ? 'tone-gold' : 'tone-neutral';

function Logo() {
  return <Link href="/" className="brand" aria-label="SEED overview">
    <span className="brand-mark"><Sprout size={19} strokeWidth={2.2} /></span>
    <span>SEED<span className="brand-period">.</span><small>ADVISOR WORKSPACE</small></span>
  </Link>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60000 } });
  const dateQuery = useGetDemoDate({ query: { queryKey: getGetDemoDateQueryKey() } });
  const dateMutation = useSetDemoDate();
  const [dateError, setDateError] = useState('');
  const currentPage = location.split('?')[0];
  const nav = [
    { href: '/', title: 'Overview', icon: Activity },
    { href: '/records', title: 'Academic Records', icon: FileText },
    { href: '/tracker', title: 'Review Tracker', icon: CheckCircle2 },
    { href: '/reference', title: 'Reference Guide', icon: BookOpen },
  ];
  return <div className="app-shell">
    <aside className="sidebar">
      <Logo />
      <div className="side-caption">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {nav.map(({ href, title, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${currentPage === href ? 'active' : ''}`} aria-label={title} title={title} aria-current={currentPage === href ? 'page' : undefined} data-testid={`nav-${title.toLowerCase().replaceAll(' ', '-')}`}>
          <Icon size={18} strokeWidth={1.8} /><span>{title}</span>{currentPage === href && <span className="nav-indicator" />}
        </Link>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="side-note"><div className="side-note-mark"><Leaf size={16} /></div><strong>Evidence first.</strong><p>Every category is a prompt to review, not a conclusion about a learner.</p><Link href="/reference">How to use SEED <ArrowRight size={14} /></Link></div>
        <div className="connection"><span className={`connection-dot ${health.isError ? 'down' : ''}`} />{health.isLoading ? 'Connecting…' : health.isError ? 'Service unavailable' : 'Workspace connected'}</div>
      </div>
    </aside>
    <div className="main-frame">
      <header className="topbar">
        <div className="mobile-brand"><Logo /></div>
        <div className="topbar-context"><span className="context-mark" /><span>SEED</span><span className="context-divider">/</span><span className="context-muted">{nav.find(n => n.href === currentPage)?.title || (currentPage.startsWith('/records/') ? 'Record review' : 'Workspace')}</span></div>
        <div className="date-control">
          <CalendarDays size={16} />
          <label htmlFor="demo-day">Demo review date</label>
          <select id="demo-day" value={dateQuery.data?.day ?? 29} disabled={dateQuery.isLoading || dateMutation.isPending} onChange={e => {
            setDateError('');
            dateMutation.mutate({ data: { day: Number(e.target.value) } }, {
              onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetDemoDateQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetAdvisorSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getListTrackerQueryKey() }); },
              onError: error => setDateError(apiErrorMessage(error, 'Could not update the demonstration date. Try again.')),
            });
          }} aria-label="Select demonstration day" data-testid="select-demo-day">
            {[29, 30, 31, 32, 33, 34, 35].map(day => <option key={day} value={day}>{demoDayOption(day)}</option>)}
          </select>
          {dateError && <span className="date-error" role="alert">{dateError}</span>}
        </div>
      </header>
      <main id="main-content" className="main-content">{children}</main>
      <footer className="app-footer"><span>SEED · Synthetic learner records</span><span>Evidence available through Day 28</span></footer>
    </div>
  </div>;
}

function ErrorState({ retry, message = 'We couldn’t load this information.' }: { retry: () => void; message?: string }) {
  return <div className="state-card error-state" role="alert"><span className="state-icon"><CircleHelp size={20} /></span><strong>{message}</strong><p>Check your connection, then try again.</p><button className="button secondary" onClick={retry}>Try again</button></div>;
}
function LoadingRows() { return <div className="loading-rows" aria-label="Loading records">{[1, 2, 3, 4].map(n => <div key={n} className="skeleton-row"><i /><i /><i /><i /></div>)}</div>; }
function PageIntro({ eyebrow, title, desc, action }: { eyebrow: string; title: string; desc: string; action?: ReactNode }) {
  return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{desc}</p></div>{action}</div>;
}
function StatusPill({ children, tone = 'tone-neutral' }: { children: ReactNode; tone?: string }) { return <span className={`status-pill ${tone}`}>{children}</span>; }
function CategoryPill({ category }: { category: AcademicCategoryType }) { return <span className={`category-pill ${categoryStyle(category)}`}><i />{category}</span>; }

function Overview() {
  const summary = useGetAdvisorSummary({ query: { queryKey: getGetAdvisorSummaryQueryKey() } });
  const date = useGetDemoDate({ query: { queryKey: getGetDemoDateQueryKey() } });
  if (summary.isLoading || date.isLoading) return <div className="page-enter"><PageIntro eyebrow="ADVISOR OVERVIEW" title="Overview" desc="Your learner–paper review workspace." /><LoadingRows /></div>;
  if (summary.isError || !summary.data) return <><PageIntro eyebrow="ADVISOR OVERVIEW" title="Overview" desc="Your learner–paper review workspace." /><ErrorState retry={() => { summary.refetch(); date.refetch(); }} /></>;
  const s = summary.data;
  const categories = [
    { label: AcademicCategory.High_Priority, count: s.academicCategories.highPriority, tone: 'urgent', note: 'Evidence suggests a timely review' },
    { label: AcademicCategory.Review_Recommended, count: s.academicCategories.reviewRecommended, tone: 'review', note: 'Worth exploring with context' },
    { label: AcademicCategory.Insufficient_Evidence, count: s.academicCategories.insufficientEvidence, tone: 'limited', note: 'More information may be needed' },
    { label: AcademicCategory.No_Current_Concern, count: s.academicCategories.noCurrentConcern, tone: 'clear', note: 'No current signal for concern' },
  ];
  return <div className="page-enter">
    <div className="welcome-band"><div className="welcome-copy"><div className="eyebrow light">ADVISOR OVERVIEW <span className="live-dot" /> LIVE WORKSPACE</div><h1>Overview</h1><p>A clear view of the evidence, and a thoughtful next step for every learner.</p><Link href="/records" className="button welcome-button">Browse all records <ArrowRight size={16} /></Link></div>
      <div className="welcome-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="plant-stem" /><i className="plant-leaf leaf-a" /><i className="plant-leaf leaf-b" /><i className="plant-leaf leaf-c" /><span className="art-caption">OBSERVE · UNDERSTAND · ACT</span></div>
      <div className="welcome-date"><span>SEMESTER TWO 2026 · WEEK {date.data?.week ?? s.demoDate.week}</span><strong>Day {date.data?.day ?? s.demoDate.day}</strong><small>Review date: {date.data?.dateLabel ?? s.demoDate.dateLabel}</small><small className="muted-light">Evidence through Day 28 · {date.data?.evidenceThrough ? dateLabel(date.data.evidenceThrough) : '16 Aug 2026'}</small></div>
    </div>
    <div className="summary-strip">
      <div><Link className="summary-metric-link" href="/records"><span className="metric-label">LEARNERS</span><strong>{s.learners.toLocaleString()}</strong><small>in this synthetic cohort</small></Link></div>
      <div><Link className="summary-metric-link" href="/records"><span className="metric-label">LEARNER–PAPER RECORDS</span><strong>{s.learnerPaperRecords.toLocaleString()}</strong><small>academic records to review</small></Link></div>
      <div className="metric-alert"><span className="metric-label">FOLLOW-UPS</span><div className="follow-up-links"><Link href="/tracker?followUp=due"><strong>{s.followUpsDueToday}</strong><small>due today</small></Link><Link href="/tracker?followUp=overdue"><strong>{s.followUpsOverdue}</strong><small>overdue</small></Link></div></div>
      <div className="metric-status"><span className="metric-label">REVIEW STATUS</span><div className="mini-progress"><span style={{ width: `${s.learnerPaperRecords ? (s.reviewStatuses.reviewed / s.learnerPaperRecords) * 100 : 0}%` }} /></div><div className="review-status-links"><Link href="/tracker?reviewStatus=Awaiting%20review">{s.reviewStatuses.awaitingReview} awaiting</Link><Link href="/tracker?reviewStatus=In%20review">{s.reviewStatuses.inReview} in review</Link><Link href="/tracker?reviewStatus=Reviewed">{s.reviewStatuses.reviewed} reviewed</Link></div></div>
    </div>
    <section className="section-block"><div className="section-heading"><div><div className="eyebrow">ACADEMIC CATEGORIES</div><h2>Where a closer look may help</h2></div><Link className="text-link" href="/records">View all records <ArrowRight size={15} /></Link></div>
      <div className="category-grid">{categories.map(c => <Link key={c.label} href={`/records?category=${encodeURIComponent(c.label)}`} className={`category-summary ${c.tone}`}><div className="category-count">{c.count}</div><div className="category-description"><strong>{c.label}</strong><span>{c.note}</span></div><ArrowRight className="category-arrow" size={17} /></Link>)}</div>
    </section>
    <section className="next-steps-panel"><div className="next-step-icon"><Clock3 size={21} /></div><div className="next-step-copy"><div className="eyebrow">A GOOD PLACE TO BEGIN</div><h2>Make follow-through visible.</h2><p>Record a dated next step as you review. Review Tracker keeps planned follow-ups in one clear view.</p></div><Link href="/tracker" className="button secondary">Open Review Tracker <ArrowRight size={15} /></Link></section>
    <div className="plain-note"><Leaf size={17} /><span><strong>A note on these records.</strong> SEED contains synthetic data for demonstration. Categories are indicators to review alongside context—not diagnoses or decisions.</span><Link href="/reference">Read the guide</Link></div>
  </div>;
}

function Records() {
  const [location, setLocation] = useLocation();
  const paramsFromUrl = new URLSearchParams(location.split('?')[1] || '');
  const [filters, setFilters] = useState<ListRecordsParams>(() => ({
    search: paramsFromUrl.get('search') || undefined, paper: paramsFromUrl.get('paper') || undefined,
    department: paramsFromUrl.get('department') || undefined,
    category: paramsFromUrl.get('category') as AcademicCategoryType || undefined,
    reviewStatus: paramsFromUrl.get('reviewStatus') as ReviewStatusType || undefined,
    sortBy: paramsFromUrl.get('sortBy') as ListRecordsParams['sortBy'] || ListRecordsSortBy.category,
    sortDirection: paramsFromUrl.get('sortDirection') as ListRecordsSortDirection || ListRecordsSortDirection.asc,
    page: Number(paramsFromUrl.get('page') || 1), pageSize: Number(paramsFromUrl.get('pageSize') || 10) as ListRecordsParams['pageSize'],
  }));
  const [term, setTerm] = useState(filters.search || '');
  const query = useListRecords(filters, { query: { queryKey: getListRecordsQueryKey(filters) } });
  const update = (next: ListRecordsParams) => {
    const merged = { ...filters, ...next };
    setFilters(merged);
    const search = new URLSearchParams();
    Object.entries(merged).forEach(([key, value]) => { if (value !== undefined && value !== '' && !(key === 'page' && value === 1) && !(key === 'pageSize' && value === 10)) search.set(key, String(value)); });
    setLocation(`/records${search.size ? `?${search.toString()}` : ''}`);
  };
  const setSearch = (event: FormEvent) => { event.preventDefault(); update({ search: term || undefined, page: 1 }); };
  const categoryCounts = [
    { value: AcademicCategory.High_Priority, label: 'High priority', count: query.data?.categoryCounts.highPriority, tone: 'urgent' },
    { value: AcademicCategory.Review_Recommended, label: 'Review recommended', count: query.data?.categoryCounts.reviewRecommended, tone: 'review' },
    { value: AcademicCategory.Insufficient_Evidence, label: 'Insufficient evidence', count: query.data?.categoryCounts.insufficientEvidence, tone: 'limited' },
    { value: AcademicCategory.No_Current_Concern, label: 'No current concern', count: query.data?.categoryCounts.noCurrentConcern, tone: 'clear' },
  ];
  return <div className="page-enter">
    <PageIntro eyebrow="ACADEMIC RECORDS" title="Academic Records" desc="Search learner–paper records, then open a record to review its context and decide what happens next." />
    <div className="counts-row"><div className="counts-label"><Filter size={15} /> CATEGORY COUNTS <span>{query.data?.countScope || 'Across all records'}</span></div>{categoryCounts.map(({ value, label, count, tone }) => <button key={value} className={`count-chip ${tone}`} onClick={() => update({ category: filters.category === value ? undefined : value, page: 1 })} aria-pressed={filters.category === value}>{label}<strong>{count ?? '—'}</strong></button>)}</div>
    <div className="filter-panel">
      <form className="search-form" onSubmit={setSearch}><Search size={17} /><input aria-label="Search records" data-testid="input-record-search" placeholder="Search learner ID, paper, department or reason" value={term} onChange={e => setTerm(e.target.value)} /><button type="submit" className="button primary">Search</button></form>
      <div className="filters-row">
        <label>Paper<input aria-label="Filter by paper" value={filters.paper || ''} onChange={e => update({ paper: e.target.value || undefined, page: 1 })} placeholder="Any paper" /></label>
        <label>Department<input aria-label="Filter by department" value={filters.department || ''} onChange={e => update({ department: e.target.value || undefined, page: 1 })} placeholder="Any department" /></label>
        <label>Category<select aria-label="Filter by category" value={filters.category || ''} onChange={e => update({ category: e.target.value as AcademicCategoryType || undefined, page: 1 })}><option value="">All categories</option>{categoryOptions.map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Review status<select aria-label="Filter by review status" value={filters.reviewStatus || ''} onChange={e => update({ reviewStatus: e.target.value as ReviewStatusType || undefined, page: 1 })}><option value="">All review statuses</option>{reviewOptions.map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Sort by<select aria-label="Sort records" value={filters.sortBy} onChange={e => update({ sortBy: e.target.value as ListRecordsParams['sortBy'], page: 1 })}><option value="category">Category</option><option value="learnerId">Learner ID</option><option value="paper">Paper</option><option value="reason">Reason</option><option value="reviewStatus">Review status</option></select></label>
        <button className="sort-direction" onClick={() => update({ sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc', page: 1 })} aria-label={`Sort ${filters.sortDirection === 'asc' ? 'descending' : 'ascending'}`}><ArrowDown size={15} className={filters.sortDirection === 'asc' ? 'sort-up' : ''} /> {filters.sortDirection}</button>
      </div>
      {(filters.search || filters.paper || filters.department || filters.category || filters.reviewStatus) && <button className="clear-link" onClick={() => { setTerm(''); update({ search: undefined, paper: undefined, department: undefined, category: undefined, reviewStatus: undefined, page: 1 }); }}>Clear filters</button>}
    </div>
    {query.isError ? <ErrorState retry={() => query.refetch()} /> : <RecordsTable records={query.data?.records || []} loading={query.isLoading} total={query.data?.total || 0} page={query.data?.page || 1} pageSize={filters.pageSize || 10} totalPages={query.data?.totalPages || 1} onPage={page => update({ page })} onPageSize={pageSize => update({ pageSize, page: 1 })} />}
  </div>;
}

function RecordsTable({ records, loading, total, page, pageSize = 10, totalPages, onPage, onPageSize }: { records: RecordSummary[]; loading: boolean; total: number; page: number; pageSize: ListRecordsParams['pageSize']; totalPages: number; onPage: (page: number) => void; onPageSize: (pageSize: ListRecordsParams['pageSize']) => void }) {
  const [location] = useLocation();
  const sorting = new URLSearchParams(location.split('?')[1] || '');
  const sortBy = sorting.get('sortBy') || 'category';
  const sortState = (field: string): 'ascending' | 'descending' | 'none' =>
    sortBy === field ? (sorting.get('sortDirection') === 'desc' ? 'descending' : 'ascending') : 'none';
  if (loading) return <div className="table-card"><LoadingRows /></div>;
  if (!records.length) return <div className="state-card empty-state"><span className="state-icon"><Search size={19} /></span><strong>No matching records</strong><p>Try broadening your search or clearing one of the filters.</p></div>;
  return <div className="table-card"><div className="table-meta"><span><strong>{total}</strong> learner–paper records</span><span>Page {page} of {totalPages}</span></div>
    <div className="table-scroll"><table><thead><tr><th aria-sort={sortState('learnerId')}>Learner ID</th><th aria-sort={sortState('category')}>Review category</th><th aria-sort={sortState('paper')}>Paper</th><th aria-sort={sortState('reason')}>Reason</th><th aria-sort={sortState('reviewStatus')}>Review status</th><th>View record</th></tr></thead><tbody>
      {records.map(r => <tr key={`${r.learnerId}-${r.courseCode}`} data-testid={`row-record-${r.learnerId}-${r.courseCode}`}><td><strong className="learner-id">{r.learnerId}</strong></td><td><CategoryPill category={r.category} /></td><td><span className="paper-name">{r.courseCode} · {r.paperTitle}</span><small>{r.department}</small></td><td className="reason-cell" title={r.reason}>{r.reason}</td><td><StatusPill tone={reviewTone(r.reviewStatus)}>{r.reviewStatus}</StatusPill></td><td><Link href={`/records/${encodeURIComponent(r.learnerId)}/${encodeURIComponent(r.courseCode)}`} onClick={() => sessionStorage.setItem('seed-record-return', location)} className="open-record" aria-label={`View record for ${r.learnerId}, ${r.courseCode}`}>View record <ArrowRight size={15} /></Link></td></tr>)}
    </tbody></table></div>
    <div className="table-pagination"><span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span><div className="pagination-controls"><label>Rows <select aria-label="Rows per page" value={pageSize} onChange={e => onPageSize(Number(e.target.value) as ListRecordsParams['pageSize'])}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><button className="page-button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ArrowLeft size={15} /></button><span className="page-number">{page}</span><button className="page-button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page"><ArrowRight size={15} /></button></div></div>
  </div>;
}

function Tracker() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split('?')[1] || '');
  const [filters, setFilters] = useState<ListTrackerParams>(() => ({ search: params.get('search') || undefined, reviewStatus: params.get('reviewStatus') as ReviewStatusType || undefined, contactStatus: params.get('contactStatus') as ContactStatusType || undefined, followUp: params.get('followUp') as ListTrackerParams['followUp'] || 'all', page: Number(params.get('page') || 1), pageSize: Number(params.get('pageSize') || 10) as ListTrackerParams['pageSize'] }));
  const [term, setTerm] = useState(filters.search || '');
  const query = useListTracker(filters, { query: { queryKey: getListTrackerQueryKey(filters) } });
  const update = (part: ListTrackerParams) => {
    const next = { ...filters, ...part }; setFilters(next);
    const p = new URLSearchParams(); Object.entries(next).forEach(([k, v]) => { if (v !== undefined && v !== '' && !(k === 'page' && v === 1) && !(k === 'pageSize' && v === 10) && !(k === 'followUp' && v === 'all')) p.set(k, String(v)); });
    setLocation(`/tracker${p.size ? `?${p}` : ''}`);
  };
  const presets: { label: string; status?: ReviewStatusType; follow?: ListTrackerParams['followUp'] }[] = [
    { label: 'All records' }, { label: 'Awaiting review', status: ReviewStatus.Awaiting_review }, { label: 'In review', status: ReviewStatus.In_review }, { label: 'Reviewed', status: ReviewStatus.Reviewed }, { label: 'Due or overdue', follow: 'open' },
  ];
  const activePreset = presets.find(p => p.status === filters.reviewStatus && (p.follow || 'all') === (filters.followUp || 'all'))?.label || (!filters.reviewStatus && !filters.followUp ? 'All records' : '');
  return <div className="page-enter"><PageIntro eyebrow="REVIEW TRACKER" title="Review Tracker" desc="A working list of saved reviews, contact attempts and dated follow-ups. Contact entries here are synthetic logs only." />
    <div className="preset-row" role="group" aria-label="Preset tracker views">{presets.map(p => <button key={p.label} className={`preset-button ${activePreset === p.label ? 'selected' : ''}`} onClick={() => update({ reviewStatus: p.status, followUp: p.follow || 'all', page: 1 })}>{p.label}{activePreset === p.label && <Check size={13} />}</button>)}</div>
    <div className="filter-panel tracker-filters"><form className="search-form" onSubmit={e => { e.preventDefault(); update({ search: term || undefined, page: 1 }); }}><Search size={17} /><input aria-label="Search tracker" placeholder="Search learner, paper or next action" value={term} onChange={e => setTerm(e.target.value)} /><button className="button primary">Search</button></form>
      <div className="filters-row"><label>Review status<select value={filters.reviewStatus || ''} onChange={e => update({ reviewStatus: e.target.value as ReviewStatusType || undefined, page: 1 })}><option value="">All statuses</option>{reviewOptions.map(o => <option key={o}>{o}</option>)}</select></label><label>Contact status<select value={filters.contactStatus || ''} onChange={e => update({ contactStatus: e.target.value as ContactStatusType || undefined, page: 1 })}><option value="">All contact statuses</option>{contactOptions.map(o => <option key={o}>{o}</option>)}</select></label><label>Follow-up date<select value={filters.followUp || 'all'} onChange={e => update({ followUp: e.target.value as ListTrackerParams['followUp'], page: 1 })}><option value="all">Any date</option><option value="due">Due today</option><option value="overdue">Overdue only</option><option value="open">Due or overdue</option></select></label></div>
    </div>
    {query.isError ? <ErrorState retry={() => query.refetch()} /> : <TrackerTable records={query.data?.records || []} loading={query.isLoading} total={query.data?.total || 0} page={query.data?.page || 1} pageSize={filters.pageSize || 10} totalPages={query.data?.totalPages || 1} onPage={page => update({ page })} onPageSize={pageSize => update({ pageSize, page: 1 })} />}
  </div>;
}

function TrackerTable({ records, loading, total, page, pageSize = 10, totalPages, onPage, onPageSize }: { records: RecordSummary[]; loading: boolean; total: number; page: number; pageSize: ListTrackerParams['pageSize']; totalPages: number; onPage: (page: number) => void; onPageSize: (pageSize: ListTrackerParams['pageSize']) => void }) {
  const [location] = useLocation();
  if (loading) return <div className="table-card"><LoadingRows /></div>;
  if (!records.length) return <div className="state-card empty-state"><span className="state-icon"><CheckCircle2 size={19} /></span><strong>Nothing in this view</strong><p>There are no saved follow-ups matching these filters.</p></div>;
  return <div className="table-card">
    <div className="table-meta"><span><strong>{total}</strong> records in this view</span><span>Page {page} of {totalPages}</span></div>
    <div className="table-scroll"><table><thead><tr><th>Learner ID</th><th>Paper</th><th>Academic category</th><th>Review status</th><th>Contact status</th><th>Next action</th><th>Follow-up date</th><th>Last updated</th><th>View record</th></tr></thead><tbody>
      {records.map(r => <tr key={`${r.learnerId}-${r.courseCode}`}>
        <td><strong className="learner-id">{r.learnerId}</strong></td>
        <td><span className="paper-name">{r.courseCode} · {r.paperTitle}</span><small>{r.department}</small></td>
        <td><CategoryPill category={r.category} /></td>
        <td><StatusPill tone={reviewTone(r.reviewStatus)}>{r.reviewStatus}</StatusPill></td>
        <td className="contact-status"><StatusPill tone={r.contactStatus === 'Response received' ? 'tone-green' : r.contactStatus === 'Awaiting response' ? 'tone-gold' : 'tone-neutral'}>{r.contactStatus}</StatusPill></td>
        <td className="next-action-cell">{r.nextAction || empty}</td>
        <td><span className={r.followUpDate ? 'follow-date' : 'table-muted'}>{dateLabel(r.followUpDate)}</span>{r.followUpCompleted && <small className="completed-label">Completed</small>}</td>
        <td className="table-muted">{dateLabel(r.lastUpdatedAt)}</td>
        <td><Link className="open-record" href={`/records/${encodeURIComponent(r.learnerId)}/${encodeURIComponent(r.courseCode)}`} onClick={() => sessionStorage.setItem('seed-record-return', location)} aria-label={`View record for ${r.learnerId}, ${r.courseCode}`}>View record <ArrowRight size={17} /></Link></td>
      </tr>)}
    </tbody></table></div>
    <div className="table-pagination"><span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span><div className="pagination-controls">
      <label>Rows <select aria-label="Rows per page" value={pageSize} onChange={e => onPageSize(Number(e.target.value) as ListTrackerParams['pageSize'])}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label>
      <button className="page-button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ArrowLeft size={15} /></button><span className="page-number">{page}</span><button className="page-button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page"><ArrowRight size={15} /></button>
    </div></div>
  </div>;
}

function Detail() {
  const params = useParams<{ learnerId: string; courseCode: string }>();
  const learnerId = decodeURIComponent(params.learnerId || '');
  const courseCode = decodeURIComponent(params.courseCode || '');
  const detail = useGetRecord(learnerId, courseCode, { query: { queryKey: getGetRecordQueryKey(learnerId, courseCode) } });
  const [backHref] = useState(() => sessionStorage.getItem('seed-record-return') || '/records');
  const backLabel = backHref.startsWith('/tracker') ? 'Back to Review Tracker' : 'Back to Academic Records';
  const [review, setReview] = useState<ReviewInput | null>(null);
  const [initial, setInitial] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formHasError, setFormHasError] = useState(false);
  const [contactMethod, setContactMethod] = useState('Email');
  const [contactNote, setContactNote] = useState('');
  const [responseNote, setResponseNote] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const queryClient = useQueryClient();
  const save = useSaveReview();
  const logContact = useLogContact();
  const logResponse = useLogResponse();
  const dayQuery = useGetDemoDate({ query: { queryKey: getGetDemoDateQueryKey() } });
  const dirty = (review ? JSON.stringify(review) !== initial : false) || Boolean(contactNote.trim() || responseNote.trim());
  useEffect(() => {
    const d = detail.data;
    if (!d || dirty) return;
    const actionDate = (dayQuery.data?.date || d.review.lastEffectiveDate || '').slice(0, 10);
    const input: ReviewInput = { reviewStatus: d.review.reviewStatus, advisorNotes: d.review.advisorNotes || '', outcome: d.review.outcome, nextAction: d.review.nextAction, followUpDate: d.review.followUpDate?.slice(0, 10) || null, followUpCompleted: d.review.followUpCompleted, contactStatus: d.review.contactStatus, effectiveDate: actionDate };
    setReview(input); setInitial(JSON.stringify(input));
    setEffectiveDate(actionDate);
  }, [detail.data, dayQuery.data?.date]);
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetRecordQueryKey(learnerId, courseCode) });
    queryClient.invalidateQueries({ queryKey: getListRecordsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTrackerQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdvisorSummaryQueryKey() });
  };
  const effective = effectiveDate || dayQuery.data?.date?.slice(0, 10) || '';
  const effectiveDateMin = '2026-08-17';
  const effectiveDateMax = dayQuery.data?.date?.slice(0, 10) || effectiveDateMin;
  useEffect(() => {
    if (!dirty) return;
    const confirmNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      if (!window.confirm('You have unsaved review or log changes. Leave this record without saving them?')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const recordUrl = window.location.href;
    const confirmHistoryNavigation = (event: PopStateEvent) => {
      if (!window.confirm('You have unsaved review or log changes. Leave this record without saving them?')) {
        event.stopImmediatePropagation();
        window.history.pushState(null, '', recordUrl);
      }
    };
    document.addEventListener('click', confirmNavigation, true);
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', confirmHistoryNavigation, true);
    return () => {
      document.removeEventListener('click', confirmNavigation, true);
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', confirmHistoryNavigation, true);
    };
  }, [dirty]);
  const submitReview = (e: FormEvent) => {
    e.preventDefault(); if (!review) return;
    const payload = { ...review, effectiveDate: review.effectiveDate || effective };
    setFormMessage(''); setFormHasError(false);
    save.mutate({ learnerId, courseCode, data: payload }, { onSuccess: () => { setReview(payload); setInitial(JSON.stringify(payload)); setFormMessage('Review saved.'); setFormHasError(false); invalidate(); }, onError: error => { setFormMessage(apiErrorMessage(error, 'Review could not be saved. Your changes are still here—try again.')); setFormHasError(true); } });
  };
  const syncLoggedContactStatus = (status: ContactStatusType) => {
    setReview(current => current ? { ...current, contactStatus: status } : current);
    setInitial(current => current ? JSON.stringify({ ...JSON.parse(current), contactStatus: status }) : current);
  };
  const submitContact = (e: FormEvent) => {
    e.preventDefault();
    setFormMessage(''); setFormHasError(false);
    logContact.mutate({ learnerId, courseCode, data: { method: contactMethod, effectiveDate: effective, note: contactNote } }, { onSuccess: result => { syncLoggedContactStatus(result.review.contactStatus); setContactNote(''); setFormMessage('Synthetic contact attempt recorded.'); setFormHasError(false); invalidate(); }, onError: error => { setFormMessage(apiErrorMessage(error, 'Contact log could not be saved. Try again.')); setFormHasError(true); } });
  };
  const submitResponse = (e: FormEvent) => {
    e.preventDefault();
    setFormMessage(''); setFormHasError(false);
    logResponse.mutate({ learnerId, courseCode, data: { effectiveDate: effective, note: responseNote } }, { onSuccess: result => { syncLoggedContactStatus(result.review.contactStatus); setResponseNote(''); setFormMessage('Synthetic response recorded.'); setFormHasError(false); invalidate(); }, onError: error => { setFormMessage(apiErrorMessage(error, 'Response could not be saved. Try again.')); setFormHasError(true); } });
  };
  if (detail.isLoading) return <><Link href={backHref} className="back-link"><ArrowLeft size={15} /> {backLabel}</Link><LoadingRows /></>;
  if (detail.isError || !detail.data) return <><Link href={backHref} className="back-link"><ArrowLeft size={15} /> {backLabel}</Link><ErrorState message="This learner–paper record could not be loaded." retry={() => detail.refetch()} /></>;
  const d = detail.data;
  const setReviewField = <K extends keyof ReviewInput>(key: K, value: ReviewInput[K]) => setReview(current => current ? { ...current, [key]: value } : current);
  return <div className="page-enter detail-page">
    <Link href={backHref} className="back-link" data-testid="link-back-records"><ArrowLeft size={15} /> {backLabel}</Link>
    <div className="detail-heading"><div><div className="eyebrow">LEARNER–PAPER RECORD <span className="detail-divider">/</span> {d.courseCode}</div><h1>{d.learnerId}</h1><p>{d.paperTitle}</p><div className="detail-badges"><CategoryPill category={d.category} /><StatusPill tone={reviewTone(d.review.reviewStatus)}>{d.review.reviewStatus}</StatusPill></div></div><div className="detail-context"><span>FACULTY / SCHOOL</span><strong>{d.facultySchool}</strong><span>DEPARTMENT</span><strong>{d.department}</strong><span>PAPER CONTEXT</span><strong>Level {d.courseLevel} · {d.paperStructureType} · {d.offeringPeriod}</strong><span>REGISTRATION</span><strong>Day {d.registrationDay} · {d.opportunityDays} days of opportunity</strong></div></div>
    <div className="evidence-banner"><span className="banner-icon"><BookOpen size={19} /></span><span><strong>Evidence available through Day 28</strong><small>Later activity is not included in the evidence summary. Academic category is read-only; use your review to record interpretation and action.</small></span><span className="evidence-asof">EVIDENCE CUTOFF<br /><b>DAY 28</b></span></div>
    <div className="detail-columns">
      <div className="evidence-column">
        <section className="panel reason-panel"><div className="eyebrow">SUPPLIED ADVISOR REASON</div><p>{d.reason || unavailable}</p><small>The academic category and reason are supplied indicators. Advisor review does not edit either field.</small></section>
        <section className="panel"><div className="panel-heading"><div><div className="eyebrow">LEARNING ACTIVITY</div><h2>Engagement evidence</h2></div><StatusPill tone={d.learning.concern ? 'tone-gold' : 'tone-neutral'}>{d.learning.concern ? 'Concern flag present' : 'No concern flag'}</StatusPill></div><div className="metric-cards"><div><span>Engagement coverage</span><strong>{pct(d.learning.engagementCoverage)}</strong></div><div><span>Active learning days</span><strong>{d.learning.activeLearningDays ?? unavailable}</strong></div><div><span>Last activity</span><strong>{d.learning.latestActivityDay == null ? unavailable : `Day ${d.learning.latestActivityDay}`}</strong></div></div><div className="evidence-line"><span>Interacted resources</span><strong>{d.learning.interactedResources} of {d.learning.eligibleResources}</strong></div><div className="evidence-line"><span>Days since activity</span><strong>{d.learning.daysSinceLastActivity ?? unavailable}</strong></div><p className="evidence-empty">Recorded resource interactions do not prove reading, completion or understanding. The list below contains interacted resources only.</p>{d.learning.resources.length > 0 ? <div className="mini-list">{d.learning.resources.map((resource, i) => <div className="mini-list-row" key={`${resource.resourceTitle}-${i}`}><span><b>{resource.resourceTitle}</b><small>{resource.activityType} · available Day {resource.availableFromDay}</small></span><span className="resource-count">{resource.interactionCount} interactions<small>Last: Day {resource.latestInteractionDay}</small></span></div>)}</div> : <p className="evidence-empty">No learning-resource interaction is recorded by Day 28.</p>}</section>
        <section className="panel"><div className="panel-heading"><div><div className="eyebrow">ASSESSMENT PARTICIPATION</div><h2>Checkpoint evidence</h2></div><StatusPill tone={d.assessmentParticipation.concern ? 'tone-gold' : 'tone-neutral'}>{d.assessmentParticipation.concern ? 'Concern flag present' : 'No concern flag'}</StatusPill></div>
          <div className="metric-cards"><div><span>Due by Day 28</span><strong>{d.assessmentParticipation.dueCount}</strong></div><div><span>Submitted by Day 28</span><strong>{d.assessmentParticipation.submittedCount}</strong></div><div><span>Missed by Day 28</span><strong>{d.assessmentParticipation.missedCount}</strong></div></div>
          <p className="evidence-empty">These supplied counts use nominal due dates and include prior-credit submission records. Supplied released-score totals and averages also include prior-credit results. Prior credit is not a current-offering submission. Individual rows show learner-specific due dates and registered opportunity; source definitions should be confirmed before interpreting late-registration counts as current participation.</p>
          <div className="evidence-line"><span>Submission completion</span><strong>{pct(d.assessmentParticipation.submissionCompletionRate)}</strong></div>
          <div className="evidence-line"><span>Weighted submission coverage</span><strong>{pct(d.assessmentParticipation.weightedSubmissionCoverage)}</strong></div>
          <div className="evidence-line"><span>Missed assessment weight</span><strong>{d.assessmentParticipation.missedAssessmentWeight}%</strong></div>
          <div className="evidence-line"><span>Results released by Day 28</span><strong>{d.assessmentParticipation.releasedResultCount} · {d.assessmentParticipation.releasedAssessmentWeight}% of paper weight</strong></div>
          <div className="evidence-line"><span>Weighted average of available scores</span><strong>{d.assessmentParticipation.weightedAverageAvailableScore == null ? unavailable : `${Number(d.assessmentParticipation.weightedAverageAvailableScore.toFixed(1))}%`}</strong></div>
          {d.assessmentParticipation.assessments.length > 0 ? <div className="assessment-list"><div className="assessment-head"><span>ASSESSMENT</span><span>DUE</span><span>SUBMISSION</span><span>WEIGHT</span><span>SCORE</span></div>
            {d.assessmentParticipation.assessments.map(a => <div className="assessment-row" key={a.assessmentId}>
              <span><b>{a.assessmentName}</b><small>{a.category} · {a.availabilityStatus} · {a.learnerOpportunityDays} opportunity days{a.priorCredit ? ' · prior credit, not a current submission' : ''}</small></span>
              <span>{a.applicableDueDate ? dateLabel(a.applicableDueDate) : unavailable}<small>{a.dueState}{a.dueDay == null ? '' : ` · Day ${a.dueDay}`}</small></span>
              <span><StatusPill tone={a.submissionStatus === 'Submitted' ? 'tone-green' : 'tone-neutral'}>{a.submissionStatus}</StatusPill><small>{a.submissionDate ? `${a.priorCredit ? 'Prior-credit record' : 'Submitted'} ${dateLabel(a.submissionDate)}` : unavailable}</small></span>
              <span>{a.weightPercent}%</span>
              <span>{a.resultAvailable && a.result != null ? `${a.result}%` : unavailable}{a.priorCredit && a.resultAvailable && <small>Prior-credit result</small>}</span>
            </div>)}
          </div> : <p className="evidence-empty">No assessment definitions are supplied for this paper offering.</p>}
        </section>
        <section className="panel"><div className="panel-heading"><div><div className="eyebrow">EARLY PERFORMANCE</div><h2>Available result evidence</h2></div><StatusPill tone={d.earlyPerformanceConcern ? 'tone-gold' : 'tone-neutral'}>{d.earlyPerformanceConcern ? 'Concern flag present' : 'No concern flag'}</StatusPill></div><div className="evidence-line"><span>Weighted average of available scores</span><strong>{pct(d.assessmentParticipation.weightedAverageAvailableScore)}</strong></div><div className="evidence-line"><span>Released results by Day 28</span><strong>{d.assessmentParticipation.releasedResultCount}</strong></div><p className="evidence-empty">The flag and average are supplied values, including available prior-credit results. Missing scores are unavailable, not zero. No new threshold or prediction is applied.</p></section>
        <section className="panel"><div className="panel-heading"><div><div className="eyebrow">LEARNER CONTEXT</div><h2>Background to consider</h2></div></div><div className="context-grid"><div><span>Prior education</span><strong>{d.learnerContext.priorEducationLevel || unavailable}</strong></div><div><span>Previous attempts</span><strong>{d.learnerContext.previousAttemptCount ?? unavailable}</strong></div><div><span>Credit load</span><strong>{d.learnerContext.creditLoad ?? unavailable}</strong></div></div>{d.concernDomains.length > 0 && <div className="domain-row"><span>Evidence domains</span>{d.concernDomains.map(domain => <span className="domain-tag" key={domain}>{domain}</span>)}</div>}</section>
      </div>
      <div className="action-column">
        <form className="panel review-panel" onSubmit={submitReview}><div className="panel-heading"><div><div className="eyebrow">ADVISOR REVIEW</div><h2>Record your next step</h2></div><span className={`save-indicator ${dirty ? 'unsaved' : ''}`}>{save.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}</span></div>
          {!review ? <div className="field-skeleton" /> : <>
            <label className="field-label">Review status<select value={review.reviewStatus} onChange={e => setReviewField('reviewStatus', e.target.value as ReviewStatusType)}>{reviewOptions.map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="field-label">Review outcome<select value={review.outcome || ''} onChange={e => setReviewField('outcome', e.target.value as ReviewOutcomeType || null)}><option value="">Select an outcome</option>{outcomeOptions.map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="field-label">Advisor notes<textarea value={review.advisorNotes} onChange={e => setReviewField('advisorNotes', e.target.value)} maxLength={4000} rows={4} placeholder="What does the evidence suggest? What context should be considered?" /></label>
            <label className="field-label">Next action<textarea value={review.nextAction || ''} onChange={e => setReviewField('nextAction', e.target.value || null)} maxLength={500} rows={2} placeholder="A clear, plain-language next step" /></label>
            <div className="field-pair"><label className="field-label">Follow-up date<input type="date" value={review.followUpDate || ''} onChange={e => setReviewField('followUpDate', e.target.value || null)} /></label><label className="field-label">Contact status<select value={review.contactStatus} onChange={e => setReviewField('contactStatus', e.target.value as ContactStatusType)}>{contactOptions.map(x => <option key={x}>{x}</option>)}</select></label></div>
          <label className="field-label">Effective date<input type="date" min={effectiveDateMin} max={effectiveDateMax} value={review.effectiveDate || effective} onChange={e => setReviewField('effectiveDate', e.target.value)} required /></label>
            <label className="check-label"><input type="checkbox" checked={review.followUpCompleted} onChange={e => setReviewField('followUpCompleted', e.target.checked)} /> <span>Follow-up completed</span></label>
            <button className="button primary wide" type="submit" disabled={!dirty || save.isPending}><Check size={16} /> {save.isPending ? 'Saving review…' : 'Save review'}</button>
          </>}
          {formMessage && <p className={`form-message ${formHasError ? 'message-error' : 'message-success'}`} role={formHasError ? 'alert' : 'status'}>{formMessage}</p>}
          <p className="form-footnote">Saving records a dated review in the history below. It does not change the academic category.</p>
        </form>
        <form className="panel log-panel" onSubmit={submitContact}><div className="panel-heading"><div><div className="eyebrow">SYNTHETIC LOG</div><h2>Record contact attempt</h2></div><Send size={17} /></div><p>Log only—SEED will not send a message to the learner.</p><label className="field-label">Method<input value={contactMethod} onChange={e => setContactMethod(e.target.value)} maxLength={80} required /></label><label className="field-label">Dated<input type="date" min={effectiveDateMin} max={effectiveDateMax} value={effective} onChange={e => setEffectiveDate(e.target.value)} required /></label><label className="field-label">Note<textarea value={contactNote} onChange={e => setContactNote(e.target.value)} rows={2} maxLength={2000} placeholder="Briefly describe the attempt" /></label><button className="button secondary wide" disabled={logContact.isPending || !contactNote.trim()}>{logContact.isPending ? 'Recording…' : 'Record contact attempt'}</button></form>
        <form className="panel log-panel" onSubmit={submitResponse}><div className="panel-heading"><div><div className="eyebrow">SYNTHETIC LOG</div><h2>Record a response</h2></div><Send size={17} /></div><p>Keep a dated note of a response received.</p><label className="field-label">Dated<input type="date" min={effectiveDateMin} max={effectiveDateMax} value={effective} onChange={e => setEffectiveDate(e.target.value)} required /></label><label className="field-label">Note<textarea value={responseNote} onChange={e => setResponseNote(e.target.value)} rows={2} maxLength={2000} placeholder="Briefly summarize the response" /></label><button className="button secondary wide" disabled={logResponse.isPending || !responseNote.trim()}>{logResponse.isPending ? 'Recording…' : 'Record response'}</button></form>
      </div>
    </div>
    <section className="panel history-panel"><div className="panel-heading"><div><div className="eyebrow">RECORD HISTORY</div><h2>Dated actions</h2></div></div>{d.history.length ? <div className="history-list">{d.history.map(item => <div className="history-item" key={item.id}><span className="history-point" /><div className="history-body"><div className="history-title"><strong>{item.summary}</strong><span>{dateLabel(item.effectiveDate)}</span></div><p>{item.actionType}{item.method ? ` · ${item.method}` : ''}{item.note ? ` — ${item.note}` : ''}</p><small>Saved {dateTimeLabel(item.savedAt)} (Pacific/Auckland)</small></div></div>)}</div> : <div className="history-empty">No dated actions have been recorded for this learner–paper record.</div>}</section>
  </div>;
}

function Reference() {
  const query = useGetReferenceGuide({ query: { queryKey: getGetReferenceGuideQueryKey() } });
  if (query.isLoading) return <div><PageIntro eyebrow="REFERENCE GUIDE" title="A shared way to read the evidence." desc="Definitions, indicators and a plain-language workflow." /><LoadingRows /></div>;
  if (query.isError || !query.data) return <><PageIntro eyebrow="REFERENCE GUIDE" title="A shared way to read the evidence." desc="Definitions, indicators and a plain-language workflow." /><ErrorState retry={() => query.refetch()} /></>;
  const guide = query.data;
  const workflow = [
    ['01', 'Review the evidence', 'Read the academic category alongside its reason, learning activity and individual assessment checkpoints. Evidence is frozen through Day 28.'],
    ['02', 'Consider learner context', 'Use the available background to support a fair interpretation. Evidence indicators do not establish a cause or diagnose a learner.'],
    ['03', 'Record a plain-language review', 'Save your status, outcome, notes and next action with an effective date. The academic category itself is not editable.'],
    ['04', 'Track follow-through', 'Add dated synthetic contact or response logs as needed, then use the tracker to keep follow-up dates visible. No message is sent externally.'],
  ];
  return <div className="page-enter"><PageIntro eyebrow="REFERENCE GUIDE" title="A shared way to read the evidence." desc="Definitions, indicators and a plain-language workflow for reviewing synthetic learner–paper records." />
    <div className="guide-banner"><span className="guide-icon"><BookOpen size={19} /></span><span><strong>Start with context, not a label.</strong><small>Categories are prompts for an advisor to review. They are not diagnoses, predictions or automated decisions.</small></span></div>
    <section className="guide-section"><div className="section-heading"><div><div className="eyebrow">ACADEMIC CATEGORIES</div><h2>What each category means</h2></div><span className="guide-count-note">{guide.categories.reduce((sum, item) => sum + item.count, 0)} records</span></div><div className="guide-categories">{guide.categories.map(item => <article className={`guide-category ${categoryStyle(item.category)}`} key={item.category}><div className="guide-category-top"><CategoryPill category={item.category} /><strong>{item.count}</strong></div><p>{item.explanation}</p></article>)}</div></section>
    <section className="guide-section"><div className="section-heading"><div><div className="eyebrow">INDICATORS</div><h2>Evidence in plain language</h2></div></div><div className="indicator-list">{Object.entries(guide.indicators).map(([name, explanation]) => <div key={name}><strong>{name.replaceAll(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</strong><p>{explanation}</p></div>)}</div></section>
    <section className="guide-section calendar-guide"><div className="section-heading"><div><div className="eyebrow">DEMONSTRATION CALENDAR</div><h2>Keep the evidence date separate from the review date.</h2></div></div><div className="calendar-guide-grid"><article><strong>Day 1 · 20 July 2026</strong><p>The Semester Two 2026 demo mapping begins on this date. Day 28 is 16 August; the review opens at Day 29 on 17 August and can advance through Day 35 on 23 August (Week 5).</p></article><article><strong>Academic offering labels stay unchanged</strong><p>The supplied academic records are labelled Semester 1. The Semester Two 2026 dates are a demonstration calendar only and do not rewrite offering IDs or academic snapshot values.</p></article></div><div className="boundary-note"><strong>Evidence and storage boundaries</strong><p>Academic indicators, categories and reasons remain frozen at Day 28. A score appears only when its submission and score-release dates are both on or before Day 28. Prior credit is shown separately and never counts as a current submission. Blank values are shown as unavailable; a numeric zero remains zero. Protected fairness-audit fields and later-outcome validation files are excluded from the advisor API and workspace. Advisor reviews, dated actions and the selected demo day are stored separately from the academic CSV snapshot.</p></div></section>
    <section className="guide-section workflow-section"><div className="section-heading"><div><div className="eyebrow">WORKFLOW</div><h2>From evidence to follow-through</h2></div></div><div className="workflow-list">{workflow.map(([number, title, copy]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div></section>
    <section className="data-note"><div><div className="eyebrow">ABOUT THIS DATASET</div><h2>{guide.syntheticData ? 'All records are synthetic.' : 'Dataset information'}</h2><p>Evidence cutoff: {guide.evidenceCutoff}. The demonstration date can move between Day 29 and Day 35; evidence remains fixed through Day 28.</p></div><ul>{guide.datasetChecks.map((check, i) => <li key={`${i}-${check}`}><Check size={15} />{check}</li>)}</ul></section>
    <div className="guide-end"><Link href="/records" className="button primary">Browse academic records <ArrowRight size={16} /></Link><span>Keep interpretations human, specific and dated.</span></div>
  </div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch>
    <Route path="/" component={Overview} />
    <Route path="/records" component={Records} />
    <Route path="/tracker" component={Tracker} />
    <Route path="/reference" component={Reference} />
    <Route path="/records/:learnerId/:courseCode" component={Detail} />
    <Route component={NotFound} />
  </Switch></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;