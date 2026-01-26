# Python Type Issues Report

**Date:** January 26, 2026 | **mypy:** 1.19.1 | **Python:** 3.12  
**Status:** 170 errors across 47 files

## Summary

| Error Type | Count | Fix |
|------------|-------|-----|
| `no-untyped-def` | 115 | Add type annotations |
| `import-untyped` | 8 | `uv add types-requests --dev` |
| `assignment` | 8 | Fix type mismatches |
| `operator` | 8 | Type `object` variables properly |
| `index` | 6 | Add dict/list type hints |
| `var-annotated` | 6 | Annotate variables |
| `return-value` | 5 | Use `T | None` return types |
| `arg-type` | 5 | Fix function call arguments |
| `prop-decorator` | 3 | Reorder decorators |
| `name-defined` | 2 | Add missing imports |
| `attr-defined` | 2 | Type variables correctly |
| `no-redef` | 1 | Rename shadowed variable |
| `call-overload` | 1 | Fix `open()` encoding param |

## Priority Files

| File | Errors |
|------|--------|
| `data/resolution.py` | 13 |
| `core/pipeline.py` | 13 |
| `prism_utils/logging_config.py` | 11 |
| `adapters/ishares.py` | 9 |
| `prism_utils/metrics.py` | 8 |
| `core/health.py` | 8 |

## Critical Bugs (Runtime)

1. **`prism_utils/telemetry.py:477`** — `DataQuality` undefined
2. **`headless/handlers/sync.py:107`** — `STOCK_ENTITY_TYPES` undefined

## Quick Wins

```bash
# Fix 8 import-untyped errors
uv add types-requests --dev
```

## Test Status

**16 failed, 797 passed (98% pass rate)**

Remaining failures unrelated to types (pipeline integration, config paths).

## Changelog

| Date | Action | Errors | Tests |
|------|--------|--------|-------|
| 2026-01-26 | Initial audit | 170 | 109 failed, 704 passed |
| 2026-01-26 | Added `pytest-asyncio` | 170 | 16 failed, 797 passed |
