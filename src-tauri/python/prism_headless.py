#!/usr/bin/env python3
import sys
import os
import json
import threading
import time
import asyncio
import argparse
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional, cast

try:
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn

    HAS_HTTP = True
except ImportError:
    HAS_HTTP = False

if getattr(sys, "frozen", False):
    try:
        import certifi

        os.environ["SSL_CERT_FILE"] = certifi.where()
        os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
    except ImportError:
        pass

try:
    reconfig = getattr(sys.stdout, "reconfigure", None)
    if reconfig:
        reconfig(line_buffering=True)
except Exception:
    pass

import logging
from portfolio_src.prism_utils.logging_config import get_logger, configure_root_logger

configure_root_logger()
logger = get_logger("PrismHeadless")

VERSION = "0.1.0"
SESSION_ID = "unknown"
_start_time = time.time()


def resource_path(relative_path: str) -> str:
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)


def dead_mans_switch(shutdown_event):
    try:
        shutdown_event.wait()
    except Exception:
        pass
    finally:
        os._exit(0)


def handle_get_health(cmd_id: int, payload: dict) -> dict:
    from portfolio_src.data.database import get_db_path

    memory_mb = 0.0
    try:
        import psutil

        process = psutil.Process(os.getpid())
        memory_mb = process.memory_info().rss / (1024 * 1024)
    except ImportError:
        try:
            import resource

            memory_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (
                1024 * 1024
            )
        except Exception:
            pass
    uptime = time.time() - _start_time
    return {
        "id": cmd_id,
        "status": "success",
        "data": {
            "version": VERSION,
            "sessionId": SESSION_ID,
            "memoryUsageMb": round(memory_mb, 1),
            "uptimeSeconds": round(uptime, 1),
            "dbPath": str(get_db_path()),
        },
    }


_auth_manager = None
_bridge = None
_bridge_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="bridge")


def get_auth_manager():
    global _auth_manager
    if _auth_manager is None:
        from portfolio_src.core.tr_auth import TRAuthManager

        _auth_manager = TRAuthManager()
    return _auth_manager


def get_bridge():
    global _bridge
    if _bridge is None:
        from portfolio_src.core.tr_bridge import TRBridge

        _bridge = TRBridge.get_instance()
    return _bridge


def error_response(cmd_id: int, code: str, message: str) -> dict:
    return {
        "id": cmd_id,
        "status": "error",
        "error": {"code": code, "message": message},
    }


def emit_progress(progress: int, message: str):
    print(
        json.dumps(
            {
                "event": "sync_progress",
                "data": {"progress": progress, "message": message},
            }
        )
    )
    sys.stdout.flush()


async def handle_tr_get_auth_status(cmd_id: int, payload: dict) -> dict:
    try:
        loop = asyncio.get_event_loop()
        bridge = get_bridge()
        status = await loop.run_in_executor(_bridge_executor, bridge.get_status)
        auth_state_map = {
            "authenticated": "authenticated",
            "idle": "idle",
            "waiting_2fa": "waiting_2fa",
        }
        auth_state = auth_state_map.get(status.get("status", "idle"), "idle")
        auth_manager = get_auth_manager()
        has_credentials = await loop.run_in_executor(
            _bridge_executor, auth_manager.has_credentials
        )
        return {
            "id": cmd_id,
            "status": "success",
            "data": {
                "authState": auth_state,
                "hasStoredCredentials": has_credentials,
                "lastError": auth_manager.last_error,
            },
        }
    except Exception as e:
        return error_response(cmd_id, "TR_AUTH_ERROR", str(e))


async def handle_tr_check_saved_session(cmd_id: int, payload: dict) -> dict:
    try:
        loop = asyncio.get_event_loop()
        data_dir = os.environ.get(
            "PRISM_DATA_DIR",
            os.path.expanduser("~/Library/Application Support/PortfolioPrism"),
        )
        cookies_file = os.path.join(data_dir, "tr_cookies.txt")
        has_session = os.path.exists(cookies_file)
        if has_session:
            auth_manager = get_auth_manager()
            phone = await loop.run_in_executor(
                _bridge_executor, auth_manager.get_stored_phone
            )
            masked_phone = None
            if phone and len(phone) > 4:
                masked_phone = phone[:3] + "***" + phone[-4:]
            return {
                "id": cmd_id,
                "status": "success",
                "data": {
                    "hasSession": True,
                    "phoneNumber": masked_phone,
                    "prompt": "restore_session",
                },
            }
        else:
            return {
                "id": cmd_id,
                "status": "success",
                "data": {
                    "hasSession": False,
                    "phoneNumber": None,
                    "prompt": "login_required",
                },
            }
    except Exception as e:
        return error_response(cmd_id, "TR_SESSION_CHECK_ERROR", str(e))


