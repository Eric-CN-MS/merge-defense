<!-- Sync Impact Report
Version change: N/A → 1.0.0 (initial)
Added sections: Core Principles, Game Design Constraints, Development Workflow, Governance
Templates updated: ✅ constitution.md
Follow-up TODOs: none
-->

# merge-defense Constitution

## Core Principles

### I. Spec-First (NON-NEGOTIABLE)
Every feature MUST start with a written specification before any code is written.
Specifications define the "what" and "why"; implementation defines the "how".
No code without an approved spec. No spec without clear user stories.

### II. Simplicity & Incremental Delivery
Start with the simplest working version. YAGNI (You Aren't Gonna Need It).
Each development phase MUST produce a playable/testable build.
Avoid over-engineering: if it's not in the spec, don't build it.

### III. Cocos Creator + WeChat Mini Game Compatibility
All code MUST be compatible with Cocos Creator 3.x and the WeChat Mini Game platform.
Avoid browser-specific APIs not supported by WeChat's runtime.
Asset sizes MUST be optimized for mobile (textures compressed, audio lightweight).

### IV. Game Loop Integrity
Core game loop (merge → auto-attack → wave progression) MUST always be functional.
No feature may break the core loop. Regression testing required after each phase.
Performance target: stable 60 FPS on mid-range Android devices.

### V. Data-Driven Design
Game data (weapons, enemies, wave configs) MUST be defined in external JSON/config files.
No hardcoded game balance values in logic code.
This enables tuning without code changes.

## Game Design Constraints

- **Genre**: Merge + Tower Defense (casual)
- **Core mechanic**: Drag-and-drop weapon merging on a grid; merged weapons auto-attack incoming enemy waves
- **Reference**: 元气蛋蛋王 style — same-tier weapons merge into higher-tier weapons
- **Platform**: WeChat Mini Game (Cocos Creator 3.x)
- **Session length**: Casual, 3–10 minutes per run
- **Monetization**: Out of scope for initial build

## Development Workflow

1. Spec phase: `/speckit.specify` → write `spec.md`
2. Clarify phase: `/speckit.clarify` → resolve ambiguities
3. Plan phase: `/speckit.plan` → write `plan.md` with tech stack
4. Tasks phase: `/speckit.tasks` → write `tasks.md`
5. Implement phase: `/speckit.implement` → write code
6. Each phase reviewed and approved before proceeding to next

## Governance

This constitution supersedes all other practices and guidelines for this project.
Amendments require updating this file with version bump and rationale.
All implementation decisions MUST reference and comply with these principles.
The AI agent (小虾) acts as both spec author and implementer under human (狼哥) supervision.

**Version**: 1.0.0 | **Ratified**: 2026-02-25 | **Last Amended**: 2026-02-25
