# V1 documentation archive

Reconciled: 2026-09-07. These documents describe the retained V1 implementation. Start with the [current documentation map](../index.md) for V2. Archived commands and imperative language are historical source material, not instructions to execute. Revalidate useful designs, identifiers, APIs and source terms before reuse.

All former `docs/<category>/<file>` documents moved to `docs/v1/<category>/<file>`. Historical absolute paths and old `keystone/` references remain evidence of the original layout, not current navigation. No document was deleted. Obsolete tooling records remain for provenance.

## Classification inventory

| Document | Classification | Read when |
| --- | --- | --- |
| [architecture/analytics_pipeline.md](architecture/analytics_pipeline.md) | Useful V1 reference | Compare the old decomposition, enrichment and aggregation boundaries. |
| [architecture/database_schema.md](architecture/database_schema.md) | Useful V1 reference | Investigate legacy Hive storage and data provenance; revalidate schema claims against V1 code. |
| [architecture/echo_sentinel.md](architecture/echo_sentinel.md) | Useful V1 reference | Investigate old crash reporting and privacy tradeoffs; V2 uses local diagnostics. |
| [architecture/identity_resolution.md](architecture/identity_resolution.md) | Useful V1 reference | Study old identifier resolution approaches and failure modes. |
| [architecture/system_overview.md](architecture/system_overview.md) | Useful V1 reference | Navigate the retained React, Tauri and Python implementation. |
| [architecture/unified_data_schema.md](architecture/unified_data_schema.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [execution/2026-03-09-session-handoff.md](execution/2026-03-09-session-handoff.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [execution/codex-install-config-plan.md](execution/codex-install-config-plan.md) | Obsolete | Retained as dated tooling history only. Machine setup and capability claims require a new audit. |
| [execution/codex-self-testing-capabilities.md](execution/codex-self-testing-capabilities.md) | Obsolete | Retained as dated tooling history only. Machine setup and capability claims require a new audit. |
| [execution/live-ui-qa-report-2026-03-06.md](execution/live-ui-qa-report-2026-03-06.md) | Useful V1 reference | Inspect the dated V1 UI test evidence; it is not V2 acceptance. |
| [execution/opencode-self-testing-runbook.md](execution/opencode-self-testing-runbook.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [execution/project-overview-live.md](execution/project-overview-live.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [execution/self-testing-capability-gap-report-2026-03-07.md](execution/self-testing-capability-gap-report-2026-03-07.md) | Useful V1 reference | Investigate dated V1 testing limitations. |
| [execution/stabilization-and-self-dogfood-plan.md](execution/stabilization-and-self-dogfood-plan.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [execution/v1-contributing-reference.md](execution/v1-contributing-reference.md) | Useful V1 reference | Maintain V1 frontend and testing conventions. |
| [execution/v1-readme-reference.md](execution/v1-readme-reference.md) | Useful V1 reference | Recover V1 setup and architecture context. |
| [guides/debugging_pipelines.md](guides/debugging_pipelines.md) | Useful V1 reference | Investigate V1 Python pipelines; verify tool availability first. |
| [plans/2026-03-07-opencode-self-test-migration.md](plans/2026-03-07-opencode-self-test-migration.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [plans/2026-03-08-pipeline-stabilization-plan.md](plans/2026-03-08-pipeline-stabilization-plan.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [plans/2026-03-08-session-restore-dogfood-fix-plan.md](plans/2026-03-08-session-restore-dogfood-fix-plan.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [plans/2026-07-06-stabilization-roadmap.md](plans/2026-07-06-stabilization-roadmap.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [security/csp_config.md](security/csp_config.md) | Useful V1 reference | Maintain or diagnose the retained Tauri content security configuration. |
| [specs/data_model.md](specs/data_model.md) | Useful V1 reference | Interpret old stored data and recovery formats. |
| [specs/identity_resolution_details.md](specs/identity_resolution_details.md) | Useful V1 reference | Review identifier formats and source candidates; verify all matches independently. |
| [specs/ipc_api.md](specs/ipc_api.md) | Useful V1 reference | Investigate V1 IPC; confirm contracts against registries before use. |
| [specs/pipeline_definition_of_done.md](specs/pipeline_definition_of_done.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [specs/pipeline_triggering.md](specs/pipeline_triggering.md) | Useful V1 reference | Investigate old refresh and pipeline triggers. |
| [specs/product_definition.md](specs/product_definition.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [specs/supabase_hive.md](specs/supabase_hive.md) | Useful V1 reference | Investigate old Hive API and community-data assumptions. |
| [specs/trade_republic.md](specs/trade_republic.md) | Useful V1 reference | Compare old pytr-based broker behavior with the current TypeScript integration. |
| [standards/api_design.md](standards/api_design.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [standards/architecture.md](standards/architecture.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [standards/documentation.md](standards/documentation.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [standards/logging.md](standards/logging.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [standards/python_details.md](standards/python_details.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [standards/rules_ts.md](standards/rules_ts.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [standards/rust_details.md](standards/rust_details.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [standards/security.md](standards/security.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [standards/testing.md](standards/testing.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [standards/workflow.md](standards/workflow.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
| [tech_stack/overview.md](tech_stack/overview.md) | Superseded | Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2. |
