import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, BookOpen, CheckCircle2, FileText, Inbox, Sprout } from 'lucide-react';
import { getGetWorkspaceSummaryQueryKey, getHealthCheckQueryKey, useGetWorkspaceSummary, useHealthCheck } from '@workspace/api-client-react';
import { TestControls } from '@/components/test-controls';
import { useSession } from '@/components/session-gate';
import { checkpointLabel, POLL_MS, scenarioLabel } from '@/lib/format';

const NAV = [
  { href: '/', title: 'Overview', icon: Activity },
  { href: '/records', title: 'Academic Records', icon: FileText },
  { href: '/tracker', title: 'Review Tracker', icon: CheckCircle2 },
  { href: '/inbox', title: 'SEED Inbox', icon: Inbox },
  { href: '/reference', title: 'Reference Guide', icon: BookOpen },
];

function Logo() {
  return (
    <Link href="/" className="brand" aria-label="SEED overview">
      <span className="brand-mark"><Sprout size={19} strokeWidth={2.2} aria-hidden="true" /></span>
      <span>SEED<span className="brand-period">.</span><small>ADVISOR WORKSPACE</small></span>
    </Link>
  );
}

function crumbs(path: string): { label: string; href?: string }[] {
  if (path === '/') return [{ label: 'Overview' }];
  if (path.startsWith('/records/')) return [{ label: 'Academic Records', href: '/records' }, { label: 'Record' }];
  if (path === '/records') return [{ label: 'Academic Records' }];
  if (path === '/tracker') return [{ label: 'Review Tracker' }];
  if (path.startsWith('/inbox/')) return [{ label: 'SEED Inbox', href: '/inbox' }, { label: 'Conversation' }];
  if (path === '/inbox') return [{ label: 'SEED Inbox' }];
  if (path === '/reference') return [{ label: 'Reference Guide' }];
  return [{ label: 'Not found' }];
}

export function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const session = useSession();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60000 } });
  const summary = useGetWorkspaceSummary({ query: { queryKey: getGetWorkspaceSummaryQueryKey(), refetchInterval: POLL_MS } });
  const unread = summary.data?.unreadReplies ?? 0;
  const trail = crumbs(path);
  const d = session.scenarioDate;
  const activeHref = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <aside className="sidebar">
        <Logo />
        <div className="side-caption">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {NAV.map(({ href, title, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link ${activeHref(href) ? 'active' : ''}`} aria-current={activeHref(href) ? 'page' : undefined} data-testid={`nav-${title.toLowerCase().replaceAll(' ', '-')}`}>
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{title}</span>
              {href === '/inbox' && unread > 0 && <span className="nav-count" aria-label={`${unread} unread replies`}>{unread}</span>}
              {activeHref(href) && <span className="nav-indicator" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="connection" role="status">
            <span className={`connection-dot ${health.isError ? 'down' : ''}`} />
            {health.isLoading ? 'Connecting…' : health.isError ? 'Service unavailable' : 'Service connected'}
          </div>
        </div>
      </aside>
      <div className="main-frame">
        <header className="topbar">
          <div className="mobile-brand"><Logo /></div>
          <nav className="breadcrumb" aria-label="Breadcrumb" data-testid="breadcrumb">
            <ol>
              <li><Link href="/">SEED</Link></li>
              {trail.map((c, i) => (
                <li key={c.label} aria-current={i === trail.length - 1 ? 'page' : undefined}>
                  <span aria-hidden="true">/</span>
                  {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
                </li>
              ))}
            </ol>
          </nav>
          <div className="scenario-block">
            <strong data-testid="text-scenario-date">{scenarioLabel(d)}</strong>
            <span data-testid="text-checkpoint">{checkpointLabel(d)}</span>
          </div>
          <TestControls />
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>{children}</main>
        <footer className="app-footer"><span>SEED · Synthetic learner records</span><span>Session: {session.label}</span></footer>
      </div>
    </div>
  );
}
