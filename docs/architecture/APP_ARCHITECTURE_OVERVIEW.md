# App Architecture Overview

> **Purpose:** Explain the full-stack architecture of Portfolio Prism.
> **Audience:** Developers & Contributors.
> **Scope:** React Frontend, Rust Shell, Python Sidecar.

---

## 1. High-Level Architecture

Portfolio Prism uses the **Tauri Sidecar Pattern**. It combines a modern React UI with a native Rust shell and a powerful Python analytics engine.

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface (macOS)                  │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                 React Frontend (WebView)            │   │
│   │                                                     │   │
│   │   ┌───────────┐     ┌───────────┐     ┌───────────┐ │   │
│   │   │ Dashboard │     │ X-Ray View│     │ Settings  │ │   │
│   │   └─────┬─────┘     └─────┬─────┘     └─────┬─────┘ │   │
│   │         │                 │                 │       │   │
│   └─────────┼─────────────────┼─────────────────┼───────┘   │
│             │  IPC (invoke)   │                 │           │
│             ▼                 ▼                 ▼           │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                  Tauri Shell (Rust)                 │   │
│   │                                                     │   │
│   │   ┌───────────────┐     ┌───────────────────────┐   │   │
│   │   │ IPC Handlers  │ ◄─► │ PythonEngine Manager  │   │   │
│   │   └───────────────┘     └───────────┬───────────┘   │   │
│   └─────────────────────────────────────┼───────────────┘   │
│             STDIN / STDOUT (JSON)       │                   │
│             ▼                           ▼                   │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                 Python Sidecar (Headless)           │   │
│   │                                                     │   │
│   │   ┌───────────────┐     ┌───────────────────────┐   │   │
│   │   │ Command Loop  │ ──► │ Analytics Pipeline    │   │   │
│   │   └──────┬────────┘     └───────────┬───────────┘   │   │
│   │          │                          │               │   │
│   │          ▼                          ▼               │   │
│   │   ┌───────────────┐     ┌───────────────────────┐   │   │
│   │   │ SQLite DB     │     │ File System (Cache)   │   │   │
│   │   └───────────────┘     └───────────────────────┘   │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. The Boot Process

How the application starts and connects the layers.

```
┌─────────────────────────────────────────────────────────────┐
│                       Boot Sequence                         │
│                                                             │
│  [React]           [Rust Shell]             [Python]        │
│     │                    │                      │           │
│     │             1. app.run()                  │           │
│     │                    │                      │           │
│     │             2. Spawn Sidecar ────────────►│           │
│     │             (prism-headless)              │           │
│     │                    │                      │           │
│     │                    │                3. Boot & Init    │
│     │                    │                      │           │
│     │                    │◄── 4. Ready Signal ──┘           │
│     │                    │   {status: "ready"}              │
│     │                    │                      │           │
│     │◄── 5. Event ───────┤                      │           │
│     │ "engine-status"    │                      │           │
│     │                    │                      │           │
│  6. Render UI            │                      │           │
│     │                    │                      │           │
└─────┴────────────────────┴──────────────────────┴───────────┘
```

---

## 3. IPC Communication Bridge

Communication between Rust and Python happens over **Standard I/O (stdio)** using newline-delimited JSON.

### Command Structure (Rust -> Python)

Rust writes to Python's `STDIN`.

```json
{
  "id": 123,
  "command": "get_dashboard_data",
  "payload": { "portfolioId": 1 }
}
```

### Response Structure (Python -> Rust)

Python writes to `STDOUT`.

```json
{
  "id": 123,
  "status": "success",
  "data": { ... }
}
```

### Visual Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    IPC Command Lifecycle                    │
│                                                             │
│   1. React invokes "get_dashboard_data"                     │
│      │                                                      │
│      ▼                                                      │
│   [Rust] CommandHandler                                     │
│      │                                                      │
│      │  (Generates ID: 42)                                  │
│      │  (Stores Promise in Pending Map)                     │
│      │                                                      │
│      ▼                                                      │
│   [STDIN] Write: {"id": 42, "command": "..."}               │
│      │                                                      │
│      ▼                                                      │
│   [Python] Main Loop (prism_headless.py)                    │
│      │                                                      │
│      │  (Router -> database.py -> SQL Query)                │
│      │  (Result = { totalValue: 1000 })                     │
│      │                                                      │
│      ▼                                                      │
│   [STDOUT] Write: {"id": 42, "status": "success"...}        │
│      │                                                      │
│      ▼                                                      │
│   [Rust] Event Listener                                     │
│      │                                                      │
│      │  (Finds ID 42 in Pending Map)                        │
│      │  (Resolves Promise)                                  │
│      │                                                      │
│      ▼                                                      │
│   2. React receives Data                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Data Persistence Strategy

The "Headless" Engine manages all data. Rust and React are stateless views.

```
┌─────────────────────────────────────────────────────────────┐
│                   Data Persistence Cycle                    │
│                                                             │
│   ┌──────────────┐          ┌───────────────────────┐       │
│   │ Trade Republic│ ──Sync─►│    Raw Positions      │       │
│   │     API       │         │ (In-Memory / SQLite)  │       │
│   └──────────────┘          └──┬─────────────────┬──┘       │
│                                │                 │          │
│                       Analytic │                 │ Stores   │
│                       Pipeline │                 │          │
│                                ▼                 ▼          │
│                       ┌─────────────────┐   ┌────────────┐  │
│                       │   Analytics     │   │ User State │  │
│                       │    Cache        │   │ (Settings) │  │
│                       │  (JSON Files)   │   │ (SQLite)   │  │
│                       └─────────────────┘   └────────────┘  │
│                                                              │
│  Filesystem Locations (macOS):                               │
│  - Data: ~/Library/Application Support/PortfolioPrism/       │
│  - DB:   .../prism.db                                        │
│  - Cache:.../cache/                                          │
└─────────────────────────────────────────────────────────────┘
```
