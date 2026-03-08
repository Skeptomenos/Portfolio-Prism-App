"""Validation helpers for the pipeline health report contract."""

from __future__ import annotations

from typing import Any


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_pipeline_health_report(report: Any) -> list[str]:
    """Validate the JSON shape served to the frontend diagnostics views."""
    errors: list[str] = []

    if not isinstance(report, dict):
        return ["report must be an object"]

    def require_string(container: dict[str, Any], key: str, path: str) -> None:
        if not isinstance(container.get(key), str):
            errors.append(f"{path} must be a string")

    def require_number(container: dict[str, Any], key: str, path: str) -> None:
        if not _is_number(container.get(key)):
            errors.append(f"{path} must be a number")

    def require_bool(container: dict[str, Any], key: str, path: str) -> None:
        if not isinstance(container.get(key), bool):
            errors.append(f"{path} must be a boolean")

    def require_list(container: dict[str, Any], key: str, path: str) -> list[Any] | None:
        value = container.get(key)
        if not isinstance(value, list):
            errors.append(f"{path} must be a list")
            return None
        return value

    def require_dict(container: dict[str, Any], key: str, path: str) -> dict[str, Any] | None:
        value = container.get(key)
        if not isinstance(value, dict):
            errors.append(f"{path} must be an object")
            return None
        return value

    require_string(report, "timestamp", "timestamp")

    metrics = require_dict(report, "metrics", "metrics")
    if metrics is not None:
        require_number(metrics, "direct_holdings", "metrics.direct_holdings")
        require_number(metrics, "etf_positions", "metrics.etf_positions")
        require_number(metrics, "etfs_processed", "metrics.etfs_processed")
        require_number(metrics, "tier1_resolved", "metrics.tier1_resolved")
        require_number(metrics, "tier1_failed", "metrics.tier1_failed")

    performance = require_dict(report, "performance", "performance")
    if performance is not None:
        require_number(performance, "execution_time_seconds", "performance.execution_time_seconds")
        if not isinstance(performance.get("phase_durations"), dict):
            errors.append("performance.phase_durations must be an object")
        require_number(performance, "hive_hit_rate", "performance.hive_hit_rate")
        require_number(performance, "api_fallback_rate", "performance.api_fallback_rate")
        require_number(performance, "total_assets_processed", "performance.total_assets_processed")

    failures = require_list(report, "failures", "failures")
    if failures is not None:
        for index, failure in enumerate(failures):
            if not isinstance(failure, dict):
                errors.append(f"failures[{index}] must be an object")
                continue
            require_string(failure, "severity", f"failures[{index}].severity")
            require_string(failure, "stage", f"failures[{index}].stage")
            require_string(failure, "item", f"failures[{index}].item")
            require_string(failure, "error", f"failures[{index}].error")
            fix = failure.get("fix")
            if fix is not None and not isinstance(fix, str):
                errors.append(f"failures[{index}].fix must be a string")

    decomposition = report.get("decomposition")
    if decomposition is not None:
        if not isinstance(decomposition, dict):
            errors.append("decomposition must be an object")
        else:
            require_number(decomposition, "etfs_processed", "decomposition.etfs_processed")
            require_number(decomposition, "etfs_failed", "decomposition.etfs_failed")
            require_number(decomposition, "total_underlying", "decomposition.total_underlying")
            per_etf = require_list(decomposition, "per_etf", "decomposition.per_etf")
            if per_etf is not None:
                for index, item in enumerate(per_etf):
                    if not isinstance(item, dict):
                        errors.append(f"decomposition.per_etf[{index}] must be an object")
                        continue
                    require_string(item, "isin", f"decomposition.per_etf[{index}].isin")
                    require_string(item, "name", f"decomposition.per_etf[{index}].name")
                    require_number(item, "holdings_count", f"decomposition.per_etf[{index}].holdings_count")
                    require_string(item, "status", f"decomposition.per_etf[{index}].status")
                    weight_sum = item.get("weight_sum")
                    if weight_sum is not None and not _is_number(weight_sum):
                        errors.append(f"decomposition.per_etf[{index}].weight_sum must be a number")

    enrichment = report.get("enrichment")
    if enrichment is not None:
        if not isinstance(enrichment, dict):
            errors.append("enrichment must be an object")
        else:
            stats = require_dict(enrichment, "stats", "enrichment.stats")
            if stats is not None:
                require_number(stats, "hive_hits", "enrichment.stats.hive_hits")
                require_number(stats, "api_calls", "enrichment.stats.api_calls")
                require_number(stats, "new_contributions", "enrichment.stats.new_contributions")
            hive_log = enrichment.get("hive_log")
            if hive_log is not None:
                if not isinstance(hive_log, dict):
                    errors.append("enrichment.hive_log must be an object")
                else:
                    require_list(hive_log, "contributions", "enrichment.hive_log.contributions")
                    require_list(hive_log, "hits", "enrichment.hive_log.hits")

    etf_stats = report.get("etf_stats")
    if etf_stats is not None:
        if not isinstance(etf_stats, list):
            errors.append("etf_stats must be a list")
        else:
            for index, item in enumerate(etf_stats):
                if not isinstance(item, dict):
                    errors.append(f"etf_stats[{index}] must be an object")
                    continue
                require_string(item, "ticker", f"etf_stats[{index}].ticker")
                require_number(item, "holdings_count", f"etf_stats[{index}].holdings_count")
                require_number(item, "weight_sum", f"etf_stats[{index}].weight_sum")
                require_string(item, "status", f"etf_stats[{index}].status")

    data_quality = report.get("data_quality")
    if data_quality is not None:
        if not isinstance(data_quality, dict):
            errors.append("data_quality must be an object")
        else:
            require_number(data_quality, "quality_score", "data_quality.quality_score")
            require_bool(data_quality, "is_trustworthy", "data_quality.is_trustworthy")
            require_number(data_quality, "total_issues", "data_quality.total_issues")
            if not isinstance(data_quality.get("by_severity"), dict):
                errors.append("data_quality.by_severity must be an object")
            if not isinstance(data_quality.get("by_category"), dict):
                errors.append("data_quality.by_category must be an object")
            issues = require_list(data_quality, "issues", "data_quality.issues")
            if issues is not None:
                for index, item in enumerate(issues):
                    if not isinstance(item, dict):
                        errors.append(f"data_quality.issues[{index}] must be an object")
                        continue
                    require_string(item, "severity", f"data_quality.issues[{index}].severity")
                    require_string(item, "category", f"data_quality.issues[{index}].category")
                    require_string(item, "code", f"data_quality.issues[{index}].code")
                    require_string(item, "message", f"data_quality.issues[{index}].message")
                    require_string(item, "fix_hint", f"data_quality.issues[{index}].fix_hint")
                    require_string(item, "item", f"data_quality.issues[{index}].item")
                    require_string(item, "phase", f"data_quality.issues[{index}].phase")

    return errors
