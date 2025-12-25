# Workstream Registry

> **Purpose:** Tracks active parallel sessions and their ownership.
> **Updated by:** AI Agents during session start/end.

| Workstream | Feature Plan | Session Name | Status | Last Heartbeat |
| :--- | :--- | :--- | :--- | :--- |
| `infrastructure` | `keystone/project/workstreams/infrastructure.md` | `root-session` | `Active` | 2025-12-21 |
| `data-engine` | `keystone/project/workstreams/data-engine.md` | `root-session` | `Active` | 2025-12-21 |
| `frontend` | `keystone/project/workstreams/frontend.md` | `PP-UI-main` | `Paused` | 2025-12-22 |
| `sqlite-migration` | `keystone/project/workstreams/sqlite-migration.md` | `root-session` | `Active` | 2025-12-21 |
| `tailwind-migration-fix` | `keystone/project/workstreams/tailwind-migration-fix.md` | `PP-UI-main` | `Done` | 2025-12-22 |
| `beautiful-logs` | `keystone/project/workstreams/beautiful_logs.md` | `AutoFeedback` | `Active` | 2025-12-22 |
| `prism-refactor` | `keystone/project/workstreams/prism_refactor.md` | `None` | `Backlog` | 2025-12-22 |
| `pipeline-progress-ux` | `keystone/project/workstreams/pipeline-progress-ux.md` | `Pipeline Optimization` | `Active` | 2025-12-23 |
| `hive-extension` | `keystone/strategy/HIVE_EXTENSION_STRATEGY.md` | `OptiPie` | `Paused` | 2025-12-25 |

---

## Registry Rules
1. **Unique Names**: Workstream names must match their filename in `keystone/project/workstreams/`.
2. **Session Ownership**: Only one session should be `Active` per workstream at a time.
3. **Heartbeat**: Agents should update the `Last Heartbeat` when calling the `keystone-board` skill.
