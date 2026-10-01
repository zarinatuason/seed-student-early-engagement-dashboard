import { Router, type IRouter, type Response } from "express";
import { and, desc, eq, max } from "drizzle-orm";
import {
  GetAdvisorSummaryResponse,
  GetDemoDateResponse,
  GetRecordParams,
  GetRecordResponse,
  GetReferenceGuideResponse,
  ListRecordsQueryParams,
  ListRecordsResponse,
  ListTrackerQueryParams,
  ListTrackerResponse,
  LogContactBody,
  LogContactParams,
  LogContactResponse,
  LogResponseBody,
  LogResponseParams,
  LogResponseResponse,
  SaveReviewBody,
  SaveReviewParams,
  SaveReviewResponse,
  SetDemoDateBody,
  SetDemoDateResponse,
} from "@workspace/api-zod";
import type {
  AcademicCategories,
  AcademicCategory,
  AdvisorSummary,
  ContactInput,
  ContactStatus,
  DemoDate,
  RecordDetail,
  RecordSummary,
  ReferenceGuide,
  ResponseInput,
  ReviewInput,
  ReviewOutcome,
  ReviewState,
  ReviewStatus,
  TrackerPage,
} from "@workspace/api-zod";
import {
  advisorHistoryTable,
  advisorReviewsTable,
  db,
  demoSettingsTable,
} from "@workspace/db";
import { seedData } from "../lib/seed-data";

