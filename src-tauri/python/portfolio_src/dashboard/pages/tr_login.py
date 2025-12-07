"""
Trade Republic Login Page

Streamlit page for Trade Republic 2FA authentication flow.
"""

import streamlit as st
from pathlib import Path
import os

# Import from core - prism_boot.py already sets up sys.path
from core.tr_auth import TRAuthManager, AuthState, run_async


def init_auth_manager():
    """Initialize or get existing auth manager from session state."""
    if "tr_auth_manager" not in st.session_state:
        data_dir = Path(os.getenv("PRISM_DATA_DIR", "~/.prism/data")).expanduser()
        st.session_state.tr_auth_manager = TRAuthManager(data_dir)
    return st.session_state.tr_auth_manager


def render_login_ui():
    """Render the Trade Republic login interface."""
    st.title("🔐 Trade Republic Login")
    st.markdown("---")
    
    auth_manager = init_auth_manager()
    
    # Show current status
    state = auth_manager.state
    
    if state == AuthState.AUTHENTICATED:
        st.success("✅ Connected to Trade Republic!")
        st.info(f"Phone: {st.session_state.get('tr_phone', 'Unknown')}")
        
        if st.button("🚪 Disconnect", type="secondary"):
            auth_manager.clear_credentials(st.session_state.get('tr_phone'))
            st.session_state.pop('tr_phone', None)
            st.rerun()
        
        return
    
    # Login form
    with st.form("tr_login_form"):
        st.subheader("Step 1: Enter Credentials")
        
        phone = st.text_input(
            "Phone Number",
            placeholder="+49 123 456 7890",
            help="International format with country code"
        )
        
        pin = st.text_input(
            "PIN",
            type="password",
            max_chars=4,
            help="Your 4-digit Trade Republic PIN"
        )
        
        request_code = st.form_submit_button("📲 Request 2FA Code", type="primary")
    
    # Handle 2FA request
    if request_code:
        if not phone or not pin:
            st.error("Please enter both phone number and PIN")
        elif len(pin) != 4 or not pin.isdigit():
            st.error("PIN must be exactly 4 digits")
        else:
            with st.spinner("Sending 2FA request to Trade Republic..."):
                result = run_async(auth_manager.request_2fa(phone, pin))
                
                if result.success:
                    st.session_state.tr_phone = phone
                    st.success(result.message)
                    st.rerun()
                else:
                    st.error(result.message)
    
    # 2FA verification (only show if waiting for code)
    if state == AuthState.WAITING_FOR_2FA:
        st.markdown("---")
        
        with st.form("tr_2fa_form"):
            st.subheader("Step 2: Enter 2FA Code")
            st.info("📱 Check your Trade Republic app for the verification code")
            
            code = st.text_input(
                "2FA Code",
                max_chars=4,
                help="4-digit code from your Trade Republic app"
            )
            
            verify = st.form_submit_button("✅ Verify", type="primary")
        
        if verify:
            if not code or len(code) != 4 or not code.isdigit():
                st.error("Please enter a valid 4-digit code")
            else:
                with st.spinner("Verifying..."):
                    result = run_async(auth_manager.verify_2fa(code))
                    
                    if result.success:
                        st.success(result.message)
                        st.balloons()
                        st.rerun()
                    else:
                        st.error(result.message)
    
    # Error state
    if state == AuthState.ERROR:
        st.warning("There was an error. Please try again.")
        if st.button("🔄 Reset"):
            auth_manager.clear_credentials()
            st.rerun()
    
    # Help section
    with st.expander("ℹ️ Need Help?"):
        st.markdown("""
        **How to log in:**
        1. Enter your phone number in international format (e.g., +49 123 456 7890)
        2. Enter your 4-digit Trade Republic PIN
        3. Click "Request 2FA Code"
        4. Open your Trade Republic app and look for a login request
        5. Enter the 4-digit code shown in the app
        
        **Security:**
        - Your credentials are stored securely in your system's keychain
        - We never store your PIN - only the session token
        - You can disconnect at any time
        """)


# Main entry point for Streamlit multipage
if __name__ == "__main__":
    render_login_ui()
