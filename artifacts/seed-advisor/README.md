# SEED — Student Advisor Review

Advisor-facing prototype using the supplied synthetic final dataset and persistent PostgreSQL workflow data. Academic evidence remains the supplied end-of-Day-28 snapshot; advisor work changes independently. No external email is sent and no learner interface is provided.

## Run

```sh
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/seed-advisor run dev
```

The managed artifact workflows normally run the last two commands. The frontend uses its artifact base path; API requests use `/api`.

## Sessions

Opening SEED establishes a cookie-bound advisor test session with the academic dataset and two prepared conversations. **Test controls** provides:

- **Start a new session:** preserves the previous session rather than deleting it.
- **Resume:** enter the previous session's private resume code.
- **Reset current session:** requires confirmation, clears only that session's reviews, notes, outcomes, support actions, follow-ups, messages, read state and history; returns to Day 29 and restores prepared examples.
- **Scenario date:** Day 29 through Day 63. Saved work survives date changes. Moving before a saved event is rejected.

Keep the resume code private. It is an access capability, not an institutional sign-in. Workflow data is isolated by session, not authenticated university user identity. All prototype users act as Student Advisors.

## Database and relationships

The existing database is retained. Additive tables hold session-scoped reviews, history, support actions, conversations, verified conversation-to-offering links and messages. Existing legacy advisor tables remain intact; their unscoped operational endpoints are retired.

- Academic joins use verified learner, paper and offering relationships.
- Review state, contact state and support-action progress are separate.
- A conversation belongs to one learner and can link to multiple verified enrolled paper offerings.
- Messages retain original subject/body, direction, scenario date, actual save timestamp and incoming read state.
- Outgoing client message IDs and incoming event IDs prevent duplicate saves and reject reuse with different content.
- Incoming read state does not complete a review.
- Completing/cancelling a support action removes that action from outstanding lists, not another action or an independent review follow-up.
- Dated history retains its Day 28 academic checkpoint reference.

## Prepared examples and facilitator utility

Each session receives labelled **Synthetic example** conversations:

1. **STU000029 / BIOSCI201:** earlier advisor message and unread Day 29 learner reply; Response received; no completed support decision.
2. **STU000530 / SOFTENG100:** earlier advisor message; Awaiting response; planned follow-up on Day 33.

Both original academic categories remain High Priority. Re-running setup does not duplicate examples or overwrite tester messages:

```sh
pnpm --filter @workspace/api-server run build
node artifacts/api-server/dist/facilitator.mjs setup-examples --session-id SESSION_ID
```

To supply a synthetic incoming event, write its exact text into a local UTF-8 file and run:

```sh
node artifacts/api-server/dist/facilitator.mjs incoming \
  --session-id SESSION_ID \
  --conversation-id CONVERSATION_ID \
  --event-id UNIQUE_EVENT_ID \
  --day 29 \
  --subject "Re: Assessment requirements" \
  --text-file /path/to/reply.txt
```

Use the session's present day or a permitted earlier scenario day. A future-dated reply is rejected. Repeating the same event with the same content saves only once. This utility shares the validated incoming-message backend flow. There is no public incoming endpoint or advisor-facing reply-insertion form. Access requires workspace/command-line and database access. The inbox refreshes periodically; incoming events do not generate automatic responses.

## Calendar and academic checkpoint

Day 1 is Monday 20 July 2026; Day 28 is Sunday 16 August; the scenario starts Monday 17 August, Day 29, Week 5. Date-only values preserve the agreed Pacific/Auckland calendar. Actual system timestamps are separate audit metadata, not the primary scenario timeline.

Advancing the scenario changes due/overdue follow-ups, never academic categories or counts. CSV09/CSV10 retain their supplied indicators. Available resources, submission events and released scores are bounded by Day 28. Historical prior credit and expired pre-registration opportunities are identified rather than silently recalculating source aggregates.

## Simulation, privacy and future integration

**Email delivery is simulated for this prototype.** Sending saves the exact message and updates linked-paper contact status; no transport contacts an external email system. Synthetic recipient routing remains backend-only and is not included in operational API responses, URLs or routine request logs. Fairness-audit fields and later validation outcomes are excluded from operational loading/views.

Production integration would require institutional sign-in and advisor permissions, verified directory/recipient access, an authorised university mail transport, validated and authenticated incoming webhooks, durable queue/retry handling, access auditing, retention rules and secure secret management. Academic refresh would require a verified institutional data pipeline, original categorisation rules and explicit refresh/checkpoint provenance. This prototype does not provide these integrations or claim stakeholder validation.

Avoid entering real personal or confidential information into this synthetic-data prototype. Exact message preservation includes text entered by the tester; it is not a personal-data redaction service.

## Verification

```sh
# Pure source reconstruction; no session or workflow writes:
python scripts/seed-functional-checks.py --source-only

# Isolated integration sessions:
python scripts/seed-v2-functional-checks.py prepare
# Restart the managed API workflow, then:
python scripts/seed-v2-functional-checks.py verify
python scripts/seed-v2-functional-checks.py audit
python scripts/seed-v2-functional-checks.py regression
python scripts/seed-v2-functional-checks.py cleanup

pnpm run typecheck
pnpm --filter @workspace/api-server run build
PORT=21150 BASE_PATH=/ pnpm --filter @workspace/seed-advisor run build
git diff --check
```

The integration script keeps temporary access capabilities in a permission-restricted `/tmp` file and never prints them. Cleanup is restricted to exactly created test-session IDs with `seed-v2-test` labels. Do not run another prepare pass before cleaning up the previous one.

See [Version 2 verification results](docs/V2_TEST_RESULTS.md) for checks actually executed and limitations. Earlier reports under `docs/` describe the previous prototype and are not evidence of Version 2 verification.