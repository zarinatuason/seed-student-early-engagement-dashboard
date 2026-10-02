import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  CreateConversationBody,
  CreateConversationResponse,
  GetConversationParams,
  GetConversationResponse,
  ListConversationsQueryParams,
  ListConversationsResponse,
  MarkConversationReadParams,
  MarkConversationReadResponse,
  SendConversationMessageBody,
  SendConversationMessageParams,
  SendConversationMessageResponse,
} from "@workspace/api-zod";
import {
  conversationMessagesTable,
  conversationRecordsTable,
  conversationsTable,
  db,
  workspaceHistoryTable,
  workspaceReviewsTable,
  workspaceSessionsTable,
} from "@workspace/db";
import { makeConversationDetail, listConversationSummaries } from "../lib/conversation-data";
import { seedData } from "../lib/seed-data";
import { findRequestSession } from "../lib/workspace-session";

const router: IRouter = Router();

class IdempotencyRace extends Error {}

function scenarioDateForDay(day: number): string {
  const start = Date.UTC(2026, 6, 20);
  return new Date(start + (day - 1) * 86_400_000).toISOString().slice(0, 10);
}

function derivePrivateRecipient(learnerId: string): string {
  if (!seedData.records.some((record) => record.summary.learnerId === learnerId)) {
    throw new Error("Learner has no verified recipient identifier.");
  }
  // Internal-only simulated routing value; it is never persisted, returned, or logged.
  return `${learnerId.toLowerCase()}@seed.invalid`;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "en"));
}

async function existingClientMessage(sessionId: string, clientMessageId: string) {
  const [message] = await db.select().from(conversationMessagesTable).where(and(
    eq(conversationMessagesTable.sessionId, sessionId),
    eq(conversationMessagesTable.clientMessageId, clientMessageId),
  )).limit(1);
  return message ?? null;
}

async function matchesExistingSend(
  sessionId: string,
  clientMessageId: string,
  subject: string,
  body: string,
  conversationId: string | null,
  learnerId: string | null,
  courseCodes: string[] | null,
): Promise<string | null> {
  const message = await existingClientMessage(sessionId, clientMessageId);
  if (!message || message.direction !== "outgoing" || message.subject !== subject || message.body !== body) {
    return null;
  }
  if (conversationId && message.conversationId !== conversationId) return null;
  const [conversation] = await db.select().from(conversationsTable).where(and(
    eq(conversationsTable.id, message.conversationId),
    eq(conversationsTable.sessionId, sessionId),
  )).limit(1);
  if (!conversation || (learnerId && conversation.learnerId !== learnerId)) return null;
  if (courseCodes) {
    const links = await db.select().from(conversationRecordsTable).where(and(
      eq(conversationRecordsTable.sessionId, sessionId),
      eq(conversationRecordsTable.conversationId, conversation.id),
    ));
    if (JSON.stringify(sortedUnique(links.map((link) => link.courseCode))) !==
        JSON.stringify(sortedUnique(courseCodes))) return null;
  }
  return conversation.id;
}

