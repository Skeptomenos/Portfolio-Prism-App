# Problem Spec

> **Purpose:** Define the problem clearly before exploring solutions.
> **When:** After `THINKING_DIRECTIVES.md` Phase T1-T2, before Phase T3.
> **Output:** Validated problem definition that guides solution exploration.

---

## 1. Problem Statement

A busy developer needs a way to track project context across AI sessions so that they don't lose progress, but currently each session starts fresh with no memory.

---

## 2. User Context

### Who is the user?
- **Primary:** Self-directed retail investor (30-50 years old)
- **Technical Level:** Intermediate — comfortable with desktop apps, not CLI
- **Context:** Privacy-conscious, uses Trade Republic or similar broker
- **Behavior:** Checks portfolio weekly/monthly, wants deep analysis without data leaving their machine

### What is their current pain?
- **Current Process:** Manual portfolio tracking across multiple platforms (spreadsheets, broker websites)
- **Frustration:** No unified view, time-consuming data consolidation, limited analysis capabilities
- **Cost of Inaction:** Making suboptimal investment decisions due to fragmented data and analysis tools

### What does Success look like?
- **Desired Outcome:** See through your portfolio like an X-ray — understand your true exposure across assets, geographies, and sectors, all without your data leaving your computer.
- **Measurable Impact:** Portfolio analysis completes in <30 seconds with actionable insights
- **Delight Factor:** Discovering hidden risks or opportunities in existing portfolio

---

## 3. Assumptions

| # | Assumption | Validated? | Evidence |
|---|------------|------------|----------|
| 1 | User wants desktop app, not web service | Yes | Portfolio Prism concept validated through user interviews |
| 2 | Privacy is primary concern | Yes | Explicit privacy requirements in project goals |
| 3 | User has existing portfolio data | Yes | CSV import functionality planned for initial setup |
| 4 | Trade Republic API accessible | Yes | API documentation reviewed, authentication flow designed |
| 5 | macOS is primary target | Yes | Tauri chosen over Electron for macOS optimization |

---

## 4. Constraints

### Technical
- **No Chromium:** Tauri uses system WebKit — app must not bundle a browser engine
- **API Key Security:** Finnhub key must be proxied via Cloudflare Worker, never embedded in client
- **Local-First:** Core functionality must work offline; cloud features are optional enhancements
- **Single Developer:** Pragmatic scope — favor working software over comprehensive features
- **macOS Primary:** Windows/Linux compatibility is secondary goal

### Business
- **MVP Timeline:** Launch to alpha testers within 3 months
- **Budget:** Single developer, open-source tools
- **Compliance:** Must handle financial data responsibly, no tax advice provided

### Resources
- **Single Developer:** Solo development effort
- **No External Funding:** Self-funded project
- **Existing Codebase:** Python analytics engine available for reuse

---

## 5. Anti-Goals (Critical: What We Are NOT Building)

- **Trading Execution:** Compliance nightmare, not our core value
- **Real-time Price Streaming:** Free APIs don't support it; daily close is sufficient for analysis
- **Multi-user Accounts:** Desktop app = single user; no auth complexity for MVP
- **Tax Optimization/Advice:** Legal liability; out of scope
- **Windows/Linux Support (MVP):** Focus on macOS first; cross-platform testing requires additional resources
- **Mobile App (MVP):** Desktop-first; Tauri v2 mobile support is future consideration
- **Comprehensive Broker Support:** Trade Republic only for MVP; others are deferred
- **Manual Portfolio Entry:** Focus on automated import first, manual entry is fallback

---

## 6. Acceptance Criteria

The problem is solved when:
- [ ] **MVP Launch:** Standalone `.app` that runs portfolio analysis without Python installed
- [ ] **2FA Flow:** User can authenticate with Trade Republic via in-app 2FA
- [ ] **Offline Mode:** App functions with cached data when disconnected
- [ ] **Community Contribution:** New ISIN resolutions sync to/from Supabase "Hive"
- [ ] **Auto-Updates:** App checks for and applies updates via GitHub Releases

---

## 7. Open Questions

- [ ] What is the minimum viable portfolio size for initial testing?
- [ ] Should we support portfolio import from multiple brokers simultaneously?
- [ ] How should we handle data migration between broker versions?