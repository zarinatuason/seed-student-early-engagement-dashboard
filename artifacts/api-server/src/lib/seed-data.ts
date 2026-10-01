import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  AssessmentEvidence,
  RecordDetail,
  RecordSummary,
  ReferenceGuide,
} from "@workspace/api-zod";

type CsvRow = Record<string, string>;
type AcademicRecord = {
  key: string;
  summary: Omit<
    RecordSummary,
    | "reviewStatus"
    | "contactStatus"
    | "nextAction"
    | "followUpDate"
    | "followUpCompleted"
    | "lastUpdatedAt"
  >;
  dashboard: CsvRow;
  indicators: CsvRow;
  enrolment: CsvRow;
  learnerContext: CsvRow | null;
};

const DAY_ONE_UTC = Date.UTC(2026, 6, 20);
const EVIDENCE_DAY = 28;
const CATEGORY_ORDER = [
  "High Priority",
  "Review Recommended",
  "Insufficient Evidence",
  "No Current Concern",
] as const;

function makeKey(learnerId: string, courseCode: string): string {
  return `${learnerId}\u001f${courseCode}`;
}

function parseCsv(text: string, filename: string): CsvRow[] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error(`CSV contains an unterminated quoted cell: ${filename}`);
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length < 2) throw new Error(`CSV has no data rows: ${filename}`);

  const headers = rows[0].map((header) => header.trim());
  if (new Set(headers).size !== headers.length) {
    throw new Error(`CSV contains duplicate column names: ${filename}`);
  }

  return rows.slice(1).filter((values) => values.some((value) => value !== "")).map((values) => {
    if (values.length !== headers.length) {
      throw new Error(
        `CSV row has ${values.length} values; expected ${headers.length}: ${filename}`,
      );
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function readCsv(prefix: string): CsvRow[] {
  const configuredDirectory = process.env.SEED_DATA_DIR;
  const directory =
    configuredDirectory ??
    path.resolve(__dirname, "../../data/academic");
  const matches = readdirSync(directory).filter(
    (name) => name.startsWith(`${prefix}_`) && name.endsWith(".csv"),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one CSV beginning ${prefix}_ in ${directory}; found ${matches.length}`,
    );
  }
  const filename = path.join(directory, matches[0]);
  return parseCsv(readFileSync(filename, "utf8"), filename);
}

function numberValue(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerValue(value: string | undefined, fallback = 0): number {
  const parsed = numberValue(value);
  return parsed == null ? fallback : Math.trunc(parsed);
}

function nullableText(value: string | undefined): string | null {
  return value == null || value === "" ? null : value;
}

function trueValue(value: string | undefined): boolean {
  return value === "True" || value === "true";
}

function dayToDate(day: number): Date {
  return new Date(DAY_ONE_UTC + (day - 1) * 86_400_000);
}

function duplicateCount(rows: CsvRow[], columns: string[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const key = columns.map((column) => row[column] ?? "").join("\u001f");
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

const courseRows = readCsv("01");
const assessmentRows = readCsv("02");
const learnerContextRows = readCsv("03");
const enrolmentRows = readCsv("05");
const resourceRows = readCsv("06");
const activityRows = readCsv("07");
const submissionRows = readCsv("08");
const indicatorRows = readCsv("09");
const dashboardRows = readCsv("10");

const courseByCode = new Map(courseRows.map((row) => [row.course_code, row]));
const contextByLearner = new Map(learnerContextRows.map((row) => [row.learner_id, row]));
const enrolmentByKey = new Map(
  enrolmentRows.map((row) => [makeKey(row.learner_id, row.course_code), row]),
);
const indicatorByKey = new Map(
  indicatorRows.map((row) => [makeKey(row.learner_id, row.course_code), row]),
);
const dashboardByKey = new Map(
  dashboardRows.map((row) => [makeKey(row.learner_id, row.course_code), row]),
);
const resourcesById = new Map(resourceRows.map((row) => [row.learning_resource_id, row]));
const assessmentsByOffering = new Map<string, CsvRow[]>();
for (const row of assessmentRows) {
  const key = `${row.course_code}\u001f${row.course_offering_period}`;
  const list = assessmentsByOffering.get(key) ?? [];
  list.push(row);
  assessmentsByOffering.set(key, list);
}
const submissionsByAssessment = new Map<string, CsvRow>();
for (const row of submissionRows) {
  submissionsByAssessment.set(
    `${makeKey(row.learner_id, row.course_code)}\u001f${row.course_offering_period}\u001f${row.assessment_id}`,
    row,
  );
}
const activityByRecord = new Map<string, CsvRow[]>();
for (const row of activityRows) {
  const key = makeKey(row.learner_id, row.course_code);
  const list = activityByRecord.get(key) ?? [];
  list.push(row);
  activityByRecord.set(key, list);
}

const academicRecords: AcademicRecord[] = dashboardRows.map((dashboard) => {
  const key = makeKey(dashboard.learner_id, dashboard.course_code);
  const indicators = indicatorByKey.get(key);
  const enrolment = enrolmentByKey.get(key);
  if (!indicators || !enrolment) {
    throw new Error(`Missing indicator or enrolment join for ${dashboard.learner_id}/${dashboard.course_code}`);
  }
  const summary: AcademicRecord["summary"] = {
    learnerId: dashboard.learner_id,
    courseCode: dashboard.course_code,
    paperTitle: dashboard.paper_title,
    facultySchool: dashboard.faculty_school_name,
    department: dashboard.department_name,
    category: indicators.calculated_priority_category as RecordSummary["category"],
    reason: dashboard.advisor_reason,
  };
  return {
    key,
    summary,
    dashboard,
    indicators,
    enrolment,
    learnerContext: contextByLearner.get(dashboard.learner_id) ?? null,
  };
});

const expectedCategoryCounts: Record<string, number> = {
  "High Priority": 581,
  "Review Recommended": 968,
  "Insufficient Evidence": 194,
  "No Current Concern": 2131,
};
const actualCategoryCounts = new Map<string, number>();
for (const record of academicRecords) {
  const category = record.summary.category;
  actualCategoryCounts.set(category, (actualCategoryCounts.get(category) ?? 0) + 1);
}

const validationIssues: string[] = [];
if (new Set(learnerContextRows.map((row) => row.learner_id)).size !== 1400) {
  validationIssues.push("Expected 1,400 distinct learner IDs in learner context.");
}
if (courseRows.length !== 34) validationIssues.push(`Expected 34 papers; found ${courseRows.length}.`);
if (academicRecords.length !== 3874 || enrolmentRows.length !== 3874 || indicatorRows.length !== 3874) {
  validationIssues.push(
    `Expected 3,874 learner-paper records in dashboard, enrolment, and indicator files; found ${academicRecords.length}, ${enrolmentRows.length}, and ${indicatorRows.length}.`,
  );
}
for (const [category, expected] of Object.entries(expectedCategoryCounts)) {
  if (actualCategoryCounts.get(category) !== expected) {
    validationIssues.push(
      `Expected ${expected} ${category} records; found ${actualCategoryCounts.get(category) ?? 0}.`,
    );
  }
}
if (duplicateCount(courseRows, ["course_code"]) !== 0) validationIssues.push("Duplicate course codes were found.");
if (duplicateCount(assessmentRows, ["assessment_id"]) !== 0) validationIssues.push("Duplicate assessment IDs were found.");
if (duplicateCount(learnerContextRows, ["learner_id"]) !== 0) validationIssues.push("Duplicate learner context IDs were found.");
if (duplicateCount(enrolmentRows, ["learner_id", "course_code", "course_offering_period"]) !== 0) {
  validationIssues.push("Duplicate learner-paper-offering enrolments were found.");
}
if (duplicateCount(indicatorRows, ["learner_id", "course_code"]) !== 0) {
  validationIssues.push("Duplicate learner-paper indicators were found.");
}
if (duplicateCount(dashboardRows, ["learner_id", "course_code"]) !== 0) {
  validationIssues.push("Duplicate learner-paper dashboard records were found.");
}

const assessmentById = new Map(assessmentRows.map((row) => [row.assessment_id, row]));
const enrolmentKeys = new Set(
  enrolmentRows.map((row) =>
    `${makeKey(row.learner_id, row.course_code)}\u001f${row.course_offering_period}`,
  ),
);
let badSubmissionJoins = 0;
for (const row of submissionRows) {
  const assessment = assessmentById.get(row.assessment_id);
  if (
    !assessment ||
    assessment.course_code !== row.course_code ||
    assessment.course_offering_period !== row.course_offering_period ||
    !enrolmentKeys.has(`${makeKey(row.learner_id, row.course_code)}\u001f${row.course_offering_period}`)
  ) {
    badSubmissionJoins += 1;
  }
}
let badActivityJoins = 0;
for (const row of activityRows) {
  const resource = resourcesById.get(row.learning_resource_id);
  if (
    !resource ||
    resource.course_code !== row.course_code ||
    resource.course_offering_period !== row.course_offering_period ||
    !enrolmentKeys.has(`${makeKey(row.learner_id, row.course_code)}\u001f${row.course_offering_period}`)
  ) {
    badActivityJoins += 1;
  }
}
if (badSubmissionJoins > 0) validationIssues.push(`${badSubmissionJoins} submission joins failed validation.`);
if (badActivityJoins > 0) validationIssues.push(`${badActivityJoins} resource activity joins failed validation.`);
if (new Set(indicatorRows.map((row) => makeKey(row.learner_id, row.course_code))).size !== dashboardByKey.size) {
  validationIssues.push("Dashboard and indicator learner-paper key sets differ.");
}
const categoryMismatches = academicRecords.filter(
  (record) =>
    record.indicators.calculated_priority_category !==
    record.dashboard.calculated_priority_category,
).length;
if (categoryMismatches > 0) {
  validationIssues.push(
    `${categoryMismatches} dashboard categories differ from the authoritative Day 28 indicator categories.`,
  );
}

function makeAssessmentEvidence(record: AcademicRecord): AssessmentEvidence[] {
  const offering = record.enrolment.course_offering_period;
  const schedule = assessmentsByOffering.get(`${record.summary.courseCode}\u001f${offering}`) ?? [];

  return schedule
    .map((assessment) => {
      const submission = submissionsByAssessment.get(
        `${record.key}\u001f${offering}\u001f${assessment.assessment_id}`,
      );
      const availableFromDay = integerValue(assessment.assessment_available_from_day);
      const nominalDueDay = numberValue(assessment.assessment_due_day);
      const applicableDueDay =
        numberValue(submission?.applicable_due_day) ?? nominalDueDay;
      const submittedDay = numberValue(submission?.submission_day);
      const releaseDay = numberValue(submission?.score_released_day);
      const priorCredit = trueValue(submission?.prior_credit_flag);
      const isDueByCutoff =
        !priorCredit && applicableDueDay != null && applicableDueDay <= EVIDENCE_DAY;
      const submittedByCutoff =
        !priorCredit && submittedDay != null && submittedDay <= EVIDENCE_DAY;
      const result =
        submittedByCutoff &&
        releaseDay != null &&
        releaseDay <= EVIDENCE_DAY &&
        submission?.assessment_score != null &&
        submission.assessment_score !== ""
          ? numberValue(submission.assessment_score)
          : null;
      const dueState: AssessmentEvidence["dueState"] = isDueByCutoff
        ? "Due by Day 28"
        : applicableDueDay == null
          ? "Not applicable"
          : "Not yet due";

      let submissionStatus: AssessmentEvidence["submissionStatus"];
      if (priorCredit) submissionStatus = "Prior credit";
      else if (!isDueByCutoff) submissionStatus = "Not yet due";
      else if (submittedByCutoff) submissionStatus = "Submitted";
      else if (submission) submissionStatus = "Not submitted by Day 28";
      else submissionStatus = "No submission record";

      return {
        assessmentId: assessment.assessment_id,
        assessmentName: assessment.assessment_name,
        category: assessment.assessment_category,
        priorCredit,
        availableFromDay,
        availabilityStatus:
          availableFromDay <= EVIDENCE_DAY
            ? "Available by Day 28"
            : "Not yet available by Day 28" as AssessmentEvidence["availabilityStatus"],
        applicableDueDate:
          applicableDueDay == null || applicableDueDay <= 0
            ? null
            : dayToDate(applicableDueDay),
        dueDay: applicableDueDay == null ? null : Math.trunc(applicableDueDay),
        dueState: priorCredit ? "Prior credit" : dueState,
        submissionStatus,
        submissionDate:
          submittedByCutoff && submittedDay != null
            ? dayToDate(submittedDay)
            : null,
        weightPercent: numberValue(assessment.assessment_weight_percent) ?? 0,
        result,
        resultAvailable: result != null,
      };
    })
    .sort((left, right) => {
      const leftDay = left.dueDay ?? Number.MAX_SAFE_INTEGER;
      const rightDay = right.dueDay ?? Number.MAX_SAFE_INTEGER;
      return leftDay - rightDay || left.assessmentName.localeCompare(right.assessmentName);
    });
}

function makeLearningResources(record: AcademicRecord) {
  const resources = new Map<
    string,
    { resource: CsvRow; latestInteractionDay: number; interactionCount: number }
  >();
  for (const activity of activityByRecord.get(record.key) ?? []) {
    const day = numberValue(activity.activity_day);
    if (day == null || day > EVIDENCE_DAY) continue;
    const resourceId = activity.learning_resource_id;
    const resource = resourcesById.get(resourceId);
    if (!resource) continue;
    const previous = resources.get(resourceId);
    resources.set(resourceId, {
      resource,
      latestInteractionDay: Math.max(previous?.latestInteractionDay ?? 0, day),
      interactionCount:
        (previous?.interactionCount ?? 0) + integerValue(activity.interaction_count),
    });
  }

  return [...resources.values()]
    .map(({ resource, latestInteractionDay, interactionCount }) => ({
      resourceTitle: resource.resource_title,
      activityType: resource.learning_activity_type,
      availableFromDay: integerValue(resource.resource_available_from_day),
      latestInteractionDay: Math.trunc(latestInteractionDay),
      interactionCount,
    }))
    .sort(
      (left, right) =>
        right.latestInteractionDay - left.latestInteractionDay ||
        left.resourceTitle.localeCompare(right.resourceTitle),
    );
}

function makeAcademicDetail(record: AcademicRecord): Omit<RecordDetail, "review" | "history"> {
  const indicator = record.indicators;
  const context = record.learnerContext;
  const category = record.summary.category;
  const course = courseByCode.get(record.summary.courseCode);
  const concernDomains = indicator.calculated_concern_domains
    .split(" | ")
    .map((domain) => domain.trim())
    .filter(Boolean);
  const assessments = makeAssessmentEvidence(record);

  return {
    learnerId: record.summary.learnerId,
    courseCode: record.summary.courseCode,
    paperTitle: record.summary.paperTitle,
    facultySchool: record.summary.facultySchool,
    department: record.summary.department,
    courseLevel: course?.course_level ?? record.dashboard.course_level,
    offeringPeriod: record.enrolment.course_offering_period,
    paperStructureType:
      course?.paper_structure_type ?? record.dashboard.paper_structure_type,
    category,
    reason: record.summary.reason,
    concernDomains,
    registrationDay: integerValue(record.enrolment.registration_day),
    opportunityDays: integerValue(record.enrolment.opportunity_days),
    learning: {
      eligibleResources: integerValue(indicator.eligible_resource_count),
      interactedResources: integerValue(indicator.interacted_resource_count),
      engagementCoverage: numberValue(indicator.resource_engagement_coverage),
      activeLearningDays: integerValue(indicator.active_learning_days),
      latestActivityDay: numberValue(indicator.latest_activity_day),
      daysSinceLastActivity: numberValue(indicator.days_since_last_activity),
      concern: trueValue(indicator.learning_activity_concern),
      resources: makeLearningResources(record),
    },
    assessmentParticipation: {
      dueCount: integerValue(indicator.assessments_due_count),
      submittedCount: integerValue(indicator.submitted_assessment_count),
      missedCount: integerValue(indicator.missed_assessment_count),
      submissionCompletionRate: numberValue(indicator.submission_completion_rate),
      weightedSubmissionCoverage: numberValue(indicator.weighted_submission_coverage),
      missedAssessmentWeight: numberValue(indicator.missed_assessment_weight) ?? 0,
      releasedResultCount: integerValue(indicator.released_result_count),
      releasedAssessmentWeight: numberValue(indicator.released_assessment_weight) ?? 0,
      weightedAverageAvailableScore: numberValue(indicator.weighted_average_available_score),
      concern: trueValue(indicator.assessment_participation_concern),
      assessments,
    },
    earlyPerformanceConcern: trueValue(indicator.early_performance_concern),
    learnerContext: {
      priorEducationLevel: nullableText(context?.prior_education_level),
      previousAttemptCount: numberValue(context?.previous_attempt_count),
      creditLoad: numberValue(context?.credit_load),
    },
  };
}

function makeReferenceGuide(): ReferenceGuide {
  const descriptions: Record<string, string> = {
    "High Priority":
      "Multiple supplied concern flags are present. The source data include learning-activity, assessment-participation, and early-performance combinations; the exact reason is shown on each record.",
    "Review Recommended":
      "At least one supplied concern domain is flagged: learning activity, assessment participation, or early performance. The record shows the specific domain and supplied explanation.",
    "Insufficient Evidence":
      "The supplied data mark the Day 28 evidence as insufficient. This is not a conclusion that the learner is disengaged or needs a particular intervention.",
    "No Current Concern":
      "The supplied Day 28 indicators do not meet a concern threshold. This is a time-bounded snapshot, not a guarantee about later outcomes.",
  };

  const indicators: Record<string, string> = {
    "Eligible resources":
      "Learning resources available to the learner by the Day 28 evidence cutoff, as counted in the supplied indicator file.",
    "Interacted resources":
      "Distinct eligible resources with at least one recorded activity event. This does not prove the learner read, completed, or understood a resource.",
    "Engagement coverage":
      "The supplied proportion of eligible resources with recorded interaction. Zero is a measured zero; blank is unavailable.",
    "Active learning days":
      "Distinct days with recorded learning-resource activity by Day 28.",
    "Days since last activity":
      "Elapsed days from the latest recorded resource activity to the Day 28 cutoff. Zero means activity on Day 28; unavailable means no activity date was recorded.",
    "Assessments due":
      "Assessments with an applicable learner due date by Day 28.",
    "Submitted assessments":
      "Assessments with a submission date recorded by Day 28, following the supplied aggregate indicator.",
    "Weighted submission coverage":
      "The supplied submission coverage adjusted by assessment weight. It is not recalculated from advisor actions.",
    "Released results":
      "Assessment results with a release date on or before Day 28. Later releases are withheld from checkpoint evidence.",
    "Weighted average available score":
      "The supplied weighted average of results available by Day 28. Unreleased or missing results are not treated as zero.",
  };
  const categories = CATEGORY_ORDER.map((category) => ({
    category,
    explanation: descriptions[category],
    count: actualCategoryCounts.get(category) ?? 0,
  }));
  const datasetChecks = [
    `${learnerContextRows.length.toLocaleString("en-NZ")} learner context rows; ${academicRecords.length.toLocaleString("en-NZ")} unique learner-paper records; ${courseRows.length} unique papers.`,
    ...CATEGORY_ORDER.map(
      (category) =>
        `${category}: ${actualCategoryCounts.get(category) ?? 0} learner-paper records.`,
    ),
    `${assessmentRows.length} unique assessment definitions; all ${submissionRows.length.toLocaleString("en-NZ")} submissions join to an assessment and matching learner-paper offering.`,
    `${resourceRows.length} learning resources; all ${activityRows.length.toLocaleString("en-NZ")} activity rows join to a resource and matching learner-paper offering.`,
    "All supplied enrolments are labelled Semester 1. The requested Semester Two 2026 calendar is used only as the demonstration date mapping; original offering identifiers are preserved.",
    "Protected fairness-audit data and later-outcome/validation files are not loaded by this API.",
    ...validationIssues.map((issue) => `Discrepancy: ${issue}`),
  ];
  return {
    categories,
    indicators,
    evidenceCutoff: "16 August 2026 · Day 28",
    syntheticData: true,
    datasetChecks,
  };
}

export const seedData = {
  records: academicRecords,
  categoryOrder: CATEGORY_ORDER,
  categoryCounts: {
    highPriority: actualCategoryCounts.get("High Priority") ?? 0,
    reviewRecommended: actualCategoryCounts.get("Review Recommended") ?? 0,
    insufficientEvidence: actualCategoryCounts.get("Insufficient Evidence") ?? 0,
    noCurrentConcern: actualCategoryCounts.get("No Current Concern") ?? 0,
  },
  distinctLearners: new Set(learnerContextRows.map((row) => row.learner_id)).size,
  validationIssues,
  findRecord(learnerId: string, courseCode: string) {
    return academicRecords.find(
      (record) =>
        record.summary.learnerId === learnerId &&
        record.summary.courseCode === courseCode,
    );
  },
  makeAcademicDetail,
  makeReferenceGuide,
};