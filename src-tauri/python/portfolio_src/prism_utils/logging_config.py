import logging
import sys


def get_logger(name: str) -> logging.Logger:
    """
    Configures and returns a standard logger.
    """
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    # Create a handler - use stderr to avoid polluting stdout IPC channel
    handler = logging.StreamHandler(sys.stderr)

    # Create a formatter and add it to the handler
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)

    # Add the handler to the logger
    if not logger.handlers:
        logger.addHandler(handler)

    return logger
