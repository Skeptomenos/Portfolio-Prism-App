# Problem Spec

> **Purpose:** Define the problem clearly before exploring solutions.
> **When:** After `THINKING_DIRECTIVES.md` Phase T1-T2, before Phase T3.
> **Output:** Validated problem definition that guides solution exploration.

---

## 1. Problem Statement

> **A privacy-conscious retail investor** needs a way to **analyze their portfolio's true exposure (holdings, sectors, geographies)** so that **they can make informed allocation decisions**, but currently **existing tools either require uploading sensitive financial data to the cloud or are too technical (CLI/Python scripts) for regular use**.

---

## 2. User Context

### Who is the user?
- **Role:** Self-directed retail investor
- **Technical Level:** Intermediate — uses apps confidently, but not a developer
- **Context:** European investor using Trade Republic; values privacy; checks portfolio weekly/monthly

### What is their current pain?
- **Current Process:** Either exports CSV manually and analyzes in Excel, OR uses cloud-based tools that require sharing portfolio data
- **Frustration:** 
  - Cloud tools require trusting third parties with sensitive financial data
  - Excel analysis is manual, error-prone, and doesn't resolve ETF holdings
  - Developer tools (CLI scripts) are intimidating and require Python knowledge
- **Cost of Inaction:** Suboptimal investment decisions due to lack of visibility into true exposure

### What does success look like?
- **Desired Outcome:** One-click launch of a native app that shows complete portfolio analysis, including "X-ray" view of ETF holdings, sector breakdown, and geographic exposure
- **Measurable Impact:** User understands their true exposure in < 2 minutes after launching the app

---

## 3. Assumptions

| # | Assumption | Validated? | Evidence |
|---|------------|------------|----------|
| 1 | Users prefer local-first apps for financial data | Pending | Anecdotal feedback; privacy trends |
| 2 | Trade Republic API (`pytr`) will continue to work | Yes | Active library, used in POC |
| 3 | Tauri can spawn Python sidecar reliably | Pending | Phase 1 will validate |
| 4 | PyInstaller can bundle pandas+streamlit | Pending | Phase 2 will validate |
| 5 | Community will contribute ISIN resolutions | Pending | Will validate with alpha testers |

---

## 4. Constraints

### Technical
- Tauri v2 required (no Chromium bundling)
- Python analytics engine must run as sidecar (not rewritten in Rust/TS)
- Must work offline with cached data
- App bundle must be < 100MB (ideally < 50MB + Python binary)

### Business
- Single developer — scope must be pragmatic
- Zero recurring cost for MVP (free tiers only)
- No revenue model yet — this is a passion/portfolio project

### Resources
- macOS development machine only
- No access to Windows/Linux for testing (MVP is macOS-only)
- Limited time — evenings/weekends

---

## 5. Anti-Goals (What We Are NOT Solving)

- [x] NOT providing trading execution or recommendations
- [x] NOT supporting real-time streaming prices
- [x] NOT building a mobile app (yet)
- [x] NOT supporting brokers other than Trade Republic (MVP)
- [x] NOT offering tax advice or optimization

---

## 6. Acceptance Criteria

The problem is solved when:

- [ ] User can install `.app` by drag-and-drop (no Python installation required)
- [ ] User can connect Trade Republic via in-app 2FA flow
- [ ] User sees portfolio dashboard with holdings, allocations, exposure breakdown
- [ ] ETF holdings are resolved via community "Hive" or manual upload
- [ ] App functions offline with cached data (shows "Offline Mode" indicator)
- [ ] App is < 100MB installed size

---

## 7. Open Questions

- [ ] How will we handle Trade Republic API changes/breakages?
- [ ] What is the right balance between "automatic Hive contribution" and user consent?
- [ ] Should we support manual portfolio entry (for users without Trade Republic)?
