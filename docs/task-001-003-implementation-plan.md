# Phase 0 Implementation Plan: TASK-001 to TASK-003

> **Branch:** `feat/react-foundation`
> **Created:** 2024-12-15
> **Purpose:** Detailed execution steps for Phase 0 (Infrastructure & Migration)

---

## Overview

| Task | Name | Status | Estimated Effort |
|------|------|--------|------------------|
| TASK-001 | Archive Legacy Dashboard Code | Pending | 15 min |
| TASK-002 | Migrate In-Flight Infrastructure Tasks | Pending | 20 min |
| TASK-003 | Scaffold React Environment | Pending | 30 min |

**Total Estimated Time:** ~1 hour

**Rollback:** If anything goes wrong, reset to `main` branch:
```bash
git checkout main
git branch -D feat/react-foundation
```

---

## TASK-001: Archive Legacy Dashboard Code

### Objective
Preserve the Streamlit dashboard as a reference implementation while preventing accidental execution in production.

### Pre-Conditions
- On branch `feat/react-foundation`
- Working directory is project root

### Steps

#### 1.1 Create Archive Directory Structure
```bash
mkdir -p src-tauri/python/reference_dashboard
```

#### 1.2 Move Dashboard Folder
```bash
mv src-tauri/python/portfolio_src/dashboard src-tauri/python/reference_dashboard/
```

**Result:** Dashboard code moves from:
- `src-tauri/python/portfolio_src/dashboard/` 
- To: `src-tauri/python/reference_dashboard/dashboard/`

#### 1.3 Add Deprecation Warning to app.py
Edit `src-tauri/python/reference_dashboard/dashboard/app.py` to add this warning block at the very top (before any imports):

```python
"""
DEPRECATED: This Streamlit dashboard is archived.
The active UI is now React-based (see src/).
This file is preserved for reference only.
"""
import warnings
import sys

# Emit deprecation warning when imported
warnings.warn(
    "\n\n"
    "=" * 60 + "\n"
    "DEPRECATED: This Streamlit dashboard is archived.\n"
    "The active UI is now React-based.\n"
    "This file is preserved for reference only.\n"
    "=" * 60 + "\n",
    DeprecationWarning,
    stacklevel=2
)

# Block direct execution
if __name__ == "__main__":
    print("=" * 60)
    print("ERROR: This dashboard is deprecated.")
    print("Use the React UI via: npm run tauri dev")
    print("=" * 60)
    sys.exit(1)

# --- Original code below (preserved for reference) ---
```

#### 1.4 Verify portfolio_src Imports
Check if `src-tauri/python/portfolio_src/__init__.py` imports from `dashboard`. If so, remove or comment out those imports to prevent import errors.

### Verification Checklist
- [ ] `src-tauri/python/portfolio_src/dashboard/` no longer exists
- [ ] `src-tauri/python/reference_dashboard/dashboard/app.py` exists with deprecation warning
- [ ] Running `python reference_dashboard/dashboard/app.py` exits with error message
- [ ] No import errors in remaining `portfolio_src` modules

### Commit
```bash
git add -A
git commit -m "refactor: archive legacy Streamlit dashboard to reference_dashboard"
```

---

## TASK-002: Migrate In-Flight Infrastructure Tasks

### Objective
Verify Cloudflare Worker is ready for deployment and document all infrastructure requirements.

### Pre-Conditions
- TASK-001 complete (or can run in parallel)
- Cloudflare Worker already deployed (verification only)

### Steps

#### 2.1 Verify Cloudflare Worker Configuration

**File:** `infrastructure/cloudflare/wrangler.toml`

Confirm the following are present:
- `name = "portfolio-prism-proxy"` - Worker name
- `main = "worker.js"` - Entry point
- `compatibility_date` - Set to recent date

**Required Secrets (set via `wrangler secret put`):**
| Secret | Purpose | Status |
|--------|---------|--------|
| `FINNHUB_API_KEY` | Finnhub API for stock data | Needs setup |
| `GITHUB_TOKEN` | GitHub PAT for feedback issues | Needs setup |
| `GITHUB_REPO` | Target repo (e.g., `user/portfolio-prism`) | Needs setup |

#### 2.2 Verify Worker Endpoints Match IPC Needs

Check `infrastructure/cloudflare/worker.js` endpoints:
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/health` | GET | Heartbeat check | Ready |
| `/api/finnhub/profile` | POST | Stock profile lookup | Ready |
| `/api/finnhub/quote` | POST | Stock quote | Ready |
| `/api/finnhub/search` | POST | Symbol search | Ready |
| `/feedback` | POST | Create GitHub issue | Ready |

**CORS Origins Configured:**
- `tauri://localhost` (Tauri production)
- `http://localhost:1420` (Vite dev server)
- `http://localhost:8501` (Legacy Streamlit - can remove later)

#### 2.3 Update .env.example

Ensure `.env.example` documents all required environment variables:

```bash
# Cloudflare Worker Secrets (set via wrangler secret put)
# FINNHUB_API_KEY=your_finnhub_api_key
# GITHUB_TOKEN=your_github_personal_access_token
# GITHUB_REPO=username/portfolio-prism

# Supabase Configuration (for Hive features)
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=your_anon_key
```

#### 2.4 Update Infrastructure Setup Documentation

Update `docs/infrastructure_setup.md` with deployment steps if not already complete.

**Cloudflare Worker Deployment:**
```bash
cd infrastructure/cloudflare

# Install wrangler if needed
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Set secrets
wrangler secret put FINNHUB_API_KEY
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPO

# Deploy
wrangler deploy
```

