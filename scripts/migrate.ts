/**
 * Database migration script
 *
 * Run with: npx tsx scripts/migrate.ts
 * Or via npm: npm run db:migrate:run
 *
 * This script applies pending Drizzle migrations to the database.
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as path from "path";

async function runMigrations() {
  const dbPath = process.env.DB_PATH || "./session-pilot.db";
  console.log(`Migrating database at: ${dbPath}`);

  const client = createClient({
    url: `file:${dbPath}`,
  });

  const db = drizzle(client);

  // Run migrations from the drizzle folder
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  console.log(`Reading migrations from: ${migrationsFolder}`);

  try {
    await migrate(db, { migrationsFolder });
    console.log("✅ Migrations completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    client.close();
  }
}

runMigrations();
