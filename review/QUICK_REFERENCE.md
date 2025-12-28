# Quick Reference: Code Review Checklist
**Print this or keep it as a reference during fixes**

---

## 🔴 CRITICAL ISSUES

### Issue #1: Logging (48 prints across 12 files)
```bash
# Find all prints
grep -rn "print(" src-tauri/python/portfolio_src/ --include="*.py" \
  | grep -v "def print" | grep -v "# print" | grep -v "__main__"

# Fix pattern
print("message") → logger.info("message")
print(f"error: {e}") → logger.error(f"error: {e}", exc_info=True)
```

**Files (in priority order):**
1. tr_daemon.py (2 prints) — Blocks SN-001
2. hive_client.py (8 prints) — Blocks SN-005
3. ishares.py (5 prints) — Blocks SN-006
4. pdf_parser.py (10 prints) — Blocks SN-007
5. vaneck.py (4 prints) — Blocks SN-006
6. vanguard.py (4 prints) — Blocks SN-006
7. amundi.py (3 prints) — Blocks SN-006
8. xtrackers.py (3 prints) — Blocks SN-006
9. position_keeper.py (2 prints) — Blocks SN-004
10. validation.py (1 print) — Blocks SN-003
11. echo_bridge.py (2 prints) — Blocks SN-008
12. stdin_loop.py (3 prints) — Blocks SN-008
13. metrics.py (1 print) — Blocks SN-008

**Success:** `grep "print(" src-tauri/python/portfolio_src/ -r | wc -l` = 0

---

### Issue #2: Async Adapters (TASK-612)
```bash
# Find all synchronous requests.get() calls
grep -rn "requests.get(" src-tauri/python/portfolio_src/adapters/ --include="*.py"

# Expected: 5 matches (ishares, vanguard, amundi, vaneck, xtrackers)
# Fix: Create AsyncAdapterRegistry wrapper with ThreadPoolExecutor(max_workers=5)
```

**Create:** `src-tauri/python/portfolio_src/adapters/async_registry.py`
- [ ] Class AsyncAdapterRegistry
- [ ] Method: async fetch_holdings_batch(isins: list[str])
- [ ] ThreadPoolExecutor with max_workers=5
- [ ] Error handling + logging

**Integrate:** `src-tauri/python/portfolio_src/core/pipeline.py`
- [ ] Create _async_registry instance
- [ ] Use in decompose_etf_holdings()
- [ ] Benchmark: 50 ETFs in <60 seconds

**Test:** 
```bash
# Create benchmark
python -c "
import time
import asyncio
from portfolio_src.adapters.async_registry import AsyncAdapterRegistry

async def benchmark():
    registry = AsyncAdapterRegistry()
    isins = [...]  # 50 ETFs
    start = time.time()
    await registry.fetch_holdings_batch(isins)
    elapsed = time.time() - start
    print(f'50 ETFs in {elapsed:.1f}s')

asyncio.run(benchmark())
"

# Expected: <60 seconds (was 250+ seconds)
```

---

### Issue #3: Type Safety (6 `as any` casts)
```bash
# Find all 'as any' casts
grep -rn " as any" src/ --include="*.tsx" --include="*.ts" | grep -v test

# Expected after fix: 0 matches
```

**Fix:**
```typescript
// File 1: src/components/HoldingsUpload.tsx:55
// BEFORE: const filePath = (file as any).path || file.name;
// AFTER: Add FileWithPath interface, use type guard

// File 2: src/components/views/xray/ActionQueue.tsx:72
// BEFORE: {failure.error || (failure as any).issue}
// AFTER: Define APIFailure shape, use safe accessor
```

**Success:** `npm run build` (zero errors + warnings)

---

## 🟡 WARNINGS (Medium Priority)

### W1: Database Connection Pattern
**Files:** database.py (3 functions)
```python
# BEFORE (manual commit)
with get_connection() as conn:
    conn.execute(...)
    conn.commit()

# AFTER (auto-commit)
with transaction() as conn:
    conn.execute(...)
    # auto-commit on exit
```

**Functions to fix:**
- [ ] update_sync_state() — Line 237-250
- [ ] log_system_event() — Line 262-282
- [ ] mark_logs_processed() — Line 299-308

**Verification:**
```bash
grep -n "with transaction" src-tauri/python/portfolio_src/data/database.py
# Should see 4 instances (1 existing + 3 new)
```

---

### W2: Error Handling Missing exc_info=True
**Files:** hive_client.py and others
```python
# BEFORE (loses traceback)
except Exception as e:
    logger.error(f"Failed: {e}")

# AFTER (preserves traceback)
except Exception as e:
    logger.error(f"Failed: {e}", exc_info=True)

# OR
except Exception:
    logger.exception("Failed")
```

**Search pattern:**
```bash
grep -rn "logger.error(" src-tauri/python/portfolio_src/ --include="*.py" \
  | grep -v "exc_info=True"
```

---

