import { createHash, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
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

export const SESSION_COOKIE_NAME = "seed_resume";
const SESSION_COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 365;

export type WorkspaceSession = typeof workspaceSessionsTable.$inferSelect;

export function hashResumeCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export function issueResumeCode(): string {
  return randomBytes(32).toString("base64url");
}

export function setSessionCookie(response: Response, resumeCode: string): void {
  response.cookie(SESSION_COOKIE_NAME, resumeCode, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export function getResumeCode(request: Request): string | null {
  const cookies = request.headers.cookie?.split(";") ?? [];
  for (const item of cookies) {
    const separator = item.indexOf("=");
    if (separator < 0 || item.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim()) || null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function findSessionByResumeCode(code: string): Promise<WorkspaceSession | null> {
  const [session] = await db
    .select()
    .from(workspaceSessionsTable)
    .where(eq(workspaceSessionsTable.resumeTokenHash, hashResumeCode(code)))
    .limit(1);
  return session ?? null;
}

export async function findRequestSession(request: Request): Promise<WorkspaceSession | null> {
  const code = getResumeCode(request);
  return code ? findSessionByResumeCode(code) : null;
}

export async function createWorkspaceSession(label: string) {
  const resumeCode = issueResumeCode();
  const [session] = await db
    .insert(workspaceSessionsTable)
    .values({
      id: randomUUID(),
      label: label.trim(),
      resumeTokenHash: hashResumeCode(resumeCode),
    })
    .returning();
  if (!session) throw new Error("The workspace session could not be created.");
  return { session, resumeCode };
}

export async function deleteSessionWorkflowData(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sessionId: string,
): Promise<void> {
  await transaction.delete(conversationMessagesTable).where(eq(conversationMessagesTable.sessionId, sessionId));
  await transaction.delete(conversationRecordsTable).where(eq(conversationRecordsTable.sessionId, sessionId));
  await transaction.delete(conversationsTable).where(eq(conversationsTable.sessionId, sessionId));
  await transaction.delete(supportActionsTable).where(eq(supportActionsTable.sessionId, sessionId));
  await transaction.delete(workspaceHistoryTable).where(eq(workspaceHistoryTable.sessionId, sessionId));
  await transaction.delete(workspaceReviewsTable).where(eq(workspaceReviewsTable.sessionId, sessionId));
}