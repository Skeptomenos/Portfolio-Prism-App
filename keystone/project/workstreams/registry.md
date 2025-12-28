# Workstream Registry

> **Purpose:** Tracks active parallel sessions and their ownership.
> **Updated by:** AI Agents during session start/end.

## Active Workstreams

| Workstream | Feature Plan | Session Name | Status | Last Heartbeat |
| :--- | :--- | :--- | :--- | :--- |
| `data-engine` | `keystone/project/workstreams/data-engine.md` | `root-session` | `Active` | 2025-12-27 |
| `identity-resolution` | `keystone/project/workstreams/identity-resolution.md` | `IdentityResolution` | `Active` | 2025-12-27 |
| `silent-night` | `keystone/project/workstreams/silent-night.md` | `Sisyphus` | `Active` | 2025-12-28 |

## Archived Workstreams

| Workstream | Feature Plan | Archived Date |
| :--- | :--- | :--- |
| `tailwind-migration-fix` | `keystone/project/workstreams/archive/tailwind-migration-fix.md` | 2025-12-26 |
| `bug-fixes` | `keystone/project/workstreams/archive/bug-fixes.md` | 2025-12-26 |
| `hive-data-flow-fix` | `keystone/project/workstreams/archive/hive-data-flow-fix.md` | 2025-12-26 |
| `hive-extension` | `keystone/project/workstreams/archive/hive-extension.md` | 2025-12-26 |
| `infrastructure` | `keystone/project/workstreams/archive/infrastructure.md` | 2025-12-26 |
| `sqlite-migration` | `keystone/project/workstreams/archive/sqlite-migration.md` | 2025-12-26 |
| `beautiful-logs` | `keystone/project/workstreams/archive/beautiful_logs.md` | 2025-12-26 |
| `pipeline-progress-ux` | `keystone/project/workstreams/archive/pipeline-progress-ux.md` | 2025-12-26 |
| `frontend` | `keystone/project/workstreams/archive/frontend.md` | 2025-12-26 |
| `prism-refactor` | `keystone/project/workstreams/archive/prism_refactor.md` | 2025-12-26 |

---

## Registry Rules
1. **Unique Names**: Workstream names must match their filename in `keystone/project/workstreams/`.
2. **Session Ownership**: Only one session should be `Active` per workstream at a time.
3. **Heartbeat**: Agents should update the `Last Heartbeat` when calling the `keystone-board` skill.
