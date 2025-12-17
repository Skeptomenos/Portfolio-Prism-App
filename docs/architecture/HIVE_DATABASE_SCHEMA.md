# HIVE Database Schema

> **Purpose:** Defines the persistent, relational structure for the community asset universe (The Hive).
> **Scope:** Schema for Supabase PostgreSQL.
> **Strategy:** Normalized Relational Model with Hybrid History.
> **Reference:** `anamnesis/strategy/hive-architecture.md`

---

## 1. High-Level Schema Architecture

The Hive is built around the core concept of separating the **Asset Entity** (What is it?) from the **Listing** (How do I buy it?) to handle multi-currency and multi-exchange data, while normalizing holdings for "X-Ray" analytics.

```
┌─────────────────────────────────────────────────────────────┐
│                      HIVE DATABASE SCHEMA                     │
│               (Supabase Postgres - Community Data)            │
│                                                             │
│ ┌───────────────────┐ ┌───────────────────┐ ┌─────────────────┐ │
│ │       ASSETS      │ │     LISTINGS      │ │   ETF_HOLDINGS  │ │
│ │ (PK: isin)        │ │(PK: ticker,exchang)│ │ (etf_isin,hold_isin) │
│ │ name, base_curr   │ │ currency, isin(FK)│ │ weight, confidence │
│ │ enrich_status     │ └─────────┬─────────┘ └─────────┬─────────┘ │
│ └─────────┬─────────┘           │ FK: ISIN            │ FK: ISIN (Recursive) │
│           │ FK: ISIN            ▼                     │                   │
│ ┌─────────▼─────────┐ ┌───────────────────┐ ┌─────────▼─────────┐ │
│ │ PROV_MAPPINGS     │ │   CONTRIBUTIONS   │ │    ETF_HISTORY    │ │
│ │ (PK: provider,id) │ │ (contributor_id)  │ │ (id, holdings_json) │
│ │ isin(FK)          │ │ payload, trust_score │ │ etf_isin, created_at │
│ └───────────────────┘ └───────────────────┘ └───────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Table Detail Summary

| Table | Purpose | Primary Keys | Key Foreign Keys |
|---|---|---|---|
| **`assets`** | Master Entity (Nvidia, VOO) | `isin` | None |
| **`listings`** | Ticker/Exchange mapping | `ticker`, `exchange` | `isin` (-> assets) |
| **`etf_holdings`** | **Live** X-Ray composition | `etf_isin`, `holding_isin` | `etf_isin`, `holding_isin` (-> assets) |
| **`etf_history`** | Immutable history log | `id` | `etf_isin` (-> assets) |
| **`provider_mappings`**| Aliases/Normalization | `provider`, `provider_id` | `isin` (-> assets) |
| **`contributions`**| Audit log | `id` | `contributor_id` (User ID Hash) |
