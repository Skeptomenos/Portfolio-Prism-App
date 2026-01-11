# Pipeline State Machine - Mermaid Diagrams

> **Generated:** 2026-01-11  
> **Companion to:** `PIPELINE_STATE_MACHINE.md`

---

## High-Level Pipeline Flow

```mermaid
flowchart TB
    subgraph INIT["Phase 1: Initialization (0-5%)"]
        I1[Initialize Services]
        I2[Decomposer]
        I3[Enricher]
        I4[Aggregator]
        I5[ValidationGates]
        I1 --> I2 & I3 & I4 & I5
    end

    subgraph LOAD["Phase 2: Data Loading (5-15%)"]
        L1[get_positions from DB]
        L2{Split by asset_class}
        L3[direct_positions]
        L4[etf_positions]
        L5[Validate Load Output]
        L1 --> L2
        L2 -->|!= ETF| L3
        L2 -->|== ETF| L4
        L3 & L4 --> L5
    end

    subgraph DECOMPOSE["Phase 3: ETF Decomposition (15-40%)"]
        D1[For each ETF]
        D2{Check Local Cache}
        D3{Check Hive}
        D4[Call Adapter]
        D5[Normalize Weights]
        D6[Resolve ISINs]
        D7[Validate Decompose Output]
        D8[Async Hive Contribution]
        D1 --> D2
        D2 -->|HIT| D5
        D2 -->|MISS| D3
        D3 -->|HIT| D5
        D3 -->|MISS| D4
        D4 --> D8
        D4 --> D5
        D5 --> D6
        D6 --> D7
    end

    subgraph ENRICH["Phase 4: Enrichment (40-60%)"]
        E1[Collect Unique ISINs]
        E2{Check LocalCache}
        E3{Check Hive}
        E4[Call Fallback APIs]
        E5[Apply Enrichment Data]
        E6[Validate Enrich Output]
        E7[Batch Contribute to Hive]
        E1 --> E2
        E2 -->|HIT| E5
        E2 -->|MISS| E3
        E3 -->|HIT| E5
        E3 -->|MISS| E4
        E4 --> E7
        E4 --> E5
        E5 --> E6
    end

    subgraph AGG["Phase 5: Aggregation (60-80%)"]
        A1[Calculate Total Value]
        A2[Process Direct Positions]
        A3[Process ETF Holdings]
        A4[Combine & Group by ISIN]
        A5[Calculate Percentages]
        A6[Validate Aggregate Output]
        A1 --> A2 & A3
        A2 & A3 --> A4
        A4 --> A5
        A5 --> A6
    end

    subgraph REPORT["Phase 6: Reporting (80-95%)"]
        R1[true_exposure.csv]
        R2[holdings_breakdown.csv]
        R3[pipeline_health.json]
        R4[pipeline_errors.json]
    end

    subgraph FINAL["Phase 7: Finalize (95-100%)"]
        F1[Harvest New Securities]
        F2[Build Summary]
        F3[Broadcast via SSE]
        F4[Report Quality Telemetry]
        F1 --> F2 --> F3
        F2 --> F4
    end

    INIT --> LOAD
    LOAD --> DECOMPOSE
    L3 --> ENRICH
    DECOMPOSE --> ENRICH
    ENRICH --> AGG
    AGG --> REPORT
    REPORT --> FINAL
    FINAL --> RESULT[PipelineResult]
```

---

## ETF Decomposition Detail

```mermaid
flowchart LR
    subgraph INPUT
        ETF[ETF Position<br/>ISIN: IE00B4L5Y983]
    end

    subgraph RESOLUTION["Multi-Tier Resolution"]
        C1[(Local Cache)]
        C2[(Hive Community)]
        C3[Adapter<br/>iShares/Vanguard]
    end

    subgraph PROCESSING
        N1[Normalize Weights<br/>decimal → percentage]
        N2[Resolve Tickers → ISINs]
        N3[Add Resolution Metadata]
    end

    subgraph OUTPUT
        H[holdings_map<br/>Dict of DataFrames]
    end

    ETF --> C1
    C1 -->|MISS| C2
    C2 -->|MISS| C3
    C1 -->|HIT| N1
    C2 -->|HIT| N1
    C3 -->|HIT| N1
    C3 -.->|async| HIVE[(Contribute to Hive)]
    N1 --> N2 --> N3 --> H
```

