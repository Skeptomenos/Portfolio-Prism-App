"""Tests for Data Quality Tracking - Validates score degradation and issue management."""

from __future__ import annotations

from portfolio_src.core.contracts import (
    DataQuality,
    IssueCategory,
    IssueSeverity,
    ValidationIssue,
)
from tests.contracts.factories import make_validation_issue


class TestValidationIssue:
    def test_to_dict(self) -> None:
        issue = make_validation_issue()
        d = issue.to_dict()
        assert d["severity"] == "medium"
        assert d["category"] == "schema"
        assert d["code"] == "TEST_ISSUE"
        assert d["message"] == "Test issue message"
        assert d["fix_hint"] == "Test fix hint"
        assert d["item"] == "TEST"
        assert d["phase"] == "TEST"
        assert "timestamp" in d

    def test_to_telemetry(self) -> None:
        issue = make_validation_issue(expected="100", actual="50")
        t = issue.to_telemetry()
        assert t["severity"] == "medium"
        assert t["category"] == "schema"
        assert t["code"] == "TEST_ISSUE"
        assert t["phase"] == "TEST"
        assert t["expected"] == "100"
        assert t["actual"] == "50"
        assert "message" not in t
        assert "fix_hint" not in t
        assert "item" not in t

    def test_timestamp_default(self) -> None:
        issue = make_validation_issue()
        assert issue.timestamp is not None
        assert len(issue.timestamp) > 0
        assert "T" in issue.timestamp


class TestDataQuality:
    def test_initial_score(self) -> None:
        q = DataQuality()
        assert q.score == 1.0

    def test_is_trustworthy_initial(self) -> None:
        q = DataQuality()
        assert q.is_trustworthy is True

    def test_critical_issue_penalty(self) -> None:
        q = DataQuality()
        q.add_issue(make_validation_issue(severity=IssueSeverity.CRITICAL))
        assert q.score == 0.75

    def test_high_issue_penalty(self) -> None:
        q = DataQuality()
        q.add_issue(make_validation_issue(severity=IssueSeverity.HIGH))
        assert q.score == 0.90

    def test_medium_issue_penalty(self) -> None:
        q = DataQuality()
        q.add_issue(make_validation_issue(severity=IssueSeverity.MEDIUM))
        assert q.score == 0.97

    def test_low_issue_penalty(self) -> None:
        q = DataQuality()
        q.add_issue(make_validation_issue(severity=IssueSeverity.LOW))
        assert q.score == 0.99

    def test_score_never_below_zero(self) -> None:
        q = DataQuality()
        for _ in range(10):
            q.add_issue(make_validation_issue(severity=IssueSeverity.CRITICAL))
        assert q.score == 0.0

    def test_is_trustworthy_threshold(self) -> None:
        q = DataQuality()
        q.add_issue(make_validation_issue(severity=IssueSeverity.MEDIUM))
        q.add_issue(make_validation_issue(severity=IssueSeverity.MEDIUM))
        assert q.score == 0.94
        assert q.is_trustworthy is False

    def test_has_critical_issues(self) -> None:
        q = DataQuality()
        assert q.has_critical_issues is False
        q.add_issue(make_validation_issue(severity=IssueSeverity.HIGH))
        assert q.has_critical_issues is False
        q.add_issue(make_validation_issue(severity=IssueSeverity.CRITICAL))
        assert q.has_critical_issues is True

    def test_merge_combines_issues(self) -> None:
        q1 = DataQuality()
        q1.add_issue(make_validation_issue(code="ISSUE_1"))
        q2 = DataQuality()
        q2.add_issue(make_validation_issue(code="ISSUE_2"))
        q1.merge(q2)
        assert len(q1.issues) == 2
        codes = [i.code for i in q1.issues]
        assert "ISSUE_1" in codes
        assert "ISSUE_2" in codes

    def test_merge_recalculates_score(self) -> None:
        q1 = DataQuality()
        q1.add_issue(make_validation_issue(severity=IssueSeverity.HIGH))
        q2 = DataQuality()
        q2.add_issue(make_validation_issue(severity=IssueSeverity.HIGH))
        q1.merge(q2)
        assert q1.score == 0.80

    def test_issue_count_by_severity(self) -> None:
        q = DataQuality()
        q.add_issue(make_validation_issue(severity=IssueSeverity.CRITICAL))
        q.add_issue(make_validation_issue(severity=IssueSeverity.HIGH))
        q.add_issue(make_validation_issue(severity=IssueSeverity.HIGH))
        q.add_issue(make_validation_issue(severity=IssueSeverity.MEDIUM))
        counts = q.issue_count_by_severity
        assert counts["critical"] == 1
        assert counts["high"] == 2
        assert counts["medium"] == 1
        assert counts["low"] == 0

    def test_issue_count_by_category(self) -> None:
        q = DataQuality()
        q.add_issue(make_validation_issue(category=IssueCategory.SCHEMA))
        q.add_issue(make_validation_issue(category=IssueCategory.WEIGHT))
        q.add_issue(make_validation_issue(category=IssueCategory.WEIGHT))
        counts = q.issue_count_by_category
        assert counts["schema"] == 1
        assert counts["weight"] == 2
        assert counts["resolution"] == 0

    def test_get_issues_for_phase(self) -> None:
        q = DataQuality()
        q.add_issue(make_validation_issue(phase="LOAD"))
        q.add_issue(make_validation_issue(phase="DECOMPOSE"))
        q.add_issue(make_validation_issue(phase="LOAD"))
        load_issues = q.get_issues_for_phase("LOAD")
        assert len(load_issues) == 2

    def test_to_summary(self) -> None:
        q = DataQuality()
        q.add_issue(make_validation_issue(severity=IssueSeverity.HIGH))
        summary = q.to_summary()
        assert summary["quality_score"] == 0.9
        assert summary["is_trustworthy"] is False
        assert summary["has_critical_issues"] is False
        assert summary["total_issues"] == 1
        assert "by_severity" in summary
        assert "by_category" in summary
        assert "issues" in summary
        assert len(summary["issues"]) == 1

    def test_to_user_message_trustworthy(self) -> None:
        q = DataQuality()
        msg = q.to_user_message()
        assert "Excellent" in msg
        assert "100%" in msg

    def test_to_user_message_critical(self) -> None:
        q = DataQuality()
        q.add_issue(make_validation_issue(severity=IssueSeverity.CRITICAL))
        msg = q.to_user_message()
        assert "Warning" in msg
        assert "critical" in msg

    def test_to_user_message_high(self) -> None:
        q = DataQuality()
        q.add_issue(make_validation_issue(severity=IssueSeverity.HIGH))
        msg = q.to_user_message()
        assert "Caution" in msg
        assert "high-priority" in msg

    def test_to_user_message_minor_issues(self) -> None:
        q = DataQuality()
        q.add_issue(make_validation_issue(severity=IssueSeverity.LOW))
        msg = q.to_user_message()
        assert "good" in msg
        assert "minor" in msg

    def test_to_user_message_not_trustworthy_no_high(self) -> None:
        q = DataQuality()
        for _ in range(3):
            q.add_issue(make_validation_issue(severity=IssueSeverity.MEDIUM))
        msg = q.to_user_message()
        assert "Some data quality issues" in msg
