#!/usr/bin/env python3
"""
Import Path Fixer for Portfolio Prism

This script fixes the 'from src.' import paths that were left over from
the POC migration. The code is now in portfolio_src/ and prism_boot.py
adds that to sys.path, so imports should not have the 'src.' prefix.

Usage:
    python fix_imports.py --dry-run    # Show what would be changed
    python fix_imports.py --execute    # Actually make changes

Safety features:
    - Dry-run mode by default
    - Syntax validation after each file change
    - Full audit log of all changes
    - Can rollback via git checkout
"""

import re
import sys
import py_compile
from pathlib import Path
from typing import List, Tuple, Dict

# Configuration
PORTFOLIO_SRC = Path(__file__).parent.parent / "src-tauri" / "python" / "portfolio_src"

# Replacement patterns: (regex_pattern, replacement)
# Order matters - more specific patterns first
REPLACEMENTS = [
    # Module-specific imports (with trailing dot)
    (r"from src\.utils\.", "from utils."),
    (r"from src\.models\.", "from models."),
    (r"from src\.data\.", "from data."),
    (r"from src\.core\.", "from core."),
    (r"from src\.adapters\.", "from adapters."),
    (r"from src\.dashboard\.", "from dashboard."),
    (r"from src\.pdf_parser\.", "from pdf_parser."),
    # Direct module imports (no trailing dot)
    (r"from src\.config\b", "from config"),
    (r"from src\.models\b", "from models"),
    (r"from src\.utils\b", "from utils"),
]


def find_python_files(directory: Path) -> List[Path]:
    """Find all Python files in directory recursively."""
    return list(directory.rglob("*.py"))


def analyze_file(filepath: Path) -> List[Tuple[int, str, str, str]]:
    """
    Analyze a file for imports that need fixing.

    Returns list of (line_number, original_line, pattern_matched, replacement)
    """
    changes = []
    try:
        content = filepath.read_text()
        lines = content.split("\n")

        for i, line in enumerate(lines, 1):
            for pattern, replacement in REPLACEMENTS:
                if re.search(pattern, line):
                    new_line = re.sub(pattern, replacement, line)
                    changes.append((i, line.strip(), pattern, new_line.strip()))
                    break  # Only match first pattern per line
    except Exception as e:
        print(f"ERROR reading {filepath}: {e}")

    return changes


def fix_file(filepath: Path, dry_run: bool = True) -> Tuple[bool, List[str]]:
    """
    Fix imports in a single file.

    Returns (success, list_of_changes)
    """
    changes_made = []

    try:
        content = filepath.read_text()
        original_content = content

        for pattern, replacement in REPLACEMENTS:
            matches = re.findall(pattern, content)
            if matches:
                changes_made.append(
                    f"  {pattern} → {replacement} ({len(matches)} match(es))"
                )
                content = re.sub(pattern, replacement, content)

        if content != original_content:
            if not dry_run:
                filepath.write_text(content)
                # Validate syntax
                try:
                    py_compile.compile(str(filepath), doraise=True)
                except py_compile.PyCompileError as e:
                    # Rollback on syntax error
                    filepath.write_text(original_content)
                    return False, [f"SYNTAX ERROR - rolled back: {e}"]

            return True, changes_made

        return True, []

    except Exception as e:
        return False, [f"ERROR: {e}"]


def run_audit(directory: Path) -> Dict:
    """Run a full audit of all files."""
    results = {
        "total_files": 0,
        "files_with_issues": 0,
        "total_imports": 0,
        "by_pattern": {},
        "files": {},
    }

    for pattern, _ in REPLACEMENTS:
        results["by_pattern"][pattern] = 0

    files = find_python_files(directory)
    results["total_files"] = len(files)

    for filepath in files:
        changes = analyze_file(filepath)
        if changes:
            results["files_with_issues"] += 1
            results["total_imports"] += len(changes)
            results["files"][str(filepath.relative_to(directory))] = changes

            for _, _, pattern, _ in changes:
                results["by_pattern"][pattern] = (
                    results["by_pattern"].get(pattern, 0) + 1
                )

    return results


def print_audit_report(results: Dict):
    """Print a formatted audit report."""
    print("=" * 60)
    print("IMPORT AUDIT REPORT")
    print("=" * 60)
    print(f"\nTotal Python files scanned: {results['total_files']}")
    print(f"Files with 'from src.' imports: {results['files_with_issues']}")
    print(f"Total imports to fix: {results['total_imports']}")
    print("\nBy pattern:")
    for pattern, count in results["by_pattern"].items():
        if count > 0:
            print(f"  {pattern}: {count}")
    print("\n" + "-" * 60)
    print("FILES TO MODIFY:")
    print("-" * 60)

    for filepath, changes in sorted(results["files"].items()):
        print(f"\n{filepath}:")
        for line_num, original, pattern, new_line in changes:
            print(f"  Line {line_num}:")
            print(f"    - {original}")
            print(f"    + {new_line}")


