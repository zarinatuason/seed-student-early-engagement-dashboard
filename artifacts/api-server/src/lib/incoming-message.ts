import { randomUUID } from "node:crypto";
import { and, eq, max } from "drizzle-orm";
import {
  conversationMessagesTable,
  conversationRecordsTable,
  conversationsTable,
  db,
  supportActionsTable,
  workspaceHistoryTable,
  workspaceReviewsTable,
  workspaceSessionsTable,
} from "@workspace/db";

const DAY_ONE_UTC = Date.UTC(2026, 6, 20);

export function scenarioDateForDay(day: number): string {
  return new Date(DAY_ONE_UTC + (day - 1) * 86_400_000).toISOString().slice(0, 10);
}

export type IncomingMessageInput = {
  sessionId: string;
  conversationId: string;
  eventId: string;
  day: number;
  subject: string;
  text: string;
  syntheticExample?: boolean;
};

/**
 * Shared transaction for incoming messages from facilitator tooling and any
 * future simulated transport. Event IDs are session-scoped and payload reuse
 * is rejected unless the exact original event is being retried.
 */
export async function saveIncomingMessage(input: IncomingMessageInput) {
  if (!input.eventId.trim()) throw new Error("Incoming event ID is required.");
  if (!Number.isInteger(input.day) || input.day < 29 || input.day > 63) {
    throw new Error("Incoming message day must be between Day 29 and Day 63.");
  }
  if (typeof input.subject !== "string" || typeof input.text !== "string") {
    throw new Error("Incoming message subject and text must be strings.");
  }

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(workspaceSessionsTable)
      .where(eq(workspaceSessionsTable.id, input.sessionId))
      .limit(1);
    if (!session) throw new Error("Workspace session not found.");

    const [conversation] = await tx
      .select()
      .from(conversationsTable)
      .where(and(
        eq(conversationsTable.id, input.conversationId),
        eq(conversationsTable.sessionId, input.sessionId),
      ))
      .limit(1);
    if (!conversation) throw new Error("Conversation not found in this workspace session.");
    const links = await tx
      .select()
      .from(conversationRecordsTable)
      .where(and(
        eq(conversationRecordsTable.sessionId, input.sessionId),
        eq(conversationRecordsTable.conversationId, input.conversationId),
      ));
    if (links.length === 0) throw new Error("Conversation has no linked learner-paper records.");

    const savedAtScenarioDate = scenarioDateForDay(input.day);
    if (input.day > session.scenarioDay) {
      throw new Error("Incoming message date cannot be later than the session scenario date.");
    }

    const [existing] = await tx
      .select()
      .from(conversationMessagesTable)
      .where(and(
        eq(conversationMessagesTable.sessionId, input.sessionId),
        eq(conversationMessagesTable.incomingEventId, input.eventId),
      ))
      .limit(1);
    if (existing) {
      if (
        existing.conversationId !== input.conversationId ||
        existing.subject !== input.subject ||
        existing.body !== input.text ||
        existing.scenarioDate !== savedAtScenarioDate
      ) {
        throw new Error("Incoming event ID was already used with a different payload.");
      }
      return existing;
    }
    const [latestHistory] = await tx
      .select({ date: max(workspaceHistoryTable.effectiveDate) })
      .from(workspaceHistoryTable)
      .where(eq(workspaceHistoryTable.sessionId, input.sessionId));
    const [latestAction] = await tx
      .select({ date: max(supportActionsTable.effectiveDate) })
      .from(supportActionsTable)
      .where(eq(supportActionsTable.sessionId, input.sessionId));
    const [latestMessage] = await tx
      .select({ date: max(conversationMessagesTable.scenarioDate) })
      .from(conversationMessagesTable)
      .where(eq(conversationMessagesTable.sessionId, input.sessionId));
    const latestSavedDate = [
      latestHistory?.date,
      latestAction?.date,
      latestMessage?.date,
    ].filter((date): date is string => date != null).sort().at(-1);
    if (latestSavedDate && savedAtScenarioDate < latestSavedDate) {
      throw new Error(`Incoming message date cannot be before the latest saved event (${latestSavedDate}).`);
    }

    const [message] = await tx
      .insert(conversationMessagesTable)
      .values({
        id: randomUUID(),
        sessionId: input.sessionId,
        conversationId: input.conversationId,
        direction: "incoming",
        subject: input.subject,
        body: input.text,
        scenarioDate: savedAtScenarioDate,
        read: false,
        incomingEventId: input.eventId,
        syntheticExample: input.syntheticExample ?? false,
      })
      .onConflictDoNothing()
      .returning();

    // A concurrent retry may have won the unique event-id index.
    if (!message) {
      const [raced] = await tx
        .select()
        .from(conversationMessagesTable)
        .where(and(
          eq(conversationMessagesTable.sessionId, input.sessionId),
          eq(conversationMessagesTable.incomingEventId, input.eventId),
        ))
        .limit(1);
      if (
        !raced ||
        raced.conversationId !== input.conversationId ||
        raced.subject !== input.subject ||
        raced.body !== input.text ||
        raced.scenarioDate !== savedAtScenarioDate
      ) {
        throw new Error("Incoming event ID was already used with a different payload.");
      }
      return raced;
    }

    for (const link of links) {
      const [currentReview] = await tx
        .select()
        .from(workspaceReviewsTable)
        .where(and(
          eq(workspaceReviewsTable.sessionId, input.sessionId),
          eq(workspaceReviewsTable.learnerId, link.learnerId),
          eq(workspaceReviewsTable.courseCode, link.courseCode),
        ))
        .limit(1);
      const reviewFields = {
        reviewStatus: currentReview?.reviewStatus ?? "Awaiting review",
        advisorNotes: currentReview?.advisorNotes ?? "",
        outcome: currentReview?.outcome ?? null,
        nextAction: currentReview?.nextAction ?? null,
        followUpDate: currentReview?.followUpDate ?? null,
        followUpCompleted: currentReview?.followUpCompleted ?? false,
        contactStatus: "Response received",
        lastEffectiveDate: savedAtScenarioDate,
        updatedAt: new Date(),
      };
      await tx
        .insert(workspaceReviewsTable)
        .values({
          sessionId: input.sessionId,
          learnerId: link.learnerId,
          courseCode: link.courseCode,
          ...reviewFields,
        })
        .onConflictDoUpdate({
          target: [
            workspaceReviewsTable.sessionId,
            workspaceReviewsTable.learnerId,
            workspaceReviewsTable.courseCode,
          ],
          set: reviewFields,
        });
      await tx.insert(workspaceHistoryTable).values({
        sessionId: input.sessionId,
        learnerId: link.learnerId,
        courseCode: link.courseCode,
        actionType: "incoming_message_received",
        effectiveDate: savedAtScenarioDate,
        summary: "Learner reply received in SEED Inbox.",
      });
    }
    return message;
  });
}