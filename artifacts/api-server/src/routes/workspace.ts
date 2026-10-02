import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, max } from "drizzle-orm";
import {
  CreateSupportActionBody,
  CreateSupportActionParams,
  CreateSupportActionResponse,
  GetRecordWorkspaceParams,
  GetRecordWorkspaceResponse,
  GetWorkspaceSummaryResponse,
  ListWorkspaceRecordsQueryParams,
  ListWorkspaceRecordsResponse,
  ListWorkspaceTrackerQueryParams,
  ListWorkspaceTrackerResponse,
  SaveWorkspaceReviewBody,
  SaveWorkspaceReviewParams,
  SaveWorkspaceReviewResponse,
  UpdateSupportActionBody,
  UpdateSupportActionParams,
  UpdateSupportActionResponse,
} from "@workspace/api-zod";
import type { AcademicCategories, AcademicCategory, RecordSummary, ReviewInput } from "@workspace/api-zod";
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
import { seedData } from "../lib/seed-data";
import {
  academicCategoryKey,
  conversationSummariesForRecord,
  dateAtMidnight,
  enrichRecordSummary,
  getSessionRecordSummaries,
  getSessionReviewMap,
  loadRecordDetail,
  recordKey,
  reviewStateFromRow,
  supportActionsForRecord,
  toIsoDate,
} from "../lib/workspace-data";
import { findRequestSession } from "../lib/workspace-session";

const router: IRouter = Router();
const DAY_ONE_UTC = Date.UTC(2026, 6, 20);
const FIRST_SCENARIO_DAY = 29;
const LAST_SCENARIO_DAY = 63;

function dayForDate(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return Math.round((parsed.valueOf() - DAY_ONE_UTC) / 86_400_000) + 1;
}

function dateForDay(day: number): string {
  return new Date(DAY_ONE_UTC + (day - 1) * 86_400_000).toISOString().slice(0, 10);
}

async function requireSession(req: Request, res: Response) {
  const session = await findRequestSession(req);
  if (!session) {
    res.status(401).json({ error: "Start or resume a workspace session first." });
    return null;
  }
  return session;
}

function emptyCategories(): AcademicCategories {
  return { highPriority: 0, reviewRecommended: 0, insufficientEvidence: 0, noCurrentConcern: 0 };
}

function matchesSearch(record: RecordSummary, value: string | undefined): boolean {
  const term = value?.trim().toLocaleLowerCase();
  if (!term) return true;
  return [
    record.learnerId,
    record.courseCode,
    record.paperTitle,
    record.department,
    record.reason,
    record.nextAction ?? "",
    record.reviewStatus,
    record.contactStatus,
  ].some((field) => field.toLocaleLowerCase().includes(term));
}

function matchesCommonFilters(
  record: RecordSummary,
  filters: {
    search?: string;
    paper?: string;
    department?: string;
    reviewStatus?: string;
    contactStatus?: string;
    category?: AcademicCategory;
  },
  includeCategory: boolean,
): boolean {
  if (!matchesSearch(record, filters.search)) return false;
  if (filters.paper &&
      !record.courseCode.toLocaleLowerCase().includes(filters.paper.toLocaleLowerCase()) &&
      !record.paperTitle.toLocaleLowerCase().includes(filters.paper.toLocaleLowerCase())) return false;
  if (filters.department && !record.department.toLocaleLowerCase().includes(filters.department.toLocaleLowerCase())) return false;
  if (filters.reviewStatus && record.reviewStatus !== filters.reviewStatus) return false;
  if (filters.contactStatus && record.contactStatus !== filters.contactStatus) return false;
  if (includeCategory && filters.category && record.category !== filters.category) return false;
  return true;
}

