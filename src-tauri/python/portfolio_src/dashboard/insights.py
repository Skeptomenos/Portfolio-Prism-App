"""
Portfolio Insights Module

Generates educational text insights from portfolio data.
All functions return text/data for display - no UI code here.

Tone: Educational (explains what metrics mean, what data shows)
Approach: Factual observations, not prescriptive recommendations
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional, List, Tuple
import pandas as pd


@dataclass
class InsightMessage:
    """A single insight message with severity level."""

    text: str
    level: Literal["info", "success", "warning", "error"]


@dataclass
class PortfolioSummary:
    """Summary of portfolio performance."""

    headline: str
    total_value: float
    total_pl: float
    total_pl_pct: float
    winners_count: int
    losers_count: int
    total_count: int
    best_performer: str
    best_performer_pct: float
    worst_performer: str
    worst_performer_pct: float
    observations: List[InsightMessage]


def generate_portfolio_summary(df: pd.DataFrame) -> Optional[PortfolioSummary]:
    """
    Generate portfolio-level P/L summary with educational insights.

    Args:
        df: DataFrame with columns: name, current_value, cost_basis, pl_absolute, pl_percent

    Returns:
        PortfolioSummary dataclass or None if data is empty
    """
    if df.empty:
        return None

    total_value = df["current_value"].sum()
    total_cost = df["cost_basis"].sum()
    total_pl = total_value - total_cost
    total_pl_pct = ((total_value / total_cost) - 1) * 100 if total_cost > 0 else 0

    winners = df[df["pl_percent"] > 0]
    losers = df[df["pl_percent"] < 0]

    # Best and worst performers
    if not df.empty:
        best_idx = df["pl_percent"].idxmax()
        worst_idx = df["pl_percent"].idxmin()
        best_performer = str(df.loc[best_idx, "name"])
        best_pct = float(df.loc[best_idx, "pl_percent"])
        worst_performer = str(df.loc[worst_idx, "name"])
        worst_pct = float(df.loc[worst_idx, "pl_percent"])
    else:
        best_performer = "N/A"
        best_pct = 0.0
        worst_performer = "N/A"
        worst_pct = 0.0

    # Generate headline
    if total_pl >= 0:
        headline = f"Your portfolio is up EUR {total_pl:,.0f} ({total_pl_pct:+.1f}%)"
    else:
        headline = (
            f"Your portfolio is down EUR {abs(total_pl):,.0f} ({total_pl_pct:.1f}%)"
        )

    # Generate observations
    observations = []

    # Winner/loser ratio observation
    winner_ratio = len(winners) / len(df) * 100 if len(df) > 0 else 0
    if winner_ratio >= 70:
        observations.append(
            InsightMessage(
                text=f"{len(winners)} of {len(df)} positions are profitable ({winner_ratio:.0f}%). "
                "A high win rate indicates consistent stock selection.",
                level="success",
            )
        )
    elif winner_ratio >= 50:
        observations.append(
            InsightMessage(
                text=f"{len(winners)} of {len(df)} positions are profitable ({winner_ratio:.0f}%). "
                "More than half your positions are in the green.",
                level="info",
            )
        )
    else:
        observations.append(
            InsightMessage(
                text=f"Only {len(winners)} of {len(df)} positions are profitable ({winner_ratio:.0f}%). "
                "More positions are currently underwater than in profit.",
                level="warning",
            )
        )

    # Best performer observation
    if best_pct > 100:
        observations.append(
            InsightMessage(
                text=f"Your best performer is {best_performer} at +{best_pct:.0f}% - "
                "this position has more than doubled since purchase.",
                level="success",
            )
        )
    elif best_pct > 50:
        observations.append(
            InsightMessage(
                text=f"Your best performer is {best_performer} at +{best_pct:.0f}%.",
                level="info",
            )
        )

    # Worst performer observation
    if worst_pct < -50:
        observations.append(
            InsightMessage(
                text=f"Your worst performer is {worst_performer} at {worst_pct:.0f}% - "
                "this position has lost more than half its value since purchase.",
                level="warning",
            )
        )
    elif worst_pct < -20:
        observations.append(
            InsightMessage(
                text=f"Your worst performer is {worst_performer} at {worst_pct:.0f}%.",
                level="info",
            )
        )

    return PortfolioSummary(
        headline=headline,
        total_value=total_value,
        total_pl=total_pl,
        total_pl_pct=total_pl_pct,
        winners_count=len(winners),
        losers_count=len(losers),
        total_count=len(df),
        best_performer=best_performer,
        best_performer_pct=best_pct,
        worst_performer=worst_performer,
        worst_performer_pct=worst_pct,
        observations=observations,
    )


def generate_performance_insights(df: pd.DataFrame) -> List[InsightMessage]:
    """
    Generate insights about P/L performance.

    Args:
        df: DataFrame with columns: name, pl_absolute, pl_percent, current_value

    Returns:
        List of InsightMessage objects
    """
    if df.empty:
        return []

    insights = []

    # Check for extreme gainers
    extreme_gainers = df[df["pl_percent"] > 100]
    if len(extreme_gainers) > 0:
        names_series = extreme_gainers["name"]
        names = ", ".join(list(names_series.iloc[:3]))
        insights.append(
            InsightMessage(
                text=f"**Double-ups:** {len(extreme_gainers)} position(s) have more than doubled: {names}.",
                level="success",
            )
        )

    # Check for significant losses
    big_losers = df[df["pl_percent"] < -30]
    if len(big_losers) > 0:
        total_loss = big_losers["pl_absolute"].sum()
        insights.append(
            InsightMessage(
                text=f"**Deep drawdowns:** {len(big_losers)} position(s) are down more than 30%, "
                f"representing EUR {abs(total_loss):,.0f} in unrealized losses.",
                level="warning",
            )
        )

    # Check for unrealized gain concentration
    total_gains = df[df["pl_absolute"] > 0]["pl_absolute"].sum()
    if total_gains > 0:
        top_gainer = df.nlargest(1, "pl_absolute")
        top_gain = float(top_gainer["pl_absolute"].iloc[0])
        top_gain_pct = top_gain / total_gains * 100
        if top_gain_pct > 50:
            insights.append(
                InsightMessage(
                    text=f"**Gain concentration:** {top_gain_pct:.0f}% of your total gains "
                    f"come from a single position ({top_gainer['name'].iloc[0]}).",
                    level="info",
                )
            )

    return insights


def generate_concentration_insights(
    hhi: float,
    top_5_pct: float,
    top_10_pct: float,
    max_single_pct: float,
) -> List[InsightMessage]:
    """
    Generate educational insights about portfolio concentration.

    Args:
        hhi: Herfindahl-Hirschman Index (0-1 scale)
        top_5_pct: Percentage of portfolio in top 5 holdings
        top_10_pct: Percentage of portfolio in top 10 holdings
        max_single_pct: Percentage of largest single holding

    Returns:
        List of InsightMessage objects
    """
    insights = []

    # HHI interpretation
    if hhi < 0.01:
        insights.append(
            InsightMessage(
                text="**Highly Diversified (HHI < 0.01):** Your portfolio is spread across many positions. "
                "No single holding dominates, which reduces idiosyncratic risk.",
                level="success",
            )
        )
    elif hhi < 0.015:
        insights.append(
            InsightMessage(
                text="**Well Diversified (HHI 0.01-0.015):** Your portfolio has good balance. "
                "Risk is distributed reasonably across your holdings.",
                level="success",
            )
        )
    elif hhi < 0.025:
        insights.append(
            InsightMessage(
                text="**Moderate Concentration (HHI 0.015-0.025):** A few positions have outsized weight. "
                "This increases sensitivity to individual stock movements.",
                level="warning",
            )
        )
    else:
        insights.append(
            InsightMessage(
                text="**High Concentration (HHI > 0.025):** Your portfolio is heavily weighted in few positions. "
                "Performance will be strongly influenced by these holdings.",
                level="error",
            )
        )

    # Top 5 concentration
    if top_5_pct > 70:
        insights.append(
            InsightMessage(
                text=f"**Top-heavy:** Your top 5 holdings represent {top_5_pct:.0f}% of your portfolio. "
                "The remaining positions have minimal impact on overall performance.",
                level="warning",
            )
        )
    elif top_5_pct > 50:
        insights.append(
            InsightMessage(
                text=f"**Concentrated core:** Your top 5 holdings represent {top_5_pct:.0f}% of your portfolio.",
                level="info",
            )
        )

    # Single stock risk
    if max_single_pct > 20:
        insights.append(
            InsightMessage(
                text=f"**Single-stock risk:** One position is {max_single_pct:.1f}% of your portfolio. "
                "A 50% drop in this stock would reduce your portfolio by {:.1f}%.".format(
                    max_single_pct * 0.5
                ),
                level="error",
            )
        )
    elif max_single_pct > 15:
        insights.append(
            InsightMessage(
                text=f"**Elevated single-stock exposure:** Your largest position ({max_single_pct:.1f}%) "
                "exceeds the 15% threshold often used as a concentration guideline.",
                level="warning",
            )
        )

    return insights


def generate_overlap_insights(
    overlap_count: int,
    overlap_value: float,
    total_value: float,
    max_etf_count: int,
    top_overlapping: List[Tuple[str, int, float]],  # (name, etf_count, value)
) -> List[InsightMessage]:
    """
    Generate educational insights about ETF overlap.

    Args:
        overlap_count: Number of securities appearing in multiple ETFs
        overlap_value: Total value of overlapping securities
        total_value: Total portfolio value
        max_etf_count: Maximum number of ETFs sharing a single security
        top_overlapping: List of (security_name, etf_count, value) tuples

    Returns:
        List of InsightMessage objects
    """
    insights = []

    if overlap_count == 0:
        insights.append(
            InsightMessage(
                text="**No overlap detected:** Your ETFs hold distinct securities with no duplication.",
                level="success",
            )
        )
        return insights

    # Overlap percentage
    overlap_pct = overlap_value / total_value * 100 if total_value > 0 else 0

    if overlap_pct > 20:
        insights.append(
            InsightMessage(
                text=f"**Significant overlap:** {overlap_pct:.1f}% of your portfolio value (EUR {overlap_value:,.0f}) "
                "comes from securities that appear in multiple ETFs. This creates hidden concentration.",
                level="warning",
            )
        )
    elif overlap_pct > 10:
        insights.append(
            InsightMessage(
                text=f"**Moderate overlap:** {overlap_pct:.1f}% of your portfolio value appears in multiple ETFs. "
                "Some diversification benefit is reduced due to duplication.",
                level="info",
            )
        )
    else:
        insights.append(
            InsightMessage(
                text=f"**Low overlap:** Only {overlap_pct:.1f}% of your portfolio has ETF duplication. "
                "Your ETFs are largely complementary.",
                level="success",
            )
        )

    # Max overlap observation
    if max_etf_count >= 5:
        insights.append(
            InsightMessage(
                text=f"**High duplication:** At least one security appears in {max_etf_count} of your ETFs. "
                "This stock's performance will have amplified impact on your portfolio.",
                level="warning",
            )
        )

    # Top overlapping securities
    if top_overlapping and len(top_overlapping) > 0:
        top_name, top_count, top_val = top_overlapping[0]
        insights.append(
            InsightMessage(
                text=f"**Most duplicated:** {top_name} appears in {top_count} ETFs "
                f"with combined exposure of EUR {top_val:,.0f}.",
                level="info",
            )
        )

    return insights
