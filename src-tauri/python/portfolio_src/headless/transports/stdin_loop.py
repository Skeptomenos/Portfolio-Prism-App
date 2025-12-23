"""Stdin/Stdout IPC Transport.

Production transport for communication with the Tauri shell.
Uses JSON-RPC over stdin/stdout for maximum compatibility and performance.
"""

import asyncio
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from portfolio_src.headless.dispatcher import dispatch
from portfolio_src.headless.lifecycle import get_session_id
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

# Engine version - should match the version in lifecycle
VERSION = "0.1.0"


async def run_stdin_loop() -> None:
    """Run the stdin/stdout command loop.

    This is the main entry point for production IPC with the Tauri shell.
    Reads JSON commands from stdin, dispatches them, and writes responses to stdout.

    Protocol:
        1. On startup, emits a ready signal: {"status": "ready", "version": "...", "pid": ...}
        2. Reads one JSON command per line from stdin
        3. Dispatches command to handler
        4. Writes JSON response to stdout
        5. Repeats until stdin closes or KeyboardInterrupt

    Note:
        Uses a ThreadPoolExecutor for blocking stdin.readline() to avoid
        blocking the asyncio event loop.
    """
    from portfolio_src.prism_utils.sentinel import audit_previous_session

    # Start background audit of previous session logs
    asyncio.create_task(audit_previous_session())

    # Emit ready signal
    ready_signal = {
        "status": "ready",
        "version": VERSION,
        "pid": os.getpid(),
    }
    print(json.dumps(ready_signal))
    sys.stdout.flush()

    logger.info(f"Stdin loop started, session: {get_session_id()}")

    loop = asyncio.get_event_loop()
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="stdin")

    while True:
        try:
            # Read line in executor to avoid blocking event loop
            line = await loop.run_in_executor(executor, sys.stdin.readline)

            if not line:
                # EOF - parent process closed stdin
                logger.info("Stdin closed, shutting down")
                break

            line = line.strip()
            if not line:
                continue

            # Parse JSON command
            try:
                cmd = json.loads(line)
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON received: {e}")
                print(
                    json.dumps(
                        {
                            "id": 0,
                            "status": "error",
                            "error": {
                                "code": "INVALID_JSON",
                                "message": f"Failed to parse JSON: {e}",
                            },
                        }
                    )
                )
                sys.stdout.flush()
                continue

            # Dispatch and respond
            response = await dispatch(cmd)
            print(json.dumps(response))
            sys.stdout.flush()

        except KeyboardInterrupt:
            logger.info("Keyboard interrupt, shutting down")
            break
        except Exception as e:
            logger.error(f"Stdin loop error: {e}", exc_info=True)
            print(
                json.dumps(
                    {
                        "id": 0,
                        "status": "error",
                        "error": {"code": "INTERNAL_ERROR", "message": str(e)},
                    }
                )
            )
            sys.stdout.flush()

    executor.shutdown(wait=False)
    logger.info("Stdin loop terminated")
