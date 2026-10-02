# SEED Version 2 — implementation and verification

Technical verification of the synthetic-data prototype. No stakeholder validation is claimed.

## Implemented

- Session-isolated persistent advisor workflows, private resume codes, separate new-session and confirmed current-session reset controls.
- Day 29–63 scenario calendar, Day 28 academic checkpoint, effective-date validation and separate actual audit timestamps.
- Overview record/learner counting units, category-specific distinct learners, unread replies, due/overdue follow-ups and filtered links.
- Academic Records contact filter, required column order, sorting, pagination and URL-based return state.
- Cross-paper learner context, assessment table, resource detail expansion and explicit source-versus-detail mismatch reporting.
- Separate review, contact and support-action fields; editable generic destinations, action progress and independent follow-up completion.
- Simulated outgoing messages with exact saved subject/body, linked offerings, repeat-safe sends and shared record/Inbox conversations.
- Unread state independent of review status; explicit mark-read; periodic refresh for facilitator-supplied incoming events.
- Two idempotent labelled synthetic examples and a workspace-only incoming-reply command.
- Retired global operational endpoints; preserved legacy database tables and unchanged original CSVs.

## Verified dataset

| Category | Learner–paper records | Distinct learners within category |
|---|---:|---:|
| High Priority | 581 | 505 |
| Review Recommended | 968 | 759 |
| Insufficient Evidence | 194 | 186 |
| No Current Concern | 2,131 | 1,231 |

There are 1,400 learners, 3,874 learner–paper records and 34 papers. Of the learners, 1,072 have different categories across papers. Per-category learner counts overlap and must not be summed as a cohort total.

Source reconstruction checked all supplied indicator rows, including historical prior credit and nominal due counts for expired pre-registration opportunities. Observed aggregate reconstruction mismatches: **0**. The 12 original final CSV files were hash-checked and remained byte-for-byte unchanged.

## Executed backend and build checks

| Check | Observed result |
|---|---|
| `python scripts/seed-functional-checks.py --source-only` | 22 checks passed; no source reconstruction failures |
| `python scripts/seed-v2-functional-checks.py prepare` | 115 HTTP/semantic checks passed in two isolated labelled sessions |
| Managed API workflow restart, then `... verify` | 126 cumulative checks passed, including real restart persistence |
| `... audit` | 316 checks passed, including all 3,874 API category assignments, stable sorting, all 34 paper-filter facets and 14 offering/context samples |
| `... regression` | 11 checks passed; an independent review follow-up remains due after the support action completes |
| Guarded integration cleanup | Both exact labelled integration sessions deleted; temporary access-code file removed |
| Resume a reset session using its original code | Passed; reset retained access to the same session |
| Facilitator setup twice and incoming retry/conflicting payload checks | Passed; examples did not duplicate, exact incoming events saved once, conflicting reused events rejected |
| `pnpm run typecheck` | All workspace libraries, artifacts and scripts passed |
| API-server build and managed restart | Passed; server serving requests |
| `PORT=21150 BASE_PATH=/ pnpm --filter @workspace/seed-advisor run build` | Passed |
| `git diff --check` | Passed |
| Review/contact badge contrast calculations | Grey 8.88:1; blue 7.80:1; teal 8.16:1; purple 8.67:1; amber 7.89:1; all exceed 4.5:1 |

The integration pass exercised exact outgoing/reply content including spaces and line breaks, no automatic learner reply, multi-paper linking, incoming event deduplication, read-state separation, explicit dated no-response history followed by a later reply, completed referral independence, due/overdue changes through Day 49, cancelled/completed action removal, unknown keys, invalid dates/filters, session isolation, repeatable example setup, safe reset, hidden operational routing fields and exclusion of protected fields. Notes, conversation messages, action progress, history and scenario date survived the actual backend restart.

Initial integration-harness runs exposed incorrect test assumptions about other-paper inclusion, acceptable validation status codes and non-JSON 404 responses. These were corrected before the passing runs; failures were not represented as passing checks.

### Build warning

The frontend build emitted a non-fatal source-map warning for the existing tooltip component. It completed successfully and generated the production assets.

### Interface verification

The complete advisor journey was exercised in two isolated labelled browser sessions:

