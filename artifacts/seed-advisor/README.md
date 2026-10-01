# SEED — Student Advisor Review

SEED is a functional prototype for an INFOMGMT 399 capstone demonstration. It helps a Student Advisor inspect synthetic learner–paper records, consider the supplied Day 28 evidence, and record review decisions and follow-up actions. Categories are prompts for human review, not diagnoses, predictions, or automated decisions.

## Pages

- **Overview** — cohort totals, academic category counts, review statuses, follow-ups, and the current demo date.
- **Academic Records** — searchable, filterable learner–paper records and their evidence.
- **Review Tracker** — saved review and follow-up status across records.
- **Reference Guide** — category and indicator descriptions, evidence boundaries, calendar mapping, and workflow guidance.

Open a learner–paper record from Academic Records or the Review Tracker to view the same review, academic evidence, saved actions, and dated history.

## Data and storage

The academic snapshot is supplied as CSV files under `artifacts/api-server/data/academic`. At API startup, the service reads the allowed source groups: CSV01–03 and CSV05–10. The bundled server resolves that directory relative to its executable; `SEED_DATA_DIR` is an optional absolute-directory override, not a requirement. The source CSV snapshot is read-only from the application’s perspective and is separate from advisor-entered data. A configured directory must contain exactly one appropriately prefixed CSV for each required group. Missing or ambiguous files and malformed rows produce startup errors. All 12 original attachments are retained in `.local/conversation-workspace/files/attached_assets`; that directory is excluded from published images, so fairness/outcome files are not shipped with the operational app.

Advisor reviews, action history, and the selected demonstration day are stored in **PostgreSQL** through Drizzle ORM. Set `DATABASE_URL` to the connection string for a provisioned PostgreSQL database. The schema is defined in `lib/db/src/schema/advisor.ts`; reviews use learner ID plus course code as their key, and dated history is stored separately. `updated_at` / `saved_at` represent system save times; effective dates represent demonstration action dates.

The demonstration day and all advisor actions are shared workspace state, not scoped to a signed-in user. PostgreSQL persistence requires a configured database and persistent database service; ephemeral or reset database instances can lose saved state. Academic CSVs are loaded from the configured filesystem at API startup, not copied into PostgreSQL.

### Local workspace commands

The workspace has two configured, artifact-managed services. Start them from the Run/workflow controls; do not create duplicate servers:

- `artifacts/api-server: API Server` — API on `/api`
- `artifacts/seed-advisor: web` — interface on `/`

For setup and checks, run from the repository root with the provisioned PostgreSQL environment available:

```sh
pnpm install
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/seed-advisor run typecheck
python scripts/seed-functional-checks.py
PORT=21150 BASE_PATH=/ pnpm --filter @workspace/seed-advisor run build
```

The managed workflows supply service ports and the web base path. PostgreSQL uses `DATABASE_URL` from the environment; never commit it or print it. The read-only functional-check script requires the API workflow to be running and sends requests through the shared proxy at `localhost:80/api`. To point the API at another CSV directory, configure `SEED_DATA_DIR=/path/to/csv-directory` on the API process.

`pnpm --filter @workspace/db run push` applies the Drizzle schema to the configured database. Use only a suitable development/demo database; do not point this prototype at production data.

## Demonstration calendar

The source learner-paper offerings are labelled Semester 1. Those original offering identifiers are preserved. The Semester Two 2026 dates below are only the synthetic demo calendar and do not rewrite academic offerings or evidence:

| Demo day | Date | Teaching week |
| --- | --- | --- |
| Day 1 | Monday 20 July 2026 | Week 1 |
| Day 28 | Sunday 16 August 2026 | End of Week 4; fixed evidence cutoff |
| Day 29 | Monday 17 August 2026 | Week 5; default review date |
| Day 30 | Tuesday 18 August 2026 | Week 5 |
| Days 29–35 | 17–23 August 2026 | Week 5 |
| Day 35 | Sunday 23 August 2026 | End of Week 5 |

The selector spans Days 29–35. Changing it recalculates due and overdue follow-ups; it does not change Day 28 academic evidence. Displayed dates and times use Pacific/Auckland. Action dates cannot be later than the selected demo date or earlier than a previously saved action where that would reverse the record’s chronology.

## Checks and current status

See [Functional test results](docs/TEST_RESULTS.md) and [Repeatable backend checks](docs/BACKEND_TEST_RESULTS.md) for checks actually executed, expected and observed outputs, failures, and limitations.

See [Walkthrough](docs/WALKTHROUGH.md), [Data mapping](docs/DATA_MAPPING.md), [Limitations](docs/LIMITATIONS.md), [Change log](CHANGELOG.md), and [AI-use record](AI_USE.md) for more detail.

## Safety and readiness

All supplied learner data are synthetic. Contact attempts and responses are synthetic records only: SEED sends no messages and makes no external referrals. The prototype has no authentication or user-specific access control and is not production-ready. Do not use it for real learner information or operational decisions.