import { and, desc, eq } from "drizzle-orm";
import type { AcademicCategory, RecordDetail, RecordSummary, ReviewState } from "@workspace/api-zod";
import {
  conversationMessagesTable,
  conversationRecordsTable,
  conversationsTable,
  db,
  supportActionsTable,
  workspaceHistoryTable,
  workspaceReviewsTable,
} from "@workspace/db";
import { seedData } from "./seed-data";

export const DEFAULT_REVIEW: ReviewState = {
  reviewStatus: "Awaiting review",
  advisorNotes: "",
  outcome: null,
  nextAction: null,
  followUpDate: null,
  followUpCompleted: false,
  contactStatus: "Not contacted",
  lastUpdatedAt: null,
  lastEffectiveDate: null,
};

export function recordKey(learnerId: string, courseCode: string): string {
  return `${learnerId}\u001f${courseCode}`;
}

export function toIsoDate(date: Date | string | null | undefined): string | null {
  if (date == null) return null;
  return typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
}

export function dateAtMidnight(date: Date | string | null | undefined): Date | null {
  const value = toIsoDate(date);
  return value == null ? null : new Date(`${value}T00:00:00.000Z`);
}

export async function getSessionReviewMap(sessionId: string) {
  const rows = await db
    .select()
    .from(workspaceReviewsTable)
    .where(eq(workspaceReviewsTable.sessionId, sessionId));
  return new Map(rows.map((row) => [recordKey(row.learnerId, row.courseCode), row]));
}

export function reviewStateFromRow(row: typeof workspaceReviewsTable.$inferSelect | undefined): ReviewState {
  if (!row) return { ...DEFAULT_REVIEW };
  return {
    reviewStatus: row.reviewStatus as ReviewState["reviewStatus"],
    advisorNotes: row.advisorNotes,
    outcome: row.outcome as ReviewState["outcome"],
    nextAction: row.nextAction,
    followUpDate: dateAtMidnight(row.followUpDate),
    followUpCompleted: row.followUpCompleted,
    contactStatus: row.contactStatus as ReviewState["contactStatus"],
    lastUpdatedAt: row.updatedAt,
    lastEffectiveDate: dateAtMidnight(row.lastEffectiveDate),
  };
}

export async function getSessionRecordSummaries(sessionId: string): Promise<RecordSummary[]> {
  const reviews = await getSessionReviewMap(sessionId);
  return seedData.records.map(({ summary }) => {
    const state = reviewStateFromRow(reviews.get(recordKey(summary.learnerId, summary.courseCode)));
    return {
      ...summary,
      reviewStatus: state.reviewStatus,
      contactStatus: state.contactStatus,
      nextAction: state.nextAction,
      followUpDate: state.followUpDate,
      followUpCompleted: state.followUpCompleted,
      lastUpdatedAt: state.lastUpdatedAt,
    };
  });
}

export async function loadRecordDetail(
  sessionId: string,
  learnerId: string,
  courseCode: string,
): Promise<RecordDetail | null> {
  const academic = seedData.findRecord(learnerId, courseCode);
  if (!academic) return null;
  const [saved] = await db
    .select()
    .from(workspaceReviewsTable)
    .where(and(
      eq(workspaceReviewsTable.sessionId, sessionId),
      eq(workspaceReviewsTable.learnerId, learnerId),
      eq(workspaceReviewsTable.courseCode, courseCode),
    ))
    .limit(1);
  const historyRows = await db
    .select()
    .from(workspaceHistoryTable)
    .where(and(
      eq(workspaceHistoryTable.sessionId, sessionId),
      eq(workspaceHistoryTable.learnerId, learnerId),
      eq(workspaceHistoryTable.courseCode, courseCode),
    ))
    .orderBy(desc(workspaceHistoryTable.effectiveDate), desc(workspaceHistoryTable.savedAt), desc(workspaceHistoryTable.id));
  return {
    ...seedData.makeAcademicDetail(academic),
    review: reviewStateFromRow(saved),
    history: historyRows.map((entry) => ({
      id: String(entry.id),
      actionType: entry.actionType,
      effectiveDate: dateAtMidnight(entry.effectiveDate)!,
      savedAt: entry.savedAt,
      academicCheckpoint: dateAtMidnight(entry.evidenceCheckpoint)!,
      method: entry.method,
      note: entry.note,
      summary: entry.summary,
    })),
  };
}

