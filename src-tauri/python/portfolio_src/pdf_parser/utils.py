import re
from typing import Dict, Optional


def parse_description(description: str) -> Dict[str, Optional[str]]:
    """
    Parses a Trade Republic transaction description to extract trade details.
    """
    result = {
        "trade_type": "BUY",  # Default to BUY
        "isin": None,
        "name": None,
        "quantity": None,
        "price": None,
    }

    # Determine trade type
    if "sell" in description.lower():
        result["trade_type"] = "SELL"

    # Extract ISIN
    isin_pattern = r"[A-Z]{2}[A-Z0-9]{10}"
    isin_match = re.search(isin_pattern, description)
    if isin_match:
        result["isin"] = isin_match.group(0)
        # Extract name: text after ISIN until comma or quantity
        after_isin = description[isin_match.end() :].strip()
        name_match = re.match(r"(.+?)(?:, quantity|$)", after_isin)
        if name_match:
            result["name"] = name_match.group(1).strip()
        else:
            # If no comma, take until quantity or end
            qty_match = re.search(r", quantity", after_isin)
            if qty_match:
                result["name"] = after_isin[: qty_match.start()].strip()
            else:
                result["name"] = after_isin.strip()

        # Cleanup polluted name (e.g., "10,00 € 4.282,79 RHEINMETALL...")
        # Remove leading currency/numbers
        if result["name"]:
            result["name"] = re.sub(r"^[\d.,\s€]+", "", result["name"]).strip()
    else:
        # No ISIN, extract name from start until quantity
        # Issue: Sometimes description starts with "Buy trade DE000..." or price data "€10.00 4,282.79 NAME..."
        # We need to clean the prefix.

        raw_name = description
        qty_match = re.search(r", quantity", description)
        if qty_match:
            raw_name = description[: qty_match.start()].strip()

        # Remove leading "Buy trade" or "Sell trade" if present (common in manual buys)
        raw_name = re.sub(r"^(Buy|Sell) trade\s*", "", raw_name, flags=re.IGNORECASE)

        # Remove leading currency/numbers (e.g., "€10.00 4,282.79 ")
        # This regex removes any sequence of digits, dots, commas, and euro signs at the start
        raw_name = re.sub(r"^[\d.,\s€]+", "", raw_name).strip()

        result["name"] = raw_name

    # Extract quantity
    # Strategy: Find 'quantity:' and analyze the numbers following it.
    # Exclude numbers associated with '€'.
    qty_start = description.find("quantity:")
    if qty_start != -1:
        # Get text after "quantity:"
        after_qty = description[qty_start + 9 :].strip()

        # Split by space to analyze tokens
        tokens = after_qty.split()

        candidates = []
        for i, token in enumerate(tokens):
            # Clean token of € if attached
            clean_token = token.replace("€", "")

            # Check if it's a number (simple regex)
            if re.match(r"^[\d.,]+$", clean_token):
                # Check proximity to € symbol
                has_euro = "€" in token
                if i > 0 and "€" in tokens[i - 1]:
                    has_euro = True
                if i < len(tokens) - 1 and "€" in tokens[i + 1]:
                    has_euro = True

                if not has_euro:
                    candidates.append(clean_token)

        if candidates:
            # Heuristic: Pick the first candidate that isn't a price
            # Usually quantity is isolated.
            raw = candidates[0]
            qty_str = raw

            # Smart Number Parsing (Locale detection)
            if "," in raw and "." in raw:
                if raw.find(",") < raw.find("."):
                    qty_str = raw.replace(",", "")  # English
                else:
                    qty_str = raw.replace(".", "").replace(",", ".")  # German
            elif "," in raw:
                qty_str = raw.replace(",", ".")  # German Decimal
            elif "." in raw:
                # 123.45 (English) OR 1.234 (German Thousand)
                parts = raw.split(".")
                decimals = len(parts[-1])

                # If starts with "0." or decimals != 3, assume English Decimal
                if raw.startswith("0.") or decimals != 3:
                    qty_str = raw
                else:
                    # Assume German Thousand (remove dot)
                    qty_str = raw.replace(".", "")

            try:
                result["quantity"] = float(qty_str)
            except ValueError:
                result["quantity"] = None

    # Extract price
    price_match = re.search(r"price:\s*([\d.,]+)", description)
    if price_match:
        # German format: 1.234,56 -> remove dots, replace comma with dot
        price_str = price_match.group(1).replace(".", "").replace(",", ".")
        result["price"] = float(price_str)

    return result
