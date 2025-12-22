# Analytics Engine Strategy (Python Pipeline)

> **Purpose:** Strategic architecture for the core data processing engine powering Portfolio Prism
> **Scope:** Pipeline orchestration, service boundaries, data contracts, and performance optimization
> **Also read:** `keystone/strategy/data-architecture.md` for storage strategy
> **Also read:** `keystone/strategy/language-stack.md` for language decisions

---

## Executive Summary

The Analytics Engine is the "brain" of Portfolio Prism. It transforms raw portfolio holdings into deep insights through a three-stage pipeline: **Decompose** (Look-through) → **Enrich** (Metadata) → **Aggregate** (Analytics). 

Our strategy transitions the engine from a "Synchronous Monolith" to a **"Modular, Vectorized Event System"**. We prioritize **Data Contracts** to decouple services, allowing independent refactoring (or Rust rewriting) of any component. We embrace **Vectorization** for CPU-bound tasks and **Async Parallelism** for I/O-bound tasks to deliver sub-second analysis for massive portfolios.

---

## Current Architecture Assessment

### **The "DataFrame Monolith"**
The current pipeline moves data as loose Pandas DataFrames.
*   ✅ **Pros:** Fast implementation, mathematically powerful.
*   ❌ **Cons:** Implicit schemas (hidden dependencies on column names), synchronous execution blocks UI, monolithic state hard to test.

### **Strategic Gaps**
1.  **No Isolation:** Changing `Decomposer` output logic breaks `Aggregator` input assumptions.
2.  **Performance Choke:** Sequential network requests in `Decomposer` limit speed.
3.  **Inefficient Math:** Iterative loops (`iterrows`) in `Aggregator` waste CPU cycles.

---

## Target Architecture: "Modular & Modern"

### **1. Core Design Pattern: Functional Core, Imperative Shell**
*   **Shell (The Pipeline):** Handles orchestration, I/O, error recovery, and state management.
*   **Core (The Services):** Pure functional logic. Input Data → Transformation → Output Data. No side effects.

### **2. Service Isolation via Data Contracts**
We replace "handshake agreements" with strict **Schema Definitions** (using Pydantic/Pandera).

| Service | Input Contract | Responsibility | Output Contract |
| :--- | :--- | :--- | :--- |
| **Decomposer** | `PortfolioState` (Assets, Weights) | Fetch look-through holdings for ETFs | `HoldingsSnapshot` (List of atomic assets) |
| **Enricher** | `HoldingsSnapshot` | Attach metadata (Sector, Region, PE) | `EnrichedUniverse` (Assets + Metadata) |
| **Aggregator** | `EnrichedUniverse` | Calculate exposures and metrics | `AnalyticsResult` (Tables, Charts, Metrics) |

**Strategic Value:** You can rewrite the *Decomposer* in Rust, or swap the *Enricher* for a different API provider, without touching the rest of the pipeline.

---

## Performance Strategy

### **1. Vectorization (The CPU Fix)**
*   **Principle:** "Do math on columns, not rows."
*   **Implementation:** Replace Python loops (`for row in df`) with Pandas/NumPy vectorized operations (`df['value'] = df['price'] * df['qty']`).
*   **Impact:** 100x-1000x speedup for aggregation tasks.

### **2. Async Parallelism (The I/O Fix)**
*   **Principle:** "Fetch all at once."
*   **Implementation:** Use `asyncio` or `ThreadPoolExecutor` in the Decomposer to fetch ETF data concurrently.
*   **Impact:** Reduces data fetching time from `Sum(Time_per_ETF)` to `Max(Time_per_ETF)`.

---

## Development Roadmap

### **Phase 1: MVP Foundation (Weeks 1-4)**
*   **Goal:** Stability and Basic Speed.
*   **Action:** Implement **Vectorization** in the Aggregator (High ROI, Low Risk).
*   **Action:** Implement simple **Threaded Parallelism** in Decomposer.
*   **Action:** Define **Pydantic Models** for service inputs/outputs (Architecture foundation).

### **Phase 2: Modularization (Months 2-4)**
*   **Goal:** Isolation and Testability.
*   **Action:** Refactor Pipeline to use **Dependency Injection**. Services passed in, not hardcoded.
*   **Action:** Enforce **Data Contracts**. Pipeline validates schemas between steps.
*   **Action:** Add **Incremental Logic**. Only re-process what changed.

### **Phase 3: SaaS / Scale (Future)**
*   **Goal:** Massive Scale.
*   **Action:** Extract services into **Serverless Functions** (e.g., AWS Lambda).
*   **Action:** Replace Pandas with **Polars** or **DuckDB** for memory efficiency.
*   **Action:** Move state to **PostgreSQL**.

---

## Best Practices for Implementation

1.  **Immutability:** Services never modify input DataFrames in-place. They return new, transformed copies.
2.  **Idempotency:** Running the pipeline twice on the same input yields the exact same output.
3.  **Fail-Partial:** If one asset fails enrichment, the pipeline logs the error and proceeds with the rest ("Best Effort" analysis).
4.  **Observability:** Each stage reports specific metrics (Time taken, Row counts, Error rates) to the central telemetry system.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| **API Rate Limits** | High | Medium | Parallel requests hit limits faster. Implement **Client-Side Throttling**. |
| **Memory Bloat** | Medium | High | "Copy-on-write" behavior of Pandas. Use strict **Data Types** (categorical vs string) to minimize RAM. |
| **Schema Drift** | Low | Critical | **Strict Contracts** prevent subtle bugs from propagating downstream. |

---

## Conclusion

The transition to a **Contract-Driven, Vectorized Pipeline** is the critical enabler for Portfolio Prism's modular future. By isolating components now, we protect the investment in the MVP while clearing the path for painless refactoring and SaaS scaling later. We build for speed today, but architect for evolution tomorrow.
