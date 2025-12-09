# PyInstaller Learnings

> Lessons learned from bundling Portfolio Prism with PyInstaller.
> Reference this document when debugging bundle issues.

---

## 1. websockets v14+ Module Restructuring

**Date:** 2024-12-07  
**Symptom:** `create_connection() got an unexpected keyword argument 'additional_headers'`  
**Affected:** Portfolio sync after successful TR login

### Problem

`websockets` v14 moved its implementation from `websockets.client` to `websockets.asyncio.client`. Manual hidden imports don't capture this restructuring.

**What was happening:**
- `prism.spec` listed: `websockets`, `websockets.client`, `websockets.exceptions`
- `websockets.connect()` in v15 forwards to `websockets.asyncio.client.connect()`
- PyInstaller didn't bundle `websockets.asyncio.*` modules
- Python fell back to a stub without `additional_headers` support

### Solution

```python
# prism.spec
from PyInstaller.utils.hooks import collect_submodules

# Replace manual websockets imports with:
hidden_imports += collect_submodules('websockets')
```

This captures all 40+ websockets submodules automatically.

### Lesson

**Use `collect_submodules()` for libraries with complex internal module structures**, especially if they've had major version changes. Manual listing is fragile and breaks silently.

---

## 2. pytr asyncio.Lock() at Import Time

**Date:** 2024-12-07  
**Symptom:** `RuntimeError: There is no current event loop in thread 'ScriptRunner.scriptThread'`  
**Affected:** App crash when visiting TR Login tab

### Problem

`pytr` creates `asyncio.Lock()` at class definition time (line 65 in `pytr/api.py`), which requires an event loop to exist. Streamlit's ScriptRunner thread doesn't have one by default.

**Stack trace pattern:**
```
File "tr_login.py" → from core.tr_auth import ...
File "tr_auth.py" → from pytr.api import TradeRepublicApi
File "pytr/api.py", line 65 → asyncio.Lock()  # FAILS
```

### Solution

Two-part fix required:

**1. Lazy imports** - Defer pytr import until the tab is actually visited:
```python
# In tr_login.py - import inside functions, not at module level
def render():
    from core.tr_auth import AuthState, run_async  # Lazy
```

**2. Event loop creation** - Create loop before pytr import:
```python
# In tr_auth.py - before any pytr imports
import asyncio

try:
    asyncio.get_event_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())
```

### Lesson

**Libraries with asyncio usage at module load time need special handling.** Check if the library creates locks, tasks, or other asyncio primitives at import time. Combine lazy imports (for performance) with event loop creation (for compatibility).

---

## 3. Streamlit Static Assets

**Date:** 2024-12 (Phase 2)  
**Symptom:** Blank page, missing JS/CSS  
**Affected:** Streamlit UI rendering

### Problem

Streamlit bundles JavaScript and CSS files that PyInstaller doesn't detect as dependencies.

### Solution

```python
from PyInstaller.utils.hooks import collect_data_files

streamlit_datas = collect_data_files('streamlit')

a = Analysis(
    ...
    datas=[
        *streamlit_datas,
        ...
    ],
)
```

### Lesson

**Use `collect_data_files()` for packages with static assets** (JS, CSS, templates, etc.).

---

## 4. Package Metadata for importlib.metadata

**Date:** 2024-12 (Phase 2)  
**Symptom:** `PackageNotFoundError` at runtime  
**Affected:** Packages using `importlib.metadata.version()`

### Problem

Some packages query their own version at runtime using `importlib.metadata`. PyInstaller doesn't bundle the `.dist-info` directories by default.

### Solution

```python
from PyInstaller.utils.hooks import copy_metadata

streamlit_metadata = copy_metadata('streamlit')
pandas_metadata = copy_metadata('pandas')

a = Analysis(
    ...
    datas=[
        *streamlit_metadata,
        *pandas_metadata,
        ...
    ],
)
```

### Lesson

**Use `copy_metadata()` for packages that introspect their own version.** Common in packages with CLI tools or version display features.

---

## 5. General Best Practices

### When to Use Each Hook

| Hook | Use Case | Example |
|------|----------|---------|
| `collect_submodules()` | Complex packages with many internal modules | `websockets`, `streamlit` |
| `collect_data_files()` | Packages with static assets (JS, CSS, etc.) | `streamlit`, `altair` |
| `copy_metadata()` | Packages using `importlib.metadata` | `streamlit`, `pandas` |

### Testing Strategy

1. **Always test in frozen binary**, not just venv - behavior differs!
2. **Check error logs** at `$PRISM_DATA_DIR/logs/prism_errors.log`
3. **Use verbose mode** during development: `pyinstaller --debug all prism.spec`

### Common Pitfalls

1. **Manual hidden imports break on library updates** - Prefer `collect_submodules()`
2. **venv works but binary fails** - Usually missing hidden imports or data files
3. **Import errors with correct package** - Check for module restructuring between versions

---

## Reference: Current prism.spec Structure

```python
# Key sections in prism.spec

# 1. Collect static assets
streamlit_datas = collect_data_files('streamlit')
altair_datas = collect_data_files('altair')

# 2. Collect metadata
streamlit_metadata = copy_metadata('streamlit')

# 3. Hidden imports (prefer collect_submodules for complex packages)
hidden_imports = [...]
hidden_imports += collect_submodules('streamlit')
hidden_imports += collect_submodules('websockets')  # Added 2024-12-07

# 4. Analysis
a = Analysis(
    datas=[
        ('portfolio_src', 'portfolio_src'),
        *streamlit_datas,
        *streamlit_metadata,
        ...
    ],
    hiddenimports=hidden_imports,
)
```
