"""
Community Sync Module - Sync ETF holdings with GitHub community repository.

Two-way sync:
- Pull: Download latest community data from GitHub
- Push: Create PRs for new holdings contributions

Requires GITHUB_ISSUES_TOKEN env var for contributions.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

from prism_utils.logging_config import get_logger

logger = get_logger(__name__)

# GitHub repository info
GITHUB_OWNER = "Skeptomenos"
GITHUB_REPO = "Portfolio-Prism"
GITHUB_BRANCH = "main"
COMMUNITY_PATH = "community_data/etf_holdings"

# Local paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
LOCAL_COMMUNITY_DIR = PROJECT_ROOT / "community_data" / "etf_holdings"
SYNC_STATE_FILE = PROJECT_ROOT / "data" / "working" / ".sync_state.json"


class CommunitySync:
    """
    Sync community ETF holdings data with GitHub repository.

    Supports:
    - Pulling latest community data (no auth required)
    - Creating PRs for new contributions (requires token)
    """

    def __init__(self, github_token: Optional[str] = None):
        """
        Initialize the community sync.

        Args:
            github_token: GitHub PAT for contributions. If not provided,
                          reads from GITHUB_ISSUES_TOKEN env var.
        """
        self.github_token = github_token or os.getenv("GITHUB_ISSUES_TOKEN")
        self._sync_state = self._load_sync_state()
        self._base_raw_url = (
            f"https://raw.githubusercontent.com/{GITHUB_OWNER}/{GITHUB_REPO}"
            f"/{GITHUB_BRANCH}/{COMMUNITY_PATH}"
        )
        self._api_base = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}"

    def _load_sync_state(self) -> dict:
        """Load sync state from disk."""
        if SYNC_STATE_FILE.exists():
            try:
                return json.loads(SYNC_STATE_FILE.read_text())
            except Exception:
                pass
        return {"last_sync": None, "synced_files": []}

    def _save_sync_state(self) -> None:
        """Save sync state to disk."""
        SYNC_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        SYNC_STATE_FILE.write_text(json.dumps(self._sync_state, indent=2))

    def pull_community_data(self) -> dict:
        """
        Pull latest community data from GitHub.

        Downloads all ETF holdings CSVs and metadata.
        No authentication required for public repo.

        Returns:
            dict with sync results:
            - downloaded: list of ISINs downloaded
            - failed: list of ISINs that failed
            - skipped: list of ISINs already up-to-date
        """
        logger.info("Pulling community data from GitHub...")
        LOCAL_COMMUNITY_DIR.mkdir(parents=True, exist_ok=True)

        results = {"downloaded": [], "failed": [], "skipped": []}

        # First, get the metadata to know what files exist
        try:
            metadata = self._fetch_json(f"{self._base_raw_url}/_metadata.json")
        except Exception as e:
            logger.error(f"Failed to fetch metadata: {e}")
            return results

        # Download each ETF file
        for isin, info in metadata.items():
            if isin.startswith("_"):
                continue  # Skip stats entries

            local_file = LOCAL_COMMUNITY_DIR / f"{isin}.csv"

            # Check if we need to update
            if local_file.exists():
                # Compare timestamps
                local_mtime = datetime.fromtimestamp(local_file.stat().st_mtime)
                remote_time = info.get("cached_at")
                if remote_time:
                    try:
                        remote_mtime = datetime.fromisoformat(remote_time)
                        if local_mtime >= remote_mtime:
                            results["skipped"].append(isin)
                            continue
                    except Exception:
                        pass

            # Download the file
            try:
                csv_url = f"{self._base_raw_url}/{isin}.csv"
                content = self._fetch_text(csv_url)
                local_file.write_text(content)
                results["downloaded"].append(isin)
                logger.debug(f"Downloaded {isin}")
            except Exception as e:
                logger.warning(f"Failed to download {isin}: {e}")
                results["failed"].append(isin)

        # Save metadata locally
        try:
            metadata_file = LOCAL_COMMUNITY_DIR / "_metadata.json"
            metadata_file.write_text(json.dumps(metadata, indent=2, ensure_ascii=False))
        except Exception as e:
            logger.warning(f"Failed to save metadata: {e}")

        # Update sync state
        self._sync_state["last_sync"] = datetime.now().isoformat()
        self._sync_state["synced_files"] = results["downloaded"] + results["skipped"]
        self._save_sync_state()

        logger.info(
            f"Sync complete: {len(results['downloaded'])} downloaded, "
            f"{len(results['skipped'])} skipped, {len(results['failed'])} failed"
        )
        return results

    def create_contribution_pr(
        self,
        isin: str,
        csv_content: str,
        name: str,
        source: str = "user_contribution",
    ) -> Optional[str]:
        """
        Create a pull request to contribute new ETF holdings.

        Args:
            isin: The ETF ISIN
            csv_content: CSV content with holdings data
            name: ETF name for PR description
            source: Source of the data

        Returns:
            PR URL if successful, None if failed
        """
        if not self.github_token:
            logger.warning("No GitHub token available for contributions")
            return None

        logger.info(f"Creating PR to contribute {isin}...")

        try:
            # Step 1: Create a new branch
            branch_name = (
                f"community/add-{isin.lower()}-{datetime.now().strftime('%Y%m%d')}"
            )

            # Get the latest commit SHA from main
            main_ref = self._github_api(f"/git/refs/heads/{GITHUB_BRANCH}")
            base_sha = main_ref["object"]["sha"]

            # Create new branch
            try:
                self._github_api(
                    "/git/refs",
                    method="POST",
                    data={
                        "ref": f"refs/heads/{branch_name}",
                        "sha": base_sha,
                    },
                )
            except HTTPError as e:
                if e.code == 422:
                    # Branch already exists, that's fine
                    logger.debug(f"Branch {branch_name} already exists")
                else:
                    raise

            # Step 2: Create the file
            import base64

            file_path = f"{COMMUNITY_PATH}/{isin}.csv"
            encoded_content = base64.b64encode(csv_content.encode()).decode()

            # Check if file exists
            try:
                existing = self._github_api(f"/contents/{file_path}?ref={branch_name}")
                file_sha = existing["sha"]
            except HTTPError:
                file_sha = None

            file_data = {
                "message": f"Add ETF holdings for {isin}",
                "content": encoded_content,
                "branch": branch_name,
            }
            if file_sha:
                file_data["sha"] = file_sha

            self._github_api(f"/contents/{file_path}", method="PUT", data=file_data)

            # Step 3: Create the PR
            pr = self._github_api(
                "/pulls",
                method="POST",
                data={
                    "title": f"Add ETF holdings: {name} ({isin})",
                    "body": (
                        f"## Community Contribution\n\n"
                        f"Adding ETF holdings data for **{name}** ({isin}).\n\n"
                        f"- Source: {source}\n"
                        f"- Date: {datetime.now().strftime('%Y-%m-%d')}\n\n"
                        f"*Auto-generated by Portfolio Prism*"
                    ),
                    "head": branch_name,
                    "base": GITHUB_BRANCH,
                },
            )

            pr_url = pr["html_url"]
            logger.info(f"Created PR: {pr_url}")
            return pr_url

        except Exception as e:
            logger.error(f"Failed to create PR: {e}")
            return None

    def get_sync_stats(self) -> dict:
        """Get statistics about the sync state."""
        stats = {
            "last_sync": self._sync_state.get("last_sync"),
            "synced_count": len(self._sync_state.get("synced_files", [])),
            "local_count": 0,
            "can_contribute": bool(self.github_token),
        }

        # Count local files
        if LOCAL_COMMUNITY_DIR.exists():
            stats["local_count"] = len(list(LOCAL_COMMUNITY_DIR.glob("*.csv")))

        return stats

    def _fetch_text(self, url: str) -> str:
        """Fetch text content from URL."""
        req = Request(url)
        req.add_header("User-Agent", "Portfolio-Prism")
        with urlopen(req, timeout=30) as response:
            return response.read().decode("utf-8")

    def _fetch_json(self, url: str) -> dict:
        """Fetch JSON content from URL."""
        return json.loads(self._fetch_text(url))

    def _github_api(
        self,
        endpoint: str,
        method: str = "GET",
        data: Optional[dict] = None,
    ) -> dict:
        """Make a GitHub API request."""
        url = f"{self._api_base}{endpoint}"
        req = Request(url, method=method)
        req.add_header("User-Agent", "Portfolio-Prism")
        req.add_header("Accept", "application/vnd.github.v3+json")

        if self.github_token:
            req.add_header("Authorization", f"Bearer {self.github_token}")

        if data:
            req.add_header("Content-Type", "application/json")
            req.data = json.dumps(data).encode()

        try:
            with urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode())
        except HTTPError as e:
            # Re-raise with more context
            error_body = e.read().decode() if e.fp else ""
            logger.error(f"GitHub API error: {e.code} - {error_body}")
            raise


# Module-level singleton for convenience
_sync_instance: Optional[CommunitySync] = None


def get_community_sync() -> CommunitySync:
    """Get the singleton CommunitySync instance."""
    global _sync_instance
    if _sync_instance is None:
        _sync_instance = CommunitySync()
    return _sync_instance
