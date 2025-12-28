import argparse
import pandas as pd
from pathlib import Path
import pdfplumber
import os
import hashlib
import multiprocessing
from pdf_parser.utils import parse_description
from deep_translator import GoogleTranslator
from tqdm import tqdm

from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)
# NOTE: database.py was deleted in Phase 11 (legacy SQLite workflow removed)
# The parse_pdfs_from_folder() function doesn't need database imports.
# Stubs below are provided for main() which is deprecated but kept for reference.


def is_file_processed(file_hash: str) -> bool:
    """Stub for removed database function. Always returns False."""
    # In CSV workflow, we don't track processed files in DB
    return False


def mark_file_processed(file_hash: str, filename: str) -> None:
    """Stub for removed database function. No-op."""
    pass


def insert_trades_ignore_duplicates(df) -> int:
    """Stub for removed database function. Returns 0."""
    # In CSV workflow, we just write to CSV directly
    return 0


# Translation mappings
HEADER_MAPPING = {
    "DATUM": "DATE",
    "TYP": "TYPE",
    "BESCHREIBUNG": "DESCRIPTION",
    "SALDO": "BALANCE",
}

TYPE_MAPPING = {
    "Handel": "TRADE",
    "Zinszahlung": "INTEREST_PAYMENT",
    "Erträge": "DIVIDENDS",
    "Prämie": "PREMIUM",
    "Kartentransaktion": "CARD_TRANSACTION",
    "Überweisung": "TRANSFER",
}


