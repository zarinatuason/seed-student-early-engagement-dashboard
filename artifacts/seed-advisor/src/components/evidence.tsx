import type { RecordDetail } from '@workspace/api-client-react';
import { dayLabel, num, pct, UNAVAILABLE } from '@/lib/format';

function Flag({ on }: { on: boolean }) {
  return <span className={`badge ${on ? 'b-amber' : 'b-grey'}`}>{on ? 'Concern flag present' : 'No concern flag'}</span>;
}

export function Figures({ d }: { d: RecordDetail }) {
  const a = d.assessmentParticipation;
  const items = [
    { label: 'Engagement coverage', value: pct(d.learning.engagementCoverage), flag: d.learning.concern },
    { label: 'Active learning days', value: num(d.learning.activeLearningDays), flag: d.learning.concern },
    { label: 'Submitted of due (supplied)', value: `${a.submittedCount} of ${a.dueCount}`, flag: a.concern },
    { label: 'Missed by Day 28 (supplied)', value: String(a.missedCount), flag: a.concern },
    { label: 'Weighted average, released scores', value: pct(a.weightedAverageAvailableScore), flag: d.earlyPerformanceConcern },
  ];
  return (
    <div className="figure-grid">
      {items.map(i => (
        <div key={i.label} className="figure">
          <span>{i.label}</span>
          <strong>{i.value}</strong>
          {i.flag && <em>Related to a concern</em>}
        </div>
      ))}
    </div>
  );
}

