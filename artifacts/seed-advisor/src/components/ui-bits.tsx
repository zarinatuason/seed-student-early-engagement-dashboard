import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, ArrowRight, CircleHelp, Info, Inbox } from 'lucide-react';

export function PageHeader({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {children && <p className="page-lede">{children}</p>}
      </div>
      {action}
    </div>
  );
}

export function BackLink({ href, label, testId = 'link-back' }: { href: string; label: string; testId?: string }) {
  return (
    <Link href={href} className="back-link" data-testid={testId}>
      <ArrowLeft size={16} aria-hidden="true" /> {label}
    </Link>
  );
}

export function ErrorState({ retry, message = 'We could not load this information.' }: { retry: () => void; message?: string }) {
  return (
    <div className="state-card error-state" role="alert">
      <span className="state-icon">
        <CircleHelp size={20} aria-hidden="true" />
      </span>
      <strong>{message}</strong>
      <p>Check your connection, then try again. Nothing you have typed has been lost.</p>
      <button type="button" className="button secondary" onClick={retry} data-testid="button-retry">
        Try again
      </button>
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="state-card empty-state">
      <span className="state-icon">{icon ?? <Inbox size={20} aria-hidden="true" />}</span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function LoadingRows({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading-rows" role="status" aria-label={label}>
      {[1, 2, 3, 4].map(n => (
        <div key={n} className="skeleton-row">
          <i />
          <i />
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}

export function SimNotice() {
  return (
    <p className="sim-notice" data-testid="text-sim-notice">
      <Info size={15} aria-hidden="true" /> Email delivery is simulated for this prototype.
    </p>
  );
}

export function Feedback({ kind, children }: { kind: 'success' | 'error'; children: ReactNode }) {
  return (
    <p className={`form-message ${kind === 'error' ? 'message-error' : 'message-success'}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

export function Pagination({
  page, totalPages, pageSize, total, onPage, onPageSize,
}: { page: number; totalPages: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize: (n: number) => void }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  return (
    <div className="table-pagination">
      <span>
        Showing {from}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="pagination-controls">
        <label>
          Rows per page{' '}
          <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))} data-testid="select-page-size">
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>
        <button type="button" className="page-button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" data-testid="button-prev-page">
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <span className="page-number">
          Page {page} of {totalPages}
        </span>
        <button type="button" className="page-button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page" data-testid="button-next-page">
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
