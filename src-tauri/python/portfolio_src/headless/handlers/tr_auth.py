"""Trade Republic Authentication Handlers.

Handles login, logout, 2FA, and session management for Trade Republic integration.
"""

import asyncio
import os
from typing import Any

from portfolio_src.headless.responses import success_response, error_response
from portfolio_src.headless.state import get_auth_manager, get_bridge, get_executor
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


async def handle_tr_get_auth_status(
    cmd_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    """Get current Trade Republic authentication status.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with auth state, or error response.
    """
    try:
        loop = asyncio.get_event_loop()
        bridge = get_bridge()
        executor = get_executor()

        status = await loop.run_in_executor(executor, bridge.get_status)
        auth_state_map = {
            "authenticated": "authenticated",
            "idle": "idle",
            "waiting_2fa": "waiting_2fa",
        }
        auth_state = auth_state_map.get(status.get("status", "idle"), "idle")

        auth_manager = get_auth_manager()
        has_credentials = await loop.run_in_executor(
            executor, auth_manager.has_credentials
        )

        return success_response(
            cmd_id,
            {
                "authState": auth_state,
                "hasStoredCredentials": has_credentials,
                "lastError": auth_manager.last_error,
            },
        )
    except Exception as e:
        logger.error(f"Failed to get auth status: {e}", exc_info=True)
        return error_response(cmd_id, "TR_AUTH_ERROR", str(e))


async def handle_tr_check_saved_session(
    cmd_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    """Check for saved Trade Republic session.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with session info, or error response.
    """
    try:
        loop = asyncio.get_event_loop()
        executor = get_executor()

        data_dir = os.environ.get(
            "PRISM_DATA_DIR",
            os.path.expanduser("~/Library/Application Support/PortfolioPrism"),
        )
        cookies_file = os.path.join(data_dir, "tr_cookies.txt")
        has_session = os.path.exists(cookies_file)

        if has_session:
            auth_manager = get_auth_manager()
            phone = await loop.run_in_executor(executor, auth_manager.get_stored_phone)
            masked_phone = None
            if phone and len(phone) > 4:
                masked_phone = phone[:3] + "***" + phone[-4:]

            return success_response(
                cmd_id,
                {
                    "hasSession": True,
                    "phoneNumber": masked_phone,
                    "prompt": "restore_session",
                },
            )
        else:
            return success_response(
                cmd_id,
                {
                    "hasSession": False,
                    "phoneNumber": None,
                    "prompt": "login_required",
                },
            )
    except Exception as e:
        logger.error(f"Failed to check saved session: {e}", exc_info=True)
        return error_response(cmd_id, "TR_SESSION_CHECK_ERROR", str(e))


async def handle_tr_get_stored_credentials(
    cmd_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    """Check if stored Trade Republic credentials exist.

    Returns only a flag indicating credentials exist and a masked phone for UI display.
    SECURITY: Never returns plaintext credentials over IPC. Use useStoredCredentials
    flag in tr_login to authenticate with stored credentials server-side.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with hasCredentials flag and masked phone for display.
    """
    try:
        loop = asyncio.get_event_loop()
        executor = get_executor()
        auth_manager = get_auth_manager()

        phone, pin = await loop.run_in_executor(
            executor, auth_manager.get_stored_credentials
        )

        if phone and pin:
            masked_phone = f"***{phone[-4:]}" if len(phone) > 4 else "****"
            logger.info(f"Stored credentials found for phone ending {masked_phone}")
            return success_response(
                cmd_id,
                {
                    "hasCredentials": True,
                    "maskedPhone": masked_phone,
                    # SECURITY: Do NOT return plaintext phone or pin
                },
            )
        else:
            return success_response(
                cmd_id,
                {
                    "hasCredentials": False,
                    "maskedPhone": None,
                },
            )
    except Exception as e:
        logger.error(f"Failed to check stored credentials: {e}", exc_info=True)
        return error_response(cmd_id, "TR_CREDENTIALS_ERROR", str(e))


async def handle_tr_login(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Start Trade Republic login process with phone + PIN.

    Args:
        cmd_id: IPC command identifier.
        payload: Must contain either:
            - 'phone' and 'pin': Direct credentials from user input
            - 'useStoredCredentials': true to use server-side stored credentials
            Optionally: 'remember' to save credentials for future logins.

    Returns:
        Success response with auth state, or error response.
    """
    use_stored = payload.get("useStoredCredentials", False)
    remember = payload.get("remember", True)

    if use_stored:
        # SECURITY: Retrieve credentials server-side, never expose to frontend
        loop = asyncio.get_event_loop()
        executor = get_executor()
        auth_manager = get_auth_manager()
        phone, pin = await loop.run_in_executor(
            executor, auth_manager.get_stored_credentials
        )
        if not phone or not pin:
            return error_response(
                cmd_id, "TR_NO_STORED_CREDENTIALS", "No stored credentials available"
            )
    else:
        phone = payload.get("phone", "")
        pin = payload.get("pin", "")

    if not phone or not pin:
        return error_response(
            cmd_id, "TR_INVALID_CREDENTIALS", "Phone number and PIN are required"
        )

    try:
        # Mask phone for logging (privacy)
        masked = f"***{phone[-4:]}" if len(phone) > 4 else "****"
        logger.info(f"TR login attempt for phone ending {masked}")

        auth_manager = get_auth_manager()
        if remember:
            auth_manager.save_credentials(phone, pin)

        result = await auth_manager.request_2fa(phone, pin)

        if result.state.value == "authenticated":
            return success_response(
                cmd_id,
                {"authState": "authenticated", "message": result.message},
            )
        elif result.state.value == "waiting_for_2fa":
            return success_response(
                cmd_id,
                {
                    "authState": "waiting_2fa",
                    "message": result.message,
                    "countdown": 30,
                },
            )
        else:
            return error_response(cmd_id, "TR_LOGIN_FAILED", result.message)
    except Exception as e:
        logger.error(f"Login error: {e}", exc_info=True)
        return error_response(cmd_id, "TR_LOGIN_ERROR", str(e))


async def handle_tr_submit_2fa(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Submit 2FA code for Trade Republic authentication.

    Args:
        cmd_id: IPC command identifier.
        payload: Must contain 'code'.

    Returns:
        Success response with auth state, or error response.
    """
    code = payload.get("code", "")

    if not code:
        return error_response(cmd_id, "TR_2FA_INVALID", "2FA code is required")

    try:
        auth_manager = get_auth_manager()
        result = await auth_manager.verify_2fa(code)

        if result.success:
            logger.info("TR 2FA verification successful")
            return success_response(
                cmd_id,
                {"authState": "authenticated", "message": result.message},
            )
        else:
            return error_response(cmd_id, "TR_2FA_INVALID", result.message)
    except Exception as e:
        logger.error(f"2FA error: {e}", exc_info=True)
        return error_response(cmd_id, "TR_2FA_ERROR", str(e))


async def handle_tr_logout(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Logout from Trade Republic and clear session.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with auth state, or error response.
    """
    try:
        loop = asyncio.get_event_loop()
        executor = get_executor()

        auth_manager = get_auth_manager()
        await loop.run_in_executor(executor, auth_manager.logout)

        # Clear cookies file
        data_dir = os.environ.get(
            "PRISM_DATA_DIR",
            os.path.expanduser("~/Library/Application Support/PortfolioPrism"),
        )
        cookies_file = os.path.join(data_dir, "tr_cookies.txt")
        if os.path.exists(cookies_file):
            os.remove(cookies_file)

        logger.info("TR logout successful, session cleared")
        return success_response(
            cmd_id,
            {"authState": "idle", "message": "Logged out and session cleared"},
        )
    except Exception as e:
        logger.error(f"Logout error: {e}", exc_info=True)
        return error_response(cmd_id, "TR_LOGOUT_ERROR", str(e))
