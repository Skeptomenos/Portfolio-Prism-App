# Anamnesis

> A stateful, spec-driven framework for AI-assisted software engineering.

**Version:** 4.2

## Setup Instructions

Copy the entire `keystone_starter/` folder to your new project root, then rename it to your project name.

```bash
cp -r keystone_starter/ my-new-project/
cd my-new-project/
```

## Structure

```
your-project/
├── keystone/                   # The framework (you are here)
│   ├── directives/              # How AI should think and act
│   │   ├── THINKING.md          # First Principles & Design
│   │   └── EXECUTION.md         # Build & Deliver
│   │
│   ├── standards/               # Code quality rules
│   │   ├── INDEX.md             # Which standards to read when
│   │   ├── global.md            # Language-agnostic rules
│   │   ├── python.md            # Python-specific
│   │   └── typescript.md        # TypeScript-specific
│   │
│   ├── templates/               # Frequently recreated files
│   │   ├── active_state.md      # Session state template
│   │   ├── handover.md          # Handover template
│   │   ├── CLAUDE.md            # Claude-specific AGENTS variant
│   │   └── GEMINI.md            # Gemini-specific AGENTS variant
│   │
│   ├── specs/                   # Specification files
│   │   ├── product.md           # Product definition + requirements
│   │   ├── tech.md              # Technical decisions
│   │   ├── design.md            # Architecture diagrams
│   │   ├── ipc_api.md           # IPC protocol spec
│   │   └── archive/             # Historical planning docs
│   │
│   ├── .context/                # Project state (living files)
│   │   ├── mission.md           # Living objective
│   │   ├── backlog.md           # Ideas and deferred work
│   │   └── tech-stack.md        # Approved tools
│   │
│   ├── PROJECT_LEARNINGS.md     # Process wisdom
│   ├── DECISION_LOG.md          # Architectural decisions
│   └── README.md                # This file
│
├── AGENTS.md                    # Entry point for AI agents
└── CHANGELOG.md                 # Project version history
```

## Getting Started

1. **Read AGENTS.md** — Entry point that tells AI what to read when
2. **Fill in `.context/mission.md`** — Define your project objective
3. **Start working** — AI will follow the framework automatically

## Key Concepts

- **Directives:** Rules for how AI should think (THINKING.md) and execute (EXECUTION.md)
- **Standards:** Code quality rules organized by language/domain
- **Templates:** Files that get archived and recreated frequently
- **Specs:** Feature specifications (one set per project)
- **.context/:** Living project state that evolves over time