async def handle_tr_login(cmd_id: int, payload: dict) -> dict:
    phone = payload.get("phone", "")
    pin = payload.get("pin", "")
    remember = payload.get("remember", True)
    if not phone or not pin:
        return error_response(
            cmd_id, "TR_INVALID_CREDENTIALS", "Phone number and PIN are required"
        )
    try:
        auth_manager = get_auth_manager()
        if remember:
            auth_manager.save_credentials(phone, pin)
        result = await auth_manager.request_2fa(phone, pin)
        if result.state.value == "authenticated":
            return {
                "id": cmd_id,
                "status": "success",
                "data": {"authState": "authenticated", "message": result.message},
            }
        elif result.state.value == "waiting_for_2fa":
            return {
                "id": cmd_id,
                "status": "success",
                "data": {
                    "authState": "waiting_2fa",
                    "message": result.message,
                    "countdown": 30,
                },
            }
        else:
            return error_response(cmd_id, "TR_LOGIN_FAILED", result.message)
    except Exception as e:
        logger.error(f"Login error: {e}", exc_info=True)
        return error_response(cmd_id, "TR_LOGIN_ERROR", str(e))


async def handle_tr_submit_2fa(cmd_id: int, payload: dict) -> dict:
    code = payload.get("code", "")
    if not code:
        return error_response(cmd_id, "TR_2FA_INVALID", "2FA code is required")
    try:
        auth_manager = get_auth_manager()
        result = await auth_manager.verify_2fa(code)
        if result.success:
            return {
                "id": cmd_id,
                "status": "success",
                "data": {"authState": "authenticated", "message": result.message},
            }
        else:
            return error_response(cmd_id, "TR_2FA_INVALID", result.message)
    except Exception as e:
        logger.error(f"2FA error: {e}", exc_info=True)
        return error_response(cmd_id, "TR_2FA_ERROR", str(e))


async def handle_tr_logout(cmd_id: int, payload: dict) -> dict:
    try:
        loop = asyncio.get_event_loop()
        auth_manager = get_auth_manager()
        await loop.run_in_executor(_bridge_executor, auth_manager.logout)
        data_dir = os.environ.get(
            "PRISM_DATA_DIR",
            os.path.expanduser("~/Library/Application Support/PortfolioPrism"),
        )
        cookies_file = os.path.join(data_dir, "tr_cookies.txt")
        if os.path.exists(cookies_file):
            os.remove(cookies_file)
        return {
            "id": cmd_id,
            "status": "success",
            "data": {"authState": "idle", "message": "Logged out and session cleared"},
        }
    except Exception as e:
        return error_response(cmd_id, "TR_LOGOUT_ERROR", str(e))


