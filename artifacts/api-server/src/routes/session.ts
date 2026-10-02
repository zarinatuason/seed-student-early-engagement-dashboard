import { Router, type IRouter } from "express";
import { and, eq, max } from "drizzle-orm";
import {
  GetSessionResponse,
  ResetSessionBody,
  ResetSessionResponse,
  ResumeSessionBody,
  ResumeSessionResponse,
  SetScenarioDateBody,
  SetScenarioDateResponse,
  StartSessionBody,
  StartSessionResponse,
} from "@workspace/api-zod";
import {
  conversationMessagesTable,
  db,
  supportActionsTable,
  workspaceHistoryTable,
  workspaceSessionsTable,
} from "@workspace/db";
import { setupExampleWorkspace } from "../lib/example-workspace";
import {
  createWorkspaceSession,
  deleteSessionWorkflowData,
  findRequestSession,
  findSessionByResumeCode,
  getResumeCode,
  setSessionCookie,
} from "../lib/workspace-session";

const router: IRouter = Router();
const FIRST_SCENARIO_DAY = 29;
const LAST_SCENARIO_DAY = 63;
const DAY_ONE_UTC = Date.UTC(2026, 6, 20);

function dateForDay(day: number): string {
  return new Date(DAY_ONE_UTC + (day - 1) * 86_400_000).toISOString().slice(0, 10);
}

function scenarioDate(day: number) {
  const date = dateForDay(day);
  const instant = new Date(`${date}T00:00:00.000Z`);
  return {
    day,
    week: Math.floor((day - 1) / 7) + 1,
    date,
    dateLabel: new Intl.DateTimeFormat("en-NZ", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Pacific/Auckland",
    }).format(instant),
    evidenceThrough: dateForDay(28),
    evidenceDay: 28,
  };
}

function sessionInfo(session: typeof workspaceSessionsTable.$inferSelect, resumeCode: string) {
  return {
    id: session.id,
    label: session.label,
    resumeCode,
    scenarioDate: scenarioDate(session.scenarioDay),
    examples: [
      {
        learnerId: "STU000029",
        courseCode: "BIOSCI201",
        conversationId: `seed-example-${session.id}-one`,
        label: "Synthetic example",
      },
      {
        learnerId: "STU000530",
        courseCode: "SOFTENG100",
        conversationId: `seed-example-${session.id}-two`,
        label: "Synthetic example",
      },
    ],
  };
}

async function initializeSession(label: string) {
  const created = await createWorkspaceSession(label);
  await setupExampleWorkspace(created.session.id);
  return created;
}

router.get("/session", async (req, res): Promise<void> => {
  let session = await findRequestSession(req);
  let resumeCode: string | null = null;
  if (!session) {
    const created = await initializeSession("Student Advisor session");
    session = created.session;
    resumeCode = created.resumeCode;
    setSessionCookie(res, created.resumeCode);
  } else {
    resumeCode = getResumeCode(req);
    await setupExampleWorkspace(session.id);
  }
  res.json(GetSessionResponse.parse(sessionInfo(session, resumeCode ?? "")));
});

router.post("/session", async (req, res): Promise<void> => {
  const parsed = StartSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const created = await initializeSession(parsed.data.label.trim());
  setSessionCookie(res, created.resumeCode);
  res.status(201).json(StartSessionResponse.parse(sessionInfo(created.session, created.resumeCode)));
});

router.post("/session/resume", async (req, res): Promise<void> => {
  const parsed = ResumeSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const resumeCode = parsed.data.resumeCode;
  const session = await findSessionByResumeCode(resumeCode);
  if (!session) {
    res.status(401).json({ error: "That session resume code was not recognized." });
    return;
  }
  await setupExampleWorkspace(session.id);
  setSessionCookie(res, resumeCode);
  res.json(ResumeSessionResponse.parse(sessionInfo(session, resumeCode)));
});

router.post("/session/reset", async (req, res): Promise<void> => {
  const parsed = ResetSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const session = await findRequestSession(req);
  if (!session) {
    res.status(401).json({ error: "Start or resume a session before resetting it." });
    return;
  }
  await db.transaction(async (tx) => {
    await deleteSessionWorkflowData(tx, session.id);
    await tx
      .update(workspaceSessionsTable)
      .set({ scenarioDay: FIRST_SCENARIO_DAY, updatedAt: new Date() })
      .where(eq(workspaceSessionsTable.id, session.id));
  });
  await setupExampleWorkspace(session.id);
  const [resetSession] = await db
    .select()
    .from(workspaceSessionsTable)
    .where(eq(workspaceSessionsTable.id, session.id))
    .limit(1);
  if (!resetSession) {
    res.status(500).json({ error: "The session could not be restored after reset." });
    return;
  }
  res.json(ResetSessionResponse.parse(sessionInfo(resetSession, getResumeCode(req) ?? "")));
});

router.put("/session/date", async (req, res): Promise<void> => {
  const parsed = SetScenarioDateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const session = await findRequestSession(req);
  if (!session) {
    res.status(401).json({ error: "Start or resume a session before changing its scenario date." });
    return;
  }
  const day = parsed.data.day;
  const effectiveDates = await Promise.all([
    db.select({ date: max(workspaceHistoryTable.effectiveDate) })
      .from(workspaceHistoryTable)
      .where(eq(workspaceHistoryTable.sessionId, session.id)),
    db.select({ date: max(supportActionsTable.effectiveDate) })
      .from(supportActionsTable)
      .where(eq(supportActionsTable.sessionId, session.id)),
    db.select({ date: max(conversationMessagesTable.scenarioDate) })
      .from(conversationMessagesTable)
      .where(eq(conversationMessagesTable.sessionId, session.id)),
  ]);
  const latestSavedEvent = effectiveDates
    .map(([row]) => row?.date ?? null)
    .filter((date): date is string => date != null)
    .sort()
    .at(-1);
  if (latestSavedEvent && dateForDay(day) < latestSavedEvent) {
    res.status(409).json({
      error: `The scenario date cannot move earlier than the latest saved event (${latestSavedEvent}).`,
    });
    return;
  }
  const [updated] = await db
    .update(workspaceSessionsTable)
    .set({ scenarioDay: day, updatedAt: new Date() })
    .where(and(
      eq(workspaceSessionsTable.id, session.id),
      eq(workspaceSessionsTable.scenarioDay, session.scenarioDay),
    ))
    .returning();
  if (!updated) {
    res.status(409).json({ error: "The workspace session changed; refresh and try again." });
    return;
  }
  res.json(SetScenarioDateResponse.parse(scenarioDate(updated.scenarioDay)));
});

export default router;