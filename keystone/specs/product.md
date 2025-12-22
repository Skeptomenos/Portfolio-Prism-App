# Product Spec (The "Why")

> **Purpose:** Defines who we're building for, why, and what we explicitly won't do.
> **See Strategy:** `keystone/strategy/architecture-overview.md` for Master Architecture.

> ⚠️ **STRATEGIC PIVOT (Dec 2025):** This project has shifted from a Streamlit-based UI to a **React-based UI**. 
> - **Status of Streamlit:** Existing Python dashboard code (`src-tauri/python/portfolio_src/dashboard/`) is now **Reference Only**. 
> - **New Direction:** All new UI work happens in `src/` (React). The Python backend is being refactored into a **Headless Analytics Engine**.

---

## 1. Core Philosophy

### User Persona
- **Primary:** Self-directed retail investor (30-50 years old)
- **Technical Level:** Intermediate — comfortable with desktop apps, not CLI
- **Context:** Privacy-conscious, uses Trade Republic or similar broker
- **Behavior:** Checks portfolio weekly/monthly, wants deep analysis without data leaving their machine

### Key Value Proposition
> "See through your portfolio like an X-ray — understand your true exposure across assets, geographies, and sectors, all without your data leaving your computer."

### Tone/Vibe
- **Professional but approachable** — Not enterprise software, not gamified
- **Data-dense** — Power users appreciate seeing numbers, not hiding them
- **Trustworthy** — Privacy messaging is prominent, not hidden
- **Native feel** — Should feel like a macOS app, not a wrapped website (React + ShadCN/UI)

---

## 2. Business Goals

- [ ] **MVP Launch:** Ship a working desktop app to 10-20 alpha testers
- [ ] **Community Validation:** Prove that "Hive" concept with 100+ contributed ISIN resolutions
- [ ] **Zero Server Cost (MVP):** Operate within Cloudflare/Supabase free tiers
- [ ] **Foundation for Scale:** Architecture supports future features (multi-broker, iOS app)

---

## 3. Anti-Goals (Critical: What We Are NOT Building)

- [ ] **Trading execution** — Compliance nightmare, not our core value
- [ ] **Real-time price streaming** — Free APIs don't support it; daily close is sufficient for analysis
- [ ] **Multi-user accounts** — Desktop app = single user; no auth complexity for MVP
- [ ] **Tax optimization/advice** — Legal liability; out of scope
- [ ] **Windows/Linux support (MVP)** — Focus on macOS first; cross-platform testing requires additional resources
- [ ] **Mobile app (MVP)** — Desktop-first; Tauri v2 mobile support is future consideration
- [ ] **Comprehensive broker support** — Trade Republic only for MVP; others are deferred
- [ ] **Manual portfolio entry** — Focus on automated import first, manual entry is fallback

---

## 4. User Journey (MVP)

### First Launch
1. **App opens instantly** (<2s), shows React "Welcome" screen
2. **User prompted** to connect Trade Republic account
3. **2FA flow** (phone + code) handled natively in React UI
4. **Portfolio imports** via Python engine (background process)
5. **Dashboard shows** holdings, allocation, exposure breakdown

### Returning User
1. **App launches instantly**, shows cached dashboard from SQLite/Parquet
2. **Background sync** triggers Python engine to fetch updates
3. **UI updates reactively** when new data is available
4. **If offline**, shows "Offline Mode" badge — analysis still works

### New Asset Discovery
1. **User's portfolio** contains unknown ETF (ISIN not in local universe)
2. **App checks** "Hive" (Supabase) — if found, uses community data
3. **If not found**, prompts user: "Upload holdings CSV from provider website?"
4. **User uploads** → parsed → stored locally AND queued for Hive contribution

---

## 5. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| App launch time | < 2 seconds | Timer from click to React render |
| Offline functionality | 100% of core features | Manual testing with WiFi disabled |
| Bundle size | < 150MB | `.app` bundle size on disk |
| Crash rate | < 1% of sessions | GitHub Issues with `auto-report` label |
| Community contributions | 100+ ISINs | Supabase `master_universe` row count |

---

## 6. Acceptance Criteria

The problem is solved when:
- [ ] **MVP Launch:** Standalone `.app` that runs React UI + Python Engine
- [ ] **2FA Flow:** User can authenticate with Trade Republic via in-app 2FA
- [ ] **Offline Mode:** App functions with cached data when disconnected
- [ ] **Community Contribution:** New ISIN resolutions sync to/from Supabase "Hive"
