# Data mapping and technical notes

## Source files and allowlist

The API reads a fixed allowlist of source-file groups from the directory configured by `SEED_DATA_DIR`. For the supplied workspace, configure this explicitly as `artifacts/api-server/data/academic` (preferably an absolute path); the reader also has a relative default based on runtime location. For each prefix below it expects exactly one CSV whose filename begins with that prefix and an underscore:

| Group | Use in SEED | Main identifiers / joins |
| --- | --- | --- |
| CSV01 — course information | Paper title, code, level, structure, and course context | `course_code` |
| CSV02 — assessment information | Assessment definitions, offering, availability, due day, category, and weight | `assessment_id`, `course_code`, `course_offering_period` |
| CSV03 — learner context | Available learner background context | `learner_id` |
| CSV05 — Day 28 enrolments | Learner–paper registration and offering context | `learner_id`, `course_code`, `course_offering_period` |
| CSV06 — learning resources | Resource description, offering, and availability | `learning_resource_id`, course and offering |
| CSV07 — resource activity | Resource interaction events and days | Learner, resource, course, and offering |
| CSV08 — assessment submissions | Submission, learner-specific due-date, prior-credit, score, and release evidence | Learner, assessment, course, and offering |
| CSV09 — calculated Day 28 indicators | Supplied counts, rates, concern flags, and category | `learner_id`, `course_code` |
| CSV10 — dashboard categories and reasons | Display name, organization context, supplied reason, and dashboard record key | `learner_id`, `course_code` |

Actual files in the supplied snapshot use numbered filenames (for example, `01_final_course_information_…csv`). The prefix allowlist is deliberate: the API does not load CSV04 fairness-audit data or CSV11–12 later-outcome and validation-comparison data. These excluded sources do not take part in advisor-facing response data or classification.

The reader validates CSV headers and row widths, duplicate identifiers, expected cohort and category totals, joins, and category agreement. It preserves source categories and uses CSV09 as the authority for the displayed category. Missing values map to unavailable/null where supported; an actual numeric zero remains zero. The service fails at startup for missing required joins and records validation discrepancies for its reference information. The published check outcomes belong in [Functional test results](TEST_RESULTS.md); this mapping is not a claim that checks have passed.

## Record construction and evidence boundary

The advisor-facing academic unit is a learner–paper record keyed by learner ID plus course code. CSV10 supplies the record list and plain-language reason; CSV09 supplies the category and aggregate indicators; CSV05 supplies enrolment/offering context. CSV01 and CSV03 add course and learner context.

Assessment detail is assembled from CSV02 and CSV08 for the record’s original `course_offering_period`, matching learner, paper, offering, and assessment identifiers. Where present, the learner-specific applicable due day takes precedence over the nominal assessment due day. The evidence cutoff is Day 28:

- only resource activity on or before Day 28 is included in individual activity detail;
- the source `assessments_due_count` uses nominal Day 28 due definitions, including assessments whose availability began before a learner registered late; it is not restricted to an assessment availability window overlapping that learner’s registration opportunity;
- the individual view presents the registered-opportunity interval context (registration day and opportunity duration) separately from each assessment’s availability and due information. Consider interval overlap separately; it does not silently change the supplied aggregate;
- the source submission aggregate includes prior-credit rows (680 records), and the source released-results aggregate includes 516 prior-credit results. The supplied weighted average score also includes prior credit;
- in the individual assessment detail, a record marked Prior credit remains distinctly labelled as such. Its recorded submission date and score are shown when it was submitted and its score released by Day 28, but it is not presented as current participation;
- a displayed result requires a recorded submission by Day 28 and a score-release day on or before Day 28;
- later submissions and score releases are excluded from checkpoint evidence; and
- aggregate counts and weighted scores should therefore not be read as current-participation-only measures.

The observed supplied category associations are: High Priority has two or three concern flags; Review Recommended has exactly one; Insufficient Evidence has the insufficient-evidence flag only; and No Current Concern has all concern flags false. Concern flags refer to the supplied learning-activity, assessment-participation, and early-performance flags. These observed combinations describe the supplied categories; they do not establish independent thresholds or justify reconstructing the classification model. In particular, the source owner must confirm the threshold rules and how prior-credit evidence is intended to count toward participation and performance interpretations. Do not infer those rules from category combinations or aggregate values.

CSV09’s supplied aggregate indicators are displayed as supplied, rather than replaced by an advisor-action-based calculation. Definitions and limitations are described in the Reference Guide and [Limitations](LIMITATIONS.md).

## PostgreSQL advisor storage

Academic CSVs are a filesystem-backed, read-only snapshot loaded into API memory at startup. Advisor data is held separately in PostgreSQL using `lib/db/src/schema/advisor.ts` and `DATABASE_URL`:

- `advisor_reviews`: current editable state keyed by `learner_id` and `course_code` (status, notes, outcome, next action, follow-up fields, contact status, last effective date, system `updated_at`);
- `advisor_history`: append-only dated review, contact, response, or explicit no-response events with effective date, system `saved_at`, optional method/note, and summary; and
- `demo_settings`: one shared selected demo day.

Review writes and history appends are transactional. `drizzle-kit push` applies the schema to the selected database. Reviews and history can persist across page refreshes, API process restarts, and deployments as long as the same durable PostgreSQL database remains configured and available. The academic snapshot must also remain available at its configured data directory on every API start.

There is no per-user partition: the shared database contains one global advisor workspace and one calendar setting. This is appropriate only for controlled demonstration use.

## Calendar mapping

The source offering IDs and period labels are not changed. The separate demo calendar counts consecutive days from Monday 20 July 2026 (Day 1), using teaching week `floor((day − 1) / 7) + 1`.

| Day | Date | Week / meaning |
| --- | --- | --- |
| 1 | Monday 20 July 2026 | Week 1 starts |
| 28 | Sunday 16 August 2026 | End of Week 4; evidence cutoff |
| 29 | Monday 17 August 2026 | Week 5 starts; default selected day |
| 30 | Tuesday 18 August 2026 | Week 5 |
| 29–35 | Monday 17–Sunday 23 August 2026 | Available review dates |
| 35 | Sunday 23 August 2026 | End of Week 5 |

Changing the selected review day changes follow-up due/overdue calculations, not the Day 28 academic snapshot. Effective action dates are distinct from actual system timestamps. Dates and times shown by the interface use Pacific/Auckland.