# Workstream Registry

> **Purpose:** Tracks active parallel sessions and their ownership.
> **Updated by:** AI Agents during session start/end.

## Active Workstreams

| Workstream | Feature Plan | Session Name | Status | Last Heartbeat |
| :--- | :--- | :--- | :--- | :--- |
| `infrastructure` | `keystone/project/workstreams/infrastructure.md` | `root-session` | `Done` | 2025-12-26 |
| `data-engine` | `keystone/project/workstreams/data-engine.md` | `root-session` | `Done` | 2025-12-26 |
| `frontend` | `keystone/project/workstreams/frontend.md` | `PP-UI-main` | `Paused` | 2025-12-22 |
| `sqlite-migration` | `keystone/project/workstreams/sqlite-migration.md` | `root-session` | `Done` | 2025-12-26 |
| `beautiful-logs` | `keystone/project/workstreams/beautiful_logs.md` | `AutoFeedback` | `Done` | 2025-12-26 |
| `prism-refactor` | `keystone/project/workstreams/prism_refactor.md` | `None` | `Backlog` | 2025-12-22 |
| `pipeline-progress-ux` | `keystone/project/workstreams/pipeline-progress-ux.md` | `Pipeline Optimization` | `Done` | 2025-12-26 |

## Archived Workstreams

| Workstream | Feature Plan | Archived Date |
| :--- | :--- | :--- |
| `tailwind-migration-fix` | `keystone/project/workstreams/archive/tailwind-migration-fix.md` | 2025-12-26 |
| `bug-fixes` | `keystone/project/workstreams/archive/bug-fixes.md` | 2025-12-26 |
| `hive-data-flow-fix` | `keystone/project/workstreams/archive/hive-data-flow-fix.md` | 2025-12-26 |
| `hive-extension` | `keystone/project/workstreams/archive/hive-extension.md` | 2025-12-26 |

---

## Registry Rules
1. **Unique Names**: Workstream names must match their filename in `keystone/project/workstreams/`.
2. **Session Ownership**: Only one session should be `Active` per workstream at a time.
3. **Heartbeat**: Agents should update the `Last Heartbeat` when calling the `keystone-board` skill.