- Overview counts, initial calendar/checkpoint, category filtering and learner overlap explanation.
- Search, paper sorting, contact filter, page size, record entry, cross-paper navigation and preserved query state.
- Opening without automatically completing a review; explicit review save and dated history.
- Exact outgoing subject/body including whitespace/newline, verified recipient ID, multi-paper scope and simulation notice.
- Shared record/Inbox conversation, facilitator incoming reply appearing through polling, contact updates, explicit mark-read without completing review, advisor reply and no automatic learner reply.
- Completed referral plus independent review follow-up, planned support follow-up becoming due/overdue, completing only that action and preserving the review follow-up.
- Refresh persistence, new-session isolation, confirmed reset restoring both examples and leaving the second session intact.
- Graceful unknown-record handling; labelled keyboard access and visible focus; desktop and 390 px layouts; aligned assessment table columns and contained horizontal table scrolling.

The first pass found unsaved browser-Back navigation losing a draft, mobile header overlap, and tracker wording omitting a remaining review follow-up. These were fixed, then **only the affected flows** were rechecked in one additional isolated session:

- Browser Back displayed confirmation. Cancel retained the record route and unsaved note; Accept returned to the filtered Records list. A link-leave Cancel also retained the draft.
- At 390×844, header/date/checkpoint/Test controls, back link and headings had non-overlapping measured bounds. The full header height preceded the main content; page width stayed inside the viewport; tables kept their internal scroll regions.
- A Completed referral plus separate Day 30 review follow-up displayed **Due today · 18 Aug 2026** and **1 outstanding** in Review Tracker.

All three fixes passed targeted verification. All three positively identified browser test sessions were deleted with the guarded facilitator command; no genuine session was cleared.

The updated desktop screenshot rendered successfully without runtime browser errors. **Actual 200% browser zoom was not tested**; narrow-viewport checks are not represented as actual zoom verification. Screen-reader and broad cross-browser testing were not performed.

## Prepared examples

- **STU000029 / BIOSCI201:** High Priority, Awaiting review, Response received, unread Day 29 reply, no completed support decision.
- **STU000530 / SOFTENG100:** High Priority, Awaiting response, planned Day 33 follow-up.

## Changed files

### Backend and database

- `artifacts/api-server/build.mjs`
- `artifacts/api-server/src/facilitator.ts`
- `artifacts/api-server/src/lib/conversation-data.ts`
- `artifacts/api-server/src/lib/example-workspace.ts`
- `artifacts/api-server/src/lib/incoming-message.ts`
- `artifacts/api-server/src/lib/workspace-data.ts`
- `artifacts/api-server/src/lib/workspace-session.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/seed.ts`
- `artifacts/api-server/src/routes/conversations.ts`
- `artifacts/api-server/src/routes/session.ts`
- `artifacts/api-server/src/routes/workspace.ts`
- `lib/db/src/schema/index.ts`
- `lib/db/src/schema/workspace.ts`

### Interface

- `artifacts/seed-advisor/src/App.tsx`, `src/v2.css`, `index.html`
- `src/components/{badges,conversation,evidence,review-support,session-gate,shell,test-controls,ui-bits}.tsx`
- `src/lib/{dirty,format,page}.ts`
- `src/pages/{inbox,overview,record,records,reference,tracker}.tsx`

### Contract, generated files, checks and documentation

- `lib/api-spec/openapi.yaml`
- Regenerated `lib/api-client-react/src/generated/{api,api.schemas}.ts`
- Regenerated `lib/api-zod/src/generated/api.ts` and its associated schema type files; retired operation-specific generated types removed
- `scripts/seed-functional-checks.py`, `scripts/seed-v2-functional-checks.py`
- `artifacts/seed-advisor/README.md`, this report, and verification screenshots

The academic CSVs and original advisor tables were not replaced or cleared.

## Operating the prototype

Use **Test controls** to copy a private resume code, start another session, resume prior work or confirm a reset. Reset affects only that session and restores its prepared examples.

The facilitator uses:

```sh
node artifacts/api-server/dist/facilitator.mjs incoming \
  --session-id SESSION_ID --conversation-id CONVERSATION_ID \
  --event-id UNIQUE_EVENT_ID --day 29 \
  --subject "Re: Assessment requirements" --text-file /path/to/reply.txt
```

Full setup, calendar, database, simulation, access-control and future university integration requirements are in the [technical README](../README.md).

## Remaining boundaries

- No real external email, automatic learner replies, learner interface or institutional authentication.
- Resume-code possession grants access to that prototype test workspace; this is not university advisor authorisation.
- No later daily academic evidence or automatic categorisation refresh.
- Original source rules for interpreting historical credit and expired pre-registration due counts still require source-owner confirmation; supplied categories are preserved.
- Production email/data integration, authenticated incoming webhooks, delivery/retry queues, institutional permissions, retention controls and production-scale concurrency/load testing are not implemented.
- Browser-specific zoom and assistive-technology coverage are not implied by narrow-viewport or keyboard checks.