export function EvidenceSection({ d }: { d: RecordDetail }) {
  const a = d.assessmentParticipation;
  const l = d.learning;
  const dueRows = a.assessments.filter(x => x.dueState === 'Due by Day 28');
  const rowSubmitted = dueRows.filter(x => x.submissionStatus === 'Submitted').length;
  const rowMissed = dueRows.filter(x => x.submissionStatus === 'Not submitted by Day 28').length;
  const rowReleased = a.assessments.filter(x => x.resultAvailable).length;
  const mismatches: string[] = [];
  if (a.assessments.length) {
    if (dueRows.length !== a.dueCount) mismatches.push(`due by Day 28: ${dueRows.length} in the detailed rows, ${a.dueCount} supplied`);
    if (rowSubmitted !== a.submittedCount) mismatches.push(`submitted: ${rowSubmitted} in the detailed rows, ${a.submittedCount} supplied`);
    if (rowMissed !== a.missedCount) mismatches.push(`missed: ${rowMissed} in the detailed rows, ${a.missedCount} supplied`);
    if (rowReleased !== a.releasedResultCount) mismatches.push(`released results: ${rowReleased} in the detailed rows, ${a.releasedResultCount} supplied`);
  }
  if (l.resources.length !== l.interactedResources) mismatches.push(`interacted resources: ${l.resources.length} listed, ${l.interactedResources} supplied`);
  return (
    <div className="evidence">
      <div className="evidence-grid">
        <section aria-labelledby="ev-learning">
          <h3 id="ev-learning">Learning activity <Flag on={l.concern} /></h3>
          <dl className="kv">
            <div><dt>Engagement coverage</dt><dd>{pct(l.engagementCoverage)}</dd></div>
            <div><dt>Resources interacted with</dt><dd>{l.interactedResources} of {l.eligibleResources} eligible</dd></div>
            <div><dt>Active learning days</dt><dd>{num(l.activeLearningDays)}</dd></div>
            <div><dt>Last activity</dt><dd>{l.latestActivityDay == null ? UNAVAILABLE : `Day ${l.latestActivityDay}`}</dd></div>
            <div><dt>Days since last activity</dt><dd>{num(l.daysSinceLastActivity)}</dd></div>
          </dl>
          <p className="note">An interaction record does not show that material was read or understood. A value of 0 is a real zero; “Unavailable” means no value was supplied.</p>
        </section>
        <section aria-labelledby="ev-perf">
          <h3 id="ev-perf">Early performance <Flag on={d.earlyPerformanceConcern} /></h3>
          <dl className="kv">
            <div><dt>Weighted average, released scores</dt><dd>{pct(a.weightedAverageAvailableScore)}</dd></div>
            <div><dt>Results released by Day 28</dt><dd>{a.releasedResultCount}</dd></div>
            <div><dt>Weight of released results</dt><dd>{a.releasedAssessmentWeight}% of paper</dd></div>
          </dl>
          <p className="note">Scores appear only when submission and release both fall on or before Day 28. Prior-credit results are included in the supplied average.</p>
        </section>
      </div>

      <section aria-labelledby="ev-assess" className="wide-evidence">
        <h3 id="ev-assess">Assessment participation <Flag on={a.concern} /></h3>
        <dl className="kv kv-inline">
          <div><dt>Due by Day 28</dt><dd>{a.dueCount}</dd></div>
          <div><dt>Submitted</dt><dd>{a.submittedCount}</dd></div>
          <div><dt>Missed</dt><dd>{a.missedCount}</dd></div>
          <div><dt>Submission completion</dt><dd>{pct(a.submissionCompletionRate)}</dd></div>
          <div><dt>Weighted coverage</dt><dd>{pct(a.weightedSubmissionCoverage)}</dd></div>
          <div><dt>Missed weight</dt><dd>{a.missedAssessmentWeight}%</dd></div>
        </dl>
        <ul className="essentials">
          <li><strong>Source totals:</strong> the counts above are supplied Day 28 indicators. They use nominal due dates and include prior-credit records.</li>
          <li><strong>Registration:</strong> this learner registered on Day {d.registrationDay} with {d.opportunityDays} days of opportunity. Rows below use the learner’s own due dates.</li>
          <li><strong>Prior credit</strong> is shown as prior credit, never as a current-offering submission.</li>
          <li><strong>Cut-off:</strong> evidence ends on Day 28, 16 August 2026. Nothing later is included.</li>
        </ul>
        {a.assessments.length ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Assessment evidence table, scrollable">
            <table className="assess-table">
              <thead>
                <tr>
                  <th scope="col">Assessment</th>
                  <th scope="col">Due date</th>
                  <th scope="col">Availability</th>
                  <th scope="col">Submission</th>
                  <th scope="col" className="num">Weight</th>
                  <th scope="col" className="num">Score</th>
                </tr>
              </thead>
              <tbody>
                {a.assessments.map(x => (
                  <tr key={x.assessmentId}>
                    <th scope="row"><span className="strong">{x.assessmentName}</span><small>{x.category}{x.priorCredit ? ' · prior credit' : ''}</small></th>
                    <td>{x.applicableDueDate ? dayLabel(x.applicableDueDate) : UNAVAILABLE}<small>{x.dueState}{x.dueDay == null ? '' : ` · Day ${x.dueDay}`}</small></td>
                    <td>{x.availabilityStatus}<small>{x.learnerOpportunityDays} opportunity days</small></td>
                    <td><span className={`badge ${x.submissionStatus === 'Submitted' ? 'b-teal' : 'b-grey'}`}>{x.submissionStatus}</span><small>{x.submissionDate ? dayLabel(x.submissionDate) : UNAVAILABLE}</small></td>
                    <td className="num">{x.weightPercent}%</td>
                    <td className="num">{x.resultAvailable && x.result != null ? `${x.result}%` : UNAVAILABLE}{x.priorCredit && x.resultAvailable && <small>Prior-credit result</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="note">No assessment definitions are supplied for this paper offering.</p>}
        <p className={`mismatch ${mismatches.length ? 'warn' : ''}`} data-testid="text-mismatch">
          {mismatches.length ? `Detailed evidence differs from supplied totals — ${mismatches.join('; ')}. Supplied totals are shown as provided and are not recalculated.` : 'Detailed rows agree with the supplied aggregate indicators.'}
        </p>
      </section>

      <details className="expander">
        <summary>Resource interactions ({l.resources.length})</summary>
        {l.resources.length ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Resource interactions, scrollable">
            <table>
              <thead><tr><th scope="col">Resource</th><th scope="col">Type</th><th scope="col">Available from</th><th scope="col" className="num">Interactions</th><th scope="col">Latest</th></tr></thead>
              <tbody>
                {l.resources.map((r, i) => (
                  <tr key={`${r.resourceTitle}-${i}`}>
                    <th scope="row">{r.resourceTitle}</th><td>{r.activityType}</td><td>Day {r.availableFromDay}</td><td className="num">{r.interactionCount}</td><td>Day {r.latestInteractionDay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="note">No learning-resource interaction is recorded by Day 28.</p>}
      </details>

      <details className="expander">
        <summary>Technical definitions and source notes</summary>
        <ul className="essentials">
          <li><strong>Engagement coverage:</strong> resources interacted with divided by resources available to the learner by Day 28.</li>
          <li><strong>Active learning days:</strong> distinct days from Day 1 to Day 28 with at least one recorded resource interaction.</li>
          <li><strong>Learner opportunity days:</strong> days an assessment was available between the learner’s registration day and Day 28.</li>
          <li><strong>Weighted submission coverage:</strong> weight of submitted assessments divided by weight of assessments due by Day 28.</li>
          <li><strong>Availability:</strong> “Not yet available by Day 28” and “Availability ended before registration” are not treated as missed work.</li>
          <li><strong>Categories:</strong> calculated from the original verified rules and supplied unchanged; SEED does not recalculate them.</li>
          <li><strong>Learner context:</strong> prior education {d.learnerContext.priorEducationLevel || UNAVAILABLE}; previous attempts {num(d.learnerContext.previousAttemptCount)}; credit load {num(d.learnerContext.creditLoad)}.</li>
        </ul>
      </details>
    </div>
  );
}
