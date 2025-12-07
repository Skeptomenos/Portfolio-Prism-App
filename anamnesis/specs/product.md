# Product Spec (The "Why")

> **Purpose:** Defines who we're building for, why, and what we explicitly won't do.
> **Read this:** When making product decisions or prioritizing features.

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
- **Native feel** — Should feel like a macOS app, not a wrapped website

---

## 2. Business Goals

- [ ] **MVP Launch:** Ship a working desktop app to 10-20 alpha testers
- [ ] **Community Validation:** Prove the "Hive" concept with 100+ contributed ISIN resolutions
- [ ] **Zero Server Cost (MVP):** Operate within Cloudflare/Supabase free tiers
- [ ] **Foundation for Scale:** Architecture supports future features (multi-broker, iOS app)

---

## 3. Anti-Goals (What We Are NOT Building)

| Anti-Goal | Reason |
|-----------|--------|
| **Trading execution** | Compliance nightmare, not our core value |
| **Real-time streaming prices** | Free APIs don't support it; daily close is sufficient |
| **Multi-user accounts** | Desktop app = single user; no auth complexity for MVP |
| **Tax optimization/advice** | Legal liability; out of scope |
| **Windows/Linux support (MVP)** | Focus on macOS first; cross-platform is Phase 2+ |
| **Mobile app (MVP)** | Desktop-first; Tauri v2 mobile support is future consideration |
| **Comprehensive broker support** | Trade Republic only for MVP; others are deferred |

---

## 4. User Journey (MVP)

### First Launch
1. App opens, shows "Welcome" screen
2. User prompted to connect Trade Republic account
3. 2FA flow (phone + code)
4. Portfolio imports automatically
5. Dashboard shows holdings, allocation, exposure breakdown

### Returning User
1. App launches, shows loading spinner (~3-5 seconds for Python sidecar)
2. Dashboard loads with cached data immediately
3. Background sync fetches latest positions and prices
4. If offline, shows "Offline Mode" badge — analysis still works

### New Asset Discovery
1. User's portfolio contains unknown ETF (ISIN not in local universe)
2. App checks "Hive" (Supabase) — if found, uses community data
3. If not found, prompts user: "Upload holdings CSV from provider website?"
4. User uploads → parsed → stored locally AND queued for Hive contribution

---

## 5. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| App launch time | < 5 seconds | Timer from click to dashboard render |
| Offline functionality | 100% of core features | Manual testing with WiFi disabled |
| Bundle size | < 100MB | `.app` bundle size on disk |
| Crash rate | < 1% of sessions | GitHub Issues with `auto-report` label |
| Community contributions | 100+ ISINs | Supabase `master_universe` row count |
