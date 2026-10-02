#!/usr/bin/env python3
"""Isolated SEED V2 integration checks. Never prints session access codes."""
import argparse
import csv
import hashlib
import http.cookiejar
import json
import os
import subprocess
import tempfile
import uuid
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPCookieProcessor

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://localhost:80/api"
STATE = Path("/tmp/seed-v2-functional-state.json")
CLI = ROOT / "artifacts/api-server/dist/facilitator.mjs"
checks = []


def check(name, condition):
    checks.append({"name": name, "passed": bool(condition)})
    if not condition:
        raise AssertionError(name)


def day_date(day):
    return (date(2026, 7, 20) + timedelta(days=day - 1)).isoformat()


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.jar))

    def call(self, method, path, data=None, expected=(200, 201)):
        req = Request(BASE + path, method=method, headers={"Content-Type": "application/json"},
                      data=None if data is None else json.dumps(data).encode())
        try:
            response = self.opener.open(req, timeout=30)
            status, raw = response.status, response.read()
        except HTTPError as error:
            status, raw = error.code, error.read()
        check(f"{method} {path.split('?')[0]} HTTP {status}", status in expected)
        try:
            return json.loads(raw) if raw else None
        except json.JSONDecodeError:
            if status >= 400:
                return {"httpStatus": status}
            raise


def cli(*args, success=True):
    result = subprocess.run(["node", str(CLI), *map(str, args)], cwd=ROOT,
                            capture_output=True, text=True, timeout=45)
    # CLI output may contain routing/session information: never print it here.
    check("facilitator " + str(args[0]), (result.returncode == 0) == success)
    return result


def incoming(session, conversation, event, day, subject, body, success=True):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt") as text:
        text.write(body)
        text.flush()
        return cli("incoming", "--session-id", session["id"], "--conversation-id", conversation,
                   "--event-id", event, "--day", day, "--subject", subject,
                   "--text-file", text.name, success=success)


def no_private_fields(value):
    forbidden = {"email", "emailAddress", "recipientEmail", "routingAddress",
                 "ethnicity", "gender", "disability", "finalOutcome", "validationOutcome"}
    if isinstance(value, dict):
        return not forbidden.intersection(value) and all(no_private_fields(v) for v in value.values())
    if isinstance(value, list):
        return all(no_private_fields(v) for v in value)
    return True


def review(notes, current_day, **changes):
    value = dict(reviewStatus="In review", advisorNotes=notes, outcome="Follow-up planned",
                 nextAction="Discuss assessment requirements", followUpDate=day_date(30),
                 followUpCompleted=False, contactStatus="Not contacted",
                 effectiveDate=day_date(current_day))
    value.update(changes)
    return value


def action(current_day, **changes):
    value = dict(actionType="Refer to a support service", destination="Generic academic support",
                 details="Discuss suitable support with the learner", progress="Planned",
                 followUpDate=day_date(31), followUpCompleted=False,
                 effectiveDate=day_date(current_day))
    value.update(changes)
    return value


def source_data():
    directory = ROOT / "artifacts/api-server/data/academic"
    rows = list(csv.DictReader(next(directory.glob("09_*.csv")).open()))
    by_learner, categories = defaultdict(list), defaultdict(set)
    for row in rows:
        by_learner[row["learner_id"]].append(row)
        categories[row["calculated_priority_category"]].add(row["learner_id"])
    check("source totals 1400 learners / 3874 records", len(by_learner) == 1400 and len(rows) == 3874)
    check("505 distinct High Priority learners", len(categories["High Priority"]) == 505)
    check("1072 cross-paper category learners",
          sum(len({r["calculated_priority_category"] for r in papers}) > 1
              for papers in by_learner.values()) == 1072)
    original = ROOT / ".local/conversation-workspace/files/attached_assets"
    files = sorted(original.glob("*_final_*.csv"))
    check("all 12 final originals accessible", len(files) == 12)
    hashes = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    return rows, by_learner, hashes


def save_state(state):
    STATE.write_text(json.dumps(state))
    STATE.chmod(0o600)