function sortRecords(records: RecordSummary[], sortBy: string, direction: "asc" | "desc") {
  const categoryRank = new Map(seedData.categoryOrder.map((value, index) => [value, index]));
  const statusRank = new Map([["Awaiting review", 0], ["In review", 1], ["Reviewed", 2]]);
  const valueFor = (record: RecordSummary): string | number => {
    switch (sortBy) {
      case "learnerId": return record.learnerId;
      case "paper": return `${record.paperTitle} ${record.courseCode}`;
      case "reason": return record.reason;
      case "reviewStatus": return statusRank.get(record.reviewStatus) ?? 0;
      default: return categoryRank.get(record.category) ?? 99;
    }
  };
  return [...records].sort((left, right) => {
    const a = valueFor(left);
    const b = valueFor(right);
    let comparison = typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "en");
    if (direction === "desc") comparison *= -1;
    return comparison ||
      left.learnerId.localeCompare(right.learnerId, "en") ||
      left.courseCode.localeCompare(right.courseCode, "en");
  });
}

function makeCounts(records: RecordSummary[]) {
  const recordCounts = emptyCategories();
  const learners = new Map<AcademicCategory, Set<string>>();
  for (const record of records) {
    recordCounts[academicCategoryKey(record.category)] += 1;
    const set = learners.get(record.category) ?? new Set<string>();
    set.add(record.learnerId);
    learners.set(record.category, set);
  }
  const learnerCounts = emptyCategories();
  for (const [category, ids] of learners) {
    learnerCounts[academicCategoryKey(category)] = ids.size;
  }
  return { recordCounts, learnerCounts };
}

function pageResult<T>(records: T[], page: number, pageSize: number) {
  return {
    records: records.slice((page - 1) * pageSize, page * pageSize),
    total: records.length,
    page,
    pageSize,
    totalPages: Math.ceil(records.length / pageSize),
  };
}

function queryNumbers(query: Request["query"]) {
  return {
    ...query,
    ...(query.page == null ? {} : { page: Number(query.page) }),
    ...(query.pageSize == null ? {} : { pageSize: Number(query.pageSize) }),
  };
}

async function allSupportActions(sessionId: string) {
  return db.select().from(supportActionsTable)
    .where(eq(supportActionsTable.sessionId, sessionId));
}

function isOutstandingAction(row: typeof supportActionsTable.$inferSelect): boolean {
  return row.progress !== "Completed" && row.progress !== "Cancelled";
}

async function latestRecordEvent(sessionId: string, learnerId: string, courseCode: string) {
  const [history] = await db.select({ value: max(workspaceHistoryTable.effectiveDate) })
    .from(workspaceHistoryTable)
    .where(and(
      eq(workspaceHistoryTable.sessionId, sessionId),
      eq(workspaceHistoryTable.learnerId, learnerId),
      eq(workspaceHistoryTable.courseCode, courseCode),
    ));
  const [actions] = await db.select({ value: max(supportActionsTable.effectiveDate) })
    .from(supportActionsTable)
    .where(and(
      eq(supportActionsTable.sessionId, sessionId),
      eq(supportActionsTable.learnerId, learnerId),
      eq(supportActionsTable.courseCode, courseCode),
    ));
  return [history?.value, actions?.value].filter((value): value is string => value != null).sort().at(-1) ?? null;
}

async function validateEffectiveDate(
  session: typeof workspaceSessionsTable.$inferSelect,
  learnerId: string,
  courseCode: string,
  effectiveDate: Date,
): Promise<string | null> {
  const effective = toIsoDate(effectiveDate);
  if (!effective) return "Enter a valid effective action date.";
  const day = dayForDate(effective);
  if (day == null || day < FIRST_SCENARIO_DAY || day > LAST_SCENARIO_DAY) {
    return "Action dates must fall between Day 29 and Day 63.";
  }
  if (day > session.scenarioDay) {
    return `This action is later than the session scenario date (${dateForDay(session.scenarioDay)}).`;
  }
  const latest = await latestRecordEvent(session.id, learnerId, courseCode);
  if (latest && effective < latest) {
    return `This action cannot be dated before the latest saved action (${latest}).`;
  }
  return null;
}

async function makeRecordWorkspace(sessionId: string, learnerId: string, courseCode: string) {
  const record = await loadRecordDetail(sessionId, learnerId, courseCode);
  if (!record) return null;
  const [allSummaries, supportActions, conversations] = await Promise.all([
    getSessionRecordSummaries(sessionId),
    supportActionsForRecord(sessionId, learnerId, courseCode),
    conversationSummariesForRecord(sessionId, learnerId, courseCode),
  ]);
  return {
    record,
    otherPapers: allSummaries.filter(
      (item) => item.learnerId === learnerId,
    ),
    supportActions,
    conversations,
  };
}