async def handle_sync_portfolio(cmd_id: int, payload: dict) -> dict:
    from portfolio_src.data.tr_sync import TRDataFetcher
    from portfolio_src.data.database import sync_positions_from_tr, update_sync_state

    loop = asyncio.get_event_loop()
    portfolio_id = payload.get("portfolioId", 1)
    emit_progress(0, "Starting sync...")
    try:
        bridge = get_bridge()
        status = await loop.run_in_executor(_bridge_executor, bridge.get_status)
        if status.get("status") != "authenticated":
            emit_progress(2, "Restoring session...")
            auth_manager = get_auth_manager()
            restore_result = await auth_manager.try_restore_session()
            if restore_result.success:
                emit_progress(5, "Session restored.")
                status = await loop.run_in_executor(_bridge_executor, bridge.get_status)
            else:
                logger.warning(f"Session restoration failed: {restore_result.message}")
        if status.get("status") != "authenticated":
            return error_response(
                cmd_id,
                "TR_AUTH_REQUIRED",
                "Please authenticate with Trade Republic first",
            )
        emit_progress(10, "Connecting to Trade Republic...")
        start_time = time.time()
        fetcher = TRDataFetcher(bridge)
        emit_progress(30, "Fetching portfolio...")
        raw_positions = await loop.run_in_executor(
            _bridge_executor, fetcher.fetch_portfolio_sync
        )
        emit_progress(50, f"Processing {len(raw_positions)} positions...")
        tr_positions = []
        for pos in raw_positions:
            tr_positions.append(
                {
                    "isin": pos["isin"],
                    "name": pos["name"],
                    "symbol": "",
                    "quantity": pos["quantity"],
                    "cost_basis": pos["avg_cost"],
                    "current_price": pos["current_price"],
                    "asset_class": "Equity",
                }
            )
        emit_progress(70, "Writing to database...")
        sync_result = sync_positions_from_tr(portfolio_id, tr_positions)
        update_sync_state(
            "trade_republic",
            "success",
            f"Synced {sync_result['synced_positions']} positions",
        )
        duration_ms = int((time.time() - start_time) * 1000)
        emit_progress(100, "Sync complete! Running Deep Analysis...")

        await handle_run_pipeline(cmd_id, payload)

        return {
            "id": cmd_id,
            "status": "success",
            "data": {
                "syncedPositions": sync_result["synced_positions"],
                "newPositions": sync_result["new_positions"],
                "updatedPositions": sync_result["updated_positions"],
                "totalValue": sync_result["total_value"],
                "durationMs": duration_ms,
            },
        }
    except Exception as e:
        update_sync_state("trade_republic", "error", str(e))
        return error_response(cmd_id, "TR_SYNC_FAILED", str(e))


async def handle_run_pipeline(cmd_id: int, payload: dict) -> dict:
    from portfolio_src.core.pipeline import Pipeline

    emit_progress(0, "Starting analytics pipeline...")
    start_time = time.time()
    try:

        def pipeline_progress(msg, pct):
            time.sleep(0.1)
            emit_progress(int(pct * 100), f"Analytics: {msg}")

        pipeline = Pipeline()
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, pipeline.run, pipeline_progress)
        duration_ms = int((time.time() - start_time) * 1000)
        if not result.success:
            emit_progress(100, "Analytics completed with warnings.")
            return {
                "id": cmd_id,
                "status": "success",
                "data": {
                    "success": False,
                    "errors": [str(e) for e in result.errors],
                    "durationMs": duration_ms,
                },
            }
        else:
            emit_progress(100, "Analytics complete!")
            return {
                "id": cmd_id,
                "status": "success",
                "data": {"success": True, "errors": [], "durationMs": duration_ms},
            }
    except Exception as e:
        logger.error(f"Failed to run pipeline: {e}", exc_info=True)
        return error_response(cmd_id, "PIPELINE_ERROR", str(e))


