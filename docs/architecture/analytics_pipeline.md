# Analytics Pipeline Architecture

> **Purpose:** Detailed breakdown of the Python-based Analytics Pipeline architecture.
> **Scope:** Core analysis engine (Decomposer, Enricher, Aggregator) and Orchestrator.
> **Style:** ASCII Block Diagrams (MVP Style)

---

## 1. High-Level Architecture

The Analytics Pipeline follows a **Service-Oriented Architecture (SOA)** within the Python process. The `Pipeline` class acts as a thin orchestrator, coordinating specialized services that are decoupled from the UI.

```
┌─────────────────────────────────────────────────────────────┐
│                   Analytics Pipeline (Python)               │
│                                                             │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│   │  Decomposer  │   │   Enricher   │   │  Aggregator  │    │
│   │ (ETF Lookup) │   │  (Metadata)  │   │  (Metrics)   │    │
│   └──────▲───────┘   └──────▲───────┘   └──────▲───────┘    │
│          │                  │                  │            │
│          └──────────────────┼──────────────────┘            │
│                             │ Calls Services                │
│                    ┌────────▼────────┐                      │
│                    │   Orchestrator  │                      │
│                    │  (pipeline.py)  │                      │
│                    └────────┬────────┘                      │
│                             │ Reads/Writes                  │
└─────────────────────────────┼───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                        Data Layer                           │
│  ┌────────────┐    ┌─────────────────┐    ┌─────────────┐   │
│  │ Portfolio  │    │  Service Cache  │    │   Outputs   │   │
│  │ (State Mgr)│    │   (JSON/CSV)    │    │ (Reports)   │   │
│  └────────────┘    └─────────────────┘    └─────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Orchestration Flow

The `Pipeline.run()` method executes a strict linear sequence. It contains **no business logic**—it only manages data flow and error handling.

```
┌─────────────────────────────────────────────────────────────┐
│                     Execution Phases                        │
│                                                             │
│  1. LOAD        ┌───────────────────────┐                   │
│  ─────────────► │ load_portfolio_state  │ ──► Direct + ETFs │
│                 └───────────┬───────────┘                   │
│                             │                               │
│  2. DECOMPOSE   ┌───────────▼───────────┐                   │
│  ─────────────► │ decomposer.decompose  │ ──► Holdings Map  │
│                 └───────────┬───────────┘                   │
│                             │                               │
│  3. ENRICH      ┌───────────▼───────────┐                   │
│  ─────────────► │   enricher.enrich     │ ──► Enriched Map  │
│                 └───────────┬───────────┘                   │
│                             │                               │
│  4. AGGREGATE   ┌───────────▼───────────┐                   │
│  ─────────────► │ aggregator.aggregate  │ ──► Exposure DF   │
│                 └───────────┬───────────┘                   │
│                             │                               │
│  5. REPORT      ┌───────────▼───────────┐                   │
│  ─────────────► │    _write_reports     │ ──► disk I/O      │
│                 └───────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Service Detail: Decomposer

**Responsibility:** "X-Ray" look-through of ETF positions into underlying holdings. It prioritizes the local cache before checking external sources.

```
┌─────────────────────────────────────────────────────────────┐
│                    Decomposer Service                       │
│                                                             │
│   Input: ETF Positions (ISINs)                              │
│          │                                                  │
│          ▼                                                  │
│   ┌──────────────┐       ┌──────────────────────────────┐   │
│   │   Iterator   │ ────► │  HoldingsCache (FileSystem)  │   │
│   └──────┬───────┘       └──┬─────────────────────▲─────┘   │
│          │                  │ Hit                 │ Save    │
│          │ Miss             │                     │         │
│          ▼                  ▼                     │         │
│   ┌──────────────┐       ┌─────────────────────┐  │         │
│   │ Adapter Reg. │ ────► │   Provider Adapter  │ ─┘         │
│   └──────────────┘       │ (iShares, Amundi...)│            │
│                          └─────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Service Detail: Enricher

**Responsibility:** Augment raw assets with metadata (Sector, Geography, Asset Class). It uses a specialized `EnrichmentService` to handle batch API calls.

```
┌─────────────────────────────────────────────────────────────┐
│                    Enricher Service                         │
│                                                             │
│   Input: Holdings Map                                       │
│          │                                                  │
│          ▼                                                  │
│   ┌──────────────┐     ┌────────────────────────────────┐   │
│   │ Extract ISINs│ ──► │ EnrichmentService (Batch API)  │   │
│   └──────────────┘     └─────┬───────────────────▲──────┘   │
│                              │                   │          │
│                    ┌─────────▼────────┐          │          │
│                    │   Master Cache   │ ─────────┘          │
│                    └─────────┬────────┘                     │
│                              │ Miss                         │
│          ┌───────────────────┼───────────────────┐          │
│          ▼                   ▼                   ▼          │
│    ┌───────────┐       ┌───────────┐       ┌───────────┐    │
│    │  Finnhub  │ ────► │ Wikidata  │ ────► │ YFinance  │    │
│    │ (Primary) │       │(Fallback 1)       │(Fallback 2)    │
│    └───────────┘       └───────────┘       └───────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Service Detail: Aggregator

