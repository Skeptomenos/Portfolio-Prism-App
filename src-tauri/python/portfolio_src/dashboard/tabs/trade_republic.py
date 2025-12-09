"""
Trade Republic Tab - Login and Portfolio Sync

Provides:
- Trade Republic authentication (Web Login flow)
- Auto-sync on successful login
- Manual portfolio sync button

NOTE: All imports from core.tr_auth and data.tr_sync are done INSIDE functions (lazy imports).
This prevents pytr from initializing asyncio.Lock() at module load time,
which would fail in Streamlit's ScriptRunner thread.
"""

import streamlit as st
from pathlib import Path
import os


def _get_auth_manager():
    """Get or create the TRAuthManager instance with lazy import."""
    # Lazy import to avoid pytr asyncio initialization at module load
    from portfolio_src.core.tr_auth import TRAuthManager

    if "tr_auth_manager" not in st.session_state:
        data_dir = Path(os.getenv("PRISM_DATA_DIR", "~/.prism/data")).expanduser()
        st.session_state.tr_auth_manager = TRAuthManager(data_dir)
    return st.session_state.tr_auth_manager


def _sync_portfolio(auth_manager) -> tuple:
    """
    Sync portfolio from Trade Republic.

    Returns:
        (success: bool, message: str, positions: list|None) tuple
    """
    from portfolio_src.data.tr_sync import TRDataFetcher
    from portfolio_src.prism_utils.error_reporter import report_to_github
    from portfolio_src.dashboard.utils import HOLDINGS_PATH

    try:
        if not auth_manager.is_authenticated:
            return False, "Not authenticated. Please log in first.", None

        fetcher = TRDataFetcher(auth_manager.bridge)
        positions = fetcher.fetch_portfolio_sync()

        if not positions:
            return False, "No positions found in your Trade Republic portfolio.", None

        # Save to centralized data path (PRISM_DATA_DIR/data/working/)
        HOLDINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        count = fetcher.save_to_csv(positions, HOLDINGS_PATH)

        # Auto-populate universe with new positions
        try:
            from portfolio_src.data.state_manager import load_portfolio_state
            load_portfolio_state()  # This auto-adds unmapped ISINs to universe
        except Exception as e:
            # Don't fail sync if universe update fails - convert exception to error list
            error_data = [{"phase": "DATA_LOADING", "error_type": "UNKNOWN", "item": "universe_update", "message": str(e)}]
            report_to_github(error_data)

        return True, f"Successfully synced {count} positions!", positions

    except Exception as e:
        error_data = [{"phase": "DATA_LOADING", "error_type": "CRASH", "item": "sync_portfolio", "message": str(e)}]
        report_to_github(error_data)
        return False, f"Sync failed: {e}", None