router.get("/workspace/summary", async (req, res): Promise<void> => {
  const session = await requireSession(req, res);
  if (!session) return;
  const [records, actions, messages] = await Promise.all([
    getSessionRecordSummaries(session.id),
    allSupportActions(session.id),
    db.select().from(conversationMessagesTable)
      .where(eq(conversationMessagesTable.sessionId, session.id)),
  ]);
  const uniqueLearners = new Set(records.map((record) => record.learnerId));
  const perCategoryLearners = new Map<AcademicCategory, Set<string>>();
  const perLearnerCategories = new Map<string, Set<AcademicCategory>>();
  for (const record of records) {
    const set = perCategoryLearners.get(record.category) ?? new Set<string>();
    set.add(record.learnerId);
    perCategoryLearners.set(record.category, set);
    const categories = perLearnerCategories.get(record.learnerId) ?? new Set<AcademicCategory>();
    categories.add(record.category);
    perLearnerCategories.set(record.learnerId, categories);
  }
  const academicCategoryLearners = emptyCategories();
  for (const [category, ids] of perCategoryLearners) {
    academicCategoryLearners[academicCategoryKey(category)] = ids.size;
  }
  const today = dateForDay(session.scenarioDay);
  const openReviews = records.filter(
    (record) => record.followUpDate && !record.followUpCompleted,
  );
  const openActions = actions.filter(isOutstandingAction);
  const dueFollowUps = [
    ...openReviews.map((record) => toIsoDate(record.followUpDate)),
    ...openActions.filter((action) => !action.followUpCompleted).map((action) => action.followUpDate),
  ].filter((date): date is string => date != null);
  const response = {
    learners: uniqueLearners.size,
    learnerPaperRecords: seedData.records.length,
    academicCategories: seedData.categoryCounts,
    reviewStatuses: {
      awaitingReview: records.filter((item) => item.reviewStatus === "Awaiting review").length,
      inReview: records.filter((item) => item.reviewStatus === "In review").length,
      reviewed: records.filter((item) => item.reviewStatus === "Reviewed").length,
    },
    followUpsDueToday: dueFollowUps.filter((date) => date === today).length,
    followUpsOverdue: dueFollowUps.filter((date) => date < today).length,
    demoDate: {
      day: session.scenarioDay,
      week: Math.floor((session.scenarioDay - 1) / 7) + 1,
      date: dateAtMidnight(today),
      dateLabel: new Intl.DateTimeFormat("en-NZ", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Pacific/Auckland",
      }).format(new Date(`${today}T00:00:00.000Z`)),
      evidenceThrough: dateAtMidnight(dateForDay(28)),
      evidenceDay: 28 as const,
    },
    academicCategoryLearners,
    unreadReplies: messages.filter((message) => message.direction === "incoming" && !message.read).length,
    scheduledFollowUps: dueFollowUps.length,
    outstandingSupportActions: openActions.length,
    mixedCategoryLearners: [...perLearnerCategories.values()].filter((set) => set.size > 1).length,
  };
  res.json(GetWorkspaceSummaryResponse.parse(response));
});

router.get("/workspace/records", async (req, res): Promise<void> => {
  const session = await requireSession(req, res);
  if (!session) return;
  const query = ListWorkspaceRecordsQueryParams.safeParse(queryNumbers(req.query));
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const [summaries, actions] = await Promise.all([
    getSessionRecordSummaries(session.id),
    allSupportActions(session.id),
  ]);
  const byRecord = new Map<string, typeof actions>();
  for (const action of actions) {
    const key = recordKey(action.learnerId, action.courseCode);
    const list = byRecord.get(key) ?? [];
    list.push(action);
    byRecord.set(key, list);
  }
  const all = summaries.map((summary) =>
    enrichRecordSummary(summary, byRecord.get(recordKey(summary.learnerId, summary.courseCode)) ?? []),
  );
  const filters = query.data;
  const countScopeRows = all.filter((record) => matchesCommonFilters(record, filters, false));
  const { recordCounts: categoryCounts, learnerCounts: categoryLearnerCounts } = makeCounts(countScopeRows);
  const matching = all.filter((record) => matchesCommonFilters(record, filters, true));
  const sorted = sortRecords(matching, filters.sortBy ?? "category", filters.sortDirection ?? "asc");
  const paged = pageResult(sorted, filters.page, filters.pageSize);
  res.json(ListWorkspaceRecordsResponse.parse({
    ...paged,
    totalDistinctLearners: new Set(sorted.map((record) => record.learnerId)).size,
    categoryCounts,
    categoryLearnerCounts,
    countScope: "Counts use all active filters except academic category, including contact status.",
  }));
});

