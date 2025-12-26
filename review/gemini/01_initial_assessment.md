# Portfolio Prism: Architectural Audit Report
**Date:** 2025-12-26
**Scope:** Pipeline, Hive Integration, Frontend UI
**Auditor:** Gemini (Sisyphus Agent)

## 1. Executive Summary
**Status:** ✅ **HEALTHY / ON TRACK**

The project is **not** over-engineered. The complexity found in the codebase (specifically `Decomposer` and `HiveClient`) is *inherent complexity* required to solve the "ETF Look-through" problem in a local-first, privacy-respecting way. The architecture faithfully implements the design documents.

There is **no evidence of "spaghetti code"** or architectural drift. The separation of concerns between the React Frontend (View), Tauri Shell (Bridge), and Python Engine (Logic) is clean and strictly enforced.

## 2. Deep Dive: Analytics Pipeline
**File:** `src-tauri/python/portfolio_src/core/pipeline.py`

The pipeline is a text-book implementation of the **Service-Oriented Architecture** described in your docs. It is a linear, synchronous orchestrator that manages data flow without containing business logic.

*   **Flow Verification:** Confirmed `LOAD` → `DECOMPOSE` → `ENRICH` → `AGGREGATE` → `REPORT`.
*   **Provenance Tracking:** The `PipelineMonitor` class effectively tracks where every data point comes from (Hive vs. API vs. Cache). This is critical for trust.
*   **Debuggability:** The pipeline automatically dumps intermediate snapshots (CSVs) at each stage (`01_direct_positions`, `02_decomposed`, etc.), which is excellent for debugging the "data flow" issues you suspected.

## 3. Deep Dive: The Hive (Supabase) Connection
**File:** `src-tauri/python/portfolio_src/data/hive_client.py`

This was your primary concern ("connection and data flow"). The implementation is robust and uses **Remote Procedure Calls (RPC)** for safety.

*   **Pull Logic (Read):**
    *   **Primary:** Tries Local Cache first (fast, offline).
    *   **Secondary:** Batched fetch from Supabase (`master_view`).
    *   **Fallback:** If Supabase is unreachable, it silently degrades to local-only mode. This is correct for a "Local-First" app.
*   **Push Logic (Contribute):**
    *   **Mechanism:** When a user's local adapter (e.g., iShares) finds new holdings, it calls `contribute_etf_holdings`.
    *   **Safety:** This uses a Supabase RPC function (`batch_contribute_holdings`), ensuring the database transaction is atomic (all or nothing). This prevents partial/corrupted data uploads.
*   **Risk:** The system fails *gracefully* (silently) if `SUPABASE_URL` is missing. If you aren't seeing data, check your `.env` variables first.

## 4. Deep Dive: Frontend & UI
**File:** `src/components/views/Dashboard.tsx`

The React code is clean and modern.

*   **State Management:** Correctly splits "Server State" (React Query) from "UI State" (Zustand). This avoids the common trap of putting massive data objects into a global Redux-style store.
*   **Progress Feedback:** Uses a clever "Dual-Mode" system:
    *   **Dev:** Server-Sent Events (SSE) for browser debugging.
    *   **Prod:** Native Tauri Events for the desktop app.
*   **Resilience:** The Dashboard component uses "safe navigation" (e.g., `dashboardData.dayChange || 0`). Even if the backend misses a field, the UI won't crash; it will just show `+€0.00`.

## 5. Identified "Dead Code" (Confusion Source)
**File:** `src-tauri/python/portfolio_src/data/community_sync.py`

I found a file that implements a **GitHub-based** sync (pulling CSVs from a repo, creating Pull Requests). This appears to be a legacy approach that predates the Supabase Hive.
*   **Issue:** It exists alongside `hive_client.py` but is **not** used by the main pipeline.
*   **Recommendation:** Delete or archive this file. It likely contributes to the feeling of "over-engineering" or confusion about how data actually flows.

## 6. Recommendations

1.  **Delete Legacy Code:** Remove `community_sync.py` to clarify the architecture.
2.  **Verify Backend Metrics:** The Frontend expects `dayChange` and `dayChangePercent`. I need to verify the Python `Aggregator` actually calculates these (it wasn't explicitly visible in the `Pipeline` orchestrator, which suggests it's deep in `Aggregator`).
3.  **Check Env Vars:** Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in `src-tauri/.env` or the run config, otherwise the Hive connection will silently fail (by design).
