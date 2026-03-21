import pytest
from unittest.mock import patch, MagicMock

from portfolio_src.prism_utils.telemetry import Telemetry
from portfolio_src.core.contracts.quality import (
    DataQuality,
    ValidationIssue,
    IssueSeverity,
    IssueCategory,
)


@pytest.fixture
def telemetry():
    with patch.dict("os.environ", {"TELEMETRY_ENABLED": "true"}):
        t = Telemetry()
        t._should_report = MagicMock(return_value=True)
        t._create_issue = MagicMock(
            return_value={"html_url": "https://github.com/test"}
        )
        return t


class TestReportWeightValidationFailure:
    def test_creates_correct_title(self, telemetry):
        telemetry.report_weight_validation_failure(
            etf_isin="IE00B4L5Y983",
            weight_sum=85.5,
            adapter="ishares",
        )

        call_args = telemetry._create_issue.call_args
        title = call_args[0][0]
        assert title == "Weight validation failed: IE00B4L5Y983"

    def test_body_includes_required_fields(self, telemetry):
        telemetry.report_weight_validation_failure(
            etf_isin="IE00B4L5Y983",
            weight_sum=85.5,
            adapter="ishares",
        )

        call_args = telemetry._create_issue.call_args
        body = call_args[0][1]

        assert "IE00B4L5Y983" in body
        assert "85.50%" in body
        assert "90-110%" in body
        assert "ishares" in body
        assert "undercounted by 14.5%" in body

    def test_overcounted_impact_message(self, telemetry):
        telemetry.report_weight_validation_failure(
            etf_isin="IE00B4L5Y983",
            weight_sum=115.0,
            adapter="vanguard",
        )

        call_args = telemetry._create_issue.call_args
        body = call_args[0][1]

        assert "overcounted by 15.0%" in body

    def test_labels_include_adapter(self, telemetry):
        telemetry.report_weight_validation_failure(
            etf_isin="IE00B4L5Y983",
            weight_sum=85.5,
            adapter="ishares",
        )

        call_args = telemetry._create_issue.call_args
        labels = call_args[0][2]

        assert "data-quality" in labels
        assert "validation" in labels
        assert "ishares" in labels


class TestReportEnrichmentGap:
    def test_handles_more_than_10_isins(self, telemetry):
        isins = [f"ISIN{i:04d}" for i in range(15)]

        telemetry.report_enrichment_gap(
            gap_type="sector",
            affected_isins=isins,
            coverage_rate=0.75,
        )

        call_args = telemetry._create_issue.call_args
        body = call_args[0][1]

        assert "ISIN0000" in body
        assert "ISIN0009" in body
        assert "...and 5 more" in body

    def test_title_format(self, telemetry):
        telemetry.report_enrichment_gap(
            gap_type="geography",
            affected_isins=["ISIN1", "ISIN2"],
            coverage_rate=0.85,
        )

        call_args = telemetry._create_issue.call_args
        title = call_args[0][0]

        assert title == "Enrichment gap: geography coverage at 85%"

    def test_labels_include_gap_type(self, telemetry):
        telemetry.report_enrichment_gap(
            gap_type="sector",
            affected_isins=["ISIN1"],
            coverage_rate=0.90,
        )

        call_args = telemetry._create_issue.call_args
        labels = call_args[0][2]

        assert "data-quality" in labels
        assert "enrichment" in labels
        assert "sector" in labels


class TestReportQualitySummary:
    def test_returns_none_for_trustworthy_quality(self, telemetry):
        quality = DataQuality(score=0.98, issues=[])

        result = telemetry.report_quality_summary(quality, "session123")

        assert result is None
        telemetry._create_issue.assert_not_called()

    def test_returns_none_when_no_critical_or_high_issues(self, telemetry):
        quality = DataQuality(score=0.80, issues=[])
        quality.add_issue(
            ValidationIssue(
                severity=IssueSeverity.MEDIUM,
                category=IssueCategory.ENRICHMENT,
                code="MISSING_SECTOR",
                message="Missing sector data",
                fix_hint="Add sector data",
                item="ISIN123",
                phase="ENRICHMENT",
            )
        )

        result = telemetry.report_quality_summary(quality, "session123")

        assert result is None

    def test_reports_when_critical_issues_exist(self, telemetry):
        quality = DataQuality(score=0.50, issues=[])
        quality.add_issue(
            ValidationIssue(
                severity=IssueSeverity.CRITICAL,
                category=IssueCategory.WEIGHT,
                code="WEIGHT_SUM_VERY_LOW",
                message="Weight sum critically low",
                fix_hint="Check data source",
                item="ISIN123",
                phase="DECOMPOSITION",
            )
        )

        telemetry.report_quality_summary(quality, "session123")

        telemetry._create_issue.assert_called_once()
        call_args = telemetry._create_issue.call_args
        title = call_args[0][0]
        assert "1 critical" in title

    def test_groups_issues_by_code(self, telemetry):
        quality = DataQuality(score=0.50, issues=[])
        for _ in range(3):
            quality.add_issue(
                ValidationIssue(
                    severity=IssueSeverity.HIGH,
                    category=IssueCategory.WEIGHT,
                    code="WEIGHT_SUM_LOW",
                    message="Weight sum low",
                    fix_hint="Check data",
                    item="ISIN123",
                    phase="DECOMPOSITION",
                )
            )

        telemetry.report_quality_summary(quality, "session123")

        call_args = telemetry._create_issue.call_args
        body = call_args[0][1]

        assert "WEIGHT_SUM_LOW" in body
        assert "| 3 |" in body
