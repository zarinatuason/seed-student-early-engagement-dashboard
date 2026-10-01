#!/usr/bin/env python3
"""Read-only functional checks for the SEED academic-data API."""

import csv
import json
import math
import os
import sys
import time
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen


BASE_URL = os.environ.get("SEED_API_URL", "http://localhost:80/api").rstrip("/")
DATA_DIR = Path(__file__).resolve().parents[1] / "artifacts/api-server/data/academic"
DAY_ONE = date(2026, 7, 20)
CATEGORY_ORDER = [
    "High Priority",
    "Review Recommended",
    "Insufficient Evidence",
    "No Current Concern",
]
CATEGORY_KEYS = {
    "High Priority": "highPriority",
    "Review Recommended": "reviewRecommended",
    "Insufficient Evidence": "insufficientEvidence",
    "No Current Concern": "noCurrentConcern",
}

checks = []
failures = []
counts = {}


def check(name, passed, detail=None):
    checks.append({"name": name, "status": "PASS" if passed else "FAIL", "detail": detail})
    if not passed:
        failures.append({"check": name, "detail": detail})


def require(condition, name, detail=None):
    check(name, bool(condition), detail)


def csv_rows(prefix):
    matches = sorted(DATA_DIR.glob(prefix + "_*.csv"))
    if len(matches) != 1:
        raise RuntimeError(f"Expected exactly one {prefix}_*.csv; found {len(matches)}")
    with matches[0].open(newline="", encoding="utf-8-sig") as stream:
        return list(csv.DictReader(stream))


def num(value):
    if value is None or str(value).strip() == "":
        return None
    return float(value)


def integer(value, default=0):
    parsed = num(value)
    return default if parsed is None else int(parsed)


def truth(value):
    return value in ("True", "true", True)


def api(path, params=None):
    url = BASE_URL + path
    if params:
        url += "?" + urlencode(params)
    with urlopen(url, timeout=12) as response:
        raw = response.read()
        return response.status, json.loads(raw.decode("utf-8"))


def expected_error(path, status=None, params=None):
    url = BASE_URL + path
    if params:
        url += "?" + urlencode(params)
    try:
        with urlopen(url, timeout=12) as response:
            return response.status
    except HTTPError as error:
        return error.code


def key(learner, course):
    return (learner, course)


def day_date(day):
    return (DAY_ONE + timedelta(days=int(day) - 1)).isoformat()


def approx_equal(left, right, tolerance=1e-8):
    if left is None or right is None:
        return left is None and right is None
    return math.isclose(float(left), float(right), rel_tol=tolerance, abs_tol=tolerance)


def exact_keys(obj, expected):
    return isinstance(obj, dict) and set(obj) == set(expected)


def get_health():
    deadline = time.monotonic() + 60
    last_error = None
    while time.monotonic() < deadline:
        try:
            status, payload = api("/healthz")
            if status == 200 and isinstance(payload, dict):
                return payload
            last_error = f"unexpected health response: {status} {payload!r}"
        except (OSError, URLError, TimeoutError, ValueError) as error:
            last_error = str(error)
        time.sleep(1)
    raise RuntimeError(f"API health check did not become ready within 60 seconds: {last_error}")


