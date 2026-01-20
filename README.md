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
- pnpm (`npm install -g pnpm`)

### Installation

```bash
# Clone the repository
cd session-pilot

# Install dependencies
pnpm install

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
| `ANTHROPIC_API_KEY` | Yes* | Claude API key for planning and summaries |
| `GITHUB_TOKEN` | No | GitHub PAT for repo scanning |
| `DB_PATH` | No | SQLite database path (default: `./session-pilot.db`) |
| `SESSIONPILOT_WORKSPACE_ROOTS` | No | Comma-separated list of allowed workspace paths |

*Required for AI features; app runs with mock data without it.

### Running

```bash
# Development
pnpm dev

# Production build
pnpm build
pnpm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
session-pilot/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Main single-page UI
│   ├── layout.tsx                # Root layout
│   ├── globals.css               # Minimal CSS
│   └── api/                      # API routes
│       ├── workspaces/route.ts   # GET/POST workspaces
│       └── session/
│           ├── start/route.ts    # POST start session
│           └── [id]/
│               ├── events/route.ts   # GET SSE stream
│               ├── task/route.ts     # GET/POST/PATCH tasks
│               └── end/route.ts      # POST end session
├── server/
│   ├── db/
│   │   ├── schema.ts             # Drizzle SQLite schema
│   │   ├── client.ts             # Database connection
│   │   └── queries.ts            # Query functions (stubbed)
│   ├── types/
│   │   └── domain.ts             # TypeScript types
│   ├── agent/
│   │   ├── claudeClient.ts       # Claude SDK wrapper (stubbed)
│   │   └── policy.ts             # Tool permission policies
│   └── scanners/
│       ├── localScan.ts          # Local repo scanner (stubbed)
│       └── githubScan.ts         # GitHub scanner (stubbed)
├── drizzle.config.ts             # Drizzle Kit config
├── next.config.ts                # Next.js config
├── package.json
└── tsconfig.json
```

## Current State

This is a **scaffolding** with stubbed implementations. The app runs and shows the full UI flow with mock data, but business logic is not implemented.

### What Works

- ✅ Single-page UI with 4 states (Start → Planning → Session → Summary)
- ✅ SQLite database schema and connection
- ✅ API routes with basic validation
- ✅ SSE endpoint with mock events
- ✅ Task CRUD operations
- ✅ Focus weight sliders
- ✅ Time budget selection

### What's Stubbed (TODO)

- ❌ Local file scanning (TODO comments, tests, lint)
- ❌ GitHub API integration (issues, PRs)
- ❌ Claude agent planning logic
- ❌ Session summary generation
- ❌ Tool permission enforcement
- ❌ Workspace path validation

---

## Next Steps Checklist

Here are the 10 tasks to implement the full MVP:

### 1. Implement Local Scanner
**File:** `server/scanners/localScan.ts`
- [ ] Use `fs/promises` to read files in workspace
- [ ] Extract TODO/FIXME comments with regex
- [ ] Parse git status for uncommitted changes
- [ ] Optionally run `npm test` and parse failures
- [ ] Score signals by recency and severity

### 2. Implement GitHub Scanner
**File:** `server/scanners/githubScan.ts`
- [ ] Initialize Octokit with `GITHUB_TOKEN`
- [ ] Fetch open issues with labels and assignees
- [ ] Fetch open PRs needing review
- [ ] Convert API responses to `ScanSignal` type
- [ ] Implement priority scoring based on labels/age

### 3. Implement Claude Planning Agent
**File:** `server/agent/claudeClient.ts`
- [ ] Call Claude API with signals and user goal
- [ ] Use focus weights to prioritize work types
- [ ] Generate tasks that fit time budget
- [ ] Parse JSON response into `PlannedTask[]`
- [ ] Handle API errors and retries

### 4. Wire Up Planning Workflow
**File:** `app/api/session/start/route.ts`
- [ ] After creating session, trigger async scanning
- [ ] Store signals in database
- [ ] Call planning agent with signals
- [ ] Create tasks from plan
- [ ] Send real SSE events during process

### 5. Implement SSE Event Stream
**File:** `app/api/session/[id]/events/route.ts`
- [ ] Create event emitter for session events
- [ ] Subscribe to scan progress events
- [ ] Subscribe to planning progress
- [ ] Implement heartbeat mechanism
- [ ] Handle client disconnection

### 6. Implement Session Summary Generation
**File:** `app/api/session/[id]/end/route.ts`
- [ ] Call Claude with completed/pending tasks
- [ ] Generate concise 2-3 sentence summary
- [ ] Include suggestions for tomorrow
- [ ] Store summary in database

### 7. Add Workspace Validation
**File:** `app/api/workspaces/route.ts`
- [ ] Validate `localPath` exists on filesystem
- [ ] Check path is within `SESSIONPILOT_WORKSPACE_ROOTS`
- [ ] Validate `githubRepo` format
- [ ] Optionally verify GitHub repo exists

### 8. Implement Policy Enforcement
**File:** `server/agent/policy.ts`
- [ ] Implement `checkPolicy()` with pattern matching
- [ ] Add file path validation against denylist
- [ ] Validate shell commands before execution
- [ ] Integrate policy checks in agent loop

### 9. Add Workspace Management UI
**File:** `app/page.tsx`
- [ ] Add workspace creation form
- [ ] Show workspace list with edit/delete
- [ ] Validate paths before submission
- [ ] Show last session summary for workspace

### 10. Add Database Migrations
**Files:** `drizzle/` migrations folder
- [ ] Run `pnpm db:generate` to create migrations
- [ ] Test migration on fresh database
- [ ] Document migration workflow
- [ ] Add migration to deployment process

### 11. Implement Session Timer Notifications
**File:** `app/page.tsx`
- [ ] Add elapsed time tracking with `useState` and `useEffect` interval
- [ ] Display countdown timer in SessionView showing remaining time
- [ ] Trigger browser notification when timer reaches 0 (use Notification API)
- [ ] Add warning notifications at 10-minute and 5-minute marks
- [ ] Consider adding optional sound alerts
- [ ] Add new SSE event type `session_timeout` in `server/types/domain.ts`

---

## API Reference

### Workspaces

```
GET  /api/workspaces          # List all workspaces
POST /api/workspaces          # Create workspace
     Body: { name, localPath, githubRepo? }
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
```

## License

MIT
