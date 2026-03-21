"""IPC Transport Layer.

This package provides two transport mechanisms for the headless engine:
- stdin_loop: Production transport using stdin/stdout JSON-RPC
- echo_bridge: Development transport using HTTP/FastAPI

Both transports use the same dispatcher and handler infrastructure.
"""

from portfolio_src.headless.transports.stdin_loop import run_stdin_loop
from portfolio_src.headless.transports.echo_bridge import run_echo_bridge, HAS_HTTP

__all__ = [
    "run_stdin_loop",
    "run_echo_bridge",
    "HAS_HTTP",
]
