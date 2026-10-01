# Limitations and implementation status

SEED is a synthetic-data capstone prototype, not a production student-information or case-management system. This page distinguishes implemented behaviour from simulated demonstration actions and work that remains incomplete or should not be inferred.

## Implemented in the prototype

- Overview, Academic Records, Review Tracker, Reference Guide, and shared individual-review routes.
- CSV-backed academic snapshot from CSV01–03 and CSV05–10; supplied categories and reasons are preserved.
- Search, filters, category counts, sorting, pagination, academic evidence detail, and tracker views.
- PostgreSQL-backed saved review state, dated history, and one selected demo day, provided a durable configured database is available.
- Editable review status, advisor notes, outcome, next action, follow-up date/completion, and contact status.
- Explicit dated review, contact, response, and no-response history entries.
- Day 29–35 demo date selector; follow-up calculations use the selected day while academic evidence stays at Day 28.
- Backend request validation, effective-date constraints, and category values kept independent of advisor actions.
- CSV04 fairness-audit and CSV11–12 later-outcome/validation sources excluded from the advisor-facing load path.

These are descriptions of implemented paths, not claims that every behavior has passed verification. See [Functional test results](TEST_RESULTS.md) for actual check outcomes.

## Simulated by design

- Learners, records, contact attempts, responses, notes, and advisor actions are synthetic demonstration data/actions.
- Contact method labels and response entries are logs only. **No email, text, message, referral, or other external communication is sent.**
- Semester Two 2026 is a calendar overlay for the review demonstration only. Supplied academic records retain their original Semester 1 offering labels and source values.
- The selector’s one calendar day and all saved advisor activity form a single global demo state shared by anyone able to access this instance.

## Incomplete or out of scope

- There is no authentication, authorization, user account, role separation, audit attribution to an authenticated advisor, or per-user data isolation.
- The prototype has not been hardened, privacy-reviewed, security-reviewed, or approved for production; do not store real learner data or rely on it for operational decisions.
- No integration exists for institutional student systems, identity services, messaging, referral services, or live data refresh.
- The academic CSV snapshot is read from the API server filesystem at startup; it is not a versioned academic-data database or a live source integration. Keep the expected allowlisted files available and consistent across restarts.
- PostgreSQL durability depends on the configured database’s persistence, availability, backup, and retention. This application does not itself provide database backup or disaster recovery.
- Academic-source definitions and category rules are consumed as supplied. The prototype does not create a new risk model or independently establish the validity, fairness, predictive value, or causal meaning of the categories. Any ambiguous business rules require subject-matter confirmation.
- Source-owner confirmation is needed for the exact category threshold rules and the intended interpretation of prior-credit evidence in participation/performance. Although the supplied categories show observed combinations of concern flags, those combinations are not a basis for inferring the full model or its thresholds.
- Supplied aggregate submission, released-result, and weighted-score measures include prior-credit evidence (680 prior-credit submission rows; 516 prior-credit released results). They must not be described as current-participation-only measures. The individual detail marks Prior credit distinctly while retaining a recorded submission date or score when its event meets the Day 28 boundary.
- The supplied due aggregate follows nominal Day 28 due definitions, including assessments that became available before late registration; it is not limited to assessment dates overlapping each learner’s registered-opportunity interval. The individual view presents registration day/opportunity duration separately from assessment availability and due information. Interpret the context rather than assuming the aggregate is overlap-adjusted.
- Later outcomes, fairness audits, and validation comparisons are intentionally not exposed or used for classification in the advisor application.
- Independent accessibility, security, privacy, performance, deployment-recovery, and operational-readiness assessments remain outside this prototype unless recorded as completed in the test-results document.

## Verification status

This limitations document does not assert that tests or checks passed. Review [docs/TEST_RESULTS.md](TEST_RESULTS.md) for checks actually run, expected and observed results, failures, and outstanding verification gaps.