def execute_fixes(directory: Path, dry_run: bool = True) -> Tuple[int, int]:
    """
    Execute fixes on all files.

    Returns (success_count, error_count)
    """
    files = find_python_files(directory)
    success_count = 0
    error_count = 0
    modified_count = 0

    mode = "DRY RUN" if dry_run else "EXECUTING"
    print(f"\n{'=' * 60}")
    print(f"{mode}: Processing {len(files)} files")
    print("=" * 60)

    for filepath in sorted(files):
        rel_path = filepath.relative_to(directory)
        success, changes = fix_file(filepath, dry_run)

        if changes:
            print(f"\n{rel_path}:")
            for change in changes:
                print(change)

            if success:
                modified_count += 1
            else:
                error_count += 1
                print("  *** ERROR - see above ***")

        if success:
            success_count += 1
        else:
            error_count += 1

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Files processed: {len(files)}")
    print(f"Files modified: {modified_count}")
    print(f"Errors: {error_count}")

    if dry_run:
        print("\nThis was a DRY RUN. No files were modified.")
        print("Run with --execute to apply changes.")
    else:
        print(
            "\nChanges applied successfully!"
            if error_count == 0
            else "\nSome errors occurred."
        )

    return success_count, error_count


def validate_imports(directory: Path) -> bool:
    """Verify no 'from src.' imports remain."""
    print("\n" + "=" * 60)
    print("VALIDATION: Checking for remaining 'from src.' imports")
    print("=" * 60)

    remaining = []
    for filepath in find_python_files(directory):
        try:
            content = filepath.read_text()
            for i, line in enumerate(content.split("\n"), 1):
                if re.search(r"from src\.", line):
                    remaining.append((filepath.relative_to(directory), i, line.strip()))
        except Exception as e:
            print(f"Error reading {filepath}: {e}")

    if remaining:
        print(f"\nFOUND {len(remaining)} remaining 'from src.' imports:")
        for path, line_num, line in remaining:
            print(f"  {path}:{line_num}: {line}")
        return False
    else:
        print("\nSUCCESS: No 'from src.' imports found!")
        return True


def test_imports(directory: Path) -> bool:
    """Test that key modules can be imported."""
    print("\n" + "=" * 60)
    print("VALIDATION: Testing module imports")
    print("=" * 60)

    # Add portfolio_src to path (simulating what prism_boot.py does)
    sys.path.insert(0, str(directory))

    test_imports = [
        ("config", "config"),
        ("utils.logging_config", "get_logger"),
        ("models", "Position"),
        ("data.caching", "cache_adapter_data"),
        ("core.health", "health"),
        ("adapters.registry", "AdapterRegistry"),
        ("dashboard.utils", "load_asset_universe"),
    ]

    success = True
    for module, symbol in test_imports:
        try:
            exec(f"from {module} import {symbol}")
            print(f"  OK: from {module} import {symbol}")
        except ImportError as e:
            print(f"  FAIL: from {module} import {symbol} - {e}")
            success = False
        except Exception as e:
            print(f"  WARN: from {module} import {symbol} - {e}")

    return success


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Fix 'from src.' imports in Portfolio Prism"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Show what would be changed (default)"
    )
    parser.add_argument("--execute", action="store_true", help="Actually make changes")
    parser.add_argument("--audit", action="store_true", help="Just show audit report")
    parser.add_argument(
        "--validate", action="store_true", help="Validate no src. imports remain"
    )
    parser.add_argument(
        "--test", action="store_true", help="Test module imports after fix"
    )

    args = parser.parse_args()

    if not PORTFOLIO_SRC.exists():
        print(f"ERROR: Directory not found: {PORTFOLIO_SRC}")
        sys.exit(1)

    print(f"Target directory: {PORTFOLIO_SRC}")

    if args.audit:
        results = run_audit(PORTFOLIO_SRC)
        print_audit_report(results)
    elif args.validate:
        success = validate_imports(PORTFOLIO_SRC)
        sys.exit(0 if success else 1)
    elif args.test:
        success = test_imports(PORTFOLIO_SRC)
        sys.exit(0 if success else 1)
    elif args.execute:
        success, errors = execute_fixes(PORTFOLIO_SRC, dry_run=False)
        if errors == 0:
            validate_imports(PORTFOLIO_SRC)
        sys.exit(0 if errors == 0 else 1)
    else:
        # Default to dry-run
        execute_fixes(PORTFOLIO_SRC, dry_run=True)


if __name__ == "__main__":
    main()
