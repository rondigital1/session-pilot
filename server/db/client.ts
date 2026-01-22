import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as path from "path";
import * as schema from "./schema";

// Database singleton
let dbInstance: ReturnType<typeof drizzle> | null = null;
let clientInstance: ReturnType<typeof createClient> | null = null;

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

  // Create indexes if they don't exist (idempotent operation)
  await client.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_session ON session_tasks(session_id);
    CREATE INDEX IF NOT EXISTS idx_signals_session ON signals(session_id);
  `);

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
  const migrationCount = migrations.rows[0]?.count as number;

  if (migrationCount === 0) {
    // Mark initial migration as applied since tables already exist
    const fs = await import("fs/promises");
    const journalPath = path.join(process.cwd(), "drizzle", "meta", "_journal.json");

    try {
      const journalContent = await fs.readFile(journalPath, "utf-8");
      const journal = JSON.parse(journalContent);

      // Mark all existing migrations as applied
      for (const entry of journal.entries) {
        const migrationPath = path.join(process.cwd(), "drizzle", `${entry.tag}.sql`);
        const migrationContent = await fs.readFile(migrationPath, "utf-8");

        await client.execute({
          sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
          args: [migrationContent, entry.when],
        });
        console.log(`Schema update: Marked migration ${entry.tag} as applied`);
      }
      schemaUpdated = true;
    } catch (error) {
      console.error("Warning: Could not read migration journal:", error);
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
    // Log but don't throw - migrations may have already been applied
    console.error("Migration error (may be safe to ignore if already applied):", error);
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