router.get("/workspace/tracker", async (req, res): Promise<void> => {
  const session = await requireSession(req, res);
  if (!session) return;
  const query = ListWorkspaceTrackerQueryParams.safeParse(queryNumbers(req.query));
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const [summaries, actions] = await Promise.all([
    getSessionRecordSummaries(session.id),
    allSupportActions(session.id),
  ]);
  const byRecord = new Map<string, typeof actions>();
  for (const action of actions) {
    const key = recordKey(action.learnerId, action.courseCode);
    const list = byRecord.get(key) ?? [];
    list.push(action);
    byRecord.set(key, list);
  }
  const all = summaries.map((summary) =>
    enrichRecordSummary(summary, byRecord.get(recordKey(summary.learnerId, summary.courseCode)) ?? []),
  );
  const filters = query.data;
  const today = dateForDay(session.scenarioDay);
  let matching = all.filter((record) => matchesCommonFilters(record, filters, false));
  if (filters.followUp === "due") {
    matching = matching.filter((record) =>
      (toIsoDate(record.followUpDate) === today && !record.followUpCompleted) ||
      (byRecord.get(recordKey(record.learnerId, record.courseCode)) ?? []).some(
        (action) => isOutstandingAction(action) && !action.followUpCompleted && action.followUpDate === today,
      ),
    );
  } else if (filters.followUp === "overdue") {
    matching = matching.filter((record) =>
      (!!record.followUpDate && !record.followUpCompleted && (toIsoDate(record.followUpDate) ?? "9999") < today) ||
      (byRecord.get(recordKey(record.learnerId, record.courseCode)) ?? []).some(
        (action) => isOutstandingAction(action) && !action.followUpCompleted && action.followUpDate != null && action.followUpDate < today,
      ),
    );
  } else if (filters.followUp === "open") {
    matching = matching.filter((record) =>
      (!!record.followUpDate && !record.followUpCompleted && (toIsoDate(record.followUpDate) ?? "9999") <= today) ||
      (byRecord.get(recordKey(record.learnerId, record.courseCode)) ?? []).some(
        (action) => isOutstandingAction(action) && !action.followUpCompleted && action.followUpDate != null && action.followUpDate <= today,
      ),
    );
  }
  if (filters.supportProgress) {
    matching = matching.filter((record) =>
      (byRecord.get(recordKey(record.learnerId, record.courseCode)) ?? []).some(
        (action) => action.progress === filters.supportProgress,
      ),
    );
  }
  const { recordCounts: categoryCounts, learnerCounts: categoryLearnerCounts } = makeCounts(matching);
  const sorted = sortRecords(matching, "category", "asc");
  res.json(ListWorkspaceTrackerResponse.parse({
    ...pageResult(sorted, filters.page, filters.pageSize),
    totalDistinctLearners: new Set(sorted.map((record) => record.learnerId)).size,
    categoryCounts,
    categoryLearnerCounts,
    countScope: "Tracker counts use the current search, review, contact, follow-up, and support-progress filters.",
  }));
});

router.get("/workspace/records/:learnerId/:courseCode", async (req, res): Promise<void> => {
  const session = await requireSession(req, res);
  if (!session) return;
  const params = GetRecordWorkspaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await makeRecordWorkspace(session.id, params.data.learnerId, params.data.courseCode);
  if (!result) {
    res.status(404).json({ error: "Learner-paper record not found." });
    return;
  }
  res.json(GetRecordWorkspaceResponse.parse(result));
});

