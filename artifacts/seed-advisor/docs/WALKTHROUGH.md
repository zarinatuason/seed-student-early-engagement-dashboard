# SEED walkthrough

This guide follows an advisor’s review of one synthetic learner–paper record. The pages use the labels **Overview**, **Academic Records**, **Review Tracker**, and **Reference Guide**.

## Overview

Start at Overview to see the synthetic cohort size, learner–paper record total, supplied academic category totals, saved review-status totals, and follow-ups due today or overdue. The date panel shows the Semester Two 2026 demonstration day and the fixed Day 28 evidence cutoff.

Use a category, status, or follow-up link to open a filtered list, or choose **Browse all records** to go to Academic Records. The category totals describe learner–paper records, not distinct learners.

## Academic Records

Search using a learner ID, paper/course, department, or reason. Narrow the table by paper, department, academic category, or review status. Sort the results, change the page size, and use **Clear filters** to reset filters. The category-count controls show comparable counts for the current search, paper, department, and review-status scope; they do not apply the selected academic category when calculating those counts.

Choose **Review** on a row to open its learner–paper record. The individual page brings the category and supplied reason together with:

- learning-resource activity and engagement indicators through Day 28;
- participation totals and per-assessment due, submission, weight, and result evidence;
- registration, paper, and available learner context; and
- the advisor’s saved review and dated action history.

The detailed assessment view excludes submissions after Day 28 and results released after Day 28. A prior-credit assessment is explicitly labelled Prior credit; if the source records a submission and a result released by Day 28, their date and score are still shown as recorded evidence, not described as current participation. The source aggregate submission count includes 680 prior-credit rows; the released-results aggregate includes 516 prior-credit results, and the source weighted score includes prior credit. These aggregates are not current-participation-only measures.

The page shows the registered-opportunity interval context (registration day and opportunity duration) separately from the assessment’s availability and due information. The supplied due aggregate uses nominal Day 28 due definitions, including assessments available before a late registration, rather than restricting the count to the registered learner’s opportunity interval. Consider interval overlap separately; do not infer that the supplied aggregate counts only intervals overlapping registration opportunity.

A blank or unavailable value is not the same as a measured zero. Academic categories and reasons come from the supplied snapshot and cannot be edited in the advisor form. The category combinations observed in the supplied flags are documented in [Data mapping](DATA_MAPPING.md); the underlying thresholds and interpretation of prior-credit participation require confirmation from the source owner.

## Review Tracker

Use Review Tracker to find a record by search, review status, contact status, or follow-up timing. Presets provide all records, Awaiting review, In review, Reviewed, and due-or-overdue views. A row opens the same individual review available from Academic Records.

## Record a review

On a record, choose a review status, optional outcome, notes, next action, follow-up date, contact status, and follow-up completion state. Choose **Save review**. The service stores the review in PostgreSQL and appends a dated history entry. Opening a record alone does not change its status; records without a saved review begin as Awaiting review. A Reviewed record can be reopened by changing and saving its status.

The effective date is the date the action represents; the system save timestamp is recorded separately. The selected demo date is the default effective date. Actions cannot be dated after that selected day. Saved history also prevents moving the date backwards for the same record; the demo calendar cannot be moved earlier than the latest saved action.

Use **Record contact attempt** or **Record a response** to add synthetic contact-history entries. These actions only save a note and status in the demo database; they do not contact a learner. “No response” is an explicit advisor update, not an automatic result of advancing the calendar. An outstanding follow-up can remain open after a record is marked Reviewed.

Unsaved changes trigger a warning when leaving the page. Saving updates the record history and the Overview, Academic Records, and Review Tracker data.

## Demo calendar and interpretation

The demonstration opens at Day 29, Monday 17 August 2026. The date selector advances through Day 35, Sunday 23 August 2026. This maps the review demonstration onto Semester Two 2026, while all supplied academic offerings remain labelled Semester 1. Academic evidence remains fixed at Day 28, Sunday 16 August 2026.

Use the Reference Guide for category meanings, indicator explanations, data boundaries, and the advisor’s role. Interpret the supplied evidence with context: a category is neither a diagnosis nor a decision about support.

## Synthetic-data reminder

All learner and contact information in this prototype is synthetic. Do not enter real personal information, send external messages, or treat the prototype as an operational student-support system.