def handle_get_dashboard_data(cmd_id: int, payload: dict) -> dict:
    from portfolio_src.data.database import get_positions

    portfolio_id = payload.get("portfolioId", 1)
    positions = get_positions(portfolio_id)
    if not positions:
        return {
            "id": cmd_id,
            "status": "success",
            "data": {
                "totalValue": 0,
                "totalGain": 0,
                "gainPercentage": 0,
                "allocations": {"sector": {}, "region": {}, "assetClass": {}},
                "topHoldings": [],
                "lastUpdated": None,
                "isEmpty": True,
                "positionCount": 0,
            },
        }
    total_value = 0.0
    total_cost = 0.0
    holdings = []
    for pos in positions:
        quantity = float(pos.get("quantity", 0))
        current_price = float(pos.get("current_price") or pos.get("cost_basis") or 0)
        cost_basis = float(pos.get("cost_basis") or current_price)
        value = quantity * current_price
        cost = quantity * cost_basis
        pnl = value - cost
        pnl_pct = (pnl / cost * 100) if cost > 0 else 0
        total_value += value
        total_cost += cost
        holdings.append(
            {
                "isin": pos.get("isin", ""),
                "name": pos.get("name") or pos.get("isin", "Unknown"),
                "ticker": pos.get("symbol"),
                "value": round(value, 2),
                "weight": 0.0,
                "pnl": round(pnl, 2),
                "pnlPercentage": round(pnl_pct, 1),
                "quantity": quantity,
                "assetClass": pos.get("asset_class"),
            }
        )
    for h in holdings:
        h["weight"] = round(h["value"] / total_value, 4) if total_value > 0 else 0.0
    holdings.sort(key=lambda x: x["value"], reverse=True)
    top_holdings = holdings[:10]
    total_gain = total_value - total_cost
    gain_percentage = (total_gain / total_cost * 100) if total_cost > 0 else 0.0
    asset_class_alloc = {}
    for h in holdings:
        ac = str(h.get("assetClass") or "Unknown")
        asset_class_alloc[ac] = asset_class_alloc.get(ac, 0.0) + h["weight"]
    sector_alloc = {}
    region_alloc = {}
    try:
        from portfolio_src.config import TRUE_EXPOSURE_REPORT
        import pandas as pd

        if os.path.exists(TRUE_EXPOSURE_REPORT):
            df = pd.read_csv(TRUE_EXPOSURE_REPORT)
            if not df.empty:
                sector_alloc = {
                    str(k): round(float(v), 2)
                    for k, v in df.groupby("sector")["portfolio_percentage"]
                    .sum()
                    .items()
                    if v > 0
                }
                region_alloc = {
                    str(k): round(float(v), 2)
                    for k, v in df.groupby("geography")["portfolio_percentage"]
                    .sum()
                    .items()
                    if v > 0
                }
    except Exception:
        pass
    day_change = 0.0
    day_change_pct = 0.0
    history = []
    try:
        from portfolio_src.data.history_manager import HistoryManager

        history_mgr = HistoryManager()
        day_change, day_change_pct = history_mgr.calculate_day_change(positions)
        history = history_mgr.get_portfolio_history(positions, days=30)
    except Exception:
        pass
    return {
        "id": cmd_id,
        "status": "success",
        "data": {
            "totalValue": round(total_value, 2),
            "totalGain": round(total_gain, 2),
            "gainPercentage": round(gain_percentage, 1),
            "dayChange": day_change,
            "dayChangePercent": day_change_pct,
            "history": history,
            "allocations": {
                "sector": sector_alloc,
                "region": region_alloc,
                "assetClass": asset_class_alloc,
            },
            "topHoldings": top_holdings,
            "lastUpdated": None,
            "isEmpty": False,
            "positionCount": len(positions),
        },
    }


def handle_get_positions(cmd_id: int, payload: dict) -> dict:
    from portfolio_src.data.database import get_positions, get_sync_state
    from datetime import datetime

    portfolio_id = payload.get("portfolioId", 1)
    positions_raw = get_positions(portfolio_id)
    if not positions_raw:
        return {
            "id": cmd_id,
            "status": "success",
            "data": {
                "positions": [],
                "totalValue": 0,
                "totalCost": 0,
                "totalPnl": 0,
                "totalPnlPercent": 0,
                "lastSyncTime": None,
            },
        }
    total_value = 0.0
    total_cost = 0.0
    positions = []
    for pos in positions_raw:
        quantity = float(pos.get("quantity", 0))
        current_price = float(pos.get("current_price") or pos.get("cost_basis") or 0)
        avg_buy_price = float(pos.get("cost_basis") or current_price)
        current_value = quantity * current_price
        total_cost_pos = quantity * avg_buy_price
        pnl_eur = current_value - total_cost_pos
        pnl_percent = (pnl_eur / total_cost_pos * 100) if total_cost_pos > 0 else 0
        total_value += current_value
        total_cost += total_cost_pos
        asset_class = pos.get("asset_class", "other")
        instrument_type = "stock"
        if asset_class:
            ac_lower = asset_class.lower()
            if "etf" in ac_lower:
                instrument_type = "etf"
            elif "crypto" in ac_lower:
                instrument_type = "crypto"
            elif "bond" in ac_lower:
                instrument_type = "bond"
            elif any(x in ac_lower for x in ["derivative", "option", "warrant"]):
                instrument_type = "derivative"
        positions.append(
            {
                "isin": pos.get("isin", ""),
                "name": pos.get("name") or pos.get("isin", "Unknown"),
                "ticker": pos.get("symbol") or "",
                "instrumentType": instrument_type,
                "quantity": quantity,
                "avgBuyPrice": round(avg_buy_price, 2),
                "currentPrice": round(current_price, 2),
                "currentValue": round(current_value, 2),
                "totalCost": round(total_cost_pos, 2),
                "pnlEur": round(pnl_eur, 2),
                "pnlPercent": round(pnl_percent, 2),
                "weight": 0.0,
                "currency": pos.get("currency") or "EUR",
                "notes": pos.get("notes") or "",
                "lastUpdated": pos.get("updated_at") or datetime.now().isoformat(),
            }
        )
    for p in positions:
        p["weight"] = (
            round(p["currentValue"] / total_value * 100, 2) if total_value > 0 else 0.0
        )
    positions.sort(key=lambda x: x["currentValue"], reverse=True)
    sync_state = get_sync_state("trade_republic")
    return {
        "id": cmd_id,
        "status": "success",
        "data": {
            "positions": positions,
            "totalValue": round(total_value, 2),
            "totalCost": round(total_cost, 2),
            "totalPnl": round(total_value - total_cost, 2),
            "totalPnlPercent": round(
                ((total_value - total_cost) / total_cost * 100)
                if total_cost > 0
                else 0.0,
                2,
            ),
            "lastSyncTime": sync_state.get("last_sync") if sync_state else None,
        },
    }


