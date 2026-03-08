"""Tests for the shared pipeline health report validator."""

from portfolio_src.core.contracts import validate_pipeline_health_report


def make_valid_report() -> dict:
    return {
        "timestamp": "2026-03-06T20:00:00Z",
        "metrics": {
            "direct_holdings": 5,
            "etf_positions": 2,
            "etfs_processed": 2,
            "tier1_resolved": 10,
            "tier1_failed": 1,
        },
        "performance": {
            "execution_time_seconds": 1.2,
            "phase_durations": {"loading": 0.1},
            "hive_hit_rate": 50.0,
            "api_fallback_rate": 50.0,
            "total_assets_processed": 12,
        },
        "decomposition": {
            "etfs_processed": 2,
            "etfs_failed": 1,
            "total_underlying": 120,
            "per_etf": [
                {
                    "isin": "IE00B4L5Y983",
                    "name": "World ETF",
                    "holdings_count": 100,
                    "weight_sum": 99.5,
                    "status": "success",
                }
            ],
        },
        "enrichment": {
            "stats": {
                "hive_hits": 10,
                "api_calls": 2,
                "new_contributions": 1,
            },
            "hive_log": {
                "contributions": ["US0378331005"],
                "hits": ["US02079K3059"],
            },
        },
        "failures": [
            {
                "severity": "ERROR",
                "stage": "decomposition",
                "item": "IE00B4L5Y983",
                "error": "Missing adapter",
                "fix": "Upload manual holdings",
            }
        ],
        "data_quality": {
            "quality_score": 0.92,
            "is_trustworthy": True,
            "total_issues": 0,
            "by_severity": {},
            "by_category": {},
            "issues": [],
        },
    }


def test_validate_pipeline_health_report_accepts_contract_complete_report() -> None:
    assert validate_pipeline_health_report(make_valid_report()) == []


def test_validate_pipeline_health_report_flags_missing_decomposition_summary() -> None:
    report = make_valid_report()
    report["decomposition"] = {"per_etf": []}

    errors = validate_pipeline_health_report(report)

    assert "decomposition.etfs_processed must be a number" in errors
    assert "decomposition.etfs_failed must be a number" in errors
    assert "decomposition.total_underlying must be a number" in errors
