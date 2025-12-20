# Hive Architecture (Final Design)

## Goal

Design a "Forever Database" for the Community Asset Universe that is **Robust**, **Extensible**, and **Portable**.

### Why these goals?

1.  **Robust (Trust)**: This data drives financial decisions. If a ticker is wrong, a user's net worth calculation is wrong. We need "Acid-compliant" transactions (SQL) to ensure we never have "half-written" records (e.g., an Asset without a Listing).
2.  **Extensible (Growth)**: The app today only needs Tickers. Tomorrow it might need **Dividend Yields**, **TER**, **ESG Scores**, or **Sector Weightings**. A normalized schema allows us to attach new tables (`asset_dividends`, `asset_esg`) without breaking the core `assets` list.
3.  **Portable (Freedom)**: "The Hive" is a community asset. If we rely on proprietary features (like Firebase or Airtable), the community is locked in. By using standard Postgres SQL, we can move this database to any cloud provider (AWS, Azure, DigitalOcean) or even self-host it in 1 hour. This guarantees the project's survival regardless of vendor pricing changes.

## The Strategy: Normalized Registry (Option 4)

Since this data is the "heart of the application" and will outlive the current Python client, **we choose the Normalized approach.**

### Core Schema

**Table 1: `assets`** (The Instruments)
_Unique semantic entities._

```sql
CREATE TABLE assets (
    isin TEXT PRIMARY KEY,          -- Natural Key (Global)
    wkn TEXT UNIQUE,                -- Security ID (German standard)
    name TEXT NOT NULL,
    provider TEXT,                  -- "Vanguard", "iShares"
    asset_type TEXT,                -- "ETF", "Stock"
    distribution_policy TEXT,       -- "Acc", "Dist"
    ter DECIMAL(4, 2),              -- 0.07
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Table 2: `listings`** (The Access Points)
_How to buy the instrument._

```sql
CREATE TABLE listings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    isin TEXT REFERENCES assets(isin),
    ticker TEXT NOT NULL,
    currency TEXT NOT NULL,         -- "EUR"
    mic TEXT,                       -- "XAMS"
    contributor_count INTEGER DEFAULT 1,
    reliability_score FLOAT DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(isin, ticker, currency)
);
```

## Answers to Strategic Questions

### 1. What about WKN?

> **Q: How does WKN fit? Is it unique? Does it map to Ticker or ISIN?** > **A: WKN maps to ISIN (The Asset).**
>
> - **WKN (Wertpapierkennnummer)** is the German standard, **ISIN** is the International standard.
> - They are 1:1. One ISIN (e.g., `IE00B3XXRP09`) corresponds to one WKN (e.g., `A0J205`).
> - **Placement**: It belongs in the `assets` table as a secondary identifier. It does _not_ vary by exchange (unlike Ticker).

### 2. Why Postgres? Is it the right choice?

> **Q: Does database selection have a big impact?** > **A: Yes.** Choosing the _type_ (Relational vs NoSQL) is critical.
>
> 1.  **Strict Structure**: Financial data (ISINs, decimals) requires strict types. If you put a string in a price field, calculations break. SQL enforces this; NoSQL doesn't.
> 2.  **Relations**: Our data is highly relational (Listing -> belongs to -> Asset). SQL handles `JOIN`s efficiently.
> 3.  **Future Proofing**: Postgres is the open-source "Gold Standard".
>     - **Vendor Neutral**: It is not owned by a single corporation (unlike Oracle/SQL Server).
>     - **Ubiquitous**: Every cloud (AWS, GCP, Azure, DigitalOcean) runs managed Postgres.
>     - **Extensible**: It handles JSON (like NoSQL) better than MongoDB if we ever need it.
>
> _Verdict:_ **Postgres is the safest, most robust choice for this project.**

## The Interface (RPC)

To keep the clients simple, we expose a single "API" function in the database.

```sql
-- Client calls this one function
SELECT contribute_asset(
  p_isin := 'IE00B3...',
  p_wkn := 'A0J205',  -- Optional
  p_ticker := 'VUSA.L',
  p_currency := 'GBP',
  p_name := 'Vanguard S&P 500',
  p_provider := 'Vanguard'
);
```

This function handles the transaction:

1.  Upsert `assets` (if new).
2.  Upsert `listings`.
3.  Update `contributor_count`.

## Final Decision

We proceed with **Option 4 (Normalized)** on **Postgres**.
