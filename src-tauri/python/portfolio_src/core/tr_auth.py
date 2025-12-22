"""
Trade Republic Authentication Module

⚠️ FRAGILE: Bridges async FastAPI with sync TRBridge.
Read keystone/specs/trade_republic_integration.md before refactoring.
"""

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from pathlib import Path
from typing import Optional
from enum import Enum
import json
import sys
from dataclasses import dataclass

from portfolio_src.core.tr_bridge import TRBridge
from portfolio_src.config import DATA_DIR


class AuthState(Enum):
    """Authentication state machine states."""

    IDLE = "idle"
    REQUESTING = "requesting"
    WAITING_FOR_2FA = "waiting_for_2fa"
    VERIFYING = "verifying"
    AUTHENTICATED = "authenticated"
    ERROR = "error"


@dataclass
class AuthResult:
    """Result of an authentication attempt."""

    success: bool
    state: AuthState
    message: str
    session_token: Optional[str] = None


class TRAuthManager:
    """
    Manages Trade Republic authentication via TR daemon subprocess.

    Delegates all pytr operations to the isolated daemon process.
    Maintains compatibility with existing UI code.
    """

    def __init__(self, data_dir: Optional[Path] = None):
        """
        Initialize the auth manager.

        Args:
            data_dir: Path to data directory
        """
        self.bridge = TRBridge.get_instance()
        self._state = AuthState.IDLE
        self._phone_number: Optional[str] = None
        self.data_dir = data_dir  # Store for compatibility with Pipeline
        self._executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="auth_manager"
        )

    @property
    def state(self) -> AuthState:
        """Get current authentication state."""
        return self._state

    @property
    def is_authenticated(self) -> bool:
        """Check if we have a valid session."""
        return self._state == AuthState.AUTHENTICATED

    @property
    def last_error(self) -> Optional[str]:
        """Get last error message if any."""
        return getattr(self, "_last_error", None)

    def has_credentials(self) -> bool:
        """Check if stored credentials exist."""
        phone, pin = self.get_stored_credentials()
        return phone is not None and pin is not None

    def get_stored_phone(self) -> Optional[str]:
        """Get stored phone number for masking."""
        phone, _ = self.get_stored_credentials()
        return phone

    def logout(self) -> None:
        """Logout and clear session."""
        self.clear_credentials()
        self._last_error = None

    def clear_credentials(self, phone: Optional[str] = None) -> bool:
        """Clear stored credentials (delegates to daemon)."""
        # Call logout on daemon to clear cookies
        try:
            self.bridge.logout()
        except Exception:
            pass

        self._state = AuthState.IDLE
        self._phone_number = None
        return True

    async def request_2fa(self, phone_number: str, pin: str) -> AuthResult:
        """
        Start the 2FA login process via daemon.

        Args:
            phone_number: Phone number in international format
            pin: 4-digit PIN

        Returns:
            AuthResult with state WAITING_FOR_2FA if successful
        """
        self._state = AuthState.REQUESTING
        self._phone_number = phone_number

        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                self._executor, self.bridge.login, phone_number, pin
            )

            if result.get("status") == "authenticated":
                # Session was restored immediately (e.g. from cookies)
                self._state = AuthState.AUTHENTICATED
                return AuthResult(
                    success=True,
                    state=AuthState.AUTHENTICATED,
                    message=result.get("message", "Session restored."),
                    session_token="restored",
                )
            elif result.get("status") == "waiting_2fa":
                self._state = AuthState.WAITING_FOR_2FA
                return AuthResult(
                    success=True,
                    state=AuthState.WAITING_FOR_2FA,
                    message="2FA code sent to your Trade Republic app. Please enter it.",
                )
            else:
                self._state = AuthState.ERROR
                return AuthResult(
                    success=False,
                    state=AuthState.ERROR,
                    message=result.get("message", "Login failed"),
                )

        except Exception as e:
            self._state = AuthState.ERROR
            return AuthResult(
                success=False,
                state=AuthState.ERROR,
                message=f"Login request failed: {str(e)}",
            )

    async def verify_2fa(self, code: str) -> AuthResult:
        """
        Verify the 2FA code via daemon.

        Args:
            code: 4-digit code from Trade Republic app

        Returns:
            AuthResult with state AUTHENTICATED if successful
        """
        if self._state != AuthState.WAITING_FOR_2FA:
            return AuthResult(
                success=False,
                state=AuthState.ERROR,
                message="Please request 2FA first.",
            )

        self._state = AuthState.VERIFYING

        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                self._executor, self.bridge.confirm_2fa, code
            )

            if result.get("status") == "authenticated":
                self._state = AuthState.AUTHENTICATED
                return AuthResult(
                    success=True,
                    state=AuthState.AUTHENTICATED,
                    message="Successfully authenticated with Trade Republic!",
                    session_token="authenticated",  # Placeholder for compatibility
                )
            else:
                self._state = AuthState.WAITING_FOR_2FA  # Allow retry
                return AuthResult(
                    success=False,
                    state=AuthState.WAITING_FOR_2FA,
                    message=result.get("message", "2FA verification failed"),
                )

        except Exception as e:
            self._state = AuthState.ERROR
            return AuthResult(
                success=False,
                state=AuthState.ERROR,
                message=f"2FA verification failed: {str(e)}",
            )

    async def try_restore_session(
        self, phone_number: Optional[str] = None
    ) -> AuthResult:
        """
        Try to restore a previous session using stored credentials.
        ⚠️ MUST check bridge.get_status() first to avoid redundant API calls.
        """
        try:
            loop = asyncio.get_event_loop()
            status = await loop.run_in_executor(self._executor, self.bridge.get_status)
            if status.get("status") == "authenticated":
                self._state = AuthState.AUTHENTICATED
                return AuthResult(
                    success=True,
                    state=AuthState.AUTHENTICATED,
                    message="Session already active.",
                    session_token="active",
                )

            phone, pin = self.get_stored_credentials()
            if not phone or not pin:
                return AuthResult(
                    success=False,
                    state=AuthState.IDLE,
                    message="No saved credentials found.",
                )

            result = await loop.run_in_executor(
                self._executor,
                partial(self.bridge.login, phone, pin, restore_only=True),
            )

            if result.get("status") == "authenticated":
                self._state = AuthState.AUTHENTICATED
                self._phone_number = phone
                return AuthResult(
                    success=True,
                    state=AuthState.AUTHENTICATED,
                    message=result.get("message", "Session restored."),
                    session_token="restored",
                )
            elif result.get("code") == "SESSION_RESTORE_FAILED":
                return AuthResult(
                    success=False,
                    state=AuthState.IDLE,
                    message="Session expired. Please log in again.",
                )
            elif result.get("status") == "waiting_2fa":
                # Token expired, need 2FA again
                self._state = AuthState.WAITING_FOR_2FA
                return AuthResult(
                    success=False,  # Not fully authenticated yet
                    state=AuthState.WAITING_FOR_2FA,
                    message="Session expired. 2FA required.",
                )
            else:
                return AuthResult(
                    success=False,
                    state=AuthState.IDLE,
                    message=result.get("message", "Restore failed"),
                )

        except Exception as e:
            return AuthResult(
                success=False,
                state=AuthState.IDLE,
                message=f"Session restore failed: {str(e)}",
            )

    def save_credentials(self, phone: str, pin: str) -> bool:
        """Save credentials to local file (User requested file-based storage)."""
        # Force file storage for reliability as requested
        return self._save_to_file(phone, pin)

    def get_stored_credentials(self) -> tuple[Optional[str], Optional[str]]:
        """Retrieve stored credentials from file."""
        # Force file storage for reliability
        return self._load_from_file()

    def delete_credentials(self) -> bool:
        """Remove credentials from keychain and file."""
        # Clean file
        try:
            if self.data_dir:
                cred_file = self.data_dir / "config" / ".credentials.json"
                if cred_file.exists():
                    cred_file.unlink()
        except Exception:
            pass

        try:
            import keyring
            import keyring.errors

            try:
                keyring.delete_password("PortfolioPrism", "tr_phone")
            except keyring.errors.PasswordDeleteError:
                pass
            try:
                keyring.delete_password("PortfolioPrism", "tr_pin")
            except keyring.errors.PasswordDeleteError:
                pass
            return True
        except Exception:
            return False

    def _save_to_file(self, phone: str, pin: str) -> bool:
        """Save credentials to a local JSON file (Dev Mode/Fallback)."""
        try:
            if not self.data_dir:
                self.data_dir = DATA_DIR

            config_dir = self.data_dir / "config"
            config_dir.mkdir(parents=True, exist_ok=True)
            cred_file = config_dir / ".credentials.json"

            # Simple encoding to avoid plain text staring at you
            import base64

            data = {
                "phone": base64.b64encode(phone.encode()).decode(),
                "pin": base64.b64encode(pin.encode()).decode(),
            }
            cred_file.write_text(json.dumps(data))
            return True
        except Exception:
            return False

    def _load_from_file(self) -> tuple[Optional[str], Optional[str]]:
        """Load credentials from local JSON file."""
        try:
            if not self.data_dir:
                self.data_dir = DATA_DIR

            cred_file = self.data_dir / "config" / ".credentials.json"
            if not cred_file.exists():
                return None, None

            import base64

            data = json.loads(cred_file.read_text())
            phone = base64.b64decode(data["phone"]).decode()
            pin = base64.b64decode(data["pin"]).decode()
            return phone, pin
        except Exception:
            return None, None
