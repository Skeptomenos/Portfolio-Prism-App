# Walkthrough: Debugging Complex Data Pipelines with OpenJupy

This guide explains how to use the **OpenJupy MCP** to test, debug, and verify extensive Python data pipelines step-by-step inside OpenCode.

## The Problem: The "Black Box" Pipeline
Traditional pipeline debugging involves running a script, waiting for it to crash, adding `print()` statements, and restarting from zero. This is slow and expensive for large datasets.

## The Solution: The "Interactive Laboratory"
OpenJupy allows you to maintain a **persistent Python kernel**. You can run your pipeline function-by-function, inspect state at every step, and fix errors without losing the data you've already processed.

---

## Phase 1: Setup & Connection

### 1. Start the Engine
Before opening OpenCode, start your local Jupyter server in your project root:
```bash
export JUPYTER_TOKEN="your-token"
jupyter lab --port 8888 --IdentityProvider.token "$JUPYTER_TOKEN"
```

### 2. Enter the "Data Scientist" Agent
In OpenCode, switch to your **Data Scientist** agent. This agent is optimized to use Jupyter tools and respond to the middleware's "Smart Tips."

---

## Phase 2: Connecting to Your Existing Code

To test your pipeline, the Jupyter kernel needs to "see" your source code. 

**Pro Tip: The Module Path Setup**
If your pipeline is in `/Users/you/projects/my_pipeline/src`, tell the agent:
> "Open a new notebook `debug_session.ipynb`. Add my `src` folder to the Python path so we can import my modules."

The agent will execute:
```python
import sys
import os
sys.path.append(os.path.abspath("./src"))
```

---

## Phase 3: Step-by-Step Execution Workflow

### Step 1: Incremental Loading
Ask the agent to run only the first stage of your pipeline:
> "Import my `loader` module and run `load_raw_data()`. Show me the shape of the result."

### Step 2: The "Smart Tip" Inspection
After loading, OpenJupy's middleware will notice you have a new variable. It will inject a `claude_tip` into the conversation:
*   *Middleware says:* "DataFrame `raw_df` detected. Tip: Use `raw_df.info()` to check for null values."
*   *Agent follows up:* "I see we have the data. Let me check the schema for any missing values before we proceed to transformation."

### Step 3: Interactive Debugging (The "Heal" Cycle)
If a transformation fails:
1.  **Intercept**: The middleware catches the crash and parses the traceback.
2.  **Suggest**: It provides a `claude_next` suggestion (e.g., "The error is a `KeyError: 'timestamp'`. Verify if the column name changed in the source.")
3.  **Fix**: You or the agent fix the code in a **new cell**.
4.  **Resume**: You run the next step immediately. **You don't need to reload the data because the kernel kept it in memory.**

---

## Phase 4: Real-Time Verification (RTC)

While working in OpenCode, keep your browser open to `localhost:8888`.

1.  **Visual Confirmation**: If you ask for a plot, it appears in OpenCode AND in your browser simultaneously.
2.  **Manual Intervention**: If the AI is struggling with a complex data structure, you can manually type `my_variable` in the browser to inspect it yourself, then tell the AI: "I checked the variable in the browser, it looks like X. Try logic Y."

---

## Summary of Benefits
| Feature | Benefit for your Pipeline |
|---------|---------------------------|
| **Persistent State** | No more re-running 10-minute data loads to test a 1-second logic fix. |
| **Smart Error Parsing** | AI understands *why* your pipeline crashed immediately. |
| **Package Mapping** | AI uses `uv` to install missing pipeline dependencies on the fly. |
| **Rich Output** | View data distributions and pipeline health via plots in real-time. |
