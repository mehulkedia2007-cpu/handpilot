# Changelog

All notable changes to HandPilot are listed here, newest first.

## [Unreleased]

### Phase 0: Set up the project
- P0.1: Repository skeleton, `package.json` with `dev` and `test` scripts, MIT licence, `.gitignore`.
- P0.2: Split the prototype into ES modules (`src/core`, `src/input`, `src/scene`, `src/ui`, `src/main.js`). Three.js r128 global script replaced by `three@0.160.0` through an import map, with lighting and colour settings adjusted so the robot looks the same. Added keyboard orbit (arrow keys, +/-) on the 3D view.
- P0.3: Unit tests with `node:test` for finger-bend maths, gesture classification, the agent state machine (fake clock) and pose mapping. The prototype had no test code, so these were written from its behaviour.
- P0.4: README v1 (pitch, features, run, test, architecture, privacy, credits, AI-assistance note), `docs/ARCHITECTURE.md`, `docs/LEARNING.md` (Phase 0), `docs/TESTING.md` manual checklist, `src/core/types.md`.