def prepare():
    if STATE.exists():
        raise FileExistsError("Clean up the prior isolated verification sessions first.")
    rows, learners, hashes = source_data()
    marker = "seed-v2-test-" + uuid.uuid4().hex[:12]
    a, b = Client(), Client()
    sa = a.call("POST", "/session", {"label": marker + "-A"})
    sb = b.call("POST", "/session", {"label": marker + "-B"})
    state = dict(sessions=[sa, sb], marker=marker, hashes=hashes)
    save_state(state)  # Enables exact cleanup even if a later assertion fails.
    summary = a.call("GET", "/workspace/summary")
    check("original category record totals", summary["academicCategories"] ==
          dict(highPriority=581, reviewRecommended=968, insufficientEvidence=194, noCurrentConcern=2131))
    check("category-specific distinct learner totals", summary["academicCategoryLearners"] ==
          dict(highPriority=505, reviewRecommended=759, insufficientEvidence=186, noCurrentConcern=1231))
    check("two prepared conversations and one unread incoming reply",
          len(a.call("GET", "/conversations")["conversations"]) == 2 and summary["unreadReplies"] == 1)
    for session in (sa, sb):
        cli("setup-examples", "--session-id", session["id"])
    check("example setup idempotent", len(a.call("GET", "/conversations")["conversations"]) == 2)
    filtered = a.call("GET", "/workspace/records?" + urlencode({"category": "High Priority"}))
    check("high-priority filter record and learner counts", filtered["total"] == 581 and filtered["totalDistinctLearners"] == 505)
    check("selected category does not narrow category counts", filtered["categoryCounts"] == summary["academicCategories"])
    contacted = a.call("GET", "/workspace/records?" + urlencode({"contactStatus": "Response received", "category": "No Current Concern"}))
    check("contact filter applies to category count scope", contacted["categoryCounts"]["highPriority"] == 1
          and contacted["categoryLearnerCounts"]["highPriority"] == 1 and contacted["total"] == 0)
    learner, course = "STU000001", "INFOSYS100"
    path = f"/workspace/records/{learner}/{course}"
    before = a.call("GET", path)
    state.update(path=path, learner=learner, course=course, category=before["record"]["category"])
    save_state(state)
    check("verified cross-paper enrolments", {course} | {p["courseCode"] for p in before["otherPapers"]} ==
          {r["course_code"] for r in learners[learner]})
    check("opening leaves review awaiting", before["record"]["review"]["reviewStatus"] == "Awaiting review")
    a.call("PUT", path + "/review", review(marker, 29))
    text = "  Exact tester message.\nPlease explain assessment requirements. Café.  "
    subject = "  Assessment requirements — question  "
    links = [course] + [p["courseCode"] for p in before["otherPapers"] if p["courseCode"] != course][:1]
    send = dict(learnerId=learner, courseCodes=links, subject=subject, body=text, clientMessageId=uuid.uuid4().hex)
    conversation = a.call("POST", "/conversations", send)
    cid = conversation["id"]
    state.update(conversationId=cid, outgoingSubject=subject, outgoingBody=text)
    save_state(state)
    check("exact outgoing text retained", conversation["messages"][-1]["body"] == text and
          conversation["messages"][-1]["subject"] == subject)
    same = a.call("POST", "/conversations", send)
    check("send retry stores one message", same["id"] == cid and len(same["messages"]) == 1)
    a.call("POST", "/conversations", {**send, "body": "Different payload"}, expected=(409,))
    a.call("POST", "/conversations", {**send, "courseCodes": ["INVALID999"], "clientMessageId": uuid.uuid4().hex}, expected=(400, 404))
    a.call("GET", "/conversations/not-a-conversation", expected=(404,))
    b.call("GET", f"/conversations/{cid}", expected=(404,))
    check("isolated session review", b.call("GET", path)["record"]["review"]["advisorNotes"] == "")
    for code in links:
        linked = a.call("GET", f"/workspace/records/{learner}/{code}")
        check("only linked paper contact state updated", linked["record"]["review"]["contactStatus"] == "Awaiting response")
    for paper in before["otherPapers"]:
        if paper["courseCode"] not in links:
            unrelated = a.call("GET", f"/workspace/records/{learner}/{paper['courseCode']}")
            check("unrelated paper contact not claimed", unrelated["record"]["review"]["contactStatus"] == "Not contacted")
    check("no automatic incoming reply", not any(m["direction"] == "incoming" for m in conversation["messages"]))
    a.call("PUT", "/session/date", {"day": 30})
    check("date alone keeps Awaiting response", a.call("GET", path)["record"]["review"]["contactStatus"] == "Awaiting response")
    reply = "I can discuss the instructions. Please arrange a time."
    incoming(sa, cid, marker + "-incoming-1", 30, "Re: requirements", reply)
    received = a.call("GET", f"/conversations/{cid}")
    check("incoming correctly linked, exact, unread", received["messages"][-1]["body"] == reply and received["unreadCount"] == 1)
    check("incoming updates paper contact only", a.call("GET", path)["record"]["review"]["contactStatus"] == "Response received")
    incoming(sa, cid, marker + "-incoming-1", 30, "Re: requirements", reply)
    check("incoming event deduplicated", len(a.call("GET", f"/conversations/{cid}")["messages"]) == 2)
    a.call("POST", f"/conversations/{cid}/read")
    check("read separate from academic review", a.call("GET", path)["record"]["review"]["reviewStatus"] == "In review")
    incoming(sa, cid, marker + "-incoming-1", 30, "Re: requirements", reply)
    check("retry does not restore unread", a.call("GET", f"/conversations/{cid}")["unreadCount"] == 0)
    received_review = review(marker, 30, contactStatus="Response received", reviewStatus="Reviewed")
    a.call("PUT", path + "/review", received_review)
    referral = a.call("POST", path + "/support-actions", action(30, progress="Completed"))
    b.call("PUT", "/workspace/support-actions/" + referral["id"], action(30), expected=(404,))
    check("completed referral does not complete review follow-up",
          a.call("GET", path)["record"]["review"]["followUpCompleted"] is False)
    pending = a.call("POST", path + "/support-actions", action(30, actionType="Check in later"))
    a.call("PUT", "/session/date", {"day": 31})
    check("reviewed record still overdue", any(r["learnerId"] == learner and r["courseCode"] == course
          for r in a.call("GET", "/workspace/tracker?followUp=overdue")["records"]))
    a.call("PUT", "/workspace/support-actions/" + pending["id"], action(31, actionType="Check in later", progress="Cancelled"))
    check("cancelled support leaves due lists", a.call("GET", "/workspace/summary")["followUpsDueToday"] == 0)
    a.call("PUT", path + "/review", review(marker, 31, reviewStatus="Reviewed", contactStatus="No response recorded"))
    incoming(sa, cid, marker + "-incoming-2", 31, "Follow-up", "I have now read the instructions.")
    check("later reply replaces explicit no-response but retains decision", 
          a.call("GET", path)["record"]["review"]["contactStatus"] == "Response received" and
          any("No response recorded" in h["summary"] for h in a.call("GET", path)["record"]["history"]))
    new_message = dict(subject="Next steps", body="  Exact advisor reply\nsecond line  ", clientMessageId=uuid.uuid4().hex)
    after_reply = a.call("POST", f"/conversations/{cid}/messages", new_message)
    check("advisor reply exact", after_reply["messages"][-1]["body"] == new_message["body"])
    check("record and Inbox share conversation", any(c["id"] == cid for c in a.call("GET", path)["conversations"]) and
          any(c["id"] == cid for c in a.call("GET", "/conversations")["conversations"]))
    future = a.call("POST", path + "/support-actions", action(31, actionType="Check in later", followUpDate=day_date(42)))
    a.call("PUT", path + "/review", review(marker, 31, reviewStatus="Reviewed", contactStatus="Awaiting response", followUpCompleted=True))
    a.call("PUT", "/session/date", {"day": 42})
    due = a.call("GET", "/workspace/tracker?followUp=due")
    check("second-week follow-up becomes due", any(r["learnerId"] == learner and r["courseCode"] == course for r in due["records"]))
    a.call("PUT", "/workspace/support-actions/" + future["id"], action(42, actionType="Check in later", progress="Completed", followUpDate=day_date(42)))
    check("completed support removes outstanding record follow-up", not any(r["learnerId"] == learner and r["courseCode"] == course
          for r in a.call("GET", "/workspace/tracker?followUp=open")["records"]))
    a.call("PUT", "/session/date", {"day": 49})
    persisted_action = a.call("POST", path + "/support-actions",
                             action(49, actionType="Arrange a meeting", progress="In progress", followUpDate=day_date(50)))
    a.call("PUT", path + "/review", review(marker, 49, reviewStatus="Reviewed", contactStatus="Awaiting response", followUpCompleted=True))
    a.call("PUT", path + "/review", review(marker, 50), expected=(400, 409))
    a.call("PUT", path + "/review", {**review(marker, 49), "effectiveDate": "2026-02-30"}, expected=(400,))
    a.call("PUT", "/session/date", {"day": 30}, expected=(409,))
    a.call("POST", "/session/reset", {"confirm": "wrong"}, expected=(400,))
    a.call("GET", "/workspace/records?pageSize=17", expected=(400,))
    a.call("GET", "/workspace/records/unknown/unknown", expected=(404,))
    a.call("POST", f"/conversations/{cid}/incoming", {"body": "forbidden"}, expected=(404, 405))
    final = a.call("GET", path)
    check("categories unchanged by all support and message actions", final["record"]["category"] == state["category"]
          and a.call("GET", "/workspace/summary")["academicCategories"] == summary["academicCategories"])
    check("hidden routing and excluded fields absent", no_private_fields(final) and no_private_fields(a.call("GET", f"/conversations/{cid}")))
    own_b = b.call("POST", "/conversations", {**send, "body": marker + "-B exact", "clientMessageId": uuid.uuid4().hex})
    cli("setup-examples", "--session-id", sb["id"])
    check("example setup preserves tester message", b.call("GET", f"/conversations/{own_b['id']}")["messages"][-1]["body"] == marker + "-B exact")
    b.call("POST", "/session/reset", {"confirm": "RESET CURRENT SESSION"})
    check("reset restores only B examples and date", len(b.call("GET", "/conversations")["conversations"]) == 2
          and b.call("GET", "/session")["scenarioDate"]["day"] == 29)
    check("B reset preserves A messages/support", a.call("GET", f"/conversations/{cid}")["messageCount"] == after_reply["messageCount"]
          and len(a.call("GET", path)["supportActions"]) == len(final["supportActions"]))
    resumed = Client()
    check("resume preserves session", resumed.call("POST", "/session/resume", {"resumeCode": sa["resumeCode"]})["id"] == sa["id"])
    Client().call("POST", "/session/resume", {"resumeCode": "invalid-code-not-a-session"}, expected=(400, 401, 404))
    state.update(actionId=persisted_action["id"], expectedMessageCount=after_reply["messageCount"],
                 expectedHistoryCount=len(final["record"]["history"]), preparedChecks=checks)
    save_state(state)


