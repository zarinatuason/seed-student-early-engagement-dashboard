# Change log

## SEED demonstration prototype

- Added an Overview for synthetic cohort and learner–paper totals, supplied academic categories, review statuses, follow-ups, and demo date.
- Added searchable and filterable Academic Records with supplied category counts, sorting, pagination, individual evidence, and saved-review access.
- Added a Review Tracker with status, contact, search, and follow-up views.
- Added a Reference Guide for category and indicator explanations, evidence boundaries, synthetic data, and workflow.
- Added an advisor review workflow with PostgreSQL persistence, effective action dates, system save timestamps, and dated history.
- Added synthetic contact-attempt and response logging without external messaging or referrals.
- Added the Semester Two 2026 demonstration calendar (Day 1 July 20; Day 28 August 16; Days 29–35 August 17–23), preserving source offering identifiers and fixing academic evidence at Day 28.
- Restricted loaded academic CSV groups to CSV01–03 and CSV05–10; fairness-audit CSV04 and later-outcome/validation CSV11–12 remain outside the advisor data path.
- Added project walkthrough, data-mapping, limitations, AI-use, and functional test-results documentation references.

Verification status and any test outcomes are recorded separately in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md). This change log does not claim that checks passed.