**Responsibility:** Mathematical fusion of all data. It normalizes weights and calculates the final "True Exposure".

```
┌─────────────────────────────────────────────────────────────┐
│                   Aggregator Service                        │
│                                                             │
│   ┌────────────────┐           ┌────────────────┐           │
│   │ Direct Assets  │           │ ETF Holdings   │           │
│   └───────┬────────┘           └───────┬────────┘           │
│           │                            │                    │
│           │                    ┌───────▼────────┐           │
│           │                    │ Calc Value     │           │
│           │                    │ (Weight * NAV) │           │
│           │                    └───────┬────────┘           │
│           │                            │                    │
│           └───────────► ┌──────────────▼─────┐              │
│                         │    UNION & NORM    │              │
│                         └──────────────┬─────┘              │
│                                        │                    │
│                         ┌──────────────▼─────┐              │
│                         │      GROUP BY      │              │
│                         │ (Sector / Region)  │              │
│                         └──────────────┬─────┘              │
│                                        │                    │
│                         ┌──────────────▼─────┐              │
│                         │  Metrics & Reports │              │
│                         └────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Master Cache & Hive Architecture

**Responsibility:** Syncing the global "Asset Universe" with the Supabase community database ("The Hive").

```
┌─────────────────────────────────────────────────────────────┐
│                    Master Cache & Hive                      │
│                                                             │
│   ┌──────────────┐          ┌───────────────────────┐       │
│   │ Supabase DB  │ ◄──────► │      HiveClient       │       │
│   │ (Cloud Hive) │   HTTP   │      (Singleton)      │       │
│   └──────────────┘          └──┬─────────────────┬──┘       │
│                                │                 │          │
│                       Syncs on │                 │ Serves   │
│                       Startup  │                 │ Lookups  │
│                                ▼                 ▼          │
│                       ┌─────────────────┐   ┌────────────┐  │
│                       │   File Cache    │   │ In-Memory  │  │
│                       │ (master_univ... │   │    Dict    │  │
│                       │     json)       │   │            │  │
│                       └─────────────────┘   └────────────┘  │
│                                                              │
│  Key Features:                                               │
│  1. TTL: 24 hours (configurable in HiveClient)               │
│  2. Strategy: Stale-while-revalidate fallback                │
│  3. Mode: Read-only (public) or Contribution (auth)          │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Supabase Database Structure (The Hive)

**Responsibility:** Persistent, relational storage for the Community Asset Universe.
**Strategy:** Normalized Registry (Postgres)

```
┌─────────────────────────────────────────────────────────────┐
│                      The Hive (Postgres)                    │
│                                                             │
│   Table: assets (Unique Instruments)                        │
│   ┌────────────────┬──────────────┬─────────────────────┐   │
│   │ Column         │ Type         │ Description         │   │
│   ├────────────────┼──────────────┼─────────────────────┤   │
│   │ isin           │ TEXT (PK)    │ Global Unique ID    │   │
│   │ wkn            │ TEXT (Unique)│ German Security ID  │   │
│   │ name           │ TEXT         │ Official Name       │   │
│   │ provider       │ TEXT         │ Issuer (e.g iShares)│   │
│   │ asset_type     │ TEXT         │ ETF, Stock, etc.    │   │
│   │ ter            │ DECIMAL      │ Total Expense Ratio │   │
│   └──────┬─────────┴──────────────┴─────────────────────┘   │
│          │ 1                                                │
│          │                                                  │
│          │ Has Many                                         │
│          ▼ N                                                │
│   Table: listings (Access Points)                           │
│   ┌────────────────┬──────────────┬─────────────────────┐   │
│   │ Column         │ Type         │ Description         │   │
│   ├────────────────┼──────────────┼─────────────────────┤   │
│   │ id             │ UUID (PK)    │ Internal ID         │   │
│   │ isin           │ TEXT (FK)    │ References assets   │   │
│   │ ticker         │ TEXT         │ Exchange Symbol     │   │
│   │ currency       │ TEXT         │ Trading Currency    │   │
│   │ mic            │ TEXT         │ Exchange Code       │   │
│   │ reliability... │ FLOAT        │ Trust Score         │   │
│   └────────────────┴──────────────┴─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

RPC Interface:
- contribute_asset(isin, ticker, name, ...) -> Transactional Upsert
```