---

## Enrichment Flow

```mermaid
flowchart TB
    subgraph INPUT
        HM[holdings_map]
        DP[direct_positions]
    end

    subgraph DEDUPE["Optimization"]
        U[Collect Unique ISINs<br/>across all holdings]
    end

    subgraph TIERS["Multi-Tier Lookup"]
        T1[(LocalCache)]
        T2[(Hive Batch)]
        T3[Fallback APIs<br/>Finnhub/yfinance]
    end

    subgraph APPLY
        A1[Add sector column]
        A2[Add geography column]
        A3[Add asset_class column]
    end

    subgraph OUTPUT
        EH[enriched_holdings_map]
        ED[enriched_direct_positions]
    end

    HM --> U
    DP --> U
    U --> T1
    T1 -->|MISS| T2
    T2 -->|MISS| T3
    T1 -->|HIT| A1
    T2 -->|HIT| A1
    T3 -->|HIT| A1
    T3 -.->|contribute| T2
    A1 --> A2 --> A3
    A3 --> EH & ED
```

---

## Aggregation Logic

```mermaid
flowchart TB
    subgraph INPUTS
        DP[direct_positions<br/>enriched]
        EP[etf_positions]
        HM[enriched_holdings_map]
    end

    subgraph DIRECT["Direct Processing"]
        D1[Each position = 100% exposure]
        D2[Value = quantity × price]
    end

    subgraph ETF["ETF Processing"]
        E1[Get ETF total value]
        E2[For each holding:<br/>exposure = value × weight%]
    end

    subgraph COMBINE
        C1[Concat all exposures]
        C2[Sort by confidence DESC]
        C3[GroupBy ISIN]
        C4["Aggregate:<br/>name: first<br/>sector: first<br/>exposure: sum"]
        C5[Calculate portfolio %]
    end

    subgraph OUTPUT
        O1[exposure_df<br/>unique securities]
    end

    DP --> D1 --> D2 --> C1
    EP --> E1
    HM --> E1
    E1 --> E2 --> C1
    C1 --> C2 --> C3 --> C4 --> C5 --> O1
```

---

## Validation Gates

```mermaid
flowchart LR
    subgraph PHASES
        P1[Load]
        P2[Decompose]
        P3[Enrich]
        P4[Aggregate]
    end

    subgraph GATES["ValidationGates"]
        G1[validate_load_output]
        G2[validate_decompose_output]
        G3[validate_enrich_output]
        G4[validate_aggregate_output]
    end

    subgraph CHECKS
        C1[Required columns<br/>ISIN format<br/>Currency check]
        C2[Weight sum 90-110%<br/>Decimal detection<br/>Holdings count]
        C3[Coverage rate<br/>Missing metadata]
        C4[Total vs expected<br/>Percentage sum]
    end

    subgraph QUALITY
        Q[DataQuality<br/>score: 0-100%<br/>issues: list<br/>is_trustworthy: bool]
    end

    P1 --> G1 --> C1 --> Q
    P2 --> G2 --> C2 --> Q
    P3 --> G3 --> C3 --> Q
    P4 --> G4 --> C4 --> Q
```

---

## Data Flow Overview