async function createOutgoingMessage(input: {
  sessionId: string;
  conversationId: string;
  subject: string;
  body: string;
  clientMessageId: string;
  learnerId: string;
  courseCodes: string[];
  scenarioDay: number;
  createConversation: boolean;
}) {
  const academicLinks = input.courseCodes.map((courseCode) => {
    const academic = seedData.findRecord(input.learnerId, courseCode);
    if (!academic) throw new Error(`The learner is not verified as enrolled in ${courseCode}.`);
    return { courseCode, offeringPeriod: academic.enrolment.course_offering_period };
  });
  const scenarioDate = scenarioDateForDay(input.scenarioDay);
  return db.transaction(async (tx) => {
    if (input.createConversation) {
      await tx.insert(conversationsTable).values({
        id: input.conversationId,
        sessionId: input.sessionId,
        learnerId: input.learnerId,
        subject: input.subject,
        syntheticExample: false,
      });
      await tx.insert(conversationRecordsTable).values(academicLinks.map((link) => ({
        sessionId: input.sessionId,
        conversationId: input.conversationId,
        learnerId: input.learnerId,
        courseCode: link.courseCode,
        offeringPeriod: link.offeringPeriod,
      })));
    }
    const [message] = await tx.insert(conversationMessagesTable).values({
      id: randomUUID(),
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      direction: "outgoing",
      subject: input.subject,
      body: input.body,
      scenarioDate,
      read: true,
      advisorLabel: "Student Advisor",
      syntheticExample: false,
      clientMessageId: input.clientMessageId,
    }).onConflictDoNothing().returning();
    if (!message) throw new IdempotencyRace();

    await tx.update(conversationsTable).set({
      updatedAt: new Date(),
    }).where(and(
      eq(conversationsTable.id, input.conversationId),
      eq(conversationsTable.sessionId, input.sessionId),
    ));

    for (const link of academicLinks) {
      const [existingReview] = await tx.select().from(workspaceReviewsTable).where(and(
        eq(workspaceReviewsTable.sessionId, input.sessionId),
        eq(workspaceReviewsTable.learnerId, input.learnerId),
        eq(workspaceReviewsTable.courseCode, link.courseCode),
      )).limit(1);
      const fields = {
        reviewStatus: existingReview?.reviewStatus ?? "Awaiting review",
        advisorNotes: existingReview?.advisorNotes ?? "",
        outcome: existingReview?.outcome ?? null,
        nextAction: existingReview?.nextAction ?? null,
        followUpDate: existingReview?.followUpDate ?? null,
        followUpCompleted: existingReview?.followUpCompleted ?? false,
        contactStatus: "Awaiting response",
        lastEffectiveDate: scenarioDate,
        updatedAt: new Date(),
      };
      await tx.insert(workspaceReviewsTable).values({
        sessionId: input.sessionId,
        learnerId: input.learnerId,
        courseCode: link.courseCode,
        ...fields,
      }).onConflictDoUpdate({
        target: [
          workspaceReviewsTable.sessionId,
          workspaceReviewsTable.learnerId,
          workspaceReviewsTable.courseCode,
        ],
        set: fields,
      });
      await tx.insert(workspaceHistoryTable).values({
        sessionId: input.sessionId,
        learnerId: input.learnerId,
        courseCode: link.courseCode,
        actionType: "advisor_message_sent",
        effectiveDate: scenarioDate,
        summary: "Simulated advisor message saved.",
      });
    }
    return message;
  });
}

router.get("/conversations", async (req, res): Promise<void> => {
  const session = await findRequestSession(req);
  if (!session) {
    res.status(401).json({ error: "Start or resume a workspace session first." });
    return;
  }
  const raw = {
    ...req.query,
    unreadOnly:
      req.query.unreadOnly === "true" ? true :
      req.query.unreadOnly === "false" ? false :
      req.query.unreadOnly,
  };
  const query = ListConversationsQueryParams.safeParse(raw);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  let conversations = await listConversationSummaries(session.id, query.data.learnerId);
  if (query.data.unreadOnly) conversations = conversations.filter((row) => row.unreadCount > 0);
  conversations.sort((a, b) =>
    b.lastMessageDate.valueOf() - a.lastMessageDate.valueOf() ||
    a.learnerId.localeCompare(b.learnerId, "en"),
  );
  res.json(ListConversationsResponse.parse({
    conversations,
    unreadReplies: conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
  }));
});

router.post("/conversations", async (req, res): Promise<void> => {
  const session = await findRequestSession(req);
  if (!session) {
    res.status(401).json({ error: "Start or resume a workspace session first." });
    return;
  }
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const courseCodes = sortedUnique(input.courseCodes);
  if (courseCodes.length !== input.courseCodes.length || courseCodes.some(
    (courseCode) => !seedData.findRecord(input.learnerId, courseCode),
  )) {
    res.status(400).json({ error: "Choose distinct learner-paper records verified for this learner." });
    return;
  }
  let recipientAddress: string;
  try {
    recipientAddress = derivePrivateRecipient(input.learnerId);
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Verified recipient was not found." });
    return;
  }
  void recipientAddress;

  const duplicateId = await matchesExistingSend(
    session.id,
    input.clientMessageId,
    input.subject,
    input.body,
    null,
    input.learnerId,
    courseCodes,
  );
  if (duplicateId) {
    const detail = await makeConversationDetail(session.id, duplicateId);
    if (detail) {
      res.status(201).json(CreateConversationResponse.parse(detail));
      return;
    }
  } else if (await existingClientMessage(session.id, input.clientMessageId)) {
    res.status(409).json({ error: "clientMessageId was already used with a different message payload." });
    return;
  }

  const conversationId = randomUUID();
  try {
    await createOutgoingMessage({
      sessionId: session.id,
      conversationId,
      subject: input.subject,
      body: input.body,
      clientMessageId: input.clientMessageId,
      learnerId: input.learnerId,
      courseCodes,
      scenarioDay: session.scenarioDay,
      createConversation: true,
    });
  } catch (error) {
    if (!(error instanceof IdempotencyRace)) throw error;
    const duplicate = await matchesExistingSend(
      session.id,
      input.clientMessageId,
      input.subject,
      input.body,
      null,
      input.learnerId,
      courseCodes,
    );
    if (!duplicate) {
      res.status(409).json({ error: "clientMessageId was already used with a different message payload." });
      return;
    }
    const detail = await makeConversationDetail(session.id, duplicate);
    if (detail) {
      res.status(201).json(CreateConversationResponse.parse(detail));
      return;
    }
  }
  const detail = await makeConversationDetail(session.id, conversationId);
  if (!detail) {
    res.status(500).json({ error: "The conversation could not be loaded after saving." });
    return;
  }
  res.status(201).json(CreateConversationResponse.parse(detail));
});

