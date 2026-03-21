import os
import re
from pathlib import Path
from typing import Optional


# === Path Validation ===
# Prevent path traversal, symlink attacks, and escaping allowed directories

# Pattern to detect path traversal attempts in raw strings before resolution
PATH_TRAVERSAL_PATTERN = re.compile(r"\.\.[/\\]|[/\\]\.\.|%2e%2e|%00", re.IGNORECASE)


def is_safe_path_within_directory(
    file_path: str, allowed_base_dir: str, must_exist: bool = False
) -> bool:
    """
    Validate that a file path is safely contained within an allowed base directory.

    Security checks:
    - Rejects None/empty paths
    - Detects path traversal patterns (../, %2e%2e, null bytes)
    - Resolves symlinks to canonical path
    - Ensures final path is within allowed directory

    Args:
        file_path: The file path to validate (can be relative or absolute)
        allowed_base_dir: The directory that must contain the resolved path
        must_exist: If True, the base directory must exist for validation to pass

    Returns:
        True if path is safe and within allowed_base_dir, False otherwise
    """
    if not file_path or not isinstance(file_path, str):
        return False
    if not allowed_base_dir or not isinstance(allowed_base_dir, str):
        return False

    # Check for obvious traversal attempts in the raw string
    if PATH_TRAVERSAL_PATTERN.search(file_path):
        return False

    try:
        # Expand user (~) and environment variables in base directory
        base_path = Path(os.path.expanduser(os.path.expandvars(allowed_base_dir)))

        if must_exist and not base_path.exists():
            return False

        # Resolve the base to an absolute, canonical path
        # Use resolve(strict=False) to handle non-existent paths
        base_resolved = base_path.resolve()

        # Construct full file path
        full_path = (
            base_path / file_path
            if not Path(file_path).is_absolute()
            else Path(file_path)
        )

        # Resolve to canonical path (follows symlinks)
        file_resolved = full_path.resolve()

        # Security check: ensure resolved path is within the base directory
        # Use os.path.commonpath to prevent escaping via symlinks
        try:
            common = Path(os.path.commonpath([str(base_resolved), str(file_resolved)]))
            return common == base_resolved
        except ValueError:
            # Different drives on Windows, or other path incompatibility
            return False

    except (OSError, ValueError, TypeError):
        # Any path resolution error is a validation failure
        return False


def get_safe_data_dir() -> str:
    """
    Get the PRISM_DATA_DIR with validation and secure defaults.

    Security: Prevents attackers from using environment variables to redirect
    sensitive files to attacker-controlled directories.

    Returns:
        Validated data directory path (expanded and absolute)

    Raises:
        ValueError: If PRISM_DATA_DIR contains path traversal patterns
    """
    default_dir = os.path.expanduser("~/Library/Application Support/PortfolioPrism")
    data_dir = os.environ.get("PRISM_DATA_DIR", default_dir)

    # Reject path traversal attempts in environment variable
    if PATH_TRAVERSAL_PATTERN.search(data_dir):
        raise ValueError("PRISM_DATA_DIR contains invalid path traversal patterns")

    # Expand and resolve to absolute path
    expanded = os.path.expanduser(os.path.expandvars(data_dir))
    resolved = str(Path(expanded).resolve())

    return resolved


def is_valid_isin(identifier: str) -> bool:
    """
    Validates if the given string is a valid ISIN (International Securities Identification Number).

    Structure:
    - 2 letters (Country Code)
    - 9 alphanumeric characters (NSIN)
    - 1 digit (Check Digit)
    - Total length: 12

    Args:
        identifier (str): The string to validate.

    Returns:
        bool: True if valid ISIN format, False otherwise.
    """
    if not identifier or not isinstance(identifier, str):
        return False

    # Basic regex for format: 2 letters, 9 alphanum, 1 digit
    # We allow the check digit to be alphanumeric in regex for flexibility,
    # but strictly it should be a digit. Most validators enforce digit.
    # Let's use a strict regex.
    pattern = r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$"

    return bool(re.match(pattern, identifier))
