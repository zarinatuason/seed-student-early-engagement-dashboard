import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Version 2 workspace data is kept in session-keyed tables. The original
 * advisor tables remain intact so historical rows (including rows without a
 * session) are never dropped or exposed to a new test session.
 */
export const workspaceSessionsTable = pgTable(
  "workspace_sessions",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    resumeTokenHash: text("resume_token_hash").notNull(),
    scenarioDay: integer("scenario_day").notNull().default(29),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("workspace_sessions_resume_hash_idx").on(table.resumeTokenHash)],
);

export const workspaceReviewsTable = pgTable(
  "workspace_reviews",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    learnerId: text("learner_id").notNull(),
    courseCode: text("course_code").notNull(),
    reviewStatus: text("review_status").notNull().default("Awaiting review"),
    advisorNotes: text("advisor_notes").notNull().default(""),
    outcome: text("outcome"),
    nextAction: text("next_action"),
    followUpDate: date("follow_up_date", { mode: "string" }),
    followUpCompleted: boolean("follow_up_completed").notNull().default(false),
    contactStatus: text("contact_status").notNull().default("Not contacted"),
    lastEffectiveDate: date("last_effective_date", { mode: "string" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_reviews_session_record_idx").on(
      table.sessionId,
      table.learnerId,
      table.courseCode,
    ),
    index("workspace_reviews_session_idx").on(table.sessionId),
  ],
);

export const workspaceHistoryTable = pgTable(
  "workspace_history",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    learnerId: text("learner_id").notNull(),
    courseCode: text("course_code").notNull(),
    actionType: text("action_type").notNull(),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    evidenceCheckpoint: date("evidence_checkpoint", { mode: "string" }).notNull().default("2026-08-16"),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    method: text("method"),
    note: text("note"),
    summary: text("summary").notNull(),
  },
  (table) => [
    index("workspace_history_session_record_date_idx").on(
      table.sessionId,
      table.learnerId,
      table.courseCode,
      table.effectiveDate,
      table.id,
    ),
    index("workspace_history_session_idx").on(table.sessionId),
  ],
);

export const supportActionsTable = pgTable(
  "support_actions",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    learnerId: text("learner_id").notNull(),
    courseCode: text("course_code").notNull(),
    offeringPeriod: text("offering_period").notNull(),
    actionType: text("action_type").notNull(),
    destination: text("destination"),
    details: text("details"),
    progress: text("progress").notNull().default("Planned"),
    followUpDate: date("follow_up_date", { mode: "string" }),
    followUpCompleted: boolean("follow_up_completed").notNull().default(false),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    setupKey: text("setup_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("support_actions_session_record_idx").on(
      table.sessionId,
      table.learnerId,
      table.courseCode,
      table.effectiveDate,
    ),
    index("support_actions_session_followup_idx").on(
      table.sessionId,
      table.followUpDate,
      table.followUpCompleted,
      table.progress,
    ),
    uniqueIndex("support_actions_session_setup_key_idx").on(table.sessionId, table.setupKey),
  ],
);

export const conversationsTable = pgTable(
  "workspace_conversations",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    learnerId: text("learner_id").notNull(),
    subject: text("subject").notNull(),
    syntheticExample: boolean("synthetic_example").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("workspace_conversations_session_learner_idx").on(table.sessionId, table.learnerId)],
);

export const conversationRecordsTable = pgTable(
  "conversation_records",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    learnerId: text("learner_id").notNull(),
    courseCode: text("course_code").notNull(),
    offeringPeriod: text("offering_period").notNull(),
  },
  (table) => [
    uniqueIndex("conversation_records_session_link_idx").on(
      table.sessionId,
      table.conversationId,
      table.learnerId,
      table.courseCode,
      table.offeringPeriod,
    ),
    index("conversation_records_session_record_idx").on(
      table.sessionId,
      table.learnerId,
      table.courseCode,
    ),
  ],
);

export const conversationMessagesTable = pgTable(
  "conversation_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    direction: text("direction").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    scenarioDate: date("scenario_date", { mode: "string" }).notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    read: boolean("read").notNull().default(false),
    advisorLabel: text("advisor_label"),
    syntheticExample: boolean("synthetic_example").notNull().default(false),
    clientMessageId: text("client_message_id"),
    incomingEventId: text("incoming_event_id"),
  },
  (table) => [
    uniqueIndex("conversation_messages_session_client_idx").on(
      table.sessionId,
      table.clientMessageId,
    ),
    uniqueIndex("conversation_messages_session_event_idx").on(
      table.sessionId,
      table.incomingEventId,
    ),
    index("conversation_messages_session_conversation_date_idx").on(
      table.sessionId,
      table.conversationId,
      table.scenarioDate,
      table.savedAt,
    ),
  ],
);