# OpenJupy MCP Guide for LLMs

Quick reference for using the Jupyter MCP server to debug and explore Python code interactively.

## Setup

```bash
# Start Jupyter server (if not running)
cd src-tauri/python
jupyter notebook --no-browser --port=8888
```

## Core Workflow

### 1. Connect to a Notebook

```
jupyter_use_notebook(
    notebook_name="debug_session",
    notebook_path="debug.ipynb",
    mode="create"  # or "connect" for existing
)
```

### 2. Execute Code Directly (Preferred for Exploration)

Use `jupyter_execute_code` for quick tests — code runs in kernel but isn't saved to notebook:

```
jupyter_execute_code(code="import pandas as pd; print(pd.__version__)")
```

**Best for:**
- Checking variable values
- Quick calculations
- Running shell commands (`!git status`)
- Magic commands (`%timeit`, `%pip install`)

### 3. Insert and Execute Cells (For Persistent Work)

```
jupyter_insert_execute_code_cell(
    cell_index=-1,  # -1 = append at end
    cell_source="df.head()",
    timeout=90
)
```

### 4. Read Notebook State

```
jupyter_read_notebook(
    notebook_name="debug_session",
    response_format="brief",  # or "detailed"
    limit=20
)
```

## Common Patterns

### Debug a Python Module

```python
# 1. Add project to path
import sys
sys.path.insert(0, "/path/to/src-tauri/python")

# 2. Import and inspect
from portfolio_src.core.pipeline import Pipeline
p = Pipeline()

# 3. Step through execution
direct, etf = p._load_portfolio()
print(f"Loaded {len(direct)} direct, {len(etf)} ETF positions")
```

### Inspect DataFrames

```python
# Shape and columns
print(df.shape, df.columns.tolist())

# Sample data
df.head(10)

# Value counts
df['status'].value_counts()

# Filter and examine
df[df['status'] == 'unresolved'][['ticker', 'name', 'weight']].head(20)
```

### Test Fixes Before Committing

```python
# Simulate a fix
def patched_function(x):
    # new logic here
    return x * 2

# Test it
result = patched_function(test_data)
assert result == expected, f"Got {result}"
```

## Tool Reference

| Tool                          | Purpose                                    |
| ----------------------------- | ------------------------------------------ |
| `jupyter_use_notebook`        | Connect/create notebook                    |
| `jupyter_execute_code`        | Run code without saving to notebook        |
| `jupyter_insert_execute_code_cell` | Insert cell and run it                |
| `jupyter_read_notebook`       | View notebook structure                    |
| `jupyter_read_cell`           | Read specific cell with outputs            |
| `jupyter_overwrite_cell_source` | Edit existing cell                       |
| `jupyter_delete_cell`         | Remove cells                               |
| `jupyter_list_notebooks`      | Show connected notebooks                   |
| `jupyter_restart_notebook`    | Restart kernel (clear state)               |
| `jupyter_unuse_notebook`      | Disconnect from notebook                   |

## Tips

1. **Use `execute_code` for exploration** — faster, no notebook clutter
2. **Use cells for reproducible steps** — when building a debug narrative
3. **Restart kernel if imports get stale** — after editing source files
4. **Set reasonable timeouts** — default 90s, increase for slow operations
5. **Check outputs** — `jupyter_read_cell(cell_index=N, include_outputs=True)`

## Example: Pipeline Investigation

```python
# Cell 1: Setup
import sys
sys.path.insert(0, "/Users/davidhelmus/Repos/portfolio-master/MVP/src-tauri/python")
from portfolio_src.core.pipeline import Pipeline
from portfolio_src.data.database import get_positions

# Cell 2: Load data
positions = get_positions(portfolio_id=1)
print(f"Total positions: {len(positions)}")

# Cell 3: Initialize pipeline
p = Pipeline(debug=True)
p._init_services()

# Cell 4: Run phase by phase
direct, etf = p._load_portfolio()
print(f"Direct: {len(direct)}, ETF: {len(etf)}")

# Cell 5: Decompose
holdings_map, errors = p._decomposer.decompose(etf)
print(f"Decomposed {len(holdings_map)} ETFs, {len(errors)} errors")

# Cell 6: Analyze results
for isin, holdings in holdings_map.items():
    resolved = holdings[holdings['isin'].notna()].shape[0]
    total = len(holdings)
    print(f"{isin}: {resolved}/{total} resolved")
```
