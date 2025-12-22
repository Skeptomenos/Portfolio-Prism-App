#!/usr/bin/env python3
"""
Portfolio Prism Orchestrator
Unified CLI for building and developing the application.
"""

import sys
import os
import subprocess
import time
import hashlib
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

PROJECT_ROOT = Path(__file__).parent.parent.absolute()
PYTHON_DIR = PROJECT_ROOT / "src-tauri" / "python"
BINARIES_DIR = PROJECT_ROOT / "src-tauri" / "binaries"
HASH_FILE = PYTHON_DIR / ".last_build_hash"
SUFFIX = "-aarch64-apple-darwin"


def run_command(
    cmd: List[str],
    cwd: Optional[Path] = None,
    env: Optional[dict] = None,
    capture: bool = True,
):
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


def calculate_source_hash() -> str:
    relevant_files = []
    patterns = ["*.py", "*.spec", "*.sql", "pyproject.toml", "uv.lock"]

    for pattern in patterns:
        relevant_files.extend(list(PYTHON_DIR.glob(f"**/{pattern}")))

    relevant_files.sort()

    hasher = hashlib.sha256()
    for file_path in relevant_files:
        if any(
            part.startswith(".") for part in file_path.relative_to(PYTHON_DIR).parts
        ):
            continue

        try:
            with open(file_path, "rb") as f:
                hasher.update(str(file_path.relative_to(PYTHON_DIR)).encode())
                while chunk := f.read(8192):
                    hasher.update(chunk)
        except Exception:
            continue

    return hasher.hexdigest()


def build_python(force: bool = False):
    console.print(Panel.fit("[bold blue]Phase 1: Building Python Sidecar[/bold blue]"))

    current_hash = calculate_source_hash()
    if not force and HASH_FILE.exists():
        with open(HASH_FILE, "r") as f:
            last_hash = f.read().strip()
        if current_hash == last_hash:
            console.print("[green]✓ Python source unchanged. Skipping build.[/green]")
            console.print("[dim]  (Use --force to override)[/dim]\n")
            return True

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

        if force:
            task_clean = progress.add_task(
                "[cyan]Cleaning previous builds...", total=100
            )
            run_command(["rm", "-rf", "dist/", "build/"], cwd=PYTHON_DIR)
            progress.update(
                task_clean,
                completed=100,
                description="[green]✓ Previous builds cleaned",
            )
            pyinstaller_clean = []
        else:
            pyinstaller_clean = []

        specs = list(PYTHON_DIR.glob("*.spec"))
        num_specs = len(specs)
        task_overall = progress.add_task("[cyan]Overall Build Progress...", total=100)

        processes = []
        for i, spec in enumerate(specs):
            desc = f"  [cyan]↳ Building {spec.name}"
            log_file = PYTHON_DIR / f"build_{spec.name}.log"

            proc = subprocess.Popen(
                ["uv", "run", "pyinstaller", str(spec), "--noconfirm"]
                + pyinstaller_clean,
                cwd=PYTHON_DIR,
                stdout=open(log_file, "w"),
                stderr=subprocess.STDOUT,
                text=True,
            )
            processes.append((proc, spec, log_file))

        completed_count = 0
        while len(processes) > 0:
            for p in processes[:]:
                proc, spec, log_file = p
                ret = proc.poll()
                if ret is not None:
                    processes.remove(p)
                    completed_count += 1
                    if ret != 0:
                        console.print(
                            f"[red]Build failed for {spec.name}. Check {log_file.name}[/red]"
                        )
                        return False
                    else:
                        log_file.unlink()

                    progress.update(
                        task_overall, completed=(completed_count / num_specs) * 100
                    )
            time.sleep(0.5)

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

        task_verify = progress.add_task("[cyan]Verifying binaries...", total=100)
        verification_failed = False

        for target in BINARIES_DIR.glob(f"*{SUFFIX}"):
            if os.access(target, os.X_OK):
                try:
                    env = {**os.environ, "PRISM_DATA_DIR": "/tmp/prism-test"}
                    result = subprocess.run(
                        [str(target)],
                        input="",
                        capture_output=True,
                        text=True,
                        env=env,
                        timeout=5,
                    )
                    if '"status": "ready"' not in result.stdout:
                        console.print(
                            f"[yellow]⚠ WARNING: {target.name} may have startup issues[/yellow]"
                        )
                        verification_failed = True
                except subprocess.TimeoutExpired:
                    console.print(
                        f"[yellow]⚠ WARNING: {target.name} timed out during startup[/yellow]"
                    )
                    verification_failed = True
                except Exception as e:
                    console.print(f"[red]Error verifying {target.name}: {e}[/red]")
                    verification_failed = True

        if verification_failed:
            console.print("[red]Verification failed for some binaries.[/red]")
            return False

        progress.update(
            task_verify, completed=100, description="[green]✓ Binaries verified"
        )

    with open(HASH_FILE, "w") as f:
        f.write(current_hash)

    console.print("[bold green]✓ Python build complete![/bold green]\n")
    return True


def start_dev():
    console.print(
        Panel.fit("[bold magenta]Phase 2: Starting Tauri Dev Server[/bold magenta]")
    )

    env = {
        **os.environ,
        "RUST_LOG": "info,tauri_app_lib=info",
        "FORCE_COLOR": "1",
    }

    try:
        time.sleep(1)
        subprocess.run(
            ["npm", "run", "tauri", "dev"], cwd=PROJECT_ROOT, env=env, check=True
        )
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopping development server...[/yellow]")
    except subprocess.CalledProcessError:
        console.print("\n[red]Tauri dev server exited with error.[/red]")


def check_prerequisites():
    console.print(
        Panel.fit("[bold blue]System Check: Verifying Prerequisites[/bold blue]")
    )

    table = Table(show_header=True, header_style="bold cyan", box=None)
    table.add_column("Tool", style="dim", width=15)
    table.add_column("Status", width=10)
    table.add_column("Version", style="dim")

    tools = {
        "Python": ["python3", "--version"],
        "UV": ["uv", "--version"],
        "Node.js": ["node", "--version"],
        "NPM": ["npm", "--version"],
        "Rust/Cargo": ["cargo", "--version"],
    }

    all_ok = True
    for tool, cmd in tools.items():
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            version = result.stdout.strip().split("\n")[0]
            table.add_row(tool, "[green]OK[/green]", version)
        except (subprocess.CalledProcessError, FileNotFoundError):
            table.add_row(tool, "[red]MISSING[/red]", "Not found")
            all_ok = False

    console.print(table)
    if not all_ok:
        console.print(
            "[bold red]Error: Some prerequisites are missing. Please install them and try again.[/bold red]"
        )
        sys.exit(1)
    console.print("")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Portfolio Prism Orchestrator")
    parser.add_argument(
        "command", choices=["build", "dev", "all"], help="Command to run"
    )
    parser.add_argument("-f", "--force", action="store_true", help="Force rebuild")
    parser.add_argument(
        "--skip-check", action="store_true", help="Skip prerequisite check"
    )

    args = parser.parse_args()

    if not args.skip_check:
        check_prerequisites()

    if args.command == "build":
        build_python(force=args.force)
    elif args.command == "dev":
        start_dev()
    elif args.command == "all":
        if build_python(force=args.force):
            start_dev()


if __name__ == "__main__":
    main()
