import { Check } from 'lucide-react';
import { getGetReferenceGuideQueryKey, useGetReferenceGuide } from '@workspace/api-client-react';
import { CategoryBadge } from '@/components/badges';
import { ErrorState, LoadingRows, PageHeader } from '@/components/ui-bits';
import { usePageMeta } from '@/lib/page';

const TITLE = 'A shared way to read the evidence.';

export default function ReferencePage() {
  usePageMeta('Reference Guide', 'Definitions of review categories, evidence indicators, the scenario calendar and the Week 4 academic checkpoint.');
  const q = useGetReferenceGuide({ query: { queryKey: getGetReferenceGuideQueryKey() } });
  const head = <PageHeader title={TITLE}>Reference Guide: categories, indicators, statuses and the scenario calendar.</PageHeader>;
  if (q.isLoading) return <div>{head}<LoadingRows label="Loading guide" /></div>;
  if (q.isError || !q.data) return <>{head}<ErrorState retry={() => q.refetch()} /></>;
  const g = q.data;
  return (
    <div className="page-enter guide">
      {head}
      <section className="panel" aria-labelledby="g-cat">
        <h2 id="g-cat">What each review category means</h2>
        <p className="note">Categories prompt a human review. They are not diagnoses, predictions or decisions.</p>
        <div className="guide-grid">
          {g.categories.map(c => <article key={c.category} className="guide-card"><div className="paper-top"><CategoryBadge category={c.category} /><strong>{c.count} records</strong></div><p>{c.explanation}</p></article>)}
        </div>
      </section>
      <section className="panel" aria-labelledby="g-ind">
        <h2 id="g-ind">Evidence in plain language</h2>
        <dl className="indicator-list">{Object.entries(g.indicators).map(([name, text]) => <div key={name}><dt>{name.replaceAll(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</dt><dd>{text}</dd></div>)}</dl>
      </section>
      <section className="panel" aria-labelledby="g-status">
        <h2 id="g-status">Separate status fields</h2>
        <ul className="essentials">
          <li><strong>Review status:</strong> Awaiting review, In review, Reviewed. Opening a record never changes it; a reviewed record can be reopened.</li>
          <li><strong>Contact status:</strong> Not contacted, Awaiting response (after a saved simulated send), Response received (after a reply is saved), No response recorded (only by an explicit dated advisor decision).</li>
          <li><strong>Support progress:</strong> Planned, In progress, Completed, Cancelled. A completed referral does not change the academic category or other follow-ups.</li>
          <li><strong>Unread state</strong> belongs to learner replies and is separate from review and contact status.</li>
        </ul>
      </section>
      <section className="panel" aria-labelledby="g-cal">
        <h2 id="g-cal">Scenario calendar and the academic checkpoint</h2>
        <ul className="essentials">
          <li>Semester Two 2026: Day 1 is 20 July 2026. Day 28 is 16 August 2026, the end of Week 4. Day 29 is Monday 17 August 2026, Week 5. The scenario starts on Day 29.</li>
          <li>The supplied academic evidence covers the end of Day 28 (Week 4 academic checkpoint). Resource activity and submissions cover Days 1–28.</li>
          <li>Moving the scenario date updates due and overdue follow-ups. It does not refresh academic evidence or change any academic count.</li>
          <li>The intended operational system would refresh academic information as new data becomes available. This prototype does not.</li>
          <li>Dates shown in lists are scenario dates. Real system timestamps (Pacific/Auckland) are kept only as audit metadata.</li>
          <li>Email delivery is simulated for this prototype. No external email is sent.</li>
        </ul>
      </section>
      <section className="panel" aria-labelledby="g-data">
        <h2 id="g-data">About this dataset</h2>
        <p className="note">{g.syntheticData ? 'All records are synthetic. ' : ''}Evidence cutoff: {g.evidenceCutoff}. Fairness-audit fields and later validation outcomes are excluded.</p>
        <ul className="check-list">{g.datasetChecks.map((c, i) => <li key={i}><Check size={15} aria-hidden="true" />{c}</li>)}</ul>
      </section>
    </div>
  );
}
