# Design Spec (The "How It Works")

> **Usage:** Create visual diagrams for complex flows using Mermaid.js syntax.
> **See Strategy:** `keystone/strategy/architecture-overview.md` for the Master Architecture.

---

## 1. System Context Diagram

High-level view of system boundaries and external actors.

```mermaid
flowchart TB
    User[User] --> App[Portfolio Prism]
    
    subgraph "Local Device (Trust Boundary)"
        App --> Shell[Rust Shell]
        Shell --> Engine[Python Engine]
        Engine --> SQLite[(SQLite Vault)]
        Engine --> Parquet[(Parquet Analytics)]
    end
    
    subgraph "External World"
        Engine --> Broker[Trade Republic API]
        Engine --> Market[Finnhub/Yahoo API]
        Engine --> Cloud[Supabase Hive]
        Shell --> Updates[GitHub Releases]
        Shell --> Proxy[Cloudflare Proxy]
    end
    
    Proxy --> GitHub[GitHub Issues]
```

---

## 2. Sequence Diagrams

### Data Sync Flow (Rapid Feedback Loop)

```mermaid
sequenceDiagram
    participant UI as React UI
    participant Rust as Rust Shell
    participant Py as Python Engine
    participant DB as SQLite/Parquet
    
    Note over UI: User clicks "Sync"
    UI->>Rust: invoke("sync_portfolio")
    Rust->>Py: write_stdin(JSON Command)
    
    activate Py
    Py->>DB: Read Portfolio State
    Py->>Py: Fetch Updates (Async Throttled)
    Py->>Py: Calculate Analytics (Vectorized)
    Py->>DB: Write New State
    Py-->>Rust: Print JSON Success
    deactivate Py
    
    Rust-->>UI: emit("portfolio-updated")
    
    activate UI
    UI->>Rust: invoke("get_dashboard_data")
    Rust->>DB: Read(SQL) / Read(Parquet)
    DB-->>Rust: Data
    Rust-->>UI: JSON Data
    UI->>UI: Re-render Charts
    deactivate UI
```

---

## 3. Component Diagram

Modular architecture showing dependencies.

```mermaid
flowchart LR
    subgraph "Frontend (React)"
        Components[UI Components]
        Store[Zustand Store]
        Query[TanStack Query]
    end
    
    subgraph "Shell (Rust)"
        IPC[IPC Bridge]
        Updater[Auto-Updater]
        Scrubber[PII Scrubber]
    end
    
    subgraph "Engine (Python)"
        Decomposer[Decomposer Service]
        Enricher[Enricher Service]
        Aggregator[Aggregator Service]
    end
    
    Components --> Store
    Store --> Query
    Query <--> IPC
    IPC <--> Decomposer
    Decomposer --> Enricher
    Enricher --> Aggregator
    
    Scrubber -.-> Proxy[Cloudflare]
```

---

## 4. State Diagrams

### Engine Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Spawning
    Spawning --> Handshake: Bind Port/Stdin
    Handshake --> Idle: Ready Signal
    
    state Idle {
        [*] --> Waiting
        Waiting --> Processing: Command Received
        Processing --> Waiting: Task Complete
    }
    
    Idle --> Updating: Update Available
    Updating --> Restarting
    Restarting --> Spawning
    
    Processing --> Error: Exception
    Error --> Reporting: Sanitize & Send
    Reporting --> Idle
```