```mermaid
flowchart LR
    subgraph SOURCES["Data Sources"]
        DB[(SQLite<br/>positions)]
        HIVE[(Supabase<br/>Hive)]
        ADAPT[Adapters<br/>iShares etc]
        API[APIs<br/>Finnhub]
    end

    subgraph PIPELINE["Pipeline Phases"]
        LOAD[Load]
        DECOMP[Decompose]
        ENRICH[Enrich]
        AGG[Aggregate]
    end

    subgraph OUTPUTS["Outputs"]
        CSV1[true_exposure.csv]
        CSV2[holdings_breakdown.csv]
        JSON1[pipeline_health.json]
        SSE[SSE Broadcast]
    end

    DB --> LOAD
    LOAD --> DECOMP
    HIVE --> DECOMP
    ADAPT --> DECOMP
    DECOMP --> ENRICH
    HIVE --> ENRICH
    API --> ENRICH
    ENRICH --> AGG
    AGG --> CSV1 & CSV2 & JSON1 & SSE
```

---

## Error Handling State Machine

```mermaid
stateDiagram-v2
    [*] --> Running
    
    Running --> PhaseError: Error in phase
    PhaseError --> ErrorCollected: Collect error
    ErrorCollected --> Running: Continue pipeline
    
    Running --> CriticalError: Unrecoverable
    CriticalError --> WriteErrors: Log errors
    WriteErrors --> Failed
    
    Running --> Complete: All phases done
    Complete --> WriteReports
    WriteReports --> Success
    
    Success --> [*]
    Failed --> [*]

    note right of PhaseError
        Pipeline never crashes on data issues.
        Errors are collected and logged.
    end note
```

---

## Component Architecture

```mermaid
graph TB
    subgraph ORCHESTRATOR["Pipeline Orchestrator"]
        P[pipeline.py<br/>Thin coordinator]
    end

    subgraph SERVICES["Services Layer"]
        S1[Decomposer<br/>ETF → holdings]
        S2[Enricher<br/>Add metadata]
        S3[Aggregator<br/>Combine exposures]
    end

    subgraph VALIDATION["Validation Layer"]
        V1[ValidationGates]
        V2[DataQuality]
    end

    subgraph DATA["Data Layer"]
        D1[HiveClient<br/>Supabase]
        D2[HoldingsCache<br/>Local files]
        D3[AdapterRegistry<br/>Scrapers]
        D4[ISINResolver<br/>Ticker lookup]
        D5[EnrichmentService<br/>API fallbacks]
    end

    subgraph OUTPUT["Output Layer"]
        O1[CSV Writers]
        O2[JSON Writers]
        O3[SSE Broadcast]
        O4[Telemetry]
    end

    P --> S1 & S2 & S3
    P --> V1
    V1 --> V2
    S1 --> D1 & D2 & D3 & D4
    S2 --> D1 & D5
    S3 --> P
    P --> O1 & O2 & O3 & O4
```

---

## Pipeline Phases Timeline

```mermaid
gantt
    title Pipeline Execution Phases
    dateFormat X
    axisFormat %s

    section Initialization
    Init Services           :0, 5

    section Data Loading
    Load Portfolio          :5, 15

    section Decomposition
    Decompose ETFs          :15, 40

    section Enrichment
    Enrich Securities       :40, 60

    section Aggregation
    Aggregate Exposures     :60, 80

    section Reporting
    Write Reports           :80, 95

    section Finalize
    Harvest & Broadcast     :95, 100
```

---

## Issue Severity Levels

```mermaid
pie title Issue Distribution by Severity
    "CRITICAL" : 5
    "HIGH" : 15
    "MEDIUM" : 30
    "LOW" : 50
```

---

## Multi-Tier Resolution Strategy

```mermaid
sequenceDiagram
    participant P as Pipeline
    participant C as LocalCache
    participant H as Hive
    participant A as Adapter
    participant API as External API

    P->>C: Check cache for holdings
    alt Cache HIT
        C-->>P: Return cached holdings
    else Cache MISS
        P->>H: Check Hive community DB
        alt Hive HIT
            H-->>P: Return community holdings
            P->>C: Save to local cache
        else Hive MISS
            P->>A: Fetch from adapter
            A->>API: Scrape provider website
            API-->>A: Raw holdings data
            A-->>P: Normalized holdings
            P->>C: Save to local cache
            P-->>H: Async contribute to Hive
        end
    end
    P->>P: Continue with holdings
```
