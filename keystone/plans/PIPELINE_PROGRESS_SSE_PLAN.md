# Implementation Plan: Pipeline Progress via SSE

> **Workstream:** `pipeline-progress-ux`
> **Created:** 2025-12-23
> **Status:** Ready for Implementation

---

## Overview

Implement real-time progress streaming so users see the "magic" happening when running Deep Analysis. Transform the pipeline from a black box ("Running...") into a transparent process ("Fetching ETF holdings 3/11...").

## Architecture Decision

**Transport:** Server-Sent Events (SSE) for Browser mode

**Why SSE over WebSocket?**
- One-way communication (server → client) is all we need
- Simpler implementation, standard HTTP
- Auto-reconnect built into browser
- Easy upgrade path to WebSocket if bidirectional needed later

```
┌─────────────────┐         SSE Stream          ┌─────────────┐
│  Echo-Bridge    │ ──── /events endpoint ────► │   Browser   │
│  (Python/HTTP)  │                             │   (React)   │
└─────────────────┘                             └─────────────┘
```

---

## Phase 1: Backend - SSE Endpoint

### SSE-001: Create SSE endpoint in Echo-Bridge

**File:** `portfolio_src/headless/transports/echo_bridge.py`

```python
from asyncio import Queue
from fastapi.responses import StreamingResponse
from typing import Set
import json

_progress_clients: Set[Queue] = set()

@app.get("/events")
async def sse_events():
    """SSE endpoint for real-time progress updates."""
    queue: Queue = Queue()
    _progress_clients.add(queue)
    
    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"
            while True:
                data = await queue.get()
                yield f"data: {json.dumps(data)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            _progress_clients.discard(queue)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
```

### SSE-002: Implement broadcast mechanism

**File:** `portfolio_src/headless/transports/echo_bridge.py`

```python
def broadcast_progress(progress: int, message: str, phase: str = "unknown", details: dict = None):
    """Broadcast progress to all connected SSE clients."""
    event_data = {
        "progress": progress,
        "message": message,
        "phase": phase,
        "details": details or {}
    }
    for queue in _progress_clients:
        try:
            queue.put_nowait(event_data)
        except:
            pass
```

### SSE-003: Update emit_progress to broadcast

**File:** `portfolio_src/headless/handlers/sync.py`

```python
def emit_progress(progress: int, message: str, phase: str = "pipeline") -> None:
    """Emit progress via stdout (Tauri) AND SSE (Browser)."""
    print(json.dumps({
        "event": "sync_progress",
        "data": {"progress": progress, "message": message, "phase": phase}
    }))
    sys.stdout.flush()
    
    from portfolio_src.headless.transports.echo_bridge import broadcast_progress
    broadcast_progress(progress, message, phase)
```

### SSE-004: Add connection lifecycle handling

Handle edge cases: client disconnect, server restart, multiple clients.

---

## Phase 2: Backend - Granular Progress Messages

### SSE-005 to SSE-008: Enhanced Pipeline Messages

Update `pipeline.py` to emit detailed progress:

| Phase | Progress | Message |
|-------|----------|---------|
| init | 5% | "Initializing services..." |
| loading | 10% | "Found 30 holdings (19 stocks, 11 ETFs)" |
| decomposition | 15% | "Investigating 11 ETFs..." |
| decomposition | 20-45% | "Fetching [ETF_NAME] holdings (N/11)..." |
| enrichment | 50-70% | "Enriching with sector/geo data..." |
| aggregation | 70-85% | "Calculating true exposure..." |
| reporting | 85-95% | "Writing reports..." |
| complete | 100% | "Analysis complete!" |

---

## Phase 3: Frontend - Progress Hook

### SSE-009 to SSE-011: usePipelineProgress Hook

**File:** `src/hooks/usePipelineProgress.ts`

```typescript
import { useState, useEffect } from 'react';
import { isTauri } from '../lib/tauri';

interface PipelineProgress {
  progress: number;
  message: string;
  phase: string;
  isConnected: boolean;
}

export function usePipelineProgress(): PipelineProgress {
  const [state, setState] = useState<PipelineProgress>({
    progress: 0,
    message: '',
    phase: 'idle',
    isConnected: false
  });

  useEffect(() => {
    if (isTauri()) return; // TODO: Tauri events

    const eventSource = new EventSource('http://127.0.0.1:5001/events');
    
    eventSource.onopen = () => {
      setState(prev => ({ ...prev, isConnected: true }));
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') return;
        
        setState({
          progress: data.progress,
          message: data.message,
          phase: data.phase || 'unknown',
          isConnected: true
        });
      } catch (e) {
        console.error('[SSE] Parse error:', e);
      }
    };

    eventSource.onerror = () => {
      setState(prev => ({ ...prev, isConnected: false }));
    };

    return () => eventSource.close();
  }, []);

  return state;
}
```

---

## Phase 4: Frontend - Progress UI Component

### SSE-012 to SSE-015: PipelineProgressCard

**File:** `src/components/common/PipelineProgressCard.tsx`

```tsx
interface Props {
  progress: number;
  message: string;
  phase: string;
  isVisible: boolean;
}

export function PipelineProgressCard({ progress, message, phase, isVisible }: Props) {
  if (!isVisible) return null;

  const phases = ['init', 'loading', 'decomposition', 'enrichment', 'aggregation', 'reporting'];
  const currentIndex = phases.indexOf(phase);

  return (
    <div className="glass-card p-6 mb-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Deep Analysis</h3>
        <span className="text-sm text-secondary">{progress}%</span>
      </div>
      
      <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-4">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <p className="text-sm text-secondary">{message}</p>
      
      <div className="flex justify-between mt-4">
        {phases.map((p, i) => (
          <div 
            key={p}
            className={`w-3 h-3 rounded-full ${
              i < currentIndex ? 'bg-green-500' :
              i === currentIndex ? 'bg-blue-500 animate-pulse' :
              'bg-white/20'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
```

### XRayView Integration

```tsx
import { usePipelineProgress } from '../../hooks/usePipelineProgress';
import { PipelineProgressCard } from '../common/PipelineProgressCard';

export default function XRayView() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { progress, message, phase } = usePipelineProgress();
  
  const showProgress = isAnalyzing || (progress > 0 && progress < 100);

  return (
    <div>
      <PipelineProgressCard
        progress={progress}
        message={message}
        phase={phase}
        isVisible={showProgress}
      />
      {/* ... */}
    </div>
  );
}
```

---

## Phase 5: Testing & Polish

### SSE-016 to SSE-019: Edge Cases

- Test SSE connection lifecycle (connect, disconnect, reconnect)
- Test with slow network simulation
- Handle empty portfolio, no ETFs, pipeline errors
- Add loading skeleton during initial connection

---

## Success Criteria

- [ ] Users see granular progress messages during pipeline execution
- [ ] Progress updates appear in real-time (not after completion)
- [ ] Works in Browser mode (Echo-Bridge)
- [ ] Pipeline phases are clearly communicated

---

## Related Documents

- `keystone/specs/ipc_api.md` - SSE protocol specification
- `keystone/strategy/analytics-engine.md` - Progress visibility requirements
