"""
Trade Republic Authentication Module

Handles:
- 2FA login flow via TR daemon subprocess
- Session persistence via daemon (keychain storage)
- Token refresh and expiry handling via daemon
"""

import asyncio
import os
from pathlib import Path
from typing import Optional
from enum import Enum
import json
import sys
from dataclasses import dataclass

from .tr_bridge import TRBridge


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

    @property
    def state(self) -> AuthState:
        """Get current authentication state."""
        return self._state

    @property
    def is_authenticated(self) -> bool:
        """Check if we have a valid session."""
        return self._state == AuthState.AUTHENTICATED

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
            result = self.bridge.login(phone_number, pin)

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
            result = self.bridge.confirm_2fa(code)

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

    async def try_restore_session(self, phone_number: str) -> AuthResult:
        """
        Try to restore a previous session via daemon.

        Args:
            phone_number: Phone number to look up

        Returns:
            AuthResult with state AUTHENTICATED if session restored
        """
        try:
            status = self.bridge.get_status()

            if status.get("status") == "authenticated":
                self._state = AuthState.AUTHENTICATED
                self._phone_number = phone_number
                return AuthResult(
                    success=True,
                    state=AuthState.AUTHENTICATED,
                    message="Session restored from saved credentials.",
                    session_token="restored",
                )
            else:
                return AuthResult(
                    success=False,
                    state=AuthState.IDLE,
                    message="No valid saved session found. Please log in.",
                )

        except Exception as e:
            return AuthResult(
                success=False,
                state=AuthState.IDLE,
                message=f"Session restore check failed: {str(e)}",
            )

    def save_credentials(self, phone: str, pin: str) -> bool:
        """Securely save credentials to keychai (or file in dev)."""
        # Fix 26: Use file in dev/unfrozen mode to avoid OS keychain prompts
        is_frozen = getattr(sys, "frozen", False)
        if not is_frozen:
            return self._save_to_file(phone, pin)

        try:
            import keyring
            keyring.set_password("PortfolioPrism", "tr_phone", phone)
            keyring.set_password("PortfolioPrism", "tr_pin", pin)
            return True
        except Exception:
            # Fallback to file
            return self._save_to_file(phone, pin)

    def get_stored_credentials(self) -> tuple[Optional[str], Optional[str]]:
        """Retrieve stored credentials from keychain (or file)."""
        is_frozen = getattr(sys, "frozen", False)
        if not is_frozen:
            return self._load_from_file()

        try:
            import keyring
            phone = keyring.get_password("PortfolioPrism", "tr_phone")
            pin = keyring.get_password("PortfolioPrism", "tr_pin")
            if phone and pin:
                return phone, pin
            return self._load_from_file()
        except Exception:
            return self._load_from_file()

    def delete_credentials(self) -> bool:
        """Remove credentials from keychain and file."""
        # Clean file
        try:
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
                 from pathlib import Path
                 # Default if not set
                 self.data_dir = Path(os.getenv("PRISM_DATA_DIR", "~/.prism/data")).expanduser()
            
            config_dir = self.data_dir / "config"
            config_dir.mkdir(parents=True, exist_ok=True)
            cred_file = config_dir / ".credentials.json"
            
            # Simple encoding to avoid plain text staring at you
            import base64
            data = {
                "phone": base64.b64encode(phone.encode()).decode(),
                "pin": base64.b64encode(pin.encode()).decode()
            }
            cred_file.write_text(json.dumps(data))
            return True
        except Exception:
            return False

    def _load_from_file(self) -> tuple[Optional[str], Optional[str]]:
        """Load credentials from local JSON file."""
        try:
            if not self.data_dir:
                 from pathlib import Path
                 self.data_dir = Path(os.getenv("PRISM_DATA_DIR", "~/.prism/data")).expanduser()
                 
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


def run_async(coro):
    """Helper to run async code from sync context."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(coro)
