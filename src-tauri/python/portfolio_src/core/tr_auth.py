"""
Trade Republic Authentication Module

Handles:
- 2FA login flow using pytr
- Session storage using keyring (macOS Keychain / Windows Credential Manager)
- Token refresh and expiry handling
"""

import os
import json
import asyncio
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Tuple
from enum import Enum
from dataclasses import dataclass

try:
    import keyring
    KEYRING_AVAILABLE = True
except ImportError:
    KEYRING_AVAILABLE = False

try:
    from pytr.api import Api as TRApi
    PYTR_AVAILABLE = True
except ImportError:
    PYTR_AVAILABLE = False


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
    Manages Trade Republic authentication.
    
    Uses pytr for the login flow and keyring for secure credential storage.
    """
    
    SERVICE_NAME = "PortfolioPrism-TR"
    
    def __init__(self, data_dir: Optional[Path] = None):
        """
        Initialize the auth manager.
        
        Args:
            data_dir: Directory for storing session data (fallback if keyring unavailable)
        """
        self.data_dir = data_dir or Path(os.getenv("PRISM_DATA_DIR", "~/.prism/data")).expanduser()
        self.auth_dir = self.data_dir / "auth"
        self.auth_dir.mkdir(parents=True, exist_ok=True)
        
        self._state = AuthState.IDLE
        self._api: Optional[TRApi] = None
        self._phone_number: Optional[str] = None
        self._pin: Optional[str] = None
        
    @property
    def state(self) -> AuthState:
        return self._state
    
    @property
    def is_authenticated(self) -> bool:
        """Check if we have a valid session."""
        return self._state == AuthState.AUTHENTICATED and self._api is not None
    
    def _get_session_file(self) -> Path:
        """Get path to session file (fallback storage)."""
        return self.auth_dir / "tr_session.json"
    
    def _store_credentials(self, phone: str, session_data: dict) -> bool:
        """
        Store credentials securely.
        
        Uses keyring if available, falls back to file storage.
        """
        if KEYRING_AVAILABLE:
            try:
                keyring.set_password(self.SERVICE_NAME, phone, json.dumps(session_data))
                return True
            except Exception as e:
                print(f"Keyring storage failed: {e}, falling back to file")
        
        # Fallback to file storage
        try:
            session_file = self._get_session_file()
            session_file.write_text(json.dumps({
                "phone": phone,
                "session": session_data,
                "stored_at": datetime.now().isoformat()
            }))
            return True
        except Exception as e:
            print(f"File storage failed: {e}")
            return False
    
    def _load_credentials(self, phone: str) -> Optional[dict]:
        """
        Load stored credentials.
        
        Args:
            phone: Phone number to look up
            
        Returns:
            Session data dict if found, None otherwise
        """
        if KEYRING_AVAILABLE:
            try:
                data = keyring.get_password(self.SERVICE_NAME, phone)
                if data:
                    return json.loads(data)
            except Exception as e:
                print(f"Keyring load failed: {e}")
        
        # Fallback to file
        try:
            session_file = self._get_session_file()
            if session_file.exists():
                data = json.loads(session_file.read_text())
                if data.get("phone") == phone:
                    return data.get("session")
        except Exception as e:
            print(f"File load failed: {e}")
        
        return None
    
    def clear_credentials(self, phone: Optional[str] = None) -> bool:
        """Clear stored credentials."""
        success = True
        
        if KEYRING_AVAILABLE and phone:
            try:
                keyring.delete_password(self.SERVICE_NAME, phone)
            except Exception:
                pass
        
        # Also clear file
        try:
            session_file = self._get_session_file()
            if session_file.exists():
                session_file.unlink()
        except Exception:
            success = False
        
        self._state = AuthState.IDLE
        self._api = None
        return success
    
    async def request_2fa(self, phone_number: str, pin: str) -> AuthResult:
        """
        Start the 2FA login process.
        
        This sends a push notification to the user's Trade Republic mobile app.
        
        Args:
            phone_number: Phone number in international format (e.g., +49123456789)
            pin: 4-digit PIN
            
        Returns:
            AuthResult with state WAITING_FOR_2FA if successful
        """
        if not PYTR_AVAILABLE:
            self._state = AuthState.ERROR
            return AuthResult(
                success=False,
                state=AuthState.ERROR,
                message="pytr library not installed. Install with: pip install pytr"
            )
        
        self._state = AuthState.REQUESTING
        self._phone_number = phone_number
        self._pin = pin
        
        try:
            # Initialize pytr API
            self._api = TRApi(
                phone_no=phone_number,
                pin=pin,
                keyfile=str(self.auth_dir / "tr_keyfile.pem")
            )
            
            # This triggers the 2FA push notification
            await self._api.login()
            
            self._state = AuthState.WAITING_FOR_2FA
            return AuthResult(
                success=True,
                state=AuthState.WAITING_FOR_2FA,
                message="2FA code sent to your Trade Republic app. Please enter it."
            )
            
        except Exception as e:
            self._state = AuthState.ERROR
            error_msg = str(e)
            
            # Parse common errors
            if "invalid" in error_msg.lower() and "pin" in error_msg.lower():
                error_msg = "Invalid PIN. Please check and try again."
            elif "phone" in error_msg.lower():
                error_msg = "Invalid phone number format. Use international format (e.g., +49123456789)."
            
            return AuthResult(
                success=False,
                state=AuthState.ERROR,
                message=error_msg
            )
    
    async def verify_2fa(self, code: str) -> AuthResult:
        """
        Verify the 2FA code and complete login.
        
        Args:
            code: 4-digit code from Trade Republic app
            
        Returns:
            AuthResult with state AUTHENTICATED if successful
        """
        if self._state != AuthState.WAITING_FOR_2FA or self._api is None:
            return AuthResult(
                success=False,
                state=AuthState.ERROR,
                message="Please request 2FA first."
            )
        
        self._state = AuthState.VERIFYING
        
        try:
            # Complete the login with 2FA code
            await self._api.complete_login(code)
            
            # Store session for future use
            if self._phone_number:
                session_data = {
                    "session_token": getattr(self._api, 'session_token', None),
                    "authenticated_at": datetime.now().isoformat()
                }
                self._store_credentials(self._phone_number, session_data)
            
            self._state = AuthState.AUTHENTICATED
            return AuthResult(
                success=True,
                state=AuthState.AUTHENTICATED,
                message="Successfully authenticated with Trade Republic!",
                session_token=getattr(self._api, 'session_token', None)
            )
            
        except Exception as e:
            self._state = AuthState.ERROR
            error_msg = str(e)
            
            if "invalid" in error_msg.lower() or "wrong" in error_msg.lower():
                error_msg = "Invalid 2FA code. Please try again."
                self._state = AuthState.WAITING_FOR_2FA  # Allow retry
            
            return AuthResult(
                success=False,
                state=self._state,
                message=error_msg
            )
    
    async def try_restore_session(self, phone_number: str) -> AuthResult:
        """
        Try to restore a previous session.
        
        Args:
            phone_number: Phone number to look up
            
        Returns:
            AuthResult with state AUTHENTICATED if session still valid
        """
        session_data = self._load_credentials(phone_number)
        
        if not session_data:
            return AuthResult(
                success=False,
                state=AuthState.IDLE,
                message="No saved session found. Please log in."
            )
        
        # TODO: Validate session is still active
        # For now, just mark as authenticated
        self._state = AuthState.AUTHENTICATED
        self._phone_number = phone_number
        
        return AuthResult(
            success=True,
            state=AuthState.AUTHENTICATED,
            message="Session restored from saved credentials.",
            session_token=session_data.get("session_token")
        )


def run_async(coro):
    """Helper to run async code from sync context."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(coro)
