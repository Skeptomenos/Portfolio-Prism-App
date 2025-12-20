#!/usr/bin/env python3
"""
Portfolio Prism Orchestrator
Unified CLI for building and developing the application.
"""

import sys
import os
import subprocess
import time
from pathlib import Path
from typing import List, Optional, Any

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.progress import (
        Progress,
        SpinnerColumn,
        TextColumn,
        BarColumn,
        TaskProgressColumn,
    )
    from rich.table import Table
    from rich.live import Live
    from rich.text import Text
except ImportError:
    print(
        "Error: 'rich' library not found. Please run 'cd src-tauri/python && uv sync'"
    )
    sys.exit(1)

console = Console()

# Configuration
PROJECT_ROOT = Path(__file__).parent.parent.absolute()
PYTHON_DIR = PROJECT_ROOT / "src-tauri" / "python"
BINARIES_DIR = PROJECT_ROOT / "src-tauri" / "binaries"
SUFFIX = "-aarch64-apple-darwin"  # Hardcoded for now


def run_command(
    cmd: List[str],
    cwd: Optional[Path] = None,
    env: Optional[dict] = None,
    capture: bool = True,
):
    """Run a command and return success status."""
    try:
        if capture:
            result = subprocess.run(
                cmd,
                cwd=cwd,
                env={**os.environ, **(env or {})},
                capture_output=True,
                text=True,
                check=True,
            )
            return True, result.stdout
        else:
            subprocess.run(cmd, cwd=cwd, env={**os.environ, **(env or {})}, check=True)
            return True, ""
    except subprocess.CalledProcessError as e:
        return False, e.stderr or e.stdout or str(e)


def run_command_live(
    cmd: List[str],
    progress: Progress,
    task_id: Any,
    base_description: str,
    cwd: Optional[Path] = None,
    milestones: Optional[dict] = None,
    progress_offset: float = 0.0,
    progress_scale: float = 1.0,
):
    try:
        process = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=os.environ,
        )

        last_milestone_pct = 0
        if process.stdout is not None:
            for line in process.stdout:
                line = line.strip()
                if not line:
                    continue

                display_line = line if len(line) < 60 else f"...{line[-57:]}"
                progress.update(
                    task_id,
                    description=f"{base_description} [dim]({display_line})[/dim]",
                )

                if milestones:
                    for trigger, pct in milestones.items():
                        if trigger in line and pct > last_milestone_pct:
                            last_milestone_pct = pct
                            actual_pct = progress_offset + (pct * progress_scale)
                            progress.update(task_id, completed=actual_pct)

        return_code = process.wait()
        if return_code != 0:
            return False, f"Command failed with exit code {return_code}"

        progress.update(task_id, completed=progress_offset + (100 * progress_scale))
        return True, ""
    except Exception as e:
        return False, str(e)


def build_python():
    console.print(Panel.fit("[bold blue]Phase 1: Building Python Sidecar[/bold blue]"))

    pyinstaller_milestones = {
        "checking Analysis": 10,
        "Analyzing modules": 20,
        "Analyzing hidden import": 40,
        "checking PYZ": 60,
        "checking PKG": 70,
        "checking EXE": 90,
        "completed successfully": 100,
    }

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
        expand=True,
    ) as progress:
        task_sync = progress.add_task("[cyan]Syncing dependencies (UV)...", total=100)
        success, err = run_command_live(
            ["uv", "sync"],
            progress,
            task_sync,
            "[cyan]Syncing dependencies (UV)",
            cwd=PYTHON_DIR,
        )
        if not success:
            console.print(f"[red]Sync failed:[/red]\n{err}")
            return False
        progress.update(task_sync, description="[green]✓ Dependencies synced")

        task_clean = progress.add_task("[cyan]Cleaning previous builds...", total=100)
        run_command(["rm", "-rf", "dist/", "build/"], cwd=PYTHON_DIR)
        progress.update(
            task_clean, completed=100, description="[green]✓ Previous builds cleaned"
        )

        specs = list(PYTHON_DIR.glob("*.spec"))
        num_specs = len(specs)
        task_overall = progress.add_task("[cyan]Overall Build Progress...", total=100)

        for i, spec in enumerate(specs):
            desc = f"  [cyan]↳ Building {spec.name}"
            offset = (i / num_specs) * 100
            scale = 1.0 / num_specs

            success, err = run_command_live(
                ["uv", "run", "pyinstaller", str(spec), "--noconfirm", "--clean"],
                progress,
                task_overall,
                desc,
                cwd=PYTHON_DIR,
                milestones=pyinstaller_milestones,
                progress_offset=offset,
                progress_scale=scale,
            )

            if not success:
                console.print(f"[red]Build failed for {spec.name}:[/red]\n{err}")
                return False

        progress.update(task_overall, description="[green]✓ All binaries built")

        task_copy = progress.add_task("[cyan]Deploying binaries...", total=100)
        BINARIES_DIR.mkdir(parents=True, exist_ok=True)
        dist_dir = PYTHON_DIR / "dist"
        for artifact in dist_dir.iterdir():
            target = BINARIES_DIR / f"{artifact.name}{SUFFIX}"
            if artifact.is_dir():
                subprocess.run(["cp", "-r", str(artifact), str(target)], check=True)
            else:
                subprocess.run(["cp", str(artifact), str(target)], check=True)
        progress.update(
            task_copy, completed=100, description="[green]✓ Binaries deployed"
        )

    console.print("[bold green]✓ Python build complete![/bold green]\n")
    return True


def start_dev():
    """Start the Tauri development server with clean output."""
    console.print(
        Panel.fit("[bold magenta]Phase 2: Starting Tauri Dev Server[/bold magenta]")
    )

    # Environment variables to help with logging
    env = {
        **os.environ,
        "RUST_LOG": "info,tauri_app_lib=info",  # Ensure our lib logs at info
        "FORCE_COLOR": "1",
    }

    try:
        # We use a simple subprocess run for dev to keep interactivity and colors
        # but we add a small delay to let the user read the header
        time.sleep(1)
        subprocess.run(
            ["npm", "run", "tauri", "dev"], cwd=PROJECT_ROOT, env=env, check=True
        )
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopping development server...[/yellow]")
    except subprocess.CalledProcessError:
        console.print("\n[red]Tauri dev server exited with error.[/red]")


def main():
    if len(sys.argv) < 2:
        console.print(
            "[bold red]Usage:[/bold red] python scripts/prism.py [build|dev|all]"
        )
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "build":
        build_python()
    elif command == "dev":
        start_dev()
    elif command == "all":
        if build_python():
            start_dev()
    else:
        console.print(f"[bold red]Unknown command:[/bold red] {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
