import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import * as path from "path";
import * as schema from "./schema";

// Database singleton
let dbInstance: ReturnType<typeof drizzle> | null = null;
let clientInstance: ReturnType<typeof createClient> | null = null;

type MigrationJournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

async function readMigrationJournalEntries(): Promise<MigrationJournalEntry[]> {
  const journalPath = path.join(process.cwd(), "drizzle", "meta", "_journal.json");
  const journalContent = await readFile(journalPath, "utf-8");
  const journal = JSON.parse(journalContent) as { entries?: MigrationJournalEntry[] };
  return journal.entries ?? [];
}

async function readMigrationSql(tag: string): Promise<string> {
  const migrationPath = path.join(process.cwd(), "drizzle", `${tag}.sql`);
  return readFile(migrationPath, "utf-8");
}

function migrationCreatesTable(migrationSql: string, tableName: string): boolean {
  const createTableRegex = new RegExp(
    `\\bCREATE\\s+TABLE\\s+[\`"]?${tableName}[\`"]?\\b`,
    "i"
  );
  return createTableRegex.test(migrationSql);
}

async function markMigrationApplied(
  client: ReturnType<typeof createClient>,
  entry: MigrationJournalEntry
) {
  const migrationSql = await readMigrationSql(entry.tag);
  const hash = createHash("sha256").update(migrationSql).digest("hex");

  await client.execute({
    sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    args: [hash, entry.when],
  });
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Get or create the database connection
 * Uses DB_PATH env var or defaults to ./session-pilot.db
 */
export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = process.env.DB_PATH || "./session-pilot.db";
  clientInstance = createClient({
    url: `file:${dbPath}`,
  });

  dbInstance = drizzle(clientInstance, { schema });

  return dbInstance;
}

/**
 * Get the raw libsql client for executing raw SQL
 */
export function getRawClient() {
  if (!clientInstance) {
    getDb(); // Initialize if not already done
  }
  return clientInstance!;
}

/**
 * Ensure database schema is up to date
 *
 * This handles:
 * 1. Legacy databases created before Drizzle migrations were added
 * 2. Databases in a partially migrated state
 * 3. Adding missing columns from schema updates
 */
