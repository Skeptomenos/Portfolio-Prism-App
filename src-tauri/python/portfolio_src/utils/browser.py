# src/utils/browser.py
"""
Shared Playwright browser utilities for ETF data scraping.

This module provides a reusable browser context manager and helper functions
for common tasks like cookie consent handling, file downloads, and network
interception.

Usage:
    from src.utils.browser import BrowserContext, handle_cookie_consent

    with BrowserContext(headless=True) as ctx:
        page = ctx.new_page()
        page.goto("https://example.com")
        handle_cookie_consent(page)
        # ... scraping logic
"""

import os
from typing import Optional, Callable, List, Dict, Any
from contextlib import contextmanager
from pathlib import Path

from src.utils.logging_config import get_logger
from src.config import RAW_DOWNLOADS_DIR

logger = get_logger(__name__)

# Ensure download directory exists
Path(RAW_DOWNLOADS_DIR).mkdir(parents=True, exist_ok=True)


class PlaywrightNotInstalledError(Exception):
    """Raised when Playwright or its browser is not installed."""

    pass


@contextmanager
def BrowserContext(
    headless: bool = True,
    locale: str = "de-DE",
    timeout: int = 30000,
    download_dir: Optional[str] = None,
):
    """
    Context manager for Playwright browser sessions.

    Args:
        headless: Run browser in headless mode (default: True)
        locale: Browser locale for language settings (default: "de-DE")
        timeout: Default timeout in milliseconds (default: 30000)
        download_dir: Directory for file downloads (default: RAW_DOWNLOADS_DIR)

    Yields:
        Playwright BrowserContext object

    Example:
        with BrowserContext() as ctx:
            page = ctx.new_page()
            page.goto("https://example.com")
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise PlaywrightNotInstalledError(
            "Playwright is not installed. Install with:\n"
            "  pip install playwright\n"
            "  playwright install chromium"
        )

    download_path = download_dir or RAW_DOWNLOADS_DIR

    playwright = None
    browser = None
    context = None

    try:
        logger.info("Starting Playwright browser...")
        playwright = sync_playwright().start()

        try:
            browser = playwright.chromium.launch(
                headless=headless,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-extensions",
                ],
            )
        except Exception as e:
            if "Executable doesn't exist" in str(e):
                raise PlaywrightNotInstalledError(
                    "Chromium browser not installed. Run:\n"
                    "  playwright install chromium"
                )
            raise

        context = browser.new_context(
            locale=locale,
            accept_downloads=True,
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        context.set_default_timeout(timeout)

        # Store download path in context for later use
        context._download_path = download_path  # type: ignore

        logger.info("Browser context ready.")
        yield context

    except PlaywrightNotInstalledError:
        raise
    except Exception as e:
        logger.error(f"Browser error: {e}")
        raise
    finally:
        if context:
            context.close()
        if browser:
            browser.close()
        if playwright:
            playwright.stop()
        logger.info("Browser closed.")


def handle_cookie_consent(page, timeout: int = 5000) -> bool:
    """
    Attempts to handle common cookie consent dialogs.

    Args:
        page: Playwright page object
        timeout: Max time to wait for consent dialog (ms)

    Returns:
        True if consent was handled, False otherwise
    """
    # Common cookie consent button selectors (German and English)
    consent_selectors = [
        # German
        "button:has-text('Alle akzeptieren')",
        "button:has-text('Alle annehmen')",
        "button:has-text('Akzeptieren')",
        "button:has-text('Zustimmen')",
        # English
        "button:has-text('Accept All')",
        "button:has-text('Accept all')",
        "button:has-text('Accept')",
        "button:has-text('I agree')",
        # Common IDs
        "#onetrust-accept-btn-handler",
        "#accept-cookies",
        ".cookie-accept",
        "[data-testid='cookie-accept']",
    ]

    for selector in consent_selectors:
        try:
            button = page.locator(selector).first
            if button.is_visible(timeout=timeout):
                button.click()
                logger.info(f"Cookie consent handled with: {selector}")
                page.wait_for_timeout(500)  # Brief pause after clicking
                return True
        except Exception:
            continue

    logger.debug("No cookie consent dialog found or already dismissed.")
    return False


def wait_for_download(page, click_action: Callable, timeout: int = 30000) -> str:
    """
    Waits for a file download triggered by an action.

    Args:
        page: Playwright page object
        click_action: Callable that triggers the download (e.g., lambda: page.click(...))
        timeout: Max time to wait for download (ms)

    Returns:
        Path to the downloaded file

    Example:
        filepath = wait_for_download(
            page,
            lambda: page.click("a:has-text('Download')")
        )
    """
    download_path = getattr(page.context, "_download_path", RAW_DOWNLOADS_DIR)

    with page.expect_download(timeout=timeout) as download_info:
        click_action()

    download = download_info.value
    filename = download.suggested_filename
    filepath = os.path.join(download_path, filename)

    download.save_as(filepath)
    logger.info(f"Downloaded file: {filepath}")

    return filepath


def intercept_api_calls(
    page,
    navigation_action: Callable,
    filter_pattern: Optional[str] = None,
    timeout: int = 10000,
) -> List[Dict[str, Any]]:
    """
    Intercepts network requests during a navigation action.

    Useful for discovering hidden API endpoints.

    Args:
        page: Playwright page object
        navigation_action: Callable that triggers navigation
        filter_pattern: Optional regex pattern to filter URLs
        timeout: Time to wait after navigation for requests (ms)

    Returns:
        List of captured API call details

    Example:
        apis = intercept_api_calls(
            page,
            lambda: page.click("button:has-text('Load Data')"),
            filter_pattern="api|json"
        )
    """
    import re

    captured_calls: List[Dict[str, Any]] = []

    def on_response(response):
        url = response.url
        content_type = response.headers.get("content-type", "")

        # Check if this looks like an API call
        is_api = (
            "json" in content_type
            or "api" in url.lower()
            or response.request.resource_type in ["xhr", "fetch"]
        )

        if is_api:
            if filter_pattern and not re.search(filter_pattern, url, re.IGNORECASE):
                return

            try:
                body = response.text() if response.ok else None
            except Exception:
                body = None

            captured_calls.append(
                {
                    "url": url,
                    "method": response.request.method,
                    "status": response.status,
                    "content_type": content_type,
                    "body_preview": body[:500] if body else None,
                }
            )

    page.on("response", on_response)

    try:
        navigation_action()
        page.wait_for_timeout(timeout)
    finally:
        page.remove_listener("response", on_response)

    logger.info(f"Captured {len(captured_calls)} API calls.")
    return captured_calls


def save_debug_screenshot(page, name: str) -> str:
    """
    Saves a debug screenshot.

    Args:
        page: Playwright page object
        name: Base name for the screenshot file

    Returns:
        Path to the saved screenshot
    """
    screenshot_dir = os.path.join(RAW_DOWNLOADS_DIR, "debug_screenshots")
    os.makedirs(screenshot_dir, exist_ok=True)

    filepath = os.path.join(screenshot_dir, f"{name}.png")
    page.screenshot(path=filepath, full_page=True)
    logger.info(f"Debug screenshot saved: {filepath}")

    return filepath


def scroll_to_load_all(
    page, container_selector: str = "body", max_scrolls: int = 10
) -> int:
    """
    Scrolls a container to trigger lazy loading of content.

    Args:
        page: Playwright page object
        container_selector: CSS selector for the scrollable container
        max_scrolls: Maximum number of scroll attempts

    Returns:
        Number of scrolls performed
    """
    scroll_count = 0
    previous_height = 0

    for i in range(max_scrolls):
        # Get current scroll height
        current_height = page.evaluate(
            f"document.querySelector('{container_selector}').scrollHeight"
        )

        if current_height == previous_height:
            logger.debug(f"Scroll complete after {scroll_count} scrolls.")
            break

        # Scroll to bottom
        page.evaluate(
            f"document.querySelector('{container_selector}').scrollTo(0, "
            f"document.querySelector('{container_selector}').scrollHeight)"
        )
        page.wait_for_timeout(1000)  # Wait for lazy load

        previous_height = current_height
        scroll_count += 1

    return scroll_count