router.put("/workspace/records/:learnerId/:courseCode/review", async (req, res): Promise<void> => {
  const session = await requireSession(req, res);
  if (!session) return;
  const params = SaveWorkspaceReviewParams.safeParse(req.params);
  const parsed = SaveWorkspaceReviewBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: params.success ? parsed.error?.message : params.error?.message });
    return;
  }
  const { learnerId, courseCode } = params.data;
  if (!seedData.findRecord(learnerId, courseCode)) {
    res.status(404).json({ error: "Learner-paper record not found." });
    return;
  }
  const input: ReviewInput = parsed.data;
  const currentReview = (await getSessionReviewMap(session.id)).get(recordKey(learnerId, courseCode));
  const currentContactStatus = currentReview?.contactStatus ?? "Not contacted";
  if (
    input.contactStatus !== currentContactStatus &&
    input.contactStatus !== "No response recorded"
  ) {
    res.status(400).json({
      error: "Contact status changes only after a saved message or incoming reply; an advisor may explicitly record No response recorded.",
    });
    return;
  }
  const effective = toIsoDate(input.effectiveDate);
  const dateProblem = await validateEffectiveDate(session, learnerId, courseCode, input.effectiveDate);
  if (dateProblem || !effective) {
    res.status(400).json({ error: dateProblem ?? "Enter a valid effective action date." });
    return;
  }
  const followUp = toIsoDate(input.followUpDate);
  if (followUp) {
    const followDay = dayForDate(followUp);
    if (followDay == null || followDay < FIRST_SCENARIO_DAY || followDay > LAST_SCENARIO_DAY) {
      res.status(400).json({ error: "Follow-up dates must fall between Day 29 and Day 63." });
      return;
    }
  }
  const fields = {
    reviewStatus: input.reviewStatus,
    advisorNotes: input.advisorNotes,
    outcome: input.outcome,
    nextAction: input.nextAction,
    followUpDate: followUp,
    followUpCompleted: input.followUpCompleted,
    contactStatus: input.contactStatus,
    lastEffectiveDate: effective,
    updatedAt: new Date(),
  };
  const explicitNoResponse = input.contactStatus === "No response recorded";
  const outcomePart = input.outcome ? ` · ${input.outcome}` : "";
  const summary = [
    `Review saved · ${input.reviewStatus}${outcomePart}`,
    input.nextAction ? `Next action: ${input.nextAction}` : "No next action",
    `Contact: ${input.contactStatus}`,
  ].join(" · ");
  await db.transaction(async (tx) => {
    await tx.insert(workspaceReviewsTable)
      .values({ sessionId: session.id, learnerId, courseCode, ...fields })
      .onConflictDoUpdate({
        target: [workspaceReviewsTable.sessionId, workspaceReviewsTable.learnerId, workspaceReviewsTable.courseCode],
        set: fields,
      });
    await tx.insert(workspaceHistoryTable).values({
      sessionId: session.id,
      learnerId,
      courseCode,
      actionType: explicitNoResponse ? "no_response_recorded" : "review_saved",
      effectiveDate: effective,
      note: input.advisorNotes || null,
      summary: explicitNoResponse ? `${summary} · advisor explicitly recorded no response` : summary,
    });
  });
  const result = await makeRecordWorkspace(session.id, learnerId, courseCode);
  if (!result) {
    res.status(404).json({ error: "Learner-paper record not found." });
    return;
  }
  res.json(SaveWorkspaceReviewResponse.parse(result));
});