def render():
    """Render the Trade Republic tab with login and sync functionality."""
    # Lazy imports to avoid pytr asyncio initialization at module load
    from portfolio_src.core.tr_auth import AuthState, run_async

    st.title("Trade Republic")
    st.markdown("Connect your Trade Republic account to sync your portfolio data.")
    st.markdown("---")

    # Try to restore session on first load
    if "session_checked" not in st.session_state:
        st.session_state.session_checked = True
        stored_phone = st.session_state.get("tr_phone")
        if stored_phone:
            auth_manager = _get_auth_manager()
            with st.spinner("Checking for saved session..."):
                result = run_async(auth_manager.try_restore_session(stored_phone))
                if result.success:
                    st.success("Session restored!")
                    st.rerun()

    auth_manager = _get_auth_manager()
    state = auth_manager.state

    # === AUTHENTICATED STATE ===
    if state == AuthState.AUTHENTICATED:
        st.success("Connected to Trade Republic")

        col1, col2 = st.columns([3, 1])
        with col1:
            phone = st.session_state.get("tr_phone", "Unknown")
            st.info(f"Account: {phone}")
        with col2:
            if st.button("Disconnect", type="secondary"):
                auth_manager.clear_credentials(st.session_state.get("tr_phone"))
                st.session_state.pop("tr_phone", None)
                st.session_state.pop("tr_just_synced", None)
                st.session_state.pop("tr_just_authenticated", None)
                st.rerun()
            
            if st.button("Forget Saved Info", type="secondary"):
                auth_manager.delete_credentials()
                auth_manager.clear_credentials(st.session_state.get("tr_phone"))
                st.session_state.pop("tr_phone", None)
                st.session_state.pop("tr_just_synced", None)
                st.session_state.pop("tr_just_authenticated", None)
                st.success("Credentials cleared.")
                st.rerun()

        st.markdown("---")

        # === SYNC SECTION ===
        st.subheader("Portfolio Sync")

        # Check if we just authenticated (trigger auto-sync)
        if st.session_state.get("tr_just_authenticated", False):
            st.session_state.tr_just_authenticated = False
            with st.spinner("Auto-syncing portfolio..."):
                success, message, positions = _sync_portfolio(auth_manager)
                if success:
                    st.success(message)
                    st.session_state.tr_just_synced = True
                    st.session_state.tr_last_positions = positions
                else:
                    st.error(message)

        # Manual sync button
        if st.button("Sync Portfolio Now", type="primary"):
            with st.spinner("Fetching portfolio from Trade Republic..."):
                success, message, positions = _sync_portfolio(auth_manager)
                if success:
                    st.success(message)
                    st.session_state.tr_just_synced = True
                    st.session_state.tr_last_positions = positions
                    st.balloons()
                else:
                    st.error(message)

        # Show sync summary if we have data
        if st.session_state.get("tr_just_synced") and st.session_state.get("tr_last_positions"):
            positions = st.session_state.tr_last_positions
            total_value = sum(p["net_value"] for p in positions)
            
            st.markdown("---")
            st.subheader("📊 Sync Summary")
            
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Total Value", f"€{total_value:,.2f}")
            with col2:
                st.metric("Positions", len(positions))
            with col3:
                total_cost = sum(p["avg_cost"] * p["quantity"] for p in positions)
                pl = total_value - total_cost
                st.metric("Unrealized P/L", f"€{pl:+,.2f}")
            
            # Top 5 positions
            with st.expander("Top 5 Positions", expanded=True):
                sorted_pos = sorted(positions, key=lambda x: x["net_value"], reverse=True)[:5]
                for pos in sorted_pos:
                    st.write(f"• {pos['name']}: €{pos['net_value']:,.2f}")
            
            st.info("✅ Your portfolio is ready! Switch to the **📈 Performance** tab to view detailed analytics.")

        st.markdown("---")
        st.subheader("🚀 True Exposure Analysis")
        st.write("Run the full analysis pipeline to decompose ETFs and enrich data.")

        if st.button("Run True Exposure Analysis", type="primary"):
            progress_bar = st.progress(0.0)
            status_text = st.empty()

            try:
                from portfolio_src.core.pipeline import Pipeline
                
                def update_progress(msg: str, pct: float):
                    progress_bar.progress(pct)
                    status_text.text(msg)

                pipeline = Pipeline(data_dir=auth_manager.data_dir)
                status_text.text("Starting pipeline...")
                
                # Run pipeline
                result = pipeline.run(progress_callback=update_progress)
                
                if result.success:
                    st.success(f"Analysis complete! Processed {result.etfs_processed} ETFs.")
                    if result.harvested_count > 0:
                        st.info(f"Learned {result.harvested_count} new securities.")
                    st.session_state["pipeline_result"] = result
                    st.session_state["pipeline_run_needed"] = False
                    st.balloons()
                else:
                    st.error("Pipeline failed. See errors below.")
                    if result.errors:
                        with st.expander("Error Details", expanded=True):
                            for err in result.errors:
                                st.error(f"**{err.phase.value}** - {err.item}: {err.message}")
                                if err.fix_hint:
                                    st.caption(f"💡 Hint: {err.fix_hint}")
                        
                        # Auto-report to GitHub
                        from portfolio_src.prism_utils.error_reporter import report_to_github
                        with st.spinner("Reporting issue..."):
                            reported = report_to_github(result.get_anonymized_errors())
                        if reported:
                            st.info("Issue automatically reported to help improve the app.")

            except Exception as e:
                from portfolio_src.prism_utils.error_reporter import report_to_github
                # Convert exception to list of dicts for report_to_github
                error_data = [{"phase": "UNKNOWN", "error_type": "CRASH", "item": "pipeline", "message": str(e)}]
                report_to_github(error_data)
                st.error(f"Pipeline execution crashed: {str(e)}")
            
            finally:
                progress_bar.empty()

        return

    # === NOT AUTHENTICATED - Show login form ===

    # Login form
    # Login form
    saved_phone, saved_pin = auth_manager.get_stored_credentials()
    
    with st.form("tr_login_form"):
        st.subheader("Step 1: Enter Credentials")

        phone = st.text_input(
            "Phone Number",
            value=saved_phone if saved_phone else "",
            placeholder="+49 123 456 7890",
            help="International format with country code",
        )

        pin = st.text_input(
            "PIN", 
            type="password", 
            max_chars=4, 
            value=saved_pin if saved_pin else "",
            help="Your 4-digit Trade Republic PIN"
        )

        request_code = st.form_submit_button("Request 2FA Code", type="primary")

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
                    # Save credentials securely
                    auth_manager.save_credentials(phone, pin)
                    st.success(result.message)
                    st.rerun()
                else:
                    st.error(result.message)

    # 2FA verification (only show if waiting for code)
    if state == AuthState.WAITING_FOR_2FA:
        st.markdown("---")

        with st.form("tr_2fa_form"):
            st.subheader("Step 2: Enter 2FA Code")
            st.info("Check your Trade Republic app for the verification code")

            code = st.text_input(
                "2FA Code",
                max_chars=4,
                help="4-digit code from your Trade Republic app",
            )

            verify = st.form_submit_button("Verify", type="primary")

        if verify:
            if not code or len(code) != 4 or not code.isdigit():
                st.error("Please enter a valid 4-digit code")
            else:
                with st.spinner("Verifying..."):
                    result = run_async(auth_manager.verify_2fa(code))

                    if result.success:
                        st.session_state.tr_just_authenticated = (
                            True  # Trigger auto-sync
                        )
                        st.success(result.message)
                        st.balloons()
                        st.rerun()
                    else:
                        st.error(result.message)

    # Error state
    if state == AuthState.ERROR:
        st.warning("There was an error. Please try again.")
        if st.button("Reset"):
            auth_manager.clear_credentials()
            st.rerun()

    # Help section
    with st.expander("Need Help?"):
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
        
        **After Login:**
        - Your portfolio will sync automatically
        - Use "Sync Portfolio Now" to refresh data anytime
        - View your portfolio in the Performance tab
        """)
