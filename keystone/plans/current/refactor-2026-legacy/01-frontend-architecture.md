# Spec: Frontend Architecture Refactor (FSD)

> **Goal**: Migrate the React frontend from a layer-based structure to Feature-Sliced Design (FSD) as mandated by `rules/architecture.md`.
> **Estimated Time**: 30-45 minutes.

## 1. Overview
The current structure (`src/components`, `src/views`) couples unrelated concerns. We will reorganize into `src/features/` where each feature is self-contained with its own components, API definitions, and types.

## 2. Target Structure
```text
src/
  features/
    auth/
      components/   # LoginForm, TwoFactorModal, SessionRestorePrompt
      api.ts        # Auth-specific IPC calls
      types.ts      # Auth interfaces
    dashboard/
      components/   # Dashboard, MetricCard, TopHoldingsCard
      api.ts        # Dashboard data fetchers
      types.ts
    portfolio/
      components/   # HoldingsView, PortfolioTable, PortfolioChart
      api.ts
      types.ts
    xray/
      components/   # XRayView, ResolutionTable, ActionQueue
      api.ts
      types.ts
    integrations/
      components/   # TradeRepublicView, HoldingsUpload
      api.ts
      types.ts
  components/       # Shared UI (Button, Modal, Toast)
  lib/              # Shared infrastructure (IPC core, Events)
```

## 3. Implementation Steps

### 3.1 Create Feature Directories
- [ ] Create folders: `src/features/{auth,dashboard,portfolio,xray,integrations}/components`

### 3.2 Move Components
**Auth Feature**:
- [ ] Move `src/components/auth/*` -> `src/features/auth/components/`

**Dashboard Feature**:
- [ ] Move `src/components/views/Dashboard.tsx` -> `src/features/dashboard/components/Dashboard.tsx`
- [ ] Move `src/components/MetricCard.tsx` -> `src/features/dashboard/components/MetricCard.tsx`
- [ ] Move `src/components/views/TopHoldingsCard.tsx` -> `src/features/dashboard/components/TopHoldingsCard.tsx`
- [ ] Move `src/components/views/TrueExposureCard.tsx` -> `src/features/dashboard/components/TrueExposureCard.tsx` (if exists)

**Portfolio Feature**:
- [ ] Move `src/components/views/HoldingsView.tsx` -> `src/features/portfolio/components/HoldingsView.tsx`
- [ ] Move `src/components/portfolio/PortfolioTable.tsx` -> `src/features/portfolio/components/PortfolioTable.tsx`
- [ ] Move `src/components/PortfolioChart.tsx` -> `src/features/portfolio/components/PortfolioChart.tsx`

**X-Ray Feature**:
- [ ] Move `src/components/views/XRayView.tsx` -> `src/features/xray/components/XRayView.tsx`
- [ ] Move `src/components/views/xray/*` -> `src/features/xray/components/`

**Integrations Feature**:
- [ ] Move `src/components/views/TradeRepublicView.tsx` -> `src/features/integrations/components/TradeRepublicView.tsx`
- [ ] Move `src/components/HoldingsUpload.tsx` -> `src/features/integrations/components/HoldingsUpload.tsx`

### 3.3 Create Feature Contracts
For each feature (`auth`, `dashboard`, `portfolio`, `xray`):
- [ ] Create `api.ts`: Move relevant IPC functions from `src/lib/api/` or `src/lib/ipc.ts` to this file.
    - Example: `tr_login` goes to `features/auth/api.ts`.
    - Example: `get_dashboard_data` goes to `features/dashboard/api.ts`.
- [ ] Create `types.ts`: Extract feature-specific types from `src/types/index.ts`.

### 3.4 Fix Imports
- [ ] Update all import paths in the moved files.
- [ ] Update `src/App.tsx` imports.
- [ ] Update `src/lib/ipc.ts` to only contain generic IPC wrappers, not specific API calls (if possible, otherwise import from features).

## 4. Verification
- [ ] Application compiles (`npm run tauri dev`).
- [ ] No circular dependencies between features.
- [ ] `src/components` only contains truly shared generic UI.
