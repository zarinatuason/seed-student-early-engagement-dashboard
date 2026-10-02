import { and, asc, eq } from "drizzle-orm";
import {
  conversationMessagesTable,
  conversationRecordsTable,
  conversationsTable,
  db,
} from "@workspace/db";
import { getSessionRecordSummaries, recordKey, dateAtMidnight } from "./workspace-data";

export async function makeConversationDetail(sessionId: string, conversationId: string) {
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(and(
      eq(conversationsTable.id, conversationId),
      eq(conversationsTable.sessionId, sessionId),
    ))
    .limit(1);
  if (!conversation) return null;

  const [links, messages, records] = await Promise.all([
    db.select().from(conversationRecordsTable)
      .where(and(
        eq(conversationRecordsTable.sessionId, sessionId),
        eq(conversationRecordsTable.conversationId, conversationId),
      )),
    db.select().from(conversationMessagesTable)
      .where(and(
        eq(conversationMessagesTable.sessionId, sessionId),
        eq(conversationMessagesTable.conversationId, conversationId),
      ))
      .orderBy(asc(conversationMessagesTable.scenarioDate), asc(conversationMessagesTable.savedAt), asc(conversationMessagesTable.id)),
    getSessionRecordSummaries(sessionId),
  ]);
  if (!messages.length) return null;
  const lastMessage = [...messages].sort((a, b) =>
    b.scenarioDate.localeCompare(a.scenarioDate) ||
    b.savedAt.valueOf() - a.savedAt.valueOf(),
  )[0]!;
  const lastIncoming = [...messages]
    .filter((message) => message.direction === "incoming")
    .sort((a, b) =>
      b.scenarioDate.localeCompare(a.scenarioDate) ||
      b.savedAt.valueOf() - a.savedAt.valueOf(),
    )[0];
  const linkedRecords = links.map((link) =>
    records.find((record) => recordKey(record.learnerId, record.courseCode) === recordKey(link.learnerId, link.courseCode)),
  ).filter((record): record is (typeof records)[number] => record != null);
  return {
    id: conversation.id,
    learnerId: conversation.learnerId,
    subject: conversation.subject,
    courseCodes: [...new Set(links.map((link) => link.courseCode))],
    syntheticExample: conversation.syntheticExample,
    unreadCount: messages.filter((message) => message.direction === "incoming" && !message.read).length,
    lastMessageDate: dateAtMidnight(lastMessage.scenarioDate)!,
    lastIncomingDate: dateAtMidnight(lastIncoming?.scenarioDate),
    messageCount: messages.length,
    messages: messages.map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      direction: message.direction as "outgoing" | "incoming",
      subject: message.subject,
      body: message.body,
      scenarioDate: dateAtMidnight(message.scenarioDate)!,
      savedAt: message.savedAt,
      read: message.read,
      advisorLabel: message.advisorLabel ?? (message.direction === "incoming" ? "Learner" : "Student Advisor"),
      syntheticExample: message.syntheticExample,
    })),
    linkedRecords,
  };
}

export async function listConversationSummaries(sessionId: string, learnerId?: string) {
  const conversations = await db.select().from(conversationsTable)
    .where(eq(conversationsTable.sessionId, sessionId));
  const results = await Promise.all(conversations
    .filter((conversation) => learnerId == null || conversation.learnerId === learnerId)
    .map(async (conversation) => {
      const detail = await makeConversationDetail(sessionId, conversation.id);
      if (!detail) return null;
      const {
        messages: _messages,
        linkedRecords: _linkedRecords,
        ...summary
      } = detail;
      return summary;
    }));
  return results.filter((result): result is NonNullable<typeof result> => result != null);
}