def main():
    health = get_health()
    require(health.get("status") == "ok", "health endpoint ready", health)

    courses = csv_rows("01")
    assessments = csv_rows("02")
    contexts = csv_rows("03")
    enrolments = csv_rows("05")
    resources = csv_rows("06")
    activities = csv_rows("07")
    submissions = csv_rows("08")
    indicators = csv_rows("09")
    dashboard = csv_rows("10")
    rows = {
        "courses": courses, "assessments": assessments, "learnerContext": contexts,
        "enrolments": enrolments, "resources": resources, "activities": activities,
        "submissions": submissions, "indicators": indicators, "dashboard": dashboard,
    }
    counts["csvRows"] = {name: len(value) for name, value in rows.items()}
    require(len(courses) == 34, "academic CSV paper total", len(courses))
    require(len(contexts) == 1400, "academic CSV learner context total", len(contexts))
    require(len(enrolments) == len(indicators) == len(dashboard) == 3874,
            "academic CSV learner-paper record totals",
            {name: len(rows[name]) for name in ("enrolments", "indicators", "dashboard")})

    def duplicates(source, fields):
        seen = set()
        count = 0
        for row in source:
            value = tuple(row.get(field, "") for field in fields)
            count += value in seen
            seen.add(value)
        return count

    unique_defs = [
        ("course codes", courses, ["course_code"]),
        ("assessment IDs", assessments, ["assessment_id"]),
        ("learner context IDs", contexts, ["learner_id"]),
        ("enrolment learner/course/offering keys", enrolments, ["learner_id", "course_code", "course_offering_period"]),
        ("indicator learner/course keys", indicators, ["learner_id", "course_code"]),
        ("dashboard learner/course keys", dashboard, ["learner_id", "course_code"]),
        ("resource IDs", resources, ["learning_resource_id"]),
        ("activity IDs", activities, ["activity_id"]),
        ("submission record IDs", submissions, ["submission_record_id"]),
    ]
    for label, source, fields in unique_defs:
        n = duplicates(source, fields)
        require(n == 0, "unique " + label, {"duplicates": n})

    course_by_code = {r["course_code"]: r for r in courses}
    context_ids = {r["learner_id"] for r in contexts}
    enrol_by_key = {key(r["learner_id"], r["course_code"]): r for r in enrolments}
    indicator_by_key = {key(r["learner_id"], r["course_code"]): r for r in indicators}
    dashboard_by_key = {key(r["learner_id"], r["course_code"]): r for r in dashboard}
    assessment_by_id = {r["assessment_id"]: r for r in assessments}
    resource_by_id = {r["learning_resource_id"]: r for r in resources}
    enrol_offerings = {
        (r["learner_id"], r["course_code"], r["course_offering_period"]) for r in enrolments
    }
    require(set(enrol_by_key) == set(indicator_by_key) == set(dashboard_by_key),
            "learner-paper key parity across enrolment, indicator, and dashboard",
            {"enrolment": len(enrol_by_key), "indicator": len(indicator_by_key), "dashboard": len(dashboard_by_key)})
    require(all(r["course_code"] in course_by_code for r in enrolments),
            "enrolments join to paper definitions")
    require(all(r["learner_id"] in context_ids for r in enrolments),
            "enrolments join to learner context")
    bad_submissions = sum(
        1 for r in submissions
        if (r["assessment_id"] not in assessment_by_id
            or assessment_by_id[r["assessment_id"]]["course_code"] != r["course_code"]
            or assessment_by_id[r["assessment_id"]]["course_offering_period"] != r["course_offering_period"]
            or (r["learner_id"], r["course_code"], r["course_offering_period"]) not in enrol_offerings)
    )
    bad_activities = sum(
        1 for r in activities
        if (r["learning_resource_id"] not in resource_by_id
            or resource_by_id[r["learning_resource_id"]]["course_code"] != r["course_code"]
            or resource_by_id[r["learning_resource_id"]]["course_offering_period"] != r["course_offering_period"]
            or (r["learner_id"], r["course_code"], r["course_offering_period"]) not in enrol_offerings)
    )
    require(bad_submissions == 0, "submission assessment/offering joins", {"invalid": bad_submissions})
    require(bad_activities == 0, "resource activity/resource/offering joins", {"invalid": bad_activities})

    category_counts = Counter(r["calculated_priority_category"] for r in indicators)
    expected_categories = {
        "High Priority": 581, "Review Recommended": 968,
        "Insufficient Evidence": 194, "No Current Concern": 2131,
    }
    counts["categoryCounts"] = dict(category_counts)
    require(dict(category_counts) == expected_categories, "source exact category totals", dict(category_counts))
    category_parity = sum(
        1 for k in indicator_by_key
        if indicator_by_key[k]["calculated_priority_category"] != dashboard_by_key[k]["calculated_priority_category"]
    )
    require(category_parity == 0, "indicator/dashboard category parity", {"mismatches": category_parity})
    fields_parity = sum(
        1 for k in indicator_by_key
        if indicator_by_key[k]["opportunity_days"] != dashboard_by_key[k]["opportunity_days"]
    )
    require(fields_parity == 0, "source indicator/dashboard opportunity fields parity",
            {"mismatches": fields_parity})

    assessment_schedules = defaultdict(list)
    for item in assessments:
        assessment_schedules[(item["course_code"], item["course_offering_period"])].append(item)
    submission_by_assessment = {}
    late_release_count = 0
    late_release_rows_with_score = 0
    for submission in submissions:
        submission_by_assessment[
            (submission["learner_id"], submission["course_code"], submission["course_offering_period"], submission["assessment_id"])
        ] = submission
        release = num(submission["score_released_day"])
        if release is not None and release > 28:
            late_release_count += 1
            if submission.get("assessment_score", "") != "":
                late_release_rows_with_score += 1
    counts["submissionsWithReleaseAfterDay28"] = late_release_count
    counts["postCutoffReleasedRowsWithScores"] = late_release_rows_with_score
    # The reconstruction below admits a result only when both submission and
    # release are on/before Day 28; no post-cutoff release can contribute.
    require(late_release_count > 0 and late_release_rows_with_score >= 0,
            "exhaustively enumerate post-cutoff release rows",
            {"lateReleaseRows": late_release_count, "lateRowsWithScore": late_release_rows_with_score})

    aggregate_mismatches = []
    for k, enrollment in enrol_by_key.items():
        schedule = assessment_schedules.get((enrollment["course_code"], enrollment["course_offering_period"]), [])
        due = submitted = missed = released = 0
        missed_weight = released_weight = score_weight = weighted_score = 0.0
        due_weight = submitted_due_weight = 0.0
        for assessment in schedule:
            sub = submission_by_assessment.get((k[0], k[1], enrollment["course_offering_period"], assessment["assessment_id"]))
            applicable_due = num(sub.get("applicable_due_day")) if sub else None
            if applicable_due is None:
                applicable_due = num(assessment.get("assessment_due_day"))
            sub_day = num(sub.get("submission_day")) if sub else None
            release_day = num(sub.get("score_released_day")) if sub else None
            prior = truth(sub.get("prior_credit_flag")) if sub else False
            by_cutoff = sub_day is not None and sub_day <= 28
            has_result = (
                by_cutoff and release_day is not None and release_day <= 28
                and sub is not None and sub.get("assessment_score", "") != ""
                and num(sub.get("assessment_score")) is not None
            )
            weight = num(assessment.get("assessment_weight_percent")) or 0.0
            if applicable_due is not None and applicable_due <= 28:
                due += 1
                due_weight += weight
                if by_cutoff:
                    submitted += 1
                    submitted_due_weight += weight
                else:
                    missed += 1
                    missed_weight += weight
            elif by_cutoff:
                # Early submissions/prior credit count toward submission totals even when
                # an assessment was not yet due at the evidence cutoff.
                submitted += 1
            if has_result:
                released += 1
                released_weight += weight
                weighted_score += float(sub["assessment_score"]) * weight
                score_weight += weight
        source = indicator_by_key[k]
        expected = {
            "assessments_due_count": due,
            "submitted_assessment_count": submitted,
            "missed_assessment_count": missed,
            "released_result_count": released,
        }
        for field, reconstructed in expected.items():
            if integer(source[field]) != reconstructed:
                aggregate_mismatches.append({"key": k, "field": field, "source": integer(source[field]), "calculated": reconstructed})
        for field, reconstructed in (
            ("missed_assessment_weight", missed_weight),
            ("released_assessment_weight", released_weight),
        ):
            if not approx_equal(num(source[field]), reconstructed, 1e-6):
                aggregate_mismatches.append({"key": k, "field": field, "source": num(source[field]), "calculated": reconstructed})
        expected_completion = submitted / due * 100 if due else None
        if not approx_equal(num(source["submission_completion_rate"]), expected_completion, 0.0051):
            aggregate_mismatches.append({"key": k, "field": "submission_completion_rate", "source": num(source["submission_completion_rate"]), "calculated": expected_completion})
        expected_weighted_coverage = submitted_due_weight / due_weight * 100 if due_weight else None
        if not approx_equal(num(source["weighted_submission_coverage"]), expected_weighted_coverage, 0.0051):
            aggregate_mismatches.append({"key": k, "field": "weighted_submission_coverage", "source": num(source["weighted_submission_coverage"]), "calculated": expected_weighted_coverage})
        expected_avg = weighted_score / score_weight if score_weight else None
        # Source indicators persist the weighted mean rounded to two decimals.
        if not approx_equal(num(source["weighted_average_available_score"]), expected_avg, 0.0051):
            aggregate_mismatches.append({"key": k, "field": "weighted_average_available_score", "source": num(source["weighted_average_available_score"]), "calculated": expected_avg})
    counts["aggregateReconstructionMismatches"] = len(aggregate_mismatches)
    require(not aggregate_mismatches, "reconstruct due/submission/missed/released/weighted-average aggregates incl prior credit",
            aggregate_mismatches[:10])

    # Fetch every summary page; compare full API totals and source category-order sorting.
    first_status, first = api("/records", {"page": 1, "pageSize": 50})
    total = first["total"]
    page_count = first["totalPages"]
    all_records = list(first["records"])
    for page in range(2, page_count + 1):
        _, result = api("/records", {"page": page, "pageSize": 50})
        all_records.extend(result["records"])
    counts["apiRecordPages"] = page_count
    counts["apiRecords"] = len(all_records)
    require(first_status == 200 and total == len(dashboard) == len(all_records),
            "runtime API learner-paper total matches source", {"apiTotal": total, "source": len(dashboard), "fetched": len(all_records)})
    api_by_key = {key(r["learnerId"], r["courseCode"]): r for r in all_records}
    require(len(api_by_key) == len(all_records), "runtime API summary keys unique")
    summary_fields = ["learnerId", "courseCode", "paperTitle", "facultySchool", "department",
                      "category", "reason", "reviewStatus", "contactStatus", "nextAction",
                      "followUpDate", "followUpCompleted", "lastUpdatedAt"]
    require(all(exact_keys(record, summary_fields) for record in all_records),
            "record summaries expose exact operational fields")
    api_categories = Counter(r["category"] for r in all_records)
    require(dict(api_categories) == expected_categories, "runtime API exact category parity", dict(api_categories))
    summary_mismatches = []
    for k, api_row in api_by_key.items():
        src = dashboard_by_key.get(k)
        if src is None or any((
            api_row["paperTitle"] != src["paper_title"],
            api_row["department"] != src["department_name"],
            api_row["facultySchool"] != src["faculty_school_name"],
            api_row["category"] != src["calculated_priority_category"],
            api_row["reason"] != src["advisor_reason"],
        )):
            summary_mismatches.append(k)
    require(not summary_mismatches, "runtime API summaries match academic source fields", {"mismatches": len(summary_mismatches), "samples": summary_mismatches[:5]})
    expected_count_obj = {CATEGORY_KEYS[c]: expected_categories[c] for c in CATEGORY_ORDER}
    require(first["categoryCounts"] == expected_count_obj, "API category counts exact")
    require([r["category"] for r in all_records] == sorted(
        [r["category"] for r in all_records], key=CATEGORY_ORDER.index
    ), "default category ordering is stable across complete pagination")

    for size in (10, 25, 50):
        pages = math.ceil(total / size)
        seen = []
        for page in range(1, pages + 1):
            _, result = api("/records", {"page": page, "pageSize": size})
            require(result["page"] == page and result["pageSize"] == size
                    and result["total"] == total and result["totalPages"] == pages
                    and len(result["records"]) <= size,
                    f"pagination metadata pageSize={size} page={page}")
            seen.extend(key(r["learnerId"], r["courseCode"]) for r in result["records"])
        require(len(seen) == total and len(set(seen)) == total,
                f"pagination covers all records exactly once pageSize={size}", {"fetched": len(seen)})

    # Filter results are checked against the complete, read-only API summary snapshot.
    sample = all_records[len(all_records) // 3]
    query_cases = [
        ("search learner ID", {"search": sample["learnerId"]}),
        ("search title", {"search": sample["paperTitle"].split()[0]}),
        ("search course code", {"search": sample["courseCode"]}),
        ("combined paper/department/category/review filters", {
            "paper": sample["courseCode"], "department": sample["department"],
            "category": sample["category"], "reviewStatus": sample["reviewStatus"],
        }),
    ]
    for label, params in query_cases:
        _, got = api("/records", {**params, "page": 1, "pageSize": 50})
        expected = [r for r in all_records if summary_matches(r, params)]
        require(got["total"] == len(expected), label, {"expected": len(expected), "actual": got["total"]})
        require(all(summary_matches(r, params) for r in got["records"]), label + " rows honor filters")
    # Exercise each search field in combination with all structured filters.
    for label, term in (("learner", sample["learnerId"]),
                        ("title", sample["paperTitle"].split()[0]),
                        ("course", sample["courseCode"])):
        combo = {"search": term, "paper": sample["courseCode"],
                 "department": sample["department"], "category": sample["category"],
                 "reviewStatus": sample["reviewStatus"]}
        _, combo_result = api("/records", {**combo, "pageSize": 10})
        combo_expected = [r for r in all_records if summary_matches(r, combo)]
        require(combo_result["total"] == len(combo_expected),
                f"search {label} combined with paper/department/category/review filters",
                {"expected": len(combo_expected), "actual": combo_result["total"]})

    noncat_params = {"search": sample["learnerId"], "paper": sample["courseCode"],
                     "department": sample["department"], "reviewStatus": sample["reviewStatus"]}
    _, no_category = api("/records", {**noncat_params, "pageSize": 10})
    _, with_category = api("/records", {**noncat_params, "category": sample["category"], "pageSize": 10})
    expected_scope = [r for r in all_records if summary_matches(r, noncat_params)]
    scope_counts = Counter(r["category"] for r in expected_scope)
    expected_scope_obj = {CATEGORY_KEYS[c]: scope_counts[c] for c in CATEGORY_ORDER}
    require(no_category["categoryCounts"] == expected_scope_obj
            and with_category["categoryCounts"] == expected_scope_obj,
            "category-count scope excludes selected category",
            {"expected": expected_scope_obj, "unfilteredSelection": no_category["categoryCounts"],
             "withCategory": with_category["categoryCounts"]})

    invalid_queries = [
        {"category": "Unknown"},
        {"reviewStatus": "Unknown"},
        {"sortBy": "invalid"},
        {"sortDirection": "sideways"},
        {"page": 0},
        {"page": "not-a-number"},
        {"pageSize": 11},
    ]
    for params in invalid_queries:
        status = expected_error("/records", 400, params)
        require(status == 400, "invalid records query returns 400", {"params": params, "status": status})
    missing_status = expected_error("/records/NOT_A_REAL_LEARNER/NOT_A_REAL_COURSE")
    require(missing_status == 404, "missing learner-paper detail returns 404", missing_status)

    # Root operational summary and public learner context must have exact, bounded shapes.
    _, advisor = api("/advisor/summary")
    require(exact_keys(advisor, ["learners", "learnerPaperRecords", "academicCategories",
                                 "reviewStatuses", "followUpsDueToday", "followUpsOverdue", "demoDate"]),
            "advisor summary exact public fields", sorted(advisor))
    require(advisor["learners"] == len(context_ids) and advisor["learnerPaperRecords"] == len(all_records)
            and advisor["academicCategories"] == expected_count_obj,
            "advisor summary source totals", advisor)
    require(exact_keys(advisor["reviewStatuses"], ["awaitingReview", "inReview", "reviewed"])
            and sum(advisor["reviewStatuses"].values()) == total,
            "advisor summary review status fields and record parity", advisor["reviewStatuses"])
    require(exact_keys(advisor["demoDate"], ["day", "week", "date", "dateLabel", "evidenceThrough", "evidenceDay"])
            and advisor["demoDate"]["evidenceDay"] == 28
            and advisor["demoDate"]["evidenceThrough"][:10] == "2026-08-16",
            "advisor summary evidence/date fields", advisor["demoDate"])

    _, reference = api("/reference")
    require(exact_keys(reference, ["categories", "indicators", "evidenceCutoff", "syntheticData", "datasetChecks"]),
            "reference response exact operational fields", sorted(reference))
    require([item["category"] for item in reference["categories"]] == CATEGORY_ORDER,
            "reference category ordering")
    require([item["count"] for item in reference["categories"]] == [expected_categories[c] for c in CATEGORY_ORDER],
            "reference category totals")
    require(reference["evidenceCutoff"] == "16 August 2026 · Day 28" and reference["syntheticData"] is True,
            "reference evidence cutoff and synthetic-data declaration")
    require(any("Protected fairness-audit data and later-outcome/validation files are not loaded" in item
                for item in reference["datasetChecks"]),
            "reference documents protected and later-outcome data exclusion")

    # Exercise selected detail records for special evidence cases and compare API facts to CSV.
    schedules = defaultdict(list)
    for assessment in assessments:
        schedules[(assessment["course_code"], assessment["course_offering_period"])].append(assessment)
    selected = {}
    for k, enrollment in enrol_by_key.items():
        schedule = schedules[(k[1], enrollment["course_offering_period"])]
        for a in schedule:
            sub = submission_by_assessment.get((k[0], k[1], enrollment["course_offering_period"], a["assessment_id"]))
            if sub and truth(sub["prior_credit_flag"]):
                selected.setdefault("prior credit", k)
            if integer(enrollment["registration_day"]) > 1:
                selected.setdefault("late registration", k)
            if num(indicator_by_key[k]["resource_engagement_coverage"]) is None or num(indicator_by_key[k]["latest_activity_day"]) is None:
                selected.setdefault("unavailable values", k)
            if num(indicator_by_key[k]["resource_engagement_coverage"]) == 0 or integer(indicator_by_key[k]["interacted_resource_count"]) == 0:
                selected.setdefault("reported zeros", k)
            if sub and num(sub.get("applicable_due_day")) is not None and num(sub.get("applicable_due_day")) != num(a.get("assessment_due_day")):
                selected.setdefault("learner-specific due date", k)
            if sub and num(sub.get("submission_day")) is not None and num(sub.get("submission_day")) <= 28 and num(sub.get("score_released_day")) is not None and num(sub.get("score_released_day")) <= 28 and sub.get("assessment_score", "") != "":
                selected.setdefault("Day 28 released score", k)
            if sub and num(sub.get("score_released_day")) is not None and num(sub.get("score_released_day")) > 28:
                selected.setdefault("post-cutoff release sample", k)
    counts["detailEvidenceSamples"] = {}
    for label, k in selected.items():
        _, envelope = api(f"/records/{k[0]}/{k[1]}")
        detail = envelope.get("record", envelope)
        counts["detailEvidenceSamples"][label] = f"{k[0]}/{k[1]}"
        src = dashboard_by_key[k]
        require(detail["learnerId"] == k[0] and detail["courseCode"] == k[1]
                and detail["paperTitle"] == src["paper_title"]
                and detail["category"] == src["calculated_priority_category"],
                "detail identity/source parity: " + label, k)
        record_enrollment = enrol_by_key[k]
        require(detail["registrationDay"] == integer(record_enrollment["registration_day"])
                and detail["opportunityDays"] == integer(record_enrollment["opportunity_days"]),
                "learner registration/opportunity evidence: " + label, k)
        context = next((r for r in contexts if r["learner_id"] == k[0]), None)
        learner_context = detail["learnerContext"]
        require(exact_keys(learner_context, ["priorEducationLevel", "previousAttemptCount", "creditLoad"])
                and learner_context["priorEducationLevel"] == (context["prior_education_level"] or None)
                and learner_context["previousAttemptCount"] == (integer(context["previous_attempt_count"]) if context["previous_attempt_count"] else None)
                and learner_context["creditLoad"] == (integer(context["credit_load"]) if context["credit_load"] else None),
                "learner context exact public fields/source parity: " + label, k)
        require(exact_keys(detail, ["learnerId", "courseCode", "paperTitle", "facultySchool", "department",
                                    "courseLevel", "offeringPeriod", "paperStructureType", "category", "reason",
                                    "concernDomains", "registrationDay", "opportunityDays", "learning",
                                    "assessmentParticipation", "earlyPerformanceConcern", "learnerContext", "review", "history"]),
                "detail exact public field set: " + label, sorted(detail))
        forbidden = {"protected", "fairness", "outcome_validation", "later_outcome", "validation_score",
                     "gender", "ethnicity", "disability", "score_released_day", "release_day"}
        leaked = sorted(k for k in flatten_keys(detail) if any(token in k.lower() for token in forbidden))
        require(not leaked, "detail excludes protected fields and release metadata: " + label, leaked)
        verify_detail_assessments(detail, k, record_enrollment, schedules, submission_by_assessment)
        assessment_rows = detail["assessmentParticipation"]["assessments"]
        if label == "prior credit":
            require(any(r["priorCredit"] and r["submissionStatus"] == "Prior credit" for r in assessment_rows),
                    "prior-credit evidence distinguished in detail")
        if label == "late registration":
            require(detail["registrationDay"] > 1, "late registration evidence sample")
        if label == "unavailable values":
            learning = detail["learning"]
            require(learning["engagementCoverage"] is None or learning["latestActivityDay"] is None,
                    "unavailable evidence remains null, not zero")
        if label == "reported zeros":
            require(detail["learning"]["interactedResources"] == 0 or detail["learning"]["engagementCoverage"] == 0,
                    "reported evidence zero remains numeric zero")
        if label == "learner-specific due date":
            require(any(row["dueDay"] is not None for row in assessment_rows),
                    "learner-specific due date evidence present")
        if label == "Day 28 released score":
            require(any(row["resultAvailable"] and row["submissionDate"] is not None
                        and row["submissionDate"][:10] <= "2026-08-16" for row in assessment_rows),
                    "Day 28 submission/released score evidence")
        if label == "post-cutoff release sample":
            late_assessments = {
                s["assessment_id"] for s in submissions
                if s["learner_id"] == k[0] and s["course_code"] == k[1]
                and num(s["score_released_day"]) is not None and num(s["score_released_day"]) > 28
            }
            require(all(next((r for r in assessment_rows if r["assessmentId"] == aid), {}).get("result") is None
                        for aid in late_assessments),
                    "API withholds post-Day-28 released scores")

    required_sample_labels = {"prior credit", "late registration", "unavailable values", "reported zeros",
                              "learner-specific due date", "Day 28 released score"}
    require(required_sample_labels.issubset(selected),
            "source contains all requested detailed evidence sample types",
            {"found": sorted(selected), "missing": sorted(required_sample_labels - set(selected))})
    counts["checksRun"] = len(checks)
    counts["failures"] = len(failures)
    print(json.dumps({"status": "PASS" if not failures else "FAIL", "counts": counts,
                      "checks": checks, "failures": failures}, indent=2, ensure_ascii=False))
    return 0 if not failures else 1


def summary_matches(row, filters):
    lower = lambda value: str(value or "").lower()
    if filters.get("search"):
        term = filters["search"].strip().lower()
        if not any(term in lower(row.get(f)) for f in
                   ("learnerId", "courseCode", "paperTitle", "department", "reason", "nextAction", "reviewStatus", "contactStatus")):
            return False
    if filters.get("paper") and not (
        lower(filters["paper"]) in lower(row["courseCode"])
        or lower(filters["paper"]) in lower(row["paperTitle"])
    ):
        return False
    if filters.get("department") and lower(filters["department"]) not in lower(row["department"]):
        return False
    if filters.get("category") and row["category"] != filters["category"]:
        return False
    if filters.get("reviewStatus") and row["reviewStatus"] != filters["reviewStatus"]:
        return False
    return True


def flatten_keys(value):
    keys = []
    if isinstance(value, dict):
        for name, item in value.items():
            keys.append(str(name))
            keys.extend(flatten_keys(item))
    elif isinstance(value, list):
        for item in value:
            keys.extend(flatten_keys(item))
    return keys


def verify_detail_assessments(detail, k, enrollment, schedules, submissions):
    actual = detail["assessmentParticipation"]["assessments"]
    offering = enrollment["course_offering_period"]
    expected = schedules[(k[1], offering)]
    expected_by_id = {a["assessment_id"]: a for a in expected}
    require(len(actual) == len(expected) and {r["assessmentId"] for r in actual} == set(expected_by_id),
            "detail assessment schedule exact for " + "/".join(k),
            {"actual": len(actual), "source": len(expected)})
    mismatches = []
    for evidence in actual:
        assessment = expected_by_id.get(evidence["assessmentId"])
        if not assessment:
            continue
        sub = submissions.get((k[0], k[1], offering, assessment["assessment_id"]))
        release = num(sub.get("score_released_day")) if sub else None
        submission_day = num(sub.get("submission_day")) if sub else None
        due = num(sub.get("applicable_due_day")) if sub else None
        if due is None:
            due = num(assessment.get("assessment_due_day"))
        result = None
        if (submission_day is not None and submission_day <= 28 and release is not None and release <= 28
                and sub.get("assessment_score", "") != ""):
            result = num(sub["assessment_score"])
        available_from = integer(assessment["assessment_available_from_day"])
        available_until = num(assessment["assessment_available_until_day"])
        opportunity_days = max(0, min(28, available_until if available_until is not None else 28)
                              - max(integer(enrollment["registration_day"]), available_from) + 1)
        expected_date = day_date(due) if due is not None and due > 0 else None
        expected_submission_date = day_date(submission_day) if submission_day is not None and submission_day <= 28 else None
        expected_submission_status = (
            "Prior credit" if sub and truth(sub["prior_credit_flag"])
            else "Submitted" if submission_day is not None and submission_day <= 28
            else "Not yet due" if due is None or due > 28
            else "Not submitted by Day 28" if sub
            else "No submission record"
        )
        if (evidence["priorCredit"] != bool(sub and truth(sub["prior_credit_flag"]))
            or evidence["dueDay"] != (int(due) if due is not None else None)
            or (evidence["applicableDueDate"][:10] if evidence["applicableDueDate"] else None) != expected_date
            or (evidence["submissionDate"][:10] if evidence["submissionDate"] else None) != expected_submission_date
            or evidence["submissionStatus"] != expected_submission_status
            or evidence["resultAvailable"] != (result is not None)
            or not approx_equal(evidence["result"], result)
            or evidence["learnerOpportunityDays"] != opportunity_days
            or evidence["weightPercent"] != (num(assessment["assessment_weight_percent"]) or 0)):
            mismatches.append(evidence["assessmentId"])
    require(not mismatches, "detailed assessment dates/status/scores/cutoff/opportunity match CSV for " + "/".join(k),
            {"mismatches": mismatches[:10]})


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        failures.append({"check": "script execution", "detail": f"{type(error).__name__}: {error}"})
        print(json.dumps({"status": "FAIL", "counts": {"checksRun": len(checks), "failures": len(failures)},
                          "checks": checks, "failures": failures}, indent=2, ensure_ascii=False))
        sys.exit(1)