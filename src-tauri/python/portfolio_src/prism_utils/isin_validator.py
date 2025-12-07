"""
Centralized ISIN validation with Luhn checksum.

ISIN format: 2 letter country code + 9 alphanumeric NSIN + 1 check digit

Example valid ISINs:
- US0378331005 (Apple Inc)
- DE0007164600 (SAP SE)
- GB0002374006 (Diageo plc)
"""

from typing import Optional


def is_valid_isin(isin: Optional[str]) -> bool:
    """
    Validate ISIN format and Luhn checksum.

    Args:
        isin: The ISIN string to validate

    Returns:
        True if valid ISIN, False otherwise
    """
    if not isin or not isinstance(isin, str):
        return False

    isin = isin.strip().upper()

    # Basic format check
    if len(isin) != 12:
        return False

    # Country code (first 2 chars must be letters)
    if not isin[:2].isalpha():
        return False

    # NSIN (next 9 chars must be alphanumeric)
    if not isin[2:11].isalnum():
        return False

    # Check digit (last char must be digit)
    if not isin[11].isdigit():
        return False

    # Luhn checksum validation
    return _validate_luhn_checksum(isin)


def _validate_luhn_checksum(isin: str) -> bool:
    """
    Validate ISIN using Luhn algorithm.

    The algorithm:
    1. Convert letters to numbers (A=10, B=11, ..., Z=35)
    2. Apply Luhn algorithm to resulting digit string
    3. Valid if total mod 10 == 0
    """
    try:
        # Convert letters to numbers
        digits = ""
        for char in isin:
            if char.isdigit():
                digits += char
            else:
                # A=10, B=11, ..., Z=35
                digits += str(ord(char) - ord("A") + 10)

        # Luhn algorithm (from right to left)
        total = 0
        for i, digit in enumerate(reversed(digits)):
            n = int(digit)
            # Double every second digit from right
            if i % 2 == 1:
                n *= 2
                if n > 9:
                    n -= 9
            total += n

        return total % 10 == 0

    except (ValueError, TypeError):
        return False


def extract_country_code(isin: str) -> Optional[str]:
    """
    Extract the 2-letter country code from an ISIN.

    Args:
        isin: A valid ISIN string

    Returns:
        2-letter country code or None if invalid
    """
    if not is_valid_isin(isin):
        return None
    return isin[:2].upper()


def generate_group_key(ticker: str, name: str) -> str:
    """
    Generate a deterministic group key for unresolved holdings.

    Uses a 10-digit hash for collision resistance (1 in 10 million).

    Args:
        ticker: The ticker symbol
        name: The security name

    Returns:
        Group key in format "UNRESOLVED:{ticker}:{hash10}"
    """
    ticker_clean = (ticker or "").upper().strip()
    name_clean = (name or "").upper().strip()[:50]  # Truncate for consistency

    # Create deterministic hash
    combined = f"{ticker_clean}|{name_clean}"
    hash_value = abs(hash(combined)) % 10_000_000_000  # 10 digits

    return f"UNRESOLVED:{ticker_clean}:{hash_value:010d}"


# Common ISIN patterns for quick rejection
INVALID_PATTERNS = frozenset(
    [
        "N/A",
        "NA",
        "NULL",
        "NONE",
        "",
    ]
)


def is_placeholder_isin(isin: Optional[str]) -> bool:
    """
    Check if ISIN is a known placeholder value.

    Args:
        isin: The ISIN string to check

    Returns:
        True if it's a placeholder, False otherwise
    """
    if not isin:
        return True

    isin_upper = str(isin).upper().strip()

    if isin_upper in INVALID_PATTERNS:
        return True

    # Check for internal patterns
    if isin_upper.startswith("FALLBACK"):
        return True
    if isin_upper.startswith("UNRESOLVED"):
        return True
    if isin_upper.startswith("UNKNOWN"):
        return True
    if isin_upper.startswith("NON_EQUITY"):
        return True
    if "|" in isin_upper:
        return True

    return False