export async function supportActionsForRecord(
  sessionId: string,
  learnerId: string,
  courseCode: string,
) {
  const rows = await db
    .select()
    .from(supportActionsTable)
    .where(and(
      eq(supportActionsTable.sessionId, sessionId),
      eq(supportActionsTable.learnerId, learnerId),
      eq(supportActionsTable.courseCode, courseCode),
    ))
    .orderBy(desc(supportActionsTable.effectiveDate), desc(supportActionsTable.createdAt));
  return rows.map((row) => ({
    id: String(row.id),
    learnerId: row.learnerId,
    courseCode: row.courseCode,
    offeringPeriod: row.offeringPeriod,
    actionType: row.actionType as typeof row.actionType,
    destination: row.destination,
    details: row.details,
    progress: row.progress as typeof row.progress,
    followUpDate: dateAtMidnight(row.followUpDate),
    followUpCompleted: row.followUpCompleted,
    effectiveDate: dateAtMidnight(row.effectiveDate)!,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function conversationSummariesForRecord(
  sessionId: string,
  learnerId: string,
  courseCode: string,
) {
  const links = await db
    .select()
    .from(conversationRecordsTable)
    .where(and(
      eq(conversationRecordsTable.sessionId, sessionId),
      eq(conversationRecordsTable.learnerId, learnerId),
      eq(conversationRecordsTable.courseCode, courseCode),
    ));
  return Promise.all(links.map(async (link) => {
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(and(
        eq(conversationsTable.id, link.conversationId),
        eq(conversationsTable.sessionId, sessionId),
      ))
      .limit(1);
    if (!conversation) return null;
    const messages = await db
      .select()
      .from(conversationMessagesTable)
      .where(and(
        eq(conversationMessagesTable.sessionId, sessionId),
        eq(conversationMessagesTable.conversationId, conversation.id),
      ))
      .orderBy(desc(conversationMessagesTable.scenarioDate), desc(conversationMessagesTable.savedAt));
    if (messages.length === 0) return null;
    const linksForConversation = await db
      .select()
      .from(conversationRecordsTable)
      .where(and(
        eq(conversationRecordsTable.sessionId, sessionId),
        eq(conversationRecordsTable.conversationId, conversation.id),
      ));
    return {
      id: conversation.id,
      learnerId: conversation.learnerId,
      subject: conversation.subject,
      courseCodes: [...new Set(linksForConversation.map((item) => item.courseCode))],
      syntheticExample: conversation.syntheticExample,
      unreadCount: messages.filter((message) => message.direction === "incoming" && !message.read).length,
      lastMessageDate: dateAtMidnight(messages[0]!.scenarioDate)!,
      lastIncomingDate: dateAtMidnight(
        messages.find((message) => message.direction === "incoming")?.scenarioDate,
      ),
      messageCount: messages.length,
    };
  })).then((rows) => rows.filter((row): row is NonNullable<typeof row> => row != null));
}

export function academicCategoryKey(category: AcademicCategory): "highPriority" | "reviewRecommended" | "insufficientEvidence" | "noCurrentConcern" {
  switch (category) {
    case "High Priority": return "highPriority";
    case "Review Recommended": return "reviewRecommended";
    case "Insufficient Evidence": return "insufficientEvidence";
    default: return "noCurrentConcern";
  }
}

export function enrichRecordSummary(
  summary: RecordSummary,
  actions: (typeof supportActionsTable.$inferSelect)[],
) {
  const ordered = [...actions].sort((a, b) =>
    b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.valueOf() - a.createdAt.valueOf(),
  );
  const open = ordered.filter(
    (action) =>
      action.progress !== "Completed" &&
      action.progress !== "Cancelled" &&
      action.followUpDate != null &&
      !action.followUpCompleted,
  );
  const followUpDates = open.map((action) => action.followUpDate!);
  const reviewFollowUp = toIsoDate(summary.followUpDate);
  if (reviewFollowUp && !summary.followUpCompleted) followUpDates.push(reviewFollowUp);
  return {
    ...summary,
    supportActionCount: actions.length,
    latestSupportAction: ordered[0]?.actionType ?? null,
    supportProgress: (ordered[0]?.progress ?? null) as "Planned" | "In progress" | "Completed" | "Cancelled" | null,
    nextFollowUpDate: dateAtMidnight(followUpDates.sort()[0]),
    outstandingFollowUpCount: followUpDates.length,
  };
}