def calculate_file_hash(file_path: Path) -> str:
    """Calculate SHA256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def translate_to_english(text: str) -> str:
    """Translate text to English using deep_translator."""
    try:
        return GoogleTranslator(source="auto", target="en").translate(text)
    except Exception:
        return text  # Fallback to original text


def process_words_to_rows(page, headers):
    """
    Processes words extracted from a cropped page into structured rows.
    """
    words = page.extract_words()

    # Define column boundaries based on header x-coordinates
    header_boundaries = {}
    for i, header in enumerate(headers):
        x0 = header["x0"]
        x1 = headers[i + 1]["x0"] if i + 1 < len(headers) else page.width
        header_boundaries[header["text"]] = (x0, x1)

    # Group words into lines based on vertical proximity, preserving reading order
    lines = []
    current_line = []
    prev_top = None
    threshold = 10  # pixels threshold for line separation
    for word in words:
        if prev_top is not None and abs(word["top"] - prev_top) > threshold:
            if current_line:
                lines.append(current_line)
            current_line = []
        current_line.append(word)
        prev_top = word["top"]
    if current_line:
        lines.append(current_line)

    # Assemble rows from lines
    raw_rows = []
    current_row = None
    for line_words in lines:
        # Check if this line starts a new transaction (has a TYPE entry)
        # We assume "TYPE" exists in boundaries because we filter headers before calling this
        if "TYPE" in header_boundaries:
            has_typ = any(
                word["text"].strip()
                for word in line_words
                if header_boundaries["TYPE"][0]
                <= word["x0"]
                < header_boundaries["TYPE"][1]
            )
            if has_typ and current_row is not None:
                raw_rows.append(current_row)
                current_row = None

        if current_row is None:
            current_row = {h["text"]: [] for h in headers}

        # Append words to the current row's columns
        for word in line_words:
            for header_text, (x0, x1) in header_boundaries.items():
                if x0 <= word["x0"] < x1:
                    current_row[header_text].append(word["text"])
                    break

    if current_row is not None:
        raw_rows.append(current_row)

    # Join words in each column for all collected rows
    for i in range(len(raw_rows)):
        for header_text in raw_rows[i]:
            raw_rows[i][header_text] = " ".join(raw_rows[i][header_text])

    return pd.DataFrame(raw_rows)


def parse_transaction_amount(row):
    """Helper to parse amount strings."""
    besch = row.get("DESCRIPTION", "")
    typ = row.get("TYPE", "")
    amount = 0.0

    # Extract amount from description (e.g., "1,84 €" or "2.000,00 €")
    import re

    amount_match = re.search(r"([\d.,]+)\s*€", str(besch))
    if amount_match:
        amount_str = amount_match.group(1)
        # Handle German format: remove dots, replace comma with dot
        amount_str = amount_str.replace(".", "").replace(",", ".")
        if not amount_str:
            amount = 0.0
        else:
            try:
                amount = float(amount_str)
            except ValueError:
                amount = 0.0
        # Determine direction
        if typ in ["INTEREST_PAYMENT", "DIVIDENDS", "PREMIUM"] or "Incoming" in str(
            besch
        ):
            pass  # positive
        elif typ in ["CARD_TRANSACTION", "TRANSFER"] or "Outgoing" in str(besch):
            amount = -amount
        elif typ == "TRADE":
            amount = 0  # Trades are not cash transactions
    row["AMOUNT"] = amount
    return row


def process_single_page(args):
    """
    Worker function to process a single page.
    Args: (pdf_path, page_idx)
    Returns: (trades_df, transactions_df) or (None, None)
    """
    pdf_path, page_idx = args
    try:
        with pdfplumber.open(pdf_path) as pdf:
            page = pdf.pages[page_idx]

            # Header detection
            header_text = page.search("UMSATZÜBERSICHT")
            footer_text = page.search("Seite")

            if page_idx == 0:
                if not header_text:
                    return None, None
                y0 = header_text[0]["bottom"]
            else:
                y0 = 0

            y1 = footer_text[0]["top"] if footer_text else page.height
            cropped_page = page.crop((0, y0, page.width, y1))

            # Find headers
            header_words = sorted(
                [
                    word
                    for word in cropped_page.extract_words()
                    if word["text"] in ["DATUM", "TYP", "BESCHREIBUNG", "SALDO"]
                ],
                key=lambda w: w["x0"],
            )

            # Translate headers
            header_words = [
                {**w, "text": HEADER_MAPPING.get(w["text"], w["text"])}
                for w in header_words
            ]

            # Validate headers
            found_header_texts = [h["text"] for h in header_words]
            if "TYPE" not in found_header_texts:
                return None, None
            if not header_words:
                return None, None

            page_df = process_words_to_rows(cropped_page, header_words)

            if page_df.empty:
                return None, None

            # Translate content
            if "TYPE" in page_df.columns:
                page_df["TYPE"] = page_df["TYPE"].map(lambda x: TYPE_MAPPING.get(x, x))
            # if "DESCRIPTION" in page_df.columns:
            #     page_df["DESCRIPTION"] = page_df["DESCRIPTION"].apply(
            #         translate_to_english
            #     )

            # Process Transactions
            transactions_df = page_df.copy()
            transactions_df = transactions_df.apply(parse_transaction_amount, axis=1)

            valid_types = [
                "INTEREST_PAYMENT",
                "TRADE",
                "DIVIDENDS",
                "PREMIUM",
                "CARD_TRANSACTION",
                "TRANSFER",
            ]

            # Filter transactions
            if "TYPE" in transactions_df.columns:
                transactions_df = transactions_df[
                    transactions_df["TYPE"].notna()
                    & transactions_df["TYPE"].isin(valid_types)
                ]
                cols = ["DATE", "TYPE", "DESCRIPTION", "AMOUNT", "BALANCE"]
                # Only keep cols that exist
                existing_cols = [c for c in cols if c in transactions_df.columns]
                transactions_df = transactions_df[existing_cols]
            else:
                transactions_df = pd.DataFrame()

            # Process Trades
            trades_df = pd.DataFrame()
            if "TYPE" in page_df.columns and "TRADE" in page_df["TYPE"].values:
                raw_trades = page_df[page_df["TYPE"] == "TRADE"].copy()
                if not raw_trades.empty:
                    parsed_data = raw_trades["DESCRIPTION"].apply(parse_description)
                    trades_df = pd.DataFrame(
                        parsed_data.tolist(), index=raw_trades.index
                    )
                    trades_df["DATE"] = raw_trades["DATE"]
                    trades_df["TYPE"] = "TRADE"  # Ensure type exists
                    trades_df["DESCRIPTION"] = raw_trades["DESCRIPTION"]
                    trades_df["AMOUNT"] = 0.0  # Placeholder
                    trades_df["BALANCE"] = 0.0  # Placeholder

                    # Rename for standard schema
                    trades_df.rename(
                        columns={
                            "isin": "ISIN",
                            "name": "NAME",
                            "quantity": "QUANTITY",
                            "price": "PRICE",
                            "trade_type": "TRADE_TYPE",
                        },
                        inplace=True,
                    )

            return trades_df, transactions_df

    except Exception:
        # print(f"Error parsing page {page_idx}: {e}")
        return None, None


def parse_pdfs_from_folder(folder_path: Path) -> pd.DataFrame:
    """
    Parse all PDFs in folder and return trades DataFrame.

    This is a simplified version of main() that returns the parsed trades
    instead of writing to database. Useful for CSV workflows.

    Args:
        folder_path: Path to folder containing PDF files

    Returns:
        DataFrame with columns: ISIN, NAME, QUANTITY, PRICE, TRADE_TYPE, DATE
    """
    pdf_files = list(folder_path.glob("*.pdf"))

    if not pdf_files:
        logger.warning(f"No PDF files found in {folder_path}")
        return pd.DataFrame()

    logger.info(f"Found {len(pdf_files)} PDF file(s)")

    all_trades_dfs = []

    for pdf_file in pdf_files:
        logger.info(f"Processing: {pdf_file.name}")

        # Get page count
        with pdfplumber.open(pdf_file) as pdf:
            num_pages = len(pdf.pages)

        # Process pages in parallel
        num_workers = min(multiprocessing.cpu_count(), num_pages)
        page_args = [(pdf_file, idx) for idx in range(num_pages)]

        with multiprocessing.Pool(num_workers) as pool:
            results = pool.map(process_single_page, page_args)

            for trades, _ in results:
                if trades is not None and not trades.empty:
                    all_trades_dfs.append(trades)

    if all_trades_dfs:
        full_trades = pd.concat(all_trades_dfs, ignore_index=True)
        logger.info(f"Parsed {len(full_trades)} trades from {len(pdf_files)} PDF(s)")
        return full_trades
    else:
        logger.warning("No trades found in PDFs")
        return pd.DataFrame()


def main():
    parser = argparse.ArgumentParser(description="Parse Trade Republic PDF exports.")
    parser.add_argument(
        "--input_folder",
        type=str,
        default="tr_pdf_exports",
        help="Folder containing PDF exports.",
    )
    parser.add_argument(
        "--output_folder",
        type=str,
        default="outputs",
        help="Folder to save the output CSV files.",
    )
    args = parser.parse_args()

    input_path = Path(args.input_folder)
    output_path = Path(args.output_folder)
    output_path.mkdir(exist_ok=True)

    pdf_files = list(input_path.glob("*.pdf"))
    total_files = len(pdf_files)

    # Use 80% of CPU cores or at least 1
    num_workers = max(1, int(os.cpu_count() * 0.8))

    for i, pdf_file in enumerate(pdf_files, 1):
        logger.info(f"Processing [{i}/{total_files}]: {pdf_file.name}")

        # 1. Check Hash
        file_hash = calculate_file_hash(pdf_file)
        if is_file_processed(file_hash):
            logger.info("File already processed (Hash match). Skipping.")
            continue

        # 2. Parallel Parse
        with pdfplumber.open(pdf_file) as pdf:
            num_pages = len(pdf.pages)

        logger.info(
            f"New file detected. Parsing {num_pages} pages with {num_workers} workers..."
        )

        # Prepare args for map
        page_args = [(pdf_file, idx) for idx in range(num_pages)]

        all_trades_dfs = []
        all_transactions_dfs = []

        with multiprocessing.Pool(num_workers) as pool:
            # Use imap for progress tracking
            results_iterator = pool.imap(process_single_page, page_args)

            # Wrap with tqdm for progress bar
            for res in tqdm(
                results_iterator, total=num_pages, desc="Parsing Pages", unit="page"
            ):
                trades, transactions = res
                if trades is not None and not trades.empty:
                    all_trades_dfs.append(trades)
                if transactions is not None and not transactions.empty:
                    all_transactions_dfs.append(transactions)

        # 3. Consolidate & Store
        new_trades_count = 0

        if all_transactions_dfs:
            # We currently only store 'trades' (parsed executions) in DB for unique checking
            # But we also extract 'transactions' (cash flow).
            # For the DB 'trades' table, we actually want the RAW transaction data to match the unique constraint
            # (Date, Type, Description, Amount, Balance)

            # Merge all transactions
            full_transactions = pd.concat(all_transactions_dfs, ignore_index=True)

            # Insert into DB and get count of NEW items
            new_trades_count = insert_trades_ignore_duplicates(full_transactions)
            logger.info(f"Inserted {new_trades_count} new transactions into Database.")

            # Save CSVs for legacy compatibility / debugging
            full_transactions.to_csv(output_path / "transactions.csv", index=False)

        if all_trades_dfs:
            full_trades = pd.concat(all_trades_dfs, ignore_index=True)
            full_trades.to_csv(output_path / "trades.csv", index=False)
            logger.info(f"Generated {len(full_trades)} parsed trades (saved to CSV).")

        # 4. Mark Done
        mark_file_processed(file_hash, pdf_file.name)
        logger.info("File marked as processed.")


if __name__ == "__main__":
    # multiprocessing freeze_support() for Windows compatibility if needed
    multiprocessing.freeze_support()
    main()
