# Anamnesis

> A stateful, spec-driven framework for AI-assisted software engineering.

**Version:** 4.2

## Setup Instructions

Copy the entire `anamnesis_starter/` folder to your new project root, then rename it to your project name.

```bash
cp -r anamnesis_starter/ my-new-project/
cd my-new-project/
```

## Structure

```
your-project/
├── anamnesis/                   # The framework (you are here)
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
│   │   ├── problem.md           # Problem definition
│   │   ├── options.md           # Solution options
│   │   ├── requirements.md      # EARS syntax requirements
│   │   ├── design.md            # Architecture diagrams
│   │   ├── tasks.md             # Atomic task list
│   │   ├── tech.md              # Technical decisions
│   │   └── product.md           # Product definition
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
