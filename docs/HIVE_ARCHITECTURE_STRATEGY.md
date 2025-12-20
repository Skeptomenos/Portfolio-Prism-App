# Supabase Hive Architecture Strategy

**Date:** 2025-12-17
**Status:** Architecture Decision Record (ADR)
**Context:** Design of the "Hive" community database for ISIN resolution and ETF look-through.

## 1. Core Problem: "One Asset, Many Faces"

Financial data is inherently messy. A single legal entity (Asset) appears in many forms across different markets.

*   **Currency:** Nvidia trades in USD (Nasdaq) and EUR (Xetra).
*   **Tickers:** Apple is `AAPL` (US), `APC` (Germany), `0R2V` (London).
*   **Composition:** An ETF is just a wrapper around thousands of other Assets.

### The Challenge
We need a database schema that:
1.  **Unifies** these variations into a Single Source of Truth (ISIN).
2.  **Enables** powerful queries (e.g., "Which ETFs hold Defense stocks?").
3.  **Survives** crowdsourced data quality issues (staleness, collisions).

## 2. Selected Architecture: Normalized Relational Schema

We chose a normalized PostgreSQL schema over a NoSQL/JSON-blob approach.

### 2.1 Schema Diagram

```sql
┌────────────────────────────────────────────────────────┐
│                        ASSETS                          │
│             (The Source of Truth / Entity)             │
├─────────────────┬──────────────────────────────────────┤
│ PK  isin        │ text    (e.g. US0378331005)          │
│     name        │ text    (e.g. Apple Inc.)            │
│     wkn         │ text    (e.g. 865985)                │
│     asset_class │ text    (e.g. Equity, ETF)           │
│     base_curr   │ text    (e.g. USD)                   │
│     website     │ text    (Optional URL)               │
└─────────────────┴──────────────────────────────────────┘
         ▲                    ▲             ▲
         │ (1:N)              │ (1:N)       │ (1:N)
         │                    │             │
┌────────┴────────┐  ┌────────┴───────┐  ┌──┴──────────────────┴──┐
│    LISTINGS     │  │ PROV_MAPPINGS  │  │      ETF_HOLDINGS      │
│   (The Quote)   │  │  (The Alias)   │  │       (The X-Ray)      │
├─────────────────┤  ├────────────────┤  ├────────────────────────┤
│ PK  ticker      │  │ PK provider    │  │ PK  etf_isin           │
│ PK  exchange    │  │ PK provider_id │  │ PK  holding_isin       │
│ FK  isin        │  │ FK isin        │  │     weight             │
│     currency    │  └────────────────┘  │     last_updated       │
└─────────────────┘                      └────────────────────────┘
```

### 2.2 Why This Wins
*   **Currency Solved:** Differentiates `assets.base_currency` (Accounting) from `listings.currency` (Trading).
*   **X-Ray Capability:** Enables recursive SQL queries to find underlying exposures across thousands of ETFs.
*   **Provider Agnostic:** `listings` handles Exchange specifics, while `provider_mappings` handles API quirks (Yahoo vs. Google tickers).

## 3. Critical Analysis & Trade-offs

### 3.1 Known Risks
1.  **Row Explosion (The "Vanguard Problem"):**
    *   **Issue:** A single "Total World" ETF has ~9,000 holdings. Syncing 500 ETFs generates ~4.5M rows.
    *   **Impact:** Performance degradation on free-tier DBs.
    *   **Mitigation:**
        *   **Cap:** Only store Top 500 holdings per ETF (covers ~99% of weight).
        *   **Prune:** Delete holdings < 0.01% weight.
2.  **Data Staleness:**
    *   **Issue:** Crowdsourced ETF compositions age quickly.
    *   **Impact:** "Look-through" analysis becomes an estimate, not a fact.
    *   **Mitigation:** `etf_holdings` table includes `last_updated`. UI must flag data > 30 days old.
3.  **Exchange Code Chaos:**
    *   **Issue:** No standard for Exchange codes (US vs. NMS vs. XNAS).
    *   **Mitigation:** Client must normalize common codes before upload (e.g., map all German exchanges to `DE`).

### 3.2 Open Questions
*   **Trust Model:** How do we handle conflicting uploads? (e.g., User A says ISIN X is "Apple", User B says "Amazon").
    *   *Current Plan:* Latest upload wins (optimistic). Future: Reputation system.
*   **Corporate Actions:** How to handle mergers/ISIN changes?
    *   *Current Plan:* Treat new ISIN as new Asset. Lose history.

## 4. Implementation Plan

See `docs/PLAN_HIVE_SETUP.md` for the execution roadmap.

1.  **Schema:** `infrastructure/supabase/schema.sql` (Pending Generation)
2.  **Client:** `hive_client.py` (Update to use RPCs)
3.  **Seed:** `scripts/seed_hive.py` (Migration)