**Supabase Setup (Future):**
1. Create project at supabase.com
2. Create tables per `anamnesis/specs/data_schema.md` (Hive tables)
3. Configure Row Level Security (RLS)
4. Add connection details to app config

#### 2.5 Test Worker Health Endpoint

If worker is already deployed, verify with:
```bash
curl https://portfolio-prism-proxy.<your-subdomain>.workers.dev/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-12-15T..."}
```

### Verification Checklist
- [ ] `wrangler.toml` is valid and complete
- [ ] `.env.example` lists all required secrets
- [ ] `docs/infrastructure_setup.md` has deployment instructions
- [ ] Worker health endpoint responds (if deployed)

### Commit
```bash
git add -A
git commit -m "docs: update infrastructure documentation and verify Cloudflare Worker"
```

---

## TASK-003: Scaffold React Environment

### Objective
Replace the vanilla TypeScript Streamlit-loader with a proper React + TypeScript environment, leveraging the existing `v2-ui/react-prototype/`.

### Approach: Option C (Hybrid)
- Promote existing React prototype to `src/`
- Add ShadCN/Tailwind incrementally later
- Preserve existing components that work

### Pre-Conditions
- TASK-001 complete
- On branch `feat/react-foundation`

### Steps

#### 3.1 Backup Current src Directory
```bash
mv src src-legacy
```

This preserves the Streamlit loader code for reference.

#### 3.2 Copy React Prototype to src
```bash
cp -r v2-ui/react-prototype/src src
```

#### 3.3 Copy React index.html
```bash
cp v2-ui/react-prototype/index.html index.html
```

This replaces the old loading screen HTML with React's entry point.

#### 3.4 Merge package.json Dependencies

Add these dependencies to root `package.json`:

**Dependencies to add:**
```json
{
  "dependencies": {
    "framer-motion": "^11.11.17",
    "lucide-react": "^0.456.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.7.0"
  }
}
```

**Final package.json should look like:**
```json
{
  "name": "portfolio-prism",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-opener": "^2",
    "framer-motion": "^11.11.17",
    "lucide-react": "^0.456.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.7.0",
    "typescript": "~5.6.2",
    "vite": "^6.0.3"
  }
}
```

#### 3.5 Update vite.config.ts for React

Replace `vite.config.ts` with:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
```

#### 3.6 Copy/Update TypeScript Config

Check if `v2-ui/react-prototype/tsconfig.json` has React-specific settings. If so, merge them into root `tsconfig.json`:

Key settings needed for React:
```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

#### 3.7 Install Dependencies
```bash
npm install
```

#### 3.8 Test Vite Dev Server
```bash
npm run dev
```

Expected: Vite starts on `http://localhost:1420`, React app renders.

#### 3.9 Test Tauri Integration
```bash
npm run tauri dev
```

Expected: Tauri window opens with React UI (not Streamlit loader).

#### 3.10 Clean Up Legacy Files
After successful test, optionally remove:
- `src-legacy/` (or keep for reference)
- `v2-ui/react-prototype/` (or keep as backup)

### Verification Checklist
- [ ] `npm install` completes without errors
- [ ] `npm run dev` starts Vite with React
- [ ] `npm run build` compiles successfully
- [ ] `npm run tauri dev` shows React UI in Tauri window
- [ ] React components render (Sidebar, Dashboard visible)
- [ ] HMR works (edit a component, see instant update)

### Commit
```bash
git add -A
git commit -m "feat: scaffold React environment from v2-ui prototype"
```

---

## Post-Implementation: Update Project State

### Update tasks.md
Mark TASK-001, TASK-002, TASK-003 as `Done`.

### Update board.md
Regenerate board to reflect new progress.

### Update handover.md
Update current state for next session.

### Final Commit
```bash
git add -A
git commit -m "docs: update project state after Phase 0 completion"
```

---

## Appendix: File Structure After Phase 0

```
.
├── src/                          # NEW: React UI
│   ├── components/
│   │   ├── views/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── HoldingsView.tsx
│   │   │   ├── OverlapView.tsx
│   │   │   └── XRayView.tsx
│   │   ├── GlassCard.tsx
│   │   ├── MetricCard.tsx
│   │   └── Sidebar.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── src-legacy/                   # ARCHIVED: Old Streamlit loader
├── src-tauri/
│   ├── python/
│   │   ├── portfolio_src/        # PRESERVED: Core Python logic
│   │   │   ├── core/
│   │   │   ├── data/
│   │   │   ├── models/
│   │   │   └── ...
│   │   └── reference_dashboard/  # NEW: Archived Streamlit dashboard
│   │       └── dashboard/
│   │           ├── app.py        # With deprecation warning
│   │           └── tabs/
│   └── src/
├── infrastructure/
│   └── cloudflare/               # VERIFIED: Worker ready
├── docs/
│   ├── infrastructure_setup.md   # UPDATED: Deployment docs
│   └── task-001-003-implementation-plan.md  # THIS FILE
├── index.html                    # UPDATED: React entry point
├── package.json                  # UPDATED: React dependencies
├── vite.config.ts                # UPDATED: React plugin
└── tsconfig.json                 # UPDATED: React/JSX support
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| React prototype has bugs | Test thoroughly before removing `src-legacy` |
| Tauri config breaks | Keep original `tauri.conf.json` (no changes needed) |
| Python imports break | Verify `portfolio_src` modules work after dashboard removal |
| Build fails | Rollback branch with `git checkout main` |

---

## Next Steps (After Phase 0)

Once this is complete, the project is ready for:

1. **TASK-101:** Implement SQLite Schema (Phase 1)
2. **TASK-301:** Frontend State Setup with Zustand (Phase 3, can run parallel)
3. **TASK-502:** GitHub Actions CI/CD (Phase 5, can start early)
