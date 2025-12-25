import os
import re
import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
KEYSTONE_DIR = PROJECT_ROOT / "keystone"
PROJECT_DIR = KEYSTONE_DIR / "project"
WORKSTREAMS_DIR = PROJECT_DIR / "workstreams"
REGISTRY_FILE = WORKSTREAMS_DIR / "registry.md"
BOARD_FILE = PROJECT_DIR / "board.md"

# Task ID pattern: PREFIX-NNN or PREFIX-SUBPREFIX-NNN (e.g., HIVE-001, TASK-LOG-001)
TASK_PATTERN = re.compile(r"- \[([ xX])\] \*\*([A-Z]+-(?:[A-Z]+-)?[0-9]+)(.*?)\*\*(.*)")
STATUS_PATTERN = re.compile(
    r"Status:?\s*\*?\*?(.*?)\*?\*?\s*$", re.MULTILINE | re.IGNORECASE
)
DEPENDENCY_PATTERN = re.compile(
    r"Dependencies:?\s*\*?\*?(.*?)\*?\*?\s*$", re.MULTILINE | re.IGNORECASE
)
WORKSTREAM_PATTERN = re.compile(
    r"Workstream:?\s*\*?\*?(.*?)\*?\*?\s*$", re.MULTILINE | re.IGNORECASE
)


class Task:
    def __init__(
        self, task_id, title, completed, status, dependencies, workstream, source_file
    ):
        self.id = task_id
        self.title = title.strip()
        self.completed = completed
        self.status = status.strip() if status else "Open"
        self.dependencies = (
            [d.strip() for d in dependencies.split(",") if d.strip().lower() != "none"]
            if dependencies
            else []
        )
        self.workstream = workstream.strip() if workstream else "main"
        self.source_file = source_file

    def is_blocked(self, all_tasks):
        if not self.dependencies:
            return False
        for dep_id in self.dependencies:
            dep_task = all_tasks.get(dep_id)
            if not dep_task or dep_task.status.lower() != "done":
                return True
        return False


def parse_task_file(file_path):
    tasks = []
    if not file_path.exists():
        return tasks

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    task_section_match = re.search(
        r"^## [^\n]*Tasks[^\n]*\n(.*?)(?=\n## |\Z)",
        content,
        re.DOTALL | re.IGNORECASE | re.MULTILINE,
    )

    if task_section_match:
        content_to_parse = task_section_match.group(1)
    else:
        content_to_parse = content

    matches = list(TASK_PATTERN.finditer(content_to_parse))

    for i, match in enumerate(matches):
        completed_mark = match.group(1)
        task_id = match.group(2)

        title_in = match.group(3).strip(": ")
        title_out = match.group(4).strip()
        title = title_in if title_in else title_out
        title = title.strip("*").strip()
        title = title.split(" — ")[0].strip()

        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content_to_parse)
        block = content_to_parse[start:end]

        status_match = STATUS_PATTERN.search(block)
        dep_match = DEPENDENCY_PATTERN.search(block)
        ws_match = WORKSTREAM_PATTERN.search(block)

        status = status_match.group(1) if status_match else "Open"
        if completed_mark.lower() == "x" and status.lower() != "done":
            status = "Done"

        tasks.append(
            Task(
                task_id=task_id,
                title=title,
                completed=(completed_mark.lower() == "x"),
                status=status,
                dependencies=dep_match.group(1) if dep_match else None,
                workstream=ws_match.group(1) if ws_match else None,
                source_file=file_path.relative_to(PROJECT_ROOT),
            )
        )
    return tasks


def get_registry_info():
    registry = []
    if not REGISTRY_FILE.exists():
        return registry

    with open(REGISTRY_FILE, "r", encoding="utf-8") as f:
        lines = f.readlines()

    for line in lines:
        if "|" in line and "Workstream" not in line and "---" not in line:
            parts = [p.strip() for p in line.split("|") if p.strip()]
            if len(parts) >= 4:
                registry.append(
                    {
                        "name": parts[0],
                        "plan": parts[1],
                        "session": parts[2],
                        "status": parts[3],
                    }
                )
    return registry


def generate_board(all_tasks, registry):
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    total = len(all_tasks)
    done = len([t for t in all_tasks.values() if t.status.lower() == "done"])
    progress = int((done / total) * 100) if total > 0 else 0

    columns = {"Blocked": [], "In Progress": [], "Open": [], "Backlog": [], "Done": []}

    for task in all_tasks.values():
        status = task.status
        is_blocked = task.is_blocked(all_tasks)

        if status.lower() == "done":
            columns["Done"].append(task)
        elif is_blocked:
            columns["Blocked"].append(task)
        elif status.lower() == "blocked" and not is_blocked:
            columns["Open"].append(task)
        elif status in columns:
            columns[status].append(task)
        else:
            columns["Open"].append(task)

    md = []
    md.append("# Project Board")
    md.append(f"\n> **Generated by `keystone-board` skill**")
    md.append(f"> **Last Updated:** {now}")

    md.append("\n## Active Workstreams")
    if registry:
        md.append("\n| Workstream | Feature Plan | Session Name | Status |")
        md.append("| :--- | :--- | :--- | :--- |")
        for ws in registry:
            md.append(
                f"| `{ws['name']}` | {ws['plan']} | `{ws['session']}` | {ws['status']} |"
            )
    else:
        md.append("\n*No active workstreams found in registry.*")

    md.append("\n## Progress Overview")
    md.append(f"\n| Total | Open | In Progress | Blocked | Done |")
    md.append(f"| :--- | :--- | :--- | :--- | :--- |")
    md.append(
        f"| {total} | {len(columns['Open'])} | {len(columns['In Progress'])} | {len(columns['Blocked'])} | {len(columns['Done'])} |"
    )

    bar_len = 20
    filled = int(progress / (100 / bar_len))
    bar = "█" * filled + "░" * (bar_len - filled)
    md.append(f"\n**Overall Progress:** [{bar}] {progress}%")

    for status, tasks in columns.items():
        md.append(f"\n---")
        md.append(f"\n## {status}")
        if not tasks:
            md.append("\n*None.*")
        else:
            for t in tasks:
                dep_str = (
                    f" (Deps: {', '.join(t.dependencies)})" if t.dependencies else ""
                )
                mark = "x" if t.status.lower() == "done" else " "
                md.append(
                    f"- [{mark}] **{t.id}:** {t.title} `[{t.workstream}]`{dep_str}"
                )

    md.append("\n---")
    md.append("\n## Source Map")
    sources = sorted(list(set(str(t.source_file) for t in all_tasks.values())))
    for src in sources:
        md.append(f"- `{src}`")

    with open(BOARD_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(md))


def main():
    all_tasks_list = []

    root_tasks_file = PROJECT_DIR / "tasks.md"
    if root_tasks_file.exists():
        all_tasks_list.extend(parse_task_file(root_tasks_file))

    if WORKSTREAMS_DIR.exists():
        for ws_file in WORKSTREAMS_DIR.glob("*.md"):
            if ws_file.name != "registry.md":
                all_tasks_list.extend(parse_task_file(ws_file))

    all_tasks = {}
    for t in all_tasks_list:
        if t.id in all_tasks:
            if "tasks.md" in str(all_tasks[t.id].source_file):
                all_tasks[t.id] = t
        else:
            all_tasks[t.id] = t

    registry = get_registry_info()
    generate_board(all_tasks, registry)

    print(
        f"✅ Board updated successfully. Parsed {len(all_tasks)} tasks from {len(set(t.source_file for t in all_tasks.values()))} files."
    )


if __name__ == "__main__":
    main()
