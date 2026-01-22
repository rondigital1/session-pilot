# SessionPilot

Local-first web UI for planning and tracking daily coding sessions.

## Overview

SessionPilot helps you run focused coding sessions by:
1. Scanning your local repo and GitHub for signals (TODOs, issues, PRs)
2. Generating a time-boxed plan based on your goal and focus weights
3. Tracking task completion during the session
4. Saving a summary for tomorrow's session

## Setup

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
# Clone the repository
cd session-pilot

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
# - ANTHROPIC_API_KEY (required for AI planning)
# - GITHUB_TOKEN (optional, for GitHub scanning)
# - DB_PATH (optional, defaults to ./session-pilot.db)
# - SESSIONPILOT_WORKSPACE_ROOTS (comma-separated allowed paths)
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for planning and summaries |
| `GITHUB_TOKEN` | No | GitHub PAT for repo scanning |
| `DB_PATH` | No | SQLite database path (default: `./session-pilot.db`) |
| `SESSIONPILOT_WORKSPACE_ROOTS` | No | Comma-separated list of allowed workspace paths |

### Running

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Database Migrations

SessionPilot uses Drizzle ORM with SQLite for data persistence. The database schema is managed through migrations.

#### Migration Commands

```bash
# Generate a new migration after schema changes
npm run db:generate

# Apply pending migrations to the database
npm run db:migrate:run

# Open Drizzle Studio to browse/edit data
npm run db:studio
```

#### Migration Workflow

1. **Modify schema**: Edit `server/db/schema.ts` to add/change tables or columns
2. **Generate migration**: Run `npm run db:generate` to create a new SQL migration file in `drizzle/`
3. **Review migration**: Check the generated SQL in `drizzle/XXXX_*.sql`
4. **Apply migration**: Run `npm run db:migrate:run` to apply changes to the database

#### Deployment

For production deployments:
1. Run migrations before starting the app: `npm run db:migrate:run`
2. Or let the app auto-migrate on startup (migrations run automatically when the app initializes)

The app automatically runs pending migrations on startup via `initializeDb()` in `server/db/client.ts`.

## Project Structure

```
session-pilot/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Main single-page UI
│   ├── layout.tsx                # Root layout
│   ├── globals.css               # Styles
│   ├── session-context.tsx       # Client-side state management
│   ├── components/               # UI components
│   │   ├── StartView.tsx         # Initial setup view
│   │   ├── PlanningView.tsx      # SSE event display during planning
│   │   ├── TaskSelectionView.tsx # Task selection before session
│   │   ├── SessionView.tsx       # Active session with timer
│   │   ├── SummaryView.tsx       # Session completion summary
│   │   ├── SessionTimer.tsx      # Countdown timer with notifications
│   │   └── WorkspaceManager.tsx  # Workspace CRUD UI
│   └── api/                      # API routes
│       ├── workspaces/           # Workspace CRUD endpoints
│       └── session/
│           ├── start/route.ts    # POST start session
│           └── [id]/
│               ├── events/route.ts   # GET SSE stream
│               ├── task/route.ts     # GET/POST/PATCH tasks
│               ├── end/route.ts      # POST end session
│               └── cancel/route.ts   # POST cancel session
├── server/
│   ├── db/
│   │   ├── schema.ts             # Drizzle SQLite schema
│   │   ├── client.ts             # Database connection + migrations
│   │   └── queries.ts            # Query functions
│   ├── types/
│   │   └── domain.ts             # TypeScript types
│   ├── agent/
│   │   ├── claudeClient.ts       # Claude SDK wrapper
│   │   ├── sessionPlanner.ts     # Plan generation logic
│   │   ├── planningWorkflow.ts   # Orchestrates scanning + planning
│   │   └── policy.ts             # Tool permission policies
│   └── scanners/
│       ├── localScan.ts          # Local repo scanner
│       ├── githubScan.ts         # GitHub scanner
│       └── parsers.ts            # Signal extraction utilities
├── lib/
│   ├── claude/                   # Claude prompts and parsers
│   ├── github/                   # GitHub API utilities
│   ├── session/                  # Session event system
│   ├── workspace/                # Workspace validation
│   ├── audio/                    # Sound effects
│   └── sse/                      # SSE utilities
├── drizzle/                      # Database migrations
├── scripts/
│   └── migrate.ts                # Standalone migration runner
├── drizzle.config.ts             # Drizzle Kit config
├── next.config.ts                # Next.js config
├── package.json
└── tsconfig.json
```

## Features

### Implemented

- Single-page UI with 5 states (Start → Planning → Task Selection → Session → Summary)
- SQLite database with auto-migrations
- Workspace management with path validation
- Local repository scanning (TODOs, git status, test failures)
- GitHub scanning (issues, PRs, commits) when token is configured
- Claude-powered session planning with focus weights
- Real-time SSE updates during planning
- Task CRUD with status tracking
- Session timer with countdown, warnings, and notifications
- PS1-style sound effects for timer alerts
- Session summary generation with Claude
- Session cancellation support

### Configuration

- Focus weight sliders for bugs/features/refactor prioritization
- Configurable time budgets (15-480 minutes)
- Workspace path restrictions via `SESSIONPILOT_WORKSPACE_ROOTS`

---

## API Reference

### Workspaces

```
GET  /api/workspaces          # List all workspaces
POST /api/workspaces          # Create workspace
     Body: { name, localPath, githubRepo? }
PUT  /api/workspaces/[id]     # Update workspace
DELETE /api/workspaces/[id]   # Delete workspace
POST /api/workspaces/scan     # Scan workspace for signals
```

### Sessions

```
POST /api/session/start       # Start new session
     Body: { workspaceId, userGoal, timeBudgetMinutes, focusWeights }

GET  /api/session/[id]/events # SSE event stream

GET  /api/session/[id]/task   # List session tasks
POST /api/session/[id]/task   # Create task
     Body: { title, description?, estimatedMinutes? }
PATCH /api/session/[id]/task  # Update task status
     Body: { taskId, status, notes? }

POST /api/session/[id]/end    # End session
     Body: { summary? }

POST /api/session/[id]/cancel # Cancel session
```

## License

MIT