router.get("/conversations/:conversationId", async (req, res): Promise<void> => {
  const session = await findRequestSession(req);
  if (!session) {
    res.status(401).json({ error: "Start or resume a workspace session first." });
    return;
  }
  const params = GetConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const detail = await makeConversationDetail(session.id, params.data.conversationId);
  if (!detail) {
    res.status(404).json({ error: "Conversation not found in this workspace session." });
    return;
  }
  res.json(GetConversationResponse.parse(detail));
});

router.post("/conversations/:conversationId/messages", async (req, res): Promise<void> => {
  const session = await findRequestSession(req);
  if (!session) {
    res.status(401).json({ error: "Start or resume a workspace session first." });
    return;
  }
  const params = SendConversationMessageParams.safeParse(req.params);
  const parsed = SendConversationMessageBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: params.success ? parsed.error?.message : params.error?.message });
    return;
  }
  const conversationId = params.data.conversationId;
  const [conversation] = await db.select().from(conversationsTable).where(and(
    eq(conversationsTable.id, conversationId),
    eq(conversationsTable.sessionId, session.id),
  )).limit(1);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found in this workspace session." });
    return;
  }
  const links = await db.select().from(conversationRecordsTable).where(and(
    eq(conversationRecordsTable.sessionId, session.id),
    eq(conversationRecordsTable.conversationId, conversationId),
  ));
  if (!links.length || links.some((link) => link.learnerId !== conversation.learnerId)) {
    res.status(409).json({ error: "Conversation links do not match the verified learner." });
    return;
  }
  let recipientAddress: string;
  try {
    recipientAddress = derivePrivateRecipient(conversation.learnerId);
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Verified recipient was not found." });
    return;
  }
  void recipientAddress;

  const input = parsed.data;
  const courseCodes = sortedUnique(links.map((link) => link.courseCode));
  const duplicate = await matchesExistingSend(
    session.id,
    input.clientMessageId,
    input.subject,
    input.body,
    conversationId,
    conversation.learnerId,
    courseCodes,
  );
  if (duplicate) {
    const detail = await makeConversationDetail(session.id, duplicate);
    if (detail) {
      res.status(201).json(SendConversationMessageResponse.parse(detail));
      return;
    }
  } else if (await existingClientMessage(session.id, input.clientMessageId)) {
    res.status(409).json({ error: "clientMessageId was already used with a different message payload." });
    return;
  }
  try {
    await createOutgoingMessage({
      sessionId: session.id,
      conversationId,
      subject: input.subject,
      body: input.body,
      clientMessageId: input.clientMessageId,
      learnerId: conversation.learnerId,
      courseCodes,
      scenarioDay: session.scenarioDay,
      createConversation: false,
    });
  } catch (error) {
    if (!(error instanceof IdempotencyRace)) throw error;
    const raced = await matchesExistingSend(
      session.id,
      input.clientMessageId,
      input.subject,
      input.body,
      conversationId,
      conversation.learnerId,
      courseCodes,
    );
    if (!raced) {
      res.status(409).json({ error: "clientMessageId was already used with a different message payload." });
      return;
    }
  }
  const detail = await makeConversationDetail(session.id, conversationId);
  if (!detail) {
    res.status(500).json({ error: "The conversation could not be loaded after saving." });
    return;
  }
  res.status(201).json(SendConversationMessageResponse.parse(detail));
});

router.post("/conversations/:conversationId/read", async (req, res): Promise<void> => {
  const session = await findRequestSession(req);
  if (!session) {
    res.status(401).json({ error: "Start or resume a workspace session first." });
    return;
  }
  const params = MarkConversationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conversation] = await db.select().from(conversationsTable).where(and(
    eq(conversationsTable.id, params.data.conversationId),
    eq(conversationsTable.sessionId, session.id),
  )).limit(1);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found in this workspace session." });
    return;
  }
  await db.update(conversationMessagesTable).set({ read: true }).where(and(
    eq(conversationMessagesTable.sessionId, session.id),
    eq(conversationMessagesTable.conversationId, conversation.id),
    eq(conversationMessagesTable.direction, "incoming"),
  ));
  const detail = await makeConversationDetail(session.id, conversation.id);
  if (!detail) {
    res.status(500).json({ error: "The conversation could not be loaded after marking replies read." });
    return;
  }
  res.json(MarkConversationReadResponse.parse(detail));
});

export default router;