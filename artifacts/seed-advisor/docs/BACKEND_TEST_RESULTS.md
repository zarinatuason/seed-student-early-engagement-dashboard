# Backend functional verification

Run the read-only checks from the workspace root with:

```sh
python3 scripts/seed-functional-checks.py
```

The script uses only Python's standard library. It waits up to 60 seconds for
`GET http://localhost:80/api/healthz`, then reads the academic CSV source and
makes GET requests only; it never calls review, contact, response, or calendar
write endpoints. Each run prints structured JSON with the overall status,
row/check counts, and failures. Note: the API's advisor-summary GET calls its
own `getSetting()` helper, which inserts the default demo-date row if it is
absent. The script does not request a date change, but a run against a database
without that default row may trigger this server-side initialization.

## Run result

**PASS — 740 checks, 0 failures.** The API was available and the complete run
finished successfully. The run fetched all 3,874 learner-paper summaries over
78 pages at page size 50, and verified pagination at sizes 10, 25, and 50.

| Academic source CSV | Rows |
| --- | ---: |
| Papers | 34 |
| Assessments | 258 |
| Learner context | 1,400 |
| Enrolments | 3,874 |
| Learning resources | 474 |
| Resource activity | 22,222 |
| Assessment submissions | 16,490 |
| Day 28 indicators | 3,874 |
| Dashboard view | 3,874 |

The source and runtime API category totals matched exactly:

| Category | Records |
| --- | ---: |
| High Priority | 581 |
| Review Recommended | 968 |
| Insufficient Evidence | 194 |
| No Current Concern | 2,131 |

The checks covered CSV uniqueness and joins, key/category parity, reconstruction
of due, submitted, missed, released-result, weighted-coverage, and
weighted-average aggregates (including prior-credit rows), summary totals and
field shapes, category ordering and counts, pagination, combined search and
filters, category-count scope, invalid-query 400s, and missing-record 404s.
Detailed source comparisons exercised prior credit, late registration,
unavailable values versus measured zeros, learner-specific due dates, and
Day 28 dates/results. Advisor summary, reference, learner-context, and detail
responses were checked for their expected public field sets and for protected
or later-outcome fields.

The source cutoff audit enumerated **2,062** submission rows whose release day
is after Day 28; none has a score value in the source. The reconstruction only
admits results submitted and released by Day 28. A detailed API sample with
post-cutoff releases also returned no result for those assessments.

Review-status checks use the values returned by the live API rather than
assuming that no reviews exist. This run does not verify browser interactions,
review-write behavior, restart behavior, or a UI workflow.