def handle_upload_holdings(cmd_id: int, payload: dict) -> dict:
    from portfolio_src.core.data_cleaner import DataCleaner
    from portfolio_src.data.holdings_cache import get_holdings_cache
    from portfolio_src.data.hive_client import get_hive_client

    file_path = payload.get("filePath")
    etf_isin = payload.get("etfIsin")
    if not file_path or not etf_isin:
        return error_response(
            cmd_id, "INVALID_PARAMS", "filePath and etfIsin are required"
        )
    try:
        df_raw = DataCleaner.smart_load(file_path)
        df_clean = DataCleaner.cleanup(df_raw)
        if df_clean.empty:
            return error_response(
                cmd_id, "CLEANUP_FAILED", "No valid holdings found in file"
            )
        total_weight = float(df_clean["weight"].sum())
        cache = get_holdings_cache()
        cache._save_to_local_cache(etf_isin, df_clean, source="manual_upload")
        hive_client = get_hive_client()
        contribution_success = (
            hive_client.contribute_etf_holdings(etf_isin, df_clean)
            if hive_client.is_configured
            else False
        )
        return {
            "id": cmd_id,
            "status": "success",
            "data": {
                "isin": etf_isin,
                "holdingsCount": len(df_clean),
                "totalWeight": round(total_weight, 2),
                "contributedToHive": contribution_success,
            },
        }
    except Exception as e:
        logger.error(f"Manual upload failed: {e}", exc_info=True)
        return error_response(cmd_id, "UPLOAD_FAILED", str(e))


def handle_get_true_holdings(cmd_id: int, payload: dict) -> dict:
    from portfolio_src.config import HOLDINGS_BREAKDOWN_PATH
    import pandas as pd

    if not os.path.exists(HOLDINGS_BREAKDOWN_PATH):
        return {"id": cmd_id, "status": "success", "data": {"holdings": []}}
    try:
        df = pd.read_csv(HOLDINGS_BREAKDOWN_PATH)
        if df.empty:
            return {"id": cmd_id, "status": "success", "data": {"holdings": []}}
        grouped = df.groupby(["child_isin", "child_name"], as_index=False).agg(
            {"value_eur": "sum", "sector": "first", "geography": "first"}
        )
        holdings = []
        for _, row in grouped.iterrows():
            child_isin = str(row["child_isin"])
            sources = [
                {
                    "etf": str(s_row["parent_isin"]),
                    "value": round(float(s_row["value_eur"]), 2),
                    "weight": round(float(s_row["weight_percent"]) / 100.0, 4),
                }
                for _, s_row in df[df["child_isin"] == child_isin].iterrows()
            ]
            holdings.append(
                {
                    "stock": str(row["child_name"]),
                    "ticker": child_isin,
                    "totalValue": round(float(row["value_eur"]), 2),
                    "sector": str(row["sector"]),
                    "geography": str(row["geography"]),
                    "sources": sources,
                }
            )
        holdings.sort(key=lambda x: x["totalValue"], reverse=True)
        return {"id": cmd_id, "status": "success", "data": {"holdings": holdings}}
    except Exception as e:
        logger.error(f"Failed to get true holdings: {e}", exc_info=True)
        return error_response(cmd_id, "HOLDINGS_ERROR", str(e))


