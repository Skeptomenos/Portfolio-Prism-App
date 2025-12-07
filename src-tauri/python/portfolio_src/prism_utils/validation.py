import re


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