router.post("/workspace/records/:learnerId/:courseCode/support-actions", async (req, res): Promise<void> => {
  const session = await requireSession(req, res);
  if (!session) return;
  const params = CreateSupportActionParams.safeParse(req.params);
  const parsed = CreateSupportActionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: params.success ? parsed.error?.message : params.error?.message });
    return;
  }
  const { learnerId, courseCode } = params.data;
  const academic = seedData.findRecord(learnerId, courseCode);
  if (!academic) {
    res.status(404).json({ error: "Learner-paper record not found." });
    return;
  }
  const input = parsed.data;
  const effective = toIsoDate(input.effectiveDate);
  const dateProblem = await validateEffectiveDate(session, learnerId, courseCode, input.effectiveDate);
  if (dateProblem || !effective) {
    res.status(400).json({ error: dateProblem ?? "Enter a valid effective action date." });
    return;
  }
  const followUpDate = toIsoDate(input.followUpDate);
  if (followUpDate) {
    const followDay = dayForDate(followUpDate);
    if (followDay == null || followDay < FIRST_SCENARIO_DAY || followDay > LAST_SCENARIO_DAY) {
      res.status(400).json({ error: "Follow-up dates must fall between Day 29 and Day 63." });
      return;
    }
  }
  const [action] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(supportActionsTable).values({
      sessionId: session.id,
      learnerId,
      courseCode,
      offeringPeriod: academic.enrolment.course_offering_period,
      actionType: input.actionType,
      destination: input.destination,
      details: input.details,
      progress: input.progress,
      followUpDate,
      followUpCompleted: input.followUpCompleted,
      effectiveDate: effective,
      updatedAt: new Date(),
    }).returning();
    if (!created) throw new Error("Support action could not be saved.");
    await tx.insert(workspaceHistoryTable).values({
      sessionId: session.id,
      learnerId,
      courseCode,
      actionType: "support_action_created",
      effectiveDate: effective,
      method: input.destination,
      note: input.details,
      summary: `Support action saved · ${input.actionType} · ${input.progress}`,
    });
    return [created];
  });
  res.status(201).json(CreateSupportActionResponse.parse({
    ...action,
    id: String(action.id),
    followUpDate: dateAtMidnight(action.followUpDate),
    effectiveDate: dateAtMidnight(action.effectiveDate),
  }));
});

router.put("/workspace/support-actions/:actionId", async (req, res): Promise<void> => {
  const session = await requireSession(req, res);
  if (!session) return;
  const params = UpdateSupportActionParams.safeParse(req.params);
  const parsed = UpdateSupportActionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: params.success ? parsed.error?.message : params.error?.message });
    return;
  }
  const id = Number(params.data.actionId);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: "Support action ID is invalid." });
    return;
  }
  const [existing] = await db.select().from(supportActionsTable)
    .where(and(
      eq(supportActionsTable.id, id),
      eq(supportActionsTable.sessionId, session.id),
    ))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Support action not found in this workspace session." });
    return;
  }
  const input = parsed.data;
  const effective = toIsoDate(input.effectiveDate);
  const dateProblem = await validateEffectiveDate(session, existing.learnerId, existing.courseCode, input.effectiveDate);
  if (dateProblem || !effective) {
    res.status(400).json({ error: dateProblem ?? "Enter a valid effective action date." });
    return;
  }
  const followUpDate = toIsoDate(input.followUpDate);
  if (followUpDate) {
    const followDay = dayForDate(followUpDate);
    if (followDay == null || followDay < FIRST_SCENARIO_DAY || followDay > LAST_SCENARIO_DAY) {
      res.status(400).json({ error: "Follow-up dates must fall between Day 29 and Day 63." });
      return;
    }
  }
  const [saved] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(supportActionsTable).set({
      actionType: input.actionType,
      destination: input.destination,
      details: input.details,
      progress: input.progress,
      followUpDate,
      followUpCompleted: input.followUpCompleted,
      effectiveDate: effective,
      updatedAt: new Date(),
    }).where(and(
      eq(supportActionsTable.id, id),
      eq(supportActionsTable.sessionId, session.id),
    )).returning();
    if (!updated) return [undefined];
    await tx.insert(workspaceHistoryTable).values({
      sessionId: session.id,
      learnerId: existing.learnerId,
      courseCode: existing.courseCode,
      actionType: "support_action_updated",
      effectiveDate: effective,
      method: input.destination,
      note: input.details,
      summary: `Support action updated · ${input.actionType} · ${input.progress}`,
    });
    return [updated];
  });
  if (!saved) {
    res.status(404).json({ error: "Support action not found in this workspace session." });
    return;
  }
  res.json(UpdateSupportActionResponse.parse({
    ...saved,
    id: String(saved.id),
    followUpDate: dateAtMidnight(saved.followUpDate),
    effectiveDate: dateAtMidnight(saved.effectiveDate),
  }));
});

export default router;