async function ensureSchemaUpToDate(client: ReturnType<typeof createClient>) {
  // Check if session_tasks table exists
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='session_tasks'"
  );

  if (tables.rows.length === 0) {
    // Fresh database, will be handled by Drizzle migrations
    return false;
  }

  // Check for missing columns in session_tasks and add them
  const columns = await client.execute("PRAGMA table_info(session_tasks)");
  const columnNames = columns.rows.map((r) => r.name as string);
  let schemaUpdated = false;

  if (!columnNames.includes("checklist")) {
    await client.execute("ALTER TABLE session_tasks ADD COLUMN checklist TEXT");
    console.log("Schema update: Added checklist column to session_tasks");
    schemaUpdated = true;
  }

  if (!columnNames.includes("context")) {
    await client.execute("ALTER TABLE session_tasks ADD COLUMN context TEXT");
    console.log("Schema update: Added context column to session_tasks");
    schemaUpdated = true;
  }

  // Check if Drizzle migrations table exists and has entries
  const drizzleTable = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
  );

  if (drizzleTable.rows.length === 0) {
    // Create the Drizzle migrations table
    await client.execute(`
      CREATE TABLE "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
      )
    `);
    schemaUpdated = true;
  }

  // Check if any migrations are recorded
  const migrations = await client.execute("SELECT COUNT(*) as count FROM __drizzle_migrations");
  const migrationCount = toNumber(migrations.rows[0]?.count);

  // Add session_summaries table if missing for legacy DBs without migration tracking.
  // If migrations already exist, let Drizzle apply the pending migration normally.
  const summariesTable = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='session_summaries'"
  );
  let hasSessionSummariesTable = summariesTable.rows.length > 0;
  if (!hasSessionSummariesTable && migrationCount === 0) {
    await client.executeMultiple(`
      CREATE TABLE session_summaries (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        tasks_completed INTEGER NOT NULL,
        tasks_total INTEGER NOT NULL,
        tasks_pending INTEGER NOT NULL,
        tasks_skipped INTEGER NOT NULL,
        completion_rate REAL NOT NULL,
        total_estimated_minutes INTEGER NOT NULL,
        actual_duration_minutes INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON UPDATE no action ON DELETE no action,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE no action ON DELETE no action
      );
    `);
    console.log("Schema update: Added session_summaries table");
    hasSessionSummariesTable = true;
    schemaUpdated = true;
  }

  // Create improve tables if missing (idempotent)
  const snapshotsTable = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='project_snapshots'"
  );
  if (snapshotsTable.rows.length === 0) {
    await client.executeMultiple(`
      CREATE TABLE project_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        snapshot_hash TEXT NOT NULL,
        snapshot_data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE no action ON DELETE no action
      );
      CREATE TABLE improvement_ideas (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        impact TEXT NOT NULL,
        effort TEXT NOT NULL,
        risk TEXT NOT NULL,
        confidence REAL NOT NULL,
        score REAL NOT NULL,
        evidence TEXT NOT NULL,
        acceptance_criteria TEXT NOT NULL,
        steps TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE no action ON DELETE no action,
        FOREIGN KEY (snapshot_id) REFERENCES project_snapshots(id) ON UPDATE no action ON DELETE no action
      );
      CREATE TABLE idea_feedback (
        id TEXT PRIMARY KEY NOT NULL,
        idea_id TEXT NOT NULL,
        vote TEXT NOT NULL,
        reason TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (idea_id) REFERENCES improvement_ideas(id) ON UPDATE no action ON DELETE no action
      );
    `);
    console.log("Schema update: Added improve feature tables");
    schemaUpdated = true;
  }

  // Create indexes if they don't exist (idempotent operation)
  await client.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_session ON session_tasks(session_id);
    CREATE INDEX IF NOT EXISTS idx_signals_session ON signals(session_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_workspace ON project_snapshots(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_hash ON project_snapshots(snapshot_hash);
    CREATE INDEX IF NOT EXISTS idx_snapshots_created ON project_snapshots(created_at);
    CREATE INDEX IF NOT EXISTS idx_ideas_workspace ON improvement_ideas(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_ideas_snapshot ON improvement_ideas(snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_ideas_status ON improvement_ideas(status);
    CREATE INDEX IF NOT EXISTS idx_ideas_created ON improvement_ideas(created_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_idea ON idea_feedback(idea_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_created ON idea_feedback(created_at);
  `);
  if (hasSessionSummariesTable) {
    await client.executeMultiple(`
      CREATE INDEX IF NOT EXISTS idx_session_summaries_session ON session_summaries(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_workspace ON session_summaries(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_created ON session_summaries(created_at);
    `);
  }

  if (migrationCount === 0) {
    // Mark initial migration as applied since tables already exist
    try {
      const entries = await readMigrationJournalEntries();
      // Mark all existing migrations as applied
      for (const entry of entries) {
        await markMigrationApplied(client, entry);
        console.log(`Schema update: Marked migration ${entry.tag} as applied`);
      }
      schemaUpdated = true;
    } catch (error) {
      console.error("Warning: Could not read migration journal:", error);
    }
  } else if (hasSessionSummariesTable) {
    // Backfill migration record when session_summaries was created manually in a prior release.
    try {
      const [entries, appliedRows] = await Promise.all([
        readMigrationJournalEntries(),
        client.execute("SELECT created_at FROM __drizzle_migrations"),
      ]);

      const appliedMigrationTimestamps = new Set(
        appliedRows.rows.map((row) => toNumber(row.created_at))
      );
      for (const entry of entries) {
        if (appliedMigrationTimestamps.has(entry.when)) {
          continue;
        }

        const migrationSql = await readMigrationSql(entry.tag);
        if (!migrationCreatesTable(migrationSql, "session_summaries")) {
          continue;
        }

        await markMigrationApplied(client, entry);
        console.log(
          `Schema update: Backfilled migration ${entry.tag} as applied (session_summaries already exists)`
        );
        schemaUpdated = true;
        break;
      }
    } catch (error) {
      console.error("Warning: Could not backfill migration records:", error);
    }
  }

  if (schemaUpdated) {
    console.log("Schema updates complete!");
  }

  return schemaUpdated;
}

/**
 * Initialize database by running migrations
 *
 * This uses Drizzle Kit migrations from the /drizzle folder.
 * Run `npm run db:generate` after schema changes to create new migrations.
 */
export async function initializeDb() {
  const db = getDb();
  const client = getRawClient();

  // Handle legacy databases and schema updates
  await ensureSchemaUpToDate(client);

  // Run migrations from the drizzle folder
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  try {
    await migrate(db, { migrationsFolder });
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }

  return db;
}

/**
 * Close database connection
 * Call this during graceful shutdown
 */
export function closeDb() {
  if (clientInstance) {
    clientInstance.close();
    clientInstance = null;
    dbInstance = null;
  }
}
