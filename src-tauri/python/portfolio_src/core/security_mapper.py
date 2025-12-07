import os
import requests
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

OPENFIGI_API_KEY = os.getenv("OPENFIGI_API_KEY")


def map_isins_to_tickers(isins: list) -> pd.DataFrame:
    """
    Maps a list of ISINs to their corresponding tickers and providers using OpenFIGI.
    """
    if not OPENFIGI_API_KEY:
        raise ValueError("OPENFIGI_API_KEY not found in .env")

    url = "https://api.openfigi.com/v3/mapping"
    headers = {
        "Content-Type": "application/json",
        "X-OPENFIGI-APIKEY": OPENFIGI_API_KEY,
    }
    data = [{"idType": "ID_ISIN", "idValue": isin} for isin in isins]

    response = requests.post(url, json=data, headers=headers)
    response.raise_for_status()

    results = response.json()

    mappings = []
    for request, result in zip(data, results):
        isin = request["idValue"]
        if "data" in result and result["data"]:
            # Take the first match
            item = result["data"][0]
            mappings.append(
                {
                    "ISIN": isin,
                    "TICKER": item.get("ticker"),
                    "PROVIDER": item.get("exchCode") or item.get("marketSector"),
                }
            )
        else:
            mappings.append(
                {
                    "ISIN": isin,
                    "TICKER": None,
                    "PROVIDER": None,
                }
            )

    return pd.DataFrame(mappings)