def verify():
    state = json.loads(STATE.read_text())
    client = Client()
    client.call("POST", "/session/resume", {"resumeCode": state["sessions"][0]["resumeCode"]})
    workspace = client.call("GET", state["path"])
    conversation = client.call("GET", "/conversations/" + state["conversationId"])
    check("notes survive actual backend restart", workspace["record"]["review"]["advisorNotes"] == state["marker"])
    check("history survives actual restart", len(workspace["record"]["history"]) == state["expectedHistoryCount"])
    check("messages survive actual restart", conversation["messageCount"] == state["expectedMessageCount"])
    check("exact original content survives actual restart", conversation["messages"][0]["body"] == state["outgoingBody"]
          and conversation["messages"][0]["subject"] == state["outgoingSubject"])
    check("support action survives actual restart", any(a["id"] == state["actionId"] and a["progress"] == "In progress" for a in workspace["supportActions"]))
    check("scenario present survives actual restart", client.call("GET", "/session")["scenarioDate"]["day"] == 49)
    check("original CSV bytes unchanged", all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == digest
          for p, digest in state["hashes"].items()))
    checks[:0] = state["preparedChecks"]


def audit():
    """Read every operational summary and compare source-derived facets."""
    state = json.loads(STATE.read_text())
    client = Client()
    client.call("POST", "/session/resume", {"resumeCode": state["sessions"][0]["resumeCode"]})
    rows, learners, _ = source_data()
    all_records = []
    first = client.call("GET", "/workspace/records?pageSize=50&page=1")
    all_records.extend(first["records"])
    for page in range(2, first["totalPages"] + 1):
        all_records.extend(client.call("GET", f"/workspace/records?pageSize=50&page={page}")["records"])
    expected = {(r["learner_id"], r["course_code"]): r["calculated_priority_category"] for r in rows}
    check("all 3874 API category assignments equal CSV09", len(all_records) == len(expected) == 3874
          and {(r["learnerId"], r["courseCode"]): r["category"] for r in all_records} == expected)
    rank = {c: i for i, c in enumerate(["High Priority", "Review Recommended", "Insufficient Evidence", "No Current Concern"])}
    ordering = [(rank[r["category"]], r["learnerId"], r["courseCode"]) for r in all_records]
    check("stable category/learner/course ordering across all pages", ordering == sorted(ordering))
    keys = {"High Priority": "highPriority", "Review Recommended": "reviewRecommended",
            "Insufficient Evidence": "insufficientEvidence", "No Current Concern": "noCurrentConcern"}
    by_course = defaultdict(list)
    for row in rows:
        by_course[row["course_code"]].append(row)
    check("all 34 papers represented", len(by_course) == 34)
    for course, cohort in sorted(by_course.items()):
        page = client.call("GET", "/workspace/records?" + urlencode({"paper": course, "category": "High Priority", "pageSize": 50}))
        totals = Counter(r["calculated_priority_category"] for r in cohort)
        category_learners = {k: len({r["learner_id"] for r in cohort if r["calculated_priority_category"] == cat})
                             for cat, k in keys.items()}
        check(course + " filtered records", page["total"] == totals["High Priority"])
        check(course + " distinct learners", page["totalDistinctLearners"] == category_learners["highPriority"])
        check(course + " counts exclude category but respect paper", page["categoryCounts"] ==
              {k: totals[cat] for cat, k in keys.items()})
        check(course + " category-specific learner counts", page["categoryLearnerCounts"] == category_learners)
    directory = ROOT / "artifacts/api-server/data/academic"
    enrolments = {(r["learner_id"], r["course_code"]): r for r in
                  csv.DictReader(next(directory.glob("05_*.csv")).open())}
    for row in rows[:14]:
        learner, course = row["learner_id"], row["course_code"]
        workspace = client.call("GET", f"/workspace/records/{learner}/{course}")
        check(learner + "/" + course + " verified offering", workspace["record"]["offeringPeriod"] ==
              enrolments[(learner, course)]["course_offering_period"])
        check(learner + " all-paper category context", {p["courseCode"]: p["category"] for p in workspace["otherPapers"]} ==
              {r["course_code"]: r["calculated_priority_category"] for r in learners[learner]})
        check("operational fields excluded in detail", no_private_fields(workspace))
    final = client.call("GET", state["path"])
    check("Day29 history remains visible on Day49", any(h["effectiveDate"][:10] == day_date(29) for h in final["record"]["history"]))
    check("all history references original academic checkpoint", all(h.get("academicCheckpoint", "")[:10] == day_date(28)
          for h in final["record"]["history"]))
    check("routing addresses never returned", ".invalid" not in json.dumps(final) and
          ".invalid" not in json.dumps(all_records))


