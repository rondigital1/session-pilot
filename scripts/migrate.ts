/**
 * Database migration script
 *
 * Run with: npx tsx scripts/migrate.ts
 * Or via npm: npm run db:migrate:run
 *
 * This script uses the same initialization path as the app runtime so
 * legacy local databases can backfill migration records before applying
 * newer Drizzle migrations.
 */

import { closeDb, initializeDb } from "../server/db/client";

async function runMigrations() {
  const dbPath = process.env.DB_PATH || "./session-pilot.db";
  console.log(`Migrating database at: ${dbPath}`);

  try {
    await initializeDb();
    console.log("✅ Migrations completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    closeDb();
  }
}

runMigrations();
