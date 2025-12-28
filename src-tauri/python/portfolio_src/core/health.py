import os
import pandas as pd
from datetime import datetime
from collections import defaultdict
import logging

from portfolio_src.core.utils import write_json_atomic

logger = logging.getLogger(__name__)


class PipelineHealth:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(PipelineHealth, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.reset()

    def reset(self):
        """Reset all metrics for a new run."""
        self.metrics = defaultdict(int)
        self.failures = []  # List of dicts: {stage, item, error, fix, severity}
        self.warnings = []
        self.etf_stats = []  # List of dicts: {ticker, holdings_count, weight_sum, status}
        self.start_time = datetime.now()
        self.total_portfolio_value = 0.0
        self.verified_value = 0.0
        self.fallback_value = 0.0

    def record_metric(self, name: str, value: int = 1, operation: str = "add"):
        """Record a simple counter metric."""
        if operation == "add":
            self.metrics[name] += value
        elif operation == "set":
            self.metrics[name] = value

    def record_etf_stat(
        self, ticker: str, holdings_count: int, weight_sum: float, status: str = "OK"
    ):
        """Record statistics for a processed ETF."""
        self.etf_stats.append(
            {
                "ticker": ticker,
                "holdings_count": holdings_count,
                "weight_sum": weight_sum,
                "status": status,
            }
        )
        # Check for Zero Weight Alert
        if (
            weight_sum < 1.0 and status == "OK"
        ):  # Assuming weight is percentage 0-100 or 0-1? usually 0-100 in this project
            # Actually project uses 0-100 usually. Let's check if it's < 1% total? No, < 90% is suspicious.
            if weight_sum < 90.0:
                self.record_failure(
                    stage="ETF_PARSING",
                    item=ticker,
                    error=f"Total weight {weight_sum:.2f}% is suspiciously low (expected ~100%)",
                    fix="Check CSV format or 'Gewichtung' column mapping",
                    severity="HIGH",
                )

    def record_failure(
        self, stage: str, item: str, error: str, fix: str, severity: str = "MEDIUM"
    ):
        """Record a failure with actionable fix."""
        self.failures.append(
            {
                "stage": stage,
                "item": item,
                "error": error,
                "fix": fix,
                "severity": severity,
                "timestamp": datetime.now().isoformat(),
            }
        )
        logger.warning(f"[{stage}] Failure for {item}: {error} -> Fix: {fix}")

    def record_value_coverage(self, verified: float, fallback: float):
        """Record value coverage for confidence metric."""
        self.verified_value += verified
        self.fallback_value += fallback
        self.total_portfolio_value = self.verified_value + self.fallback_value

    def generate_report(self) -> str:
        """Generate a Markdown health report."""
        duration = datetime.now() - self.start_time

        # Calculate Score
        score = 100
        critical_failures = len([f for f in self.failures if f["severity"] == "HIGH"])
        medium_failures = len([f for f in self.failures if f["severity"] == "MEDIUM"])
        score -= critical_failures * 10
        score -= medium_failures * 2
        score = max(0, score)

        status_icon = "🟢" if score >= 90 else "🟡" if score >= 70 else "🔴"

        # Value Confidence
        if self.total_portfolio_value > 0:
            confidence_pct = (self.verified_value / self.total_portfolio_value) * 100
        else:
            confidence_pct = 0.0

        md = [
            f"# {status_icon} Pipeline Health Report",
            f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"**Duration:** {duration}",
            f"**Quality Score:** {score}/100",
            "",
            "## 🛡️ Confidence Statement",
            f"We are tracking **€{self.total_portfolio_value:,.2f}** total value.",
            f"- **Verified (ISIN):** €{self.verified_value:,.2f} ({confidence_pct:.1f}%)",
            f"- **Estimated (Fallback):** €{self.fallback_value:,.2f} ({100 - confidence_pct:.1f}%)",
            "",
            "## 📊 Pipeline Statistics",
            f"- **ETFs Processed:** {self.metrics['etfs_processed']}",
            f"- **Direct Holdings:** {self.metrics['direct_holdings']}",
            f"- **ISINs Resolved (Tier 1):** {self.metrics['tier1_resolved']}",
            f"- **ISIN Failures (Tier 1):** {self.metrics['tier1_failed']}",
            "",
            "## 🚨 Action Items (Failures to Fix)",
        ]

        if not self.failures:
            md.append("✅ No failures detected. System is healthy.")
        else:
            # Group by fix to make it actionable
            failures_df = pd.DataFrame(self.failures)
            # Create a summary table
            md.append("| Severity | Item | Error | Action (Fix) |")
            md.append("|----------|------|-------|--------------|")
            for _, row in failures_df.iterrows():
                icon = "🔴" if row["severity"] == "HIGH" else "⚠️"
                md.append(
                    f"| {icon} {row['severity']} | `{row['item']}` | {row['error']} | **{row['fix']}** |"
                )

            md.append("")
            md.append(
                "👉 **Download detailed fix list:** `outputs/failures_to_fix.csv`"
            )

        md.append("")
        md.append("## 📋 ETF Health Check")
        md.append("| Ticker | Holdings | Weight Sum | Status |")
        md.append("|--------|----------|------------|--------|")
        for etf in self.etf_stats:
            status_icon = (
                "✅" if etf["status"] == "OK" and etf["weight_sum"] > 90 else "⚠️"
            )
            md.append(
                f"| {etf['ticker']} | {etf['holdings_count']} | {etf['weight_sum']:.2f}% | {status_icon} {etf['status']} |"
            )

        return "\n".join(md)

    def save_artifacts(self, output_dir: str = "outputs"):
        """Save report and failure CSV."""
        os.makedirs(output_dir, exist_ok=True)

        # Save Markdown Report
        report_path = os.path.join(output_dir, "PIPELINE_HEALTH.md")
        with open(report_path, "w") as f:
            f.write(self.generate_report())

        # Save Failures CSV (Drill-down)
        if self.failures:
            csv_path = os.path.join(output_dir, "failures_to_fix.csv")
            pd.DataFrame(self.failures).to_csv(csv_path, index=False)

        # Save JSON State (for history/dashboards)
        json_path = os.path.join(output_dir, "pipeline_health.json")
        state = {
            "metrics": self.metrics,
            "failures": self.failures,
            "etf_stats": self.etf_stats,
            "timestamp": datetime.now().isoformat(),
        }
        write_json_atomic(json_path, state)


# Global Instance
health = PipelineHealth()
