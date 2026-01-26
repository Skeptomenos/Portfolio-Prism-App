"""IPC Protocol Utilities.

Low-level protocol output for the stdin/stdout IPC channel.
This module has NO dependencies on handlers or dispatcher to avoid circular imports.
"""

import json
import sys
from typing import Any


def write_protocol(data: dict[str, Any]) -> None:
    """Write JSON protocol message to stdout (IPC channel).

    This is the designated method for all IPC protocol output.
    Logging should use get_logger() which writes to stderr.
    """
    print(json.dumps(data))
    sys.stdout.flush()
