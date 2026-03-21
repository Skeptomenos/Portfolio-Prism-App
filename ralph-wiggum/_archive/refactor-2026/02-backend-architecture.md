# Spec: Backend Architecture Refactor (Service Layer)

> **Goal**: Decouple the Python Presentation layer (`headless/handlers`) from the Data layer by introducing a proper Service layer.
> **Estimated Time**: 30 minutes.

## 1. Overview
The current `headless/handlers` modules directly access the database and perform business logic (P&L calculations). This violates the 3-Layer Pattern. We will extract this logic into `core/services/`.

## 2. Target Structure
```text
src-tauri/python/portfolio_src/
  core/
    services/
      dashboard_service.py  # Contains P&L, weights logic
      sync_service.py       # Contains TR sync logic
  headless/
    handlers/
      dashboard.py          # Only parses IPC, calls Service, returns DTO
      sync.py               # Only parses IPC, calls Service
```

## 3. Implementation Steps

### 3.1 Dashboard Service
- [ ] Create `src-tauri/python/portfolio_src/core/services/dashboard_service.py`.
- [ ] Extract P&L calculation and data fetching logic from `headless/handlers/dashboard.py` (`get_dashboard_data`).
- [ ] The service method should return a Pydantic model (DTO), NOT a dictionary.
- [ ] Update `headless/handlers/dashboard.py` to:
    - Inject `DashboardService`.
    - Call `service.get_dashboard_summary()`.
    - Return the result.

### 3.2 Sync Service
- [ ] Create `src-tauri/python/portfolio_src/core/services/sync_service.py`.
- [ ] Extract logic from `headless/handlers/sync.py` (TR credentials handling, pipeline triggering).
- [ ] Ensure `SyncService` interacts with `TRAuthManager` and `Pipeline`, not the handler.
- [ ] Update `headless/handlers/sync.py` to use `SyncService`.

### 3.3 Dependency Injection
- [ ] Update `src-tauri/python/portfolio_src/headless/state.py` to provide singleton accessors for these new services if they have state (or instantiate them per request if stateless).

## 4. Verification
- [ ] Run `pytest src-tauri/python/tests/headless/test_handlers_dashboard.py` (may need updating).
- [ ] Verify `handlers/dashboard.py` has NO `import portfolio_src.data.database`.
- [ ] Verify logic remains correct by running the app and checking the Dashboard numbers.