def handle_get_overlap_analysis(cmd_id: int, payload: dict) -> dict:
    import numpy as np
    from portfolio_src.config import HOLDINGS_BREAKDOWN_PATH
    import pandas as pd

    if not os.path.exists(HOLDINGS_BREAKDOWN_PATH):
        return {
            "id": cmd_id,
            "status": "success",
            "data": {"etfs": [], "matrix": [], "sharedHoldings": []},
        }
    try:
        df = pd.read_csv(HOLDINGS_BREAKDOWN_PATH)
        if df.empty:
            return {
                "id": cmd_id,
                "status": "success",
                "data": {"etfs": [], "matrix": [], "sharedHoldings": []},
            }
        etfs = sorted(df["parent_isin"].unique().tolist())
        if not etfs:
            return {
                "id": cmd_id,
                "status": "success",
                "data": {"etfs": [], "matrix": [], "sharedHoldings": []},
            }
        n = len(etfs)
        matrix = np.zeros((n, n))
        pivot_df = df.pivot(
            index="child_isin", columns="parent_isin", values="weight_percent"
        ).fillna(0)
        for i in range(n):
            for j in range(n):
                if i == j:
                    matrix[i][j] = 100.0
                else:
                    matrix[i][j] = round(
                        float(np.minimum(pivot_df[etfs[i]], pivot_df[etfs[j]]).sum()), 1
                    )
        shared_grouped = df.groupby(["child_isin", "child_name"], as_index=False).agg(
            {"value_eur": "sum"}
        )
        shared_holdings = []
        for _, row in shared_grouped.iterrows():
            child_isin = str(row["child_isin"])
            parents = df[df["child_isin"] == child_isin]["parent_isin"].tolist()
            if len(parents) > 1:
                shared_holdings.append(
                    {
                        "stock": str(row["child_name"]),
                        "etfs": parents,
                        "totalValue": round(float(row["value_eur"]), 2),
                    }
                )
        shared_holdings.sort(key=lambda x: x["totalValue"], reverse=True)
        return {
            "id": cmd_id,
            "status": "success",
            "data": {
                "etfs": etfs,
                "matrix": matrix.tolist(),
                "sharedHoldings": shared_holdings[:10],
            },
        }
    except Exception as e:
        logger.error(f"Failed to get overlap analysis: {e}", exc_info=True)
        return error_response(cmd_id, "OVERLAP_ERROR", str(e))


def handle_get_pipeline_report(cmd_id: int, payload: dict) -> dict:
    from portfolio_src.config import PIPELINE_HEALTH_PATH

    if not os.path.exists(PIPELINE_HEALTH_PATH):
        return {"id": cmd_id, "status": "success", "data": None}
    try:
        with open(PIPELINE_HEALTH_PATH, "r") as f:
            data = json.load(f)
        return {"id": cmd_id, "status": "success", "data": data}
    except Exception as e:
        return error_response(cmd_id, "REPORT_ERROR", str(e))


async def dispatch(cmd: dict) -> dict:
    command = cmd.get("command", "")
    cmd_id = cmd.get("id", 0)
    payload = cmd.get("payload", {})
    handlers = {
        "get_health": handle_get_health,
        "get_engine_health": handle_get_health,
        "get_dashboard_data": handle_get_dashboard_data,
        "get_positions": handle_get_positions,
        "tr_get_auth_status": handle_tr_get_auth_status,
        "tr_check_saved_session": handle_tr_check_saved_session,
        "tr_login": handle_tr_login,
        "tr_submit_2fa": handle_tr_submit_2fa,
        "tr_logout": handle_tr_logout,
        "sync_portfolio": handle_sync_portfolio,
        "run_pipeline": handle_run_pipeline,
        "upload_holdings": handle_upload_holdings,
        "get_true_holdings": handle_get_true_holdings,
        "get_overlap_analysis": handle_get_overlap_analysis,
        "get_pipeline_report": handle_get_pipeline_report,
    }
    handler = handlers.get(command)
    if handler:
        try:
            if asyncio.iscoroutinefunction(handler):
                return await handler(cmd_id, payload)
            else:
                return handler(cmd_id, payload)
        except Exception as e:
            return {
                "id": cmd_id,
                "status": "error",
                "error": {"code": "HANDLER_ERROR", "message": str(e)},
            }
    else:
        return {
            "id": cmd_id,
            "status": "error",
            "error": {
                "code": "UNKNOWN_COMMAND",
                "message": f"Unknown command: {command}",
            },
        }


