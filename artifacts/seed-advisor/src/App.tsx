import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionGate } from '@/components/session-gate';
import { Shell } from '@/components/shell';
import NotFound from '@/pages/not-found';
import OverviewPage from '@/pages/overview';
import RecordsPage from '@/pages/records';
import TrackerPage from '@/pages/tracker';
import { ConversationPage, InboxPage } from '@/pages/inbox';
import RecordPage from '@/pages/record';
import ReferencePage from '@/pages/reference';
import './index.css';
import './v2.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

function Routes() {
  const [path] = useLocation();
  return (
    <ErrorBoundary resetKey={path}>
      <Shell>
        <Switch>
          <Route path="/" component={OverviewPage} />
          <Route path="/records" component={RecordsPage} />
          <Route path="/records/:learnerId/:courseCode" component={RecordPage} />
          <Route path="/tracker" component={TrackerPage} />
          <Route path="/inbox" component={InboxPage} />
          <Route path="/inbox/:conversationId" component={ConversationPage} />
          <Route path="/reference" component={ReferencePage} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <SessionGate>
            <Routes />
          </SessionGate>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
