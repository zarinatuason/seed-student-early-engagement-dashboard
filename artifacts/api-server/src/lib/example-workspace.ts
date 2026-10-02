import { and, eq } from "drizzle-orm";
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
import { seedData } from "./seed-data";
import { saveIncomingMessage, scenarioDateForDay } from "./incoming-message";

const EXAMPLES = [
  {
    learnerId: "STU000029",
    courseCode: "BIOSCI201",
    suffix: "one",
    subject: "A quick check-in about BIOSCI201",
    outgoingBody:
      "Hello, I’m checking in about BIOSCI201. The Day 28 activity suggests there may be a few areas worth discussing. Is there anything about the assessment requirements you would like help clarifying?",
    incomingSubject: "Re: A quick check-in about BIOSCI201",
    incomingBody:
      "Thanks for checking in. I have been finding the assessment requirements a little difficult to understand, and would appreciate some guidance on what to focus on next.",
  },
  {
    learnerId: "STU000530",
    courseCode: "SOFTENG100",
    suffix: "two",
    subject: "Checking in about SOFTENG100",
    outgoingBody:
      "Hello, I’m checking in about SOFTENG100. I noticed the Day 28 activity may be worth discussing. Please let me know if you would like to talk through the next assessment or available study support.",
  },
] as const;

/**
 * Create only the prepared, deterministic example rows that are missing.
 * Existing example or tester content is never updated or replaced.
 */
export async function setupExampleWorkspace(sessionId: string): Promise<void> {
  const [session] = await db
    .select()
    .from(workspaceSessionsTable)
    .where(eq(workspaceSessionsTable.id, sessionId))
    .limit(1);
  if (!session) throw new Error("Workspace session not found.");

  const preparedIncoming: Array<{
    conversationId: string;
    eventId: string;
    subject: string;
    text: string;
  }> = [];

  for (const example of EXAMPLES) {
    const academic = seedData.findRecord(example.learnerId, example.courseCode);
    if (!academic || academic.summary.category !== "High Priority") {
      throw new Error(`The verified High Priority example ${example.learnerId}/${example.courseCode} is unavailable.`);
    }
    const conversationId = `seed-example-${sessionId}-${example.suffix}`;
    const eventId = `seed-example-${sessionId}-${example.suffix}-incoming`;
    const date = scenarioDateForDay(28);
    await db.transaction(async (tx) => {
      const [existingConversation] = await tx
        .select()
        .from(conversationsTable)
        .where(and(
          eq(conversationsTable.id, conversationId),
          eq(conversationsTable.sessionId, sessionId),
        ))
        .limit(1);
      if (!existingConversation) {
        await tx.insert(conversationsTable).values({
          id: conversationId,
          sessionId,
          learnerId: example.learnerId,
          subject: example.subject,
          syntheticExample: true,
        });
      } else if (existingConversation.learnerId !== example.learnerId) {
        throw new Error("Prepared example conversation ID is linked to an unexpected learner.");
      }
      const [existingLink] = await tx
        .select()
        .from(conversationRecordsTable)
        .where(and(
          eq(conversationRecordsTable.sessionId, sessionId),
          eq(conversationRecordsTable.conversationId, conversationId),
          eq(conversationRecordsTable.learnerId, example.learnerId),
          eq(conversationRecordsTable.courseCode, example.courseCode),
          eq(conversationRecordsTable.offeringPeriod, academic.enrolment.course_offering_period),
        ))
        .limit(1);
      if (!existingLink) {
        await tx.insert(conversationRecordsTable).values({
          sessionId,
          conversationId,
          learnerId: example.learnerId,
          courseCode: example.courseCode,
          offeringPeriod: academic.enrolment.course_offering_period,
        }).onConflictDoNothing();
      }

      const [existingOutgoing] = await tx
        .select()
        .from(conversationMessagesTable)
        .where(and(
          eq(conversationMessagesTable.sessionId, sessionId),
          eq(conversationMessagesTable.clientMessageId, `seed-example-${sessionId}-${example.suffix}-advisor`),
        ))
        .limit(1);
      if (!existingOutgoing) {
        await tx.insert(conversationMessagesTable).values({
          id: `${conversationId}-advisor`,
          sessionId,
          conversationId,
          direction: "outgoing",
          subject: example.subject,
          body: example.outgoingBody,
          scenarioDate: date,
          advisorLabel: "Example advisor",
          syntheticExample: true,
          clientMessageId: `seed-example-${sessionId}-${example.suffix}-advisor`,
        }).onConflictDoNothing();
        await tx.insert(workspaceHistoryTable).values({
          sessionId,
          learnerId: example.learnerId,
          courseCode: example.courseCode,
          actionType: "advisor_message_sent",
          effectiveDate: date,
          summary: "Synthetic example advisor message sent.",
        });
      }

      const [review] = await tx
        .select()
        .from(workspaceReviewsTable)
        .where(and(
          eq(workspaceReviewsTable.sessionId, sessionId),
          eq(workspaceReviewsTable.learnerId, example.learnerId),
          eq(workspaceReviewsTable.courseCode, example.courseCode),
        ))
        .limit(1);
      if (!review) {
        await tx.insert(workspaceReviewsTable).values({
          sessionId,
          learnerId: example.learnerId,
          courseCode: example.courseCode,
          reviewStatus: "Awaiting review",
          contactStatus: example.suffix === "one" ? "Response received" : "Awaiting response",
          lastEffectiveDate: date,
        }).onConflictDoNothing();
      }

      if (example.suffix === "two") {
        const [exampleAction] = await tx.insert(supportActionsTable).values({
          sessionId,
          learnerId: example.learnerId,
          courseCode: example.courseCode,
          offeringPeriod: academic.enrolment.course_offering_period,
          actionType: "Check in later",
          destination: null,
          details: null,
          progress: "Planned",
          followUpDate: scenarioDateForDay(33),
          followUpCompleted: false,
          effectiveDate: scenarioDateForDay(29),
          setupKey: `seed-example-${sessionId}-two-follow-up`,
        }).onConflictDoNothing().returning();
        if (exampleAction) {
          await tx.insert(workspaceHistoryTable).values({
            sessionId,
            learnerId: example.learnerId,
            courseCode: example.courseCode,
            actionType: "support_action_created",
            effectiveDate: scenarioDateForDay(29),
            note: null,
            summary: "Synthetic example support action planned · Check in later.",
          });
        }
      }
    });
    if (example.suffix === "one" && "incomingSubject" in example) {
      preparedIncoming.push({
        conversationId,
        eventId,
        subject: example.incomingSubject,
        text: example.incomingBody,
      });
    }
  }

  for (const incoming of preparedIncoming) {
    await saveIncomingMessage({
      sessionId,
      conversationId: incoming.conversationId,
      eventId: incoming.eventId,
      day: 29,
      subject: incoming.subject,
      text: incoming.text,
      syntheticExample: true,
    });
  }
}