def install_default_config() -> None:
    import shutil

    try:
        from portfolio_src.config import CONFIG_DIR
    except ImportError:
        logger.error(
            "Could not import portfolio_src.config. Skipping default config install."
        )
        return
    logger.info(f"Checking configuration in: {CONFIG_DIR}")
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.error(f"Failed to create config dir: {e}")
        return
    files_to_install = [
        "adapter_registry.json",
        "asset_universe.csv",
        "ishares_config.json",
        "ticker_map.json",
    ]
    for filename in files_to_install:
        target_path = CONFIG_DIR / filename
        if target_path.exists():
            continue
        bundled_path = Path(resource_path(os.path.join("default_config", filename)))
        if bundled_path.exists():
            try:
                shutil.copy2(bundled_path, target_path)
                logger.info(f"Installed default config: {filename}")
            except Exception as e:
                logger.error(f"Failed to install {filename}: {e}")
        else:
            log_level = logging.WARNING if "registry" in filename else logging.INFO
            logger.log(log_level, f"Default config not found in bundle: {bundled_path}")


def run_echo_bridge(host: str, port: int):
    if not HAS_HTTP:
        print("Error: fastapi and uvicorn are required for HTTP mode.")
        return
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn

    app = FastAPI(title="Prism Echo-Bridge")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    echo_token = os.environ.get("PRISM_ECHO_TOKEN", "dev-echo-bridge-secret")

    @app.post("/command")
    async def http_command(request: Request):
        token = request.headers.get("X-Echo-Bridge-Token")
        if token != echo_token:
            logger.warning("Echo-Bridge: Unauthorized request")
            return {
                "id": 0,
                "status": "error",
                "error": {"code": "UNAUTHORIZED", "message": "Invalid token"},
            }
        try:
            cmd = await request.json()
            command = cmd.get("command")
            if command not in [
                "get_health",
                "get_engine_health",
                "tr_get_auth_status",
                "tr_check_saved_session",
            ]:
                logger.info(f"Echo-Bridge: {command}")
            return await dispatch(cmd)
        except Exception as e:
            logger.error(f"Echo-Bridge Error: {e}", exc_info=True)
            return {
                "id": 0,
                "status": "error",
                "error": {"code": "HTTP_ERROR", "message": str(e)},
            }

    @app.get("/")
    async def http_root():
        return {"status": "online", "mode": "Echo-Bridge", "version": VERSION}

    @app.get("/health")
    async def http_health():
        return {"status": "ok", "version": VERSION, "sessionId": SESSION_ID}

    logger.info(f"Starting Echo-Bridge on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")


def main():
    parser = argparse.ArgumentParser(description="Prism Headless Engine")
    parser.add_argument(
        "--http", action="store_true", help="Start HTTP server (Echo-Bridge)"
    )
    parser.add_argument("--port", type=int, default=5001, help="HTTP server port")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="HTTP server host")
    args = parser.parse_args()
    shutdown_event = threading.Event()
    threading.Thread(
        target=dead_mans_switch, args=(shutdown_event,), daemon=True
    ).start()
    data_dir = os.environ.get("PRISM_DATA_DIR")
    if data_dir:
        os.makedirs(data_dir, exist_ok=True)
    global SESSION_ID
    SESSION_ID = str(uuid.uuid4())
    configure_root_logger(session_id=SESSION_ID)
    logger = get_logger("PrismHeadless")
    logger.info(f"Session started: {SESSION_ID}")
    install_default_config()
    from portfolio_src.data.database import init_db

    init_db()
    if args.http:
        run_echo_bridge(args.host, args.port)
        return
    ready_signal = {"status": "ready", "version": VERSION, "pid": os.getpid()}
    print(json.dumps(ready_signal))
    sys.stdout.flush()
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            try:
                cmd = json.loads(line)
            except json.JSONDecodeError as e:
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
                continue
            response = asyncio.run(dispatch(cmd))
            print(json.dumps(response))
            sys.stdout.flush()
        except KeyboardInterrupt:
            break
        except Exception as e:
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


if __name__ == "__main__":
    main()
