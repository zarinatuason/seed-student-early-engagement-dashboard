import { boolean, date, integer, pgTable, serial, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core";

export const advisorReviewsTable = pgTable(
  "advisor_reviews",
  {
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
  (table) => [primaryKey({ columns: [table.learnerId, table.courseCode] })],
);

export const advisorHistoryTable = pgTable(
  "advisor_history",
  {
    id: serial("id").primaryKey(),
    learnerId: text("learner_id").notNull(),
    courseCode: text("course_code").notNull(),
    actionType: text("action_type").notNull(),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    method: text("method"),
    note: text("note"),
    summary: text("summary").notNull(),
  },
  (table) => [
    index("advisor_history_record_date_idx").on(
      table.learnerId,
      table.courseCode,
      table.effectiveDate,
      table.id,
    ),
  ],
);

export const demoSettingsTable = pgTable("demo_settings", {
  id: integer("id").primaryKey().default(1),
  day: integer("day").notNull().default(29),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});