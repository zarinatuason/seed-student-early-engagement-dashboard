# Functional verification

Verification date: 2 October 2026 (Pacific/Auckland). This report covers the development workspace, not a published production deployment.

## Data and read-only API checks

Command: `python scripts/seed-functional-checks.py`

**Observed: PASS — 740 checks, 0 failures.** See [detailed backend results](BACKEND_TEST_RESULTS.md).

| Check | Expected | Observed |
| --- | --- | --- |
| Original attachments accessible | 12 CSVs | All 12 readable; none missing |
| Courses / learner contexts / learner-paper records | 34 / 1,400 / 3,874 | Exact match |
| High Priority / Review Recommended / Insufficient Evidence / No Current Concern | 581 / 968 / 194 / 2,131 | Exact match |
| Academic joins | Matching learner, paper, assessment/resource and offering | All 16,490 submissions and 22,222 activities join |
| Source offerings | Preserve originals | Semester 1 retained |
| Supplied categories | Dashboard and indicator agreement | Exact agreement |
| Snapshot aggregation | Preserve source definitions | Counts, released weights and available-score averages reconcile, including prior credit |
| Search and combined filters | Matching learner/paper/department/category/status | Passed |
| Category-count scope | Exclude selected category from counts; retain other filters | Passed |
| Default sorting and pagination | Category order; stable learner/course keys; 10/25/50 rows | Passed; all 3,874 API records inspected over 78 pages |
| Day 28 evidence | Hide later releases, retain learner-specific dates and registration context | Passed; 2,062 later-release rows audited |
| Missing values and zero | Distinct null and numeric zero | Passed |
| Operational data boundary | No fairness/later-outcome fields | Passed |
| Invalid read inputs and unknown record | HTTP 400 / 404 | Passed |

The script does not call write endpoints. Summary GET may initialise the default calendar-setting row if it does not already exist; no advisor actions are seeded.

## Build checks

- API contract generation and shared-library compilation: passed.
- API TypeScript check: passed.
- Workspace-wide TypeScript check (shared libraries, API, web, preview sandbox, scripts): passed. The web check was repeated after the final state-sync changes and passed.
- Web production build: passed. Vite emitted a non-blocking tooltip-source sourcemap warning; output assets were produced successfully.
- API managed workflow builds and starts successfully. Its previous bundled CSV-directory startup error was corrected.
- Overview preview rendered the live API data, requested heading, SEED breadcrumb, and current design.

## Browser journey

The initial browser run found that returning from an individual record lost search, sort, and page-size URL state. The cause was pathname-only routing state. The app now reads the query string explicitly.

The resumed journey and final focused checks passed:

| Check | Expected | Observed |
| --- | --- | --- |
| Open record without saving | Do not mark reviewed or add history | Awaiting review and empty history preserved |
| Return to table | Restore learner search, Learner ID ascending sort and 25-row page size | Full URL and controls restored after fix |
| Unsaved navigation | Warn before abandoning changes | Warning shown; cancellation retained the form |
| Save/reload | Persist notes, In review, Follow-up planned, next action and follow-up date | All fields restored |
| Contact on Day 29 | Awaiting response, dated Email log | Passed |
| Advance to Day 30 | Contact state unchanged; overdue follow-up visible | Passed |
| Record response on Day 30 | Response received and dated response log | Passed |
| Reviewed with open follow-up | Keep outstanding follow-up in overdue view | Passed |
| Complete follow-up | Remove it from due/overdue view | Passed |
| Explicit No response | Only an advisor action creates it; advancing day does not change it | Passed through Day 31 |
| Tracker search/reopen | Same saved review and history as Academic Records | Passed |
| Academic category independence | Remain High Priority despite review/contact updates or extra category input | Passed |
| Future effective date / backward demo chronology | Reject with HTTP 409 | Passed |
| Invalid review status / calendar date / blank contact method | Reject with HTTP 400 | Passed |
| Backend restart | Saved review and all dated history survive | Actual managed API restart; API and browser readback passed |
| Dirty notes plus contact log | Preserve unsaved notes and update contact status; later review save must not restore stale status | Passed; reload retained both notes and Awaiting response |
| Required headings and navigation | Overview, Academic Records, Review Tracker, prescribed Reference heading, SEED breadcrumb | Passed; no old Follow-up tracker label |
| Mobile layout | At 390px, page fits; table scrolls independently | Fixed and passed: document/body 375px, table client 321px / scroll 672px |
| Keyboard focus and form labels | Visible focus and labelled controls | Passed through navigation, date, back link, table scroller and review controls; 3px focus outline observed |
| 200% equivalent responsive width | Layout fits a 640px effective CSS width | Passed: document/body 625px; table independently scrollable |
| Browser errors | None | Vite/React informational messages only |

The initial mobile run found page-wide overflow (681px at a 390px viewport). Giving the evidence grid a zero minimum width and bounding the assessment scroll container corrected it. The rerun confirmed that horizontal scrolling is confined to the assessment table.

Actual browser magnification could not be confirmed because the automated browser's zoom shortcut did not change its scale. The 640px layout check is a 200%-equivalent responsive-width check, **not a claim that actual magnified rendering passed**.

## Cleanup and final demonstration state

Verification used one initially empty synthetic learner-paper record. A notes-marker guard and explicit test history IDs restricted cleanup to that review and its nine test-created actions. Cleanup removed exactly one test review and nine history rows; no academic data were changed.

Final PostgreSQL readback: **0 advisor reviews and 0 action-history rows**. Day 29 (17 August 2026) was restored. The API then reported 3,874 Awaiting review, 0 In review, 0 Reviewed, 0 due follow-ups and 0 overdue follow-ups. `GET /api/healthz` returned `{"status":"ok"}`.

## Interpretation and scope limitations

- The supplied aggregates include historical prior-credit records. Detail rows distinguish prior credit from current-offering participation; source values are not silently recalculated.
- Exact concern thresholds and the intended interpretation of prior credit as participation require independent source-owner/team confirmation.
- The demo has no authentication, per-advisor isolation, or external messaging. All contacts/referrals are simulated logs.
- Browser checks are not a full accessibility/security audit, load test, or production deployment/recovery assessment.
- No source submission is dated after Day 28. That exclusion branch has code-level guarding but no positive post-cutoff submission row in the supplied fixture; later score-release cases are present and checked.