### W3: IPC Type Validation
**Files:** src/lib/ipc.ts, src/types/
```bash
# Add Zod validation
npm install zod  # If not already installed

# Create: src/lib/ipc-schemas.ts
# Schema for: TrueHoldingsResponse, ResolutionSummary, XRayHolding

# Update: src/lib/ipc.ts
# Add: TrueHoldingsResponseSchema.parse(raw)
```

**Success:**
```bash
npm run build
# Zero TypeScript errors
```

---

### W4: ISIN Input Validation
**File:** src-tauri/python/portfolio_src/data/resolution.py
```python
# Add Pydantic model
class ResolutionRequest(BaseModel):
    ticker: str  # 1-50 chars, [A-Z0-9.-]+
    name: str    # 1-200 chars, no SQL injection chars

# Use in resolve()
def resolve(self, ticker: str, name: str):
    request = ResolutionRequest(ticker=ticker, name=name)
    # Continue...
```

---

### W5-W8: Other Warnings
```bash
# W5: Normalizer instances
grep -rn "NameNormalizer(" src-tauri/python/ --include="*.py" | grep -v "get_name_normalizer"
# Should return 0

# W6: Env var validation
# Add to prism_headless.py: validate_environment() at startup

# W7: useMemo deps
# Run ESLint, should report 0 violations
npm run lint

# W8: PyInstaller path
# Update: database.py:52-58 to use sys.frozen check
```

---

## ✅ VERIFICATION CHECKLIST

### After Logging Fixes
- [ ] 0 print() statements found: `grep "print(" src-tauri/python -r | wc -l`
- [ ] Python syntax valid: `python -m py_compile src-tauri/python/**/*.py`
- [ ] Logging tests pass: `pytest tests/test_logging.py`

### After Async Fixes
- [ ] AsyncAdapterRegistry created and tested
- [ ] 50 ETFs benchmark < 60 seconds
- [ ] Existing tests still pass: `pytest tests/test_adapters.py`

### After Type Safety Fixes
- [ ] 0 `as any` casts: `grep "as any" src -r | wc -l`
- [ ] TypeScript strict: `npm run build` (zero errors)
- [ ] ESLint clean: `npm run lint` (zero errors)

### Final Verification
```bash
# Run full suite
npm run build && npm run lint && pytest tests/

# Should see:
# ✓ Build successful
# ✓ No lint errors
# ✓ All tests passing
```

---

## Timeline Estimate

| Phase | Issue | Hours | Notes |
|-------|-------|-------|-------|
| 1 | Logging (SN-001) | 2-3 | Unblocks 8 tasks |
| 2 | Type Safety | 1 | `npm run build` validates |
| 2 | IPC Validation | 1 | Zod + test |
| 3 | Async Adapters | 4-6 | Benchmark critical |
| 3 | DB Consistency | 0.5 | Straightforward refactor |
| 4 | Polish (W2-W8) | 2-3 | Quick fixes |
| **Total** | — | **11-13** | Across 4 weeks |

---

## Daily Workflow (Example)

### Day 1: Logging (2-3 hours)
```bash
# 1. Fix tr_daemon.py
sed -i 's/print(/logger.debug(/g' src-tauri/python/portfolio_src/core/tr_daemon.py

# 2. Manual review + fix interactive code
vim src-tauri/python/portfolio_src/adapters/ishares.py

# 3. Verify zero prints
grep "print(" src-tauri/python -r | wc -l  # Should be 0

# 4. Commit
git add -A && git commit -m "Fix logging: replace print() with logger"
```

### Day 2: Type Safety (1-2 hours)
```bash
# 1. Create types file
cat > src/types/review-fixes.ts << 'EOF'
export interface FileWithPath extends File {
  path?: string;
}

export interface APIFailure {
  error?: string;
  issue?: string;
  message?: string;
}
EOF

# 2. Update components
vim src/components/HoldingsUpload.tsx
vim src/components/views/xray/ActionQueue.tsx

# 3. Validate
npm run build  # Should pass

# 4. Commit
git add -A && git commit -m "Fix type safety: remove 'as any' casts"
```

### Day 3+: Async + Polish
(Follow FINDINGS_WITH_FIXES.md for detailed implementation)

---

## Where to Find Details

**Detailed fixes and code examples:**
- `review/CODE_REVIEW_2025-12-28.md` — Full review with severity levels
- `review/FINDINGS_WITH_FIXES.md` — Step-by-step code fixes
- `review/WORKSTREAM_MAPPING.md` — How to integrate with project board
- `review/EXECUTIVE_SUMMARY.md` — For stakeholder communication

**All files in:** `/Users/davidhelmus/Repos/portfolio-master/MVP/review/`

---

## Questions?

If stuck on any fix:
1. Reference the detailed file for code examples
2. Check the standard in `keystone/standards/` for patterns
3. Search CHANGELOG for similar changes
4. Run the appropriate linter/validator

**Good luck! 🚀**
