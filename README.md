# SessionPilot

Local-first repo improvement orchestrator for discovering git repositories, analyzing one deeply, ranking grounded improvements, shaping bounded execution tasks, and dispatching those tasks through a local coding agent with safe git isolation.

## MVP Loop

SessionPilot now supports this end-to-end flow:

1. Configure local root directories such as `~/code` or `~/projects`
2. Discover local git repositories under those roots
3. Select one repo and run deterministic deep analysis
4. Review ranked improvement suggestions scored by impact, effort, risk, and confidence
5. Open a suggestion to generate:
   - a human-readable task spec
   - an execution-grade Codex CLI prompt
6. Execute the task in an isolated git worktree
7. Stream live execution logs and status via SSE
8. Run bounded validation commands and review the result

## Current Architecture

This MVP stays inside the existing Next.js app instead of splitting frontend and backend yet.

- Frontend: Next.js App Router, React 19, TypeScript, Tailwind CSS, TanStack Query
- Backend: Next.js Node runtime API routes, TypeScript services
- Persistence: SQLite + Drizzle ORM
- Streaming: Server-Sent Events
- Execution provider: Codex CLI
- Isolation: git worktrees under `~/.sessionpilot/worktrees` by default

Core services added in this pivot:

- `RepoDiscoveryService`
- `RepoFingerprintService`
- `RepoAnalysisService`
- `SuggestionScoringService`
- `TaskSpecService`
- `PromptGenerationService`
- `ExecutionOrchestrator`
- `GitWorkspaceService`
- `ValidationRunner`
- `RunEventStore`

Legacy session-planner code still exists in the repo but is no longer the main UX.

## Prerequisites

- Node.js 18+
- npm
- git
- Codex CLI available on `PATH`

Optional but recommended:

- `SESSIONPILOT_WORKSPACE_ROOTS` configured to constrain which local paths the app may manage

## Setup

```bash
cd session-pilot
npm install
cp .env.example .env
npm run db:migrate:run
```

Then edit `.env` as needed.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DB_PATH` | No | SQLite database path. Defaults to `./session-pilot.db`. |
| `NEXT_PUBLIC_APP_URL` | Recommended | App origin used by same-origin API protections. |
| `SESSIONPILOT_WORKSPACE_ROOTS` | Recommended | Comma-separated security boundary for allowed root paths. |
| `SESSIONPILOT_WORKTREE_ROOT` | No | Override the default isolated worktree directory. |
| `ANTHROPIC_API_KEY` | No | Legacy improve/session features only. Not required for the repo-analysis MVP loop. |
| `GITHUB_TOKEN` | No | Legacy GitHub scanning only. Not required for the repo-analysis MVP loop. |

## Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`.

Useful commands:

```bash
npm test
npm run typecheck
npm run build
npm run db:generate
npm run db:migrate:run
```

`npm run typecheck` is the reliable local TypeScript-only check for this repo. `npm run build` remains the full Next.js production validation path.

## Safety Model

- Repo discovery only promotes directories with `.git`
- Root paths are validated against `SESSIONPILOT_WORKSPACE_ROOTS` when configured
- Agent execution never runs in the source checkout
- Each run creates an isolated worktree and branch
- Commands are executed without shell interpolation
- Validation commands are bounded to inferred repo scripts and run inside the isolated worktree

## Main API Surface

- `GET/POST/DELETE /api/repo-roots`
- `GET /api/repositories`
- `POST /api/repositories/discover`
- `GET /api/repositories/:id`
- `POST /api/repositories/:id/analyze`
- `GET /api/suggestions/:id`
- `GET /api/suggestions/:id/task`
- `POST /api/executions`
- `GET /api/executions/:id`
- `GET /api/executions/:id/events`
- `POST /api/executions/:id/cancel`

## Notes

- The suggestion engine is deterministic in this MVP. It does not rely on an LLM to analyze or rank repo improvements.
- The only supported execution provider in this MVP is `codex-cli`.
- Completed worktrees are preserved for review rather than cleaned up automatically.

## MVP Gaps

- Execution coverage now validates the create-task bundle and execution creation happy paths, but there is still no test that drives a full live agent run end-to-end against a real git worktree.
- SSE execution stream behavior is only exercised indirectly; reconnect behavior and long-running stream reliability still need dedicated coverage.
- Legacy session-planner and improve flows still coexist in the repo and env surface. They are not part of the current repo-analysis MVP loop and still need cleanup or clearer separation later.