const router: IRouter = Router();
const DAY_ONE_UTC = Date.UTC(2026, 6, 20);
const DEMO_FIRST_DAY = 29;
const DEMO_LAST_DAY = 35;
const DEFAULT_REVIEW: ReviewState = {
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

type ReviewRow = typeof advisorReviewsTable.$inferSelect;
type HistoryRow = typeof advisorHistoryTable.$inferSelect;
type ReviewFields = Omit<
  typeof advisorReviewsTable.$inferInsert,
  "learnerId" | "courseCode"
>;
type RecordFilters = {
  search?: string;
  paper?: string;
  department?: string;
  category?: AcademicCategory;
  reviewStatus?: ReviewStatus;
};

function isoDate(date: Date | string | null): string | null {
  if (date == null) return null;
  if (typeof date === "string") return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function dateAtMidnight(date: string | null): Date | null {
  return date == null ? null : new Date(`${date}T00:00:00.000Z`);
}

function dateForDay(day: number): string {
  return new Date(DAY_ONE_UTC + (day - 1) * 86_400_000).toISOString().slice(0, 10);
}

function dayForDate(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    return null;
  }
  const diff = Math.round((parsed.valueOf() - DAY_ONE_UTC) / 86_400_000) + 1;
  return diff;
}

function calendarInputError(body: unknown): string | null {
  if (!body || typeof body !== "object") return "Enter valid calendar dates.";
  const fields = body as Record<string, unknown>;
  if (typeof fields.effectiveDate !== "string" || dayForDate(fields.effectiveDate) == null) {
    return "Effective date must be a valid calendar date in YYYY-MM-DD format.";
  }
  if (fields.followUpDate != null &&
      (typeof fields.followUpDate !== "string" || dayForDate(fields.followUpDate) == null)) {
    return "Follow-up date must be a valid calendar date in YYYY-MM-DD format.";
  }
  return null;
}

function dayLabel(day: number): string {
  const date = dateForDay(day);
  const instant = new Date(`${date}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Pacific/Auckland",
  }).format(instant);
}

function demoDate(day: number): DemoDate {
  return {
    day,
    week: 5,
    date: dateAtMidnight(dateForDay(day))!,
    dateLabel: dayLabel(day),
    evidenceThrough: dateAtMidnight(dateForDay(28))!,
    evidenceDay: 28,
  };
}

async function getSetting(): Promise<number> {
  await db
    .insert(demoSettingsTable)
    .values({ id: 1, day: DEMO_FIRST_DAY })
    .onConflictDoNothing();
  const [setting] = await db
    .select()
    .from(demoSettingsTable)
    .where(eq(demoSettingsTable.id, 1))
    .limit(1);
  if (!setting || setting.day < DEMO_FIRST_DAY || setting.day > DEMO_LAST_DAY) {
    throw new Error("The saved SEED demonstration calendar setting is invalid.");
  }
  return setting.day;
}

async function getAllReviews(): Promise<Map<string, ReviewRow>> {
  const rows = await db.select().from(advisorReviewsTable);
  return new Map(rows.map((row) => [`${row.learnerId}\u001f${row.courseCode}`, row]));
}

function stateFromRow(row: ReviewRow | undefined): ReviewState {
  if (!row) return { ...DEFAULT_REVIEW };
  return {
    reviewStatus: row.reviewStatus as ReviewStatus,
    advisorNotes: row.advisorNotes,
    outcome: row.outcome as ReviewOutcome | null,
    nextAction: row.nextAction,
    followUpDate: dateAtMidnight(row.followUpDate),
    followUpCompleted: row.followUpCompleted,
    contactStatus: row.contactStatus as ContactStatus,
    lastUpdatedAt: row.updatedAt,
    lastEffectiveDate: dateAtMidnight(row.lastEffectiveDate),
  };
}

function recordSummary(
  record: (typeof seedData.records)[number],
  saved: ReviewRow | undefined,
): RecordSummary {
  const state = stateFromRow(saved);
  return {
    ...record.summary,
    reviewStatus: state.reviewStatus,
    contactStatus: state.contactStatus,
    nextAction: state.nextAction,
    followUpDate: state.followUpDate,
    followUpCompleted: state.followUpCompleted,
    lastUpdatedAt: state.lastUpdatedAt,
  };
}

function recordSearchMatch(record: RecordSummary, search: string): boolean {
  const term = search.trim().toLocaleLowerCase();
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
  ].some((value) => value.toLocaleLowerCase().includes(term));
}

function matchesAcademicFilters(
  record: RecordSummary,
  filters: RecordFilters,
  includeCategory: boolean,
): boolean {
  if (filters.search && !recordSearchMatch(record, filters.search)) return false;
  if (
    filters.paper &&
    !record.courseCode.toLocaleLowerCase().includes(filters.paper.toLocaleLowerCase()) &&
    !record.paperTitle.toLocaleLowerCase().includes(filters.paper.toLocaleLowerCase())
  ) {
    return false;
  }
  if (filters.department && !record.department.toLocaleLowerCase().includes(filters.department.toLocaleLowerCase())) return false;
  if (filters.reviewStatus && record.reviewStatus !== filters.reviewStatus) return false;
  if (includeCategory && filters.category && record.category !== filters.category) return false;
  return true;
}

function sortRecords(
  records: RecordSummary[],
  sortBy: string,
  sortDirection: "asc" | "desc",
): RecordSummary[] {
  const categoryRank = new Map<string, number>(
    seedData.categoryOrder.map((category, index) => [category, index]),
  );
  const statusRank = new Map<string, number>([
    ["Awaiting review", 0],
    ["In review", 1],
    ["Reviewed", 2],
  ]);
  const valueFor = (record: RecordSummary): string | number => {
    switch (sortBy) {
      case "learnerId":
        return record.learnerId;
      case "paper":
        return `${record.paperTitle} ${record.courseCode}`;
      case "reason":
        return record.reason;
      case "reviewStatus":
        return statusRank.get(record.reviewStatus) ?? 0;
      case "category":
      default:
        return categoryRank.get(record.category) ?? 99;
    }
  };
  return [...records].sort((left, right) => {
    const leftValue = valueFor(left);
    const rightValue = valueFor(right);
    let result =
      typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), "en");
    if (sortDirection === "desc") result *= -1;
    return (
      result ||
      left.learnerId.localeCompare(right.learnerId, "en") ||
      left.courseCode.localeCompare(right.courseCode, "en")
    );
  });
}

function pageResult<T>(records: T[], page: number, pageSize: number) {
  const total = records.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  return {
    records: records.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}

function inputQuery(query: Record<string, unknown>, pageSizeDefault: number) {
  const pageRaw = query.page;
  const pageSizeRaw = query.pageSize;
  return {
    ...query,
    page: pageRaw == null ? 1 : Number(pageRaw),
    pageSize: pageSizeRaw == null ? pageSizeDefault : Number(pageSizeRaw),
  };
}

async function effectiveDateError(
  learnerId: string,
  courseCode: string,
  effectiveDate: string,
): Promise<{ status: number; message: string } | null> {
  const day = dayForDate(effectiveDate);
  if (day == null || day < DEMO_FIRST_DAY || day > DEMO_LAST_DAY) {
    return {
      status: 400,
      message: "Action dates must fall between 17 and 23 August 2026 (Demo Days 29–35).",
    };
  }
  const selectedDay = await getSetting();
  if (day > selectedDay) {
    return {
      status: 409,
      message: `This action is later than the selected demo date, ${dayLabel(selectedDay)}.`,
    };
  }
  const [latest] = await db
    .select({ effectiveDate: max(advisorHistoryTable.effectiveDate) })
    .from(advisorHistoryTable)
    .where(
      and(
        eq(advisorHistoryTable.learnerId, learnerId),
        eq(advisorHistoryTable.courseCode, courseCode),
      ),
    );
  if (latest?.effectiveDate && effectiveDate < latest.effectiveDate) {
    return {
      status: 409,
      message: `This action cannot be dated before the latest saved action (${latest.effectiveDate}).`,
    };
  }
  return null;
}

async function loadRecordDetail(
  learnerId: string,
  courseCode: string,
): Promise<RecordDetail | null> {
  const academic = seedData.findRecord(learnerId, courseCode);
  if (!academic) return null;
  const [saved] = await db
    .select()
    .from(advisorReviewsTable)
    .where(
      and(
        eq(advisorReviewsTable.learnerId, learnerId),
        eq(advisorReviewsTable.courseCode, courseCode),
      ),
    )
    .limit(1);
  const historyRows: HistoryRow[] = await db
    .select()
    .from(advisorHistoryTable)
    .where(
      and(
        eq(advisorHistoryTable.learnerId, learnerId),
        eq(advisorHistoryTable.courseCode, courseCode),
      ),
    )
    .orderBy(desc(advisorHistoryTable.effectiveDate), desc(advisorHistoryTable.id));

  return {
    ...seedData.makeAcademicDetail(academic),
    review: stateFromRow(saved),
    history: historyRows.map((entry) => ({
      id: String(entry.id),
      actionType: entry.actionType,
      effectiveDate: dateAtMidnight(entry.effectiveDate)!,
      savedAt: entry.savedAt,
      method: entry.method,
      note: entry.note,
      summary: entry.summary,
    })),
  };
}

async function ensureRecord(
  learnerId: string,
  courseCode: string,
  res: Response,
): Promise<boolean> {
  if (!seedData.findRecord(learnerId, courseCode)) {
    res.status(404).json({ error: "Learner-paper record not found." });
    return false;
  }
  return true;
}

router.get("/advisor/summary", async (_req, res): Promise<void> => {
  const [day, savedReviews] = await Promise.all([getSetting(), getAllReviews()]);
  const records = seedData.records.map((record) =>
    recordSummary(record, savedReviews.get(record.key)),
  );
  const selectedDate = dateForDay(day);
  const followUps = records.filter(
    (record) =>
      record.followUpDate != null &&
      !record.followUpCompleted &&
      isoDate(record.followUpDate) != null,
  );
  const dueToday = followUps.filter(
    (record) => isoDate(record.followUpDate) === selectedDate,
  ).length;
  const overdue = followUps.filter(
    (record) => (isoDate(record.followUpDate) ?? "9999") < selectedDate,
  ).length;
  const reviewStatuses = {
    awaitingReview: records.filter((record) => record.reviewStatus === "Awaiting review").length,
    inReview: records.filter((record) => record.reviewStatus === "In review").length,
    reviewed: records.filter((record) => record.reviewStatus === "Reviewed").length,
  };
  const response: AdvisorSummary = {
    learners: seedData.distinctLearners,
    learnerPaperRecords: seedData.records.length,
    academicCategories: seedData.categoryCounts as AcademicCategories,
    reviewStatuses,
    followUpsDueToday: dueToday,
    followUpsOverdue: overdue,
    demoDate: demoDate(day),
  };
  res.json(GetAdvisorSummaryResponse.parse(response));
});

router.get("/records", async (req, res): Promise<void> => {
  const parsed = ListRecordsQueryParams.safeParse(
    inputQuery(req.query as Record<string, unknown>, 25),
  );
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [savedReviews] = await Promise.all([getAllReviews()]);
  const all = seedData.records.map((record) =>
    recordSummary(record, savedReviews.get(record.key)),
  );
  const filters: RecordFilters = parsed.data;
  const countScopeRows = all.filter((record) =>
    matchesAcademicFilters(record, filters, false),
  );
  const categoryCounts: AcademicCategories = {
    highPriority: countScopeRows.filter((record) => record.category === "High Priority").length,
    reviewRecommended: countScopeRows.filter((record) => record.category === "Review Recommended").length,
    insufficientEvidence: countScopeRows.filter((record) => record.category === "Insufficient Evidence").length,
    noCurrentConcern: countScopeRows.filter((record) => record.category === "No Current Concern").length,
  };
  const matching = all.filter((record) =>
    matchesAcademicFilters(record, filters, true),
  );
  const sorted = sortRecords(
    matching,
    parsed.data.sortBy ?? "category",
    parsed.data.sortDirection ?? "asc",
  );
  const response = {
    ...pageResult(sorted, parsed.data.page, parsed.data.pageSize),
    categoryCounts,
    countScope:
      "Counts use the current search, paper, department, and review-status filters; academic category is excluded, so the four totals stay comparable across category selections.",
  };
  res.json(ListRecordsResponse.parse(response));
});

router.get("/records/:learnerId/:courseCode", async (req, res): Promise<void> => {
  const params = GetRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const record = await loadRecordDetail(params.data.learnerId, params.data.courseCode);
  if (!record) {
    res.status(404).json({ error: "Learner-paper record not found." });
    return;
  }
  res.json(GetRecordResponse.parse(record));
});

router.put("/records/:learnerId/:courseCode/review", async (req, res): Promise<void> => {
  const calendarProblem = calendarInputError(req.body);
  if (calendarProblem) {
    res.status(400).json({ error: calendarProblem });
    return;
  }
  const params = SaveReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SaveReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { learnerId, courseCode } = params.data;
  if (!(await ensureRecord(learnerId, courseCode, res))) return;
  const input: ReviewInput = parsed.data;
  const effective = isoDate(input.effectiveDate);
  if (!effective) {
    res.status(400).json({ error: "Enter a valid effective action date." });
    return;
  }
  const dateProblem = await effectiveDateError(learnerId, courseCode, effective);
  if (dateProblem) {
    res.status(dateProblem.status).json({ error: dateProblem.message });
    return;
  }

  const fields: ReviewFields = {
    reviewStatus: input.reviewStatus,
    advisorNotes: input.advisorNotes,
    outcome: input.outcome,
    nextAction: input.nextAction,
    followUpDate: isoDate(input.followUpDate),
    followUpCompleted: input.followUpCompleted,
    contactStatus: input.contactStatus,
    lastEffectiveDate: effective,
    updatedAt: new Date(),
  };
  const outcomePart = input.outcome ? ` · ${input.outcome}` : "";
  const summary = [
    `Review saved · ${input.reviewStatus}${outcomePart}`,
    input.nextAction ? `Next action: ${input.nextAction}` : "No next action",
    input.followUpDate ? `Follow-up: ${isoDate(input.followUpDate)}${input.followUpCompleted ? " (completed)" : ""}` : "No follow-up date",
    `Contact: ${input.contactStatus}`,
  ].join(" · ");
  const saved = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(advisorReviewsTable)
      .values({ learnerId, courseCode, ...fields })
      .onConflictDoUpdate({
        target: [advisorReviewsTable.learnerId, advisorReviewsTable.courseCode],
        set: { ...fields, updatedAt: new Date() },
      })
      .returning();
    await tx.insert(advisorHistoryTable).values({
      learnerId,
      courseCode,
      actionType:
        input.contactStatus === "No response"
          ? "no_response_updated"
          : "review_saved",
      effectiveDate: effective,
      note: input.advisorNotes || null,
      summary:
        input.contactStatus === "No response"
          ? `${summary} · advisor explicitly recorded no response`
          : summary,
    });
    if (!row) throw new Error("The advisor review could not be saved.");
    return row;
  });
  res.json(SaveReviewResponse.parse(stateFromRow(saved)));
});

router.post("/records/:learnerId/:courseCode/contact", async (req, res): Promise<void> => {
  const calendarProblem = calendarInputError(req.body);
  if (calendarProblem) {
    res.status(400).json({ error: calendarProblem });
    return;
  }
  const params = LogContactParams.safeParse(req.params);
  const parsed = LogContactBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { learnerId, courseCode } = params.data;
  if (!(await ensureRecord(learnerId, courseCode, res))) return;
  const input: ContactInput = parsed.data;
  if (!input.method.trim()) {
    res.status(400).json({ error: "Enter a contact method." });
    return;
  }
  const effective = isoDate(input.effectiveDate);
  if (!effective) {
    res.status(400).json({ error: "Enter a valid contact date." });
    return;
  }
  const dateProblem = await effectiveDateError(learnerId, courseCode, effective);
  if (dateProblem) {
    res.status(dateProblem.status).json({ error: dateProblem.message });
    return;
  }
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(advisorReviewsTable)
      .where(
        and(
          eq(advisorReviewsTable.learnerId, learnerId),
          eq(advisorReviewsTable.courseCode, courseCode),
        ),
      )
      .limit(1);
    const fields = {
      reviewStatus: existing?.reviewStatus ?? "Awaiting review",
      advisorNotes: existing?.advisorNotes ?? "",
      outcome: existing?.outcome ?? null,
      nextAction: existing?.nextAction ?? null,
      followUpDate: existing?.followUpDate ?? null,
      followUpCompleted: existing?.followUpCompleted ?? false,
      contactStatus: "Awaiting response",
      lastEffectiveDate: effective,
      updatedAt: new Date(),
    };
    await tx
      .insert(advisorReviewsTable)
      .values({ learnerId, courseCode, ...fields })
      .onConflictDoUpdate({
        target: [advisorReviewsTable.learnerId, advisorReviewsTable.courseCode],
        set: fields,
      });
    await tx.insert(advisorHistoryTable).values({
      learnerId,
      courseCode,
      actionType: "contact_logged",
      effectiveDate: effective,
      method: input.method.trim(),
      note: input.note,
      summary: `Synthetic contact recorded · ${input.method.trim()}`,
    });
  });
  const record = await loadRecordDetail(learnerId, courseCode);
  if (!record) {
    res.status(404).json({ error: "Learner-paper record not found." });
    return;
  }
  res.status(201).json(LogContactResponse.parse(record));
});

router.post("/records/:learnerId/:courseCode/response", async (req, res): Promise<void> => {
  const calendarProblem = calendarInputError(req.body);
  if (calendarProblem) {
    res.status(400).json({ error: calendarProblem });
    return;
  }
  const params = LogResponseParams.safeParse(req.params);
  const parsed = LogResponseBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { learnerId, courseCode } = params.data;
  if (!(await ensureRecord(learnerId, courseCode, res))) return;
  const input: ResponseInput = parsed.data;
  const effective = isoDate(input.effectiveDate);
  if (!effective) {
    res.status(400).json({ error: "Enter a valid response date." });
    return;
  }
  const dateProblem = await effectiveDateError(learnerId, courseCode, effective);
  if (dateProblem) {
    res.status(dateProblem.status).json({ error: dateProblem.message });
    return;
  }
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(advisorReviewsTable)
      .where(
        and(
          eq(advisorReviewsTable.learnerId, learnerId),
          eq(advisorReviewsTable.courseCode, courseCode),
        ),
      )
      .limit(1);
    const fields = {
      reviewStatus: existing?.reviewStatus ?? "Awaiting review",
      advisorNotes: existing?.advisorNotes ?? "",
      outcome: existing?.outcome ?? null,
      nextAction: existing?.nextAction ?? null,
      followUpDate: existing?.followUpDate ?? null,
      followUpCompleted: existing?.followUpCompleted ?? false,
      contactStatus: "Response received",
      lastEffectiveDate: effective,
      updatedAt: new Date(),
    };
    await tx
      .insert(advisorReviewsTable)
      .values({ learnerId, courseCode, ...fields })
      .onConflictDoUpdate({
        target: [advisorReviewsTable.learnerId, advisorReviewsTable.courseCode],
        set: fields,
      });
    await tx.insert(advisorHistoryTable).values({
      learnerId,
      courseCode,
      actionType: "response_logged",
      effectiveDate: effective,
      note: input.note,
      summary: "Synthetic response recorded",
    });
  });
  const record = await loadRecordDetail(learnerId, courseCode);
  if (!record) {
    res.status(404).json({ error: "Learner-paper record not found." });
    return;
  }
  res.status(201).json(LogResponseResponse.parse(record));
});

router.get("/tracker", async (req, res): Promise<void> => {
  const parsed = ListTrackerQueryParams.safeParse(
    inputQuery(req.query as Record<string, unknown>, 25),
  );
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [day, savedReviews] = await Promise.all([getSetting(), getAllReviews()]);
  const selectedDate = dateForDay(day);
  let records = seedData.records.map((record) =>
    recordSummary(record, savedReviews.get(record.key)),
  );
  if (parsed.data.search) {
    records = records.filter((record) =>
      recordSearchMatch(record, parsed.data.search!),
    );
  }
  if (parsed.data.reviewStatus) {
    records = records.filter((record) => record.reviewStatus === parsed.data.reviewStatus);
  }
  if (parsed.data.contactStatus) {
    records = records.filter((record) => record.contactStatus === parsed.data.contactStatus);
  }
  if (parsed.data.followUp === "due") {
    records = records.filter(
      (record) =>
        !record.followUpCompleted &&
        record.followUpDate != null &&
        isoDate(record.followUpDate) === selectedDate,
    );
  } else if (parsed.data.followUp === "overdue") {
    records = records.filter(
      (record) =>
        !record.followUpCompleted &&
        record.followUpDate != null &&
        (isoDate(record.followUpDate) ?? "9999") < selectedDate,
    );
  } else if (parsed.data.followUp === "open") {
    records = records.filter(
      (record) =>
        !record.followUpCompleted &&
        record.followUpDate != null &&
        (isoDate(record.followUpDate) ?? "9999") <= selectedDate,
    );
  }
  records = sortRecords(records, "category", "asc");
  const response: TrackerPage = pageResult(
    records,
    parsed.data.page,
    parsed.data.pageSize,
  );
  res.json(ListTrackerResponse.parse(response));
});

router.get("/demo-date", async (_req, res): Promise<void> => {
  const response = demoDate(await getSetting());
  res.json(GetDemoDateResponse.parse(response));
});

router.put("/demo-date", async (req, res): Promise<void> => {
  const parsed = SetDemoDateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const targetDay = parsed.data.day;
  if (targetDay < DEMO_FIRST_DAY || targetDay > DEMO_LAST_DAY) {
    res.status(400).json({ error: "Choose a demo date from Day 29 through Day 35." });
    return;
  }
  const [latest] = await db
    .select({ effectiveDate: max(advisorHistoryTable.effectiveDate) })
    .from(advisorHistoryTable);
  if (latest?.effectiveDate && dateForDay(targetDay) < latest.effectiveDate) {
    res.status(409).json({
      error: `The date cannot move earlier than the latest saved action (${latest.effectiveDate}).`,
    });
    return;
  }
  await db
    .insert(demoSettingsTable)
    .values({ id: 1, day: targetDay, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: demoSettingsTable.id,
      set: { day: targetDay, updatedAt: new Date() },
    });
  res.json(SetDemoDateResponse.parse(demoDate(targetDay)));
});

router.get("/reference", async (_req, res): Promise<void> => {
  const guide: ReferenceGuide = seedData.makeReferenceGuide();
  res.json(GetReferenceGuideResponse.parse(guide));
});

export default router;