def regression():
    """Review follow-up remains visible after the support action completes."""
    state = json.loads(STATE.read_text())
    client = Client()
    session = state["sessions"][0]
    client.call("POST", "/session/resume", {"resumeCode": session["resumeCode"]})
    workspace = client.call("GET", state["path"])
    saved = review(state["marker"], 49, reviewStatus="Reviewed",
                   contactStatus=workspace["record"]["review"]["contactStatus"],
                   followUpDate=day_date(49), followUpCompleted=False)
    client.call("PUT", state["path"] + "/review", saved)
    existing = next(a for a in workspace["supportActions"] if a["id"] == state["actionId"])
    updated = {k: existing[k] for k in ["actionType", "destination", "details"]}
    updated.update(progress="Completed", followUpDate=day_date(50),
                   followUpCompleted=True, effectiveDate=day_date(49))
    client.call("PUT", "/workspace/support-actions/" + state["actionId"], updated)
    incoming(session, state["conversationId"], state["marker"] + "-regression-incoming",
             49, "Meeting", "I can arrange a time to discuss the requirements.")
    page = client.call("GET", "/workspace/tracker?" + urlencode({"search": state["learner"], "followUp": "due"}))
    row = next(r for r in page["records"] if r["courseCode"] == state["course"])
    check("tracker retains independent review follow-up", row["nextFollowUpDate"][:10] == day_date(49)
          and row["outstandingFollowUpCount"] == 1)
    check("review/contact/support/category coexist", row["reviewStatus"] == "Reviewed" and
          row["contactStatus"] == "Response received" and row["supportProgress"] == "Completed"
          and row["category"] == state["category"])
    client.call("PUT", state["path"] + "/review", {**saved, "contactStatus": "Response received", "followUpCompleted": True})
    complete = client.call("GET", "/workspace/tracker?" + urlencode({"search": state["learner"]}))
    row = next(r for r in complete["records"] if r["courseCode"] == state["course"])
    check("only completing review follow-up clears its tracker item", row["nextFollowUpDate"] is None
          and row["outstandingFollowUpCount"] == 0)


def cleanup():
    if not STATE.exists():
        return
    state = json.loads(STATE.read_text())
    for session in state["sessions"]:
        cli("delete-test-session", "--session-id", session["id"], "--confirm", "DELETE-TEST-SESSION")
    STATE.unlink()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["prepare", "verify", "audit", "regression", "cleanup"])
    args = parser.parse_args()
    try:
        globals()[args.mode]()
        print(json.dumps({"status": "PASS", "mode": args.mode, "checks": len(checks), "failed": []}, indent=2))
    except Exception as error:
        # No raw API bodies, cookies, addresses, access codes or CLI output.
        print(json.dumps({"status": "FAIL", "mode": args.mode, "checks": len(checks),
                          "failed": [c["name"] for c in checks if not c["passed"]],
                          "errorType": type(error).__name__}, indent=2))
        raise SystemExit(1)