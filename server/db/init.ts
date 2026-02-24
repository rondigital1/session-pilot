import { initializeDb } from "./client";

let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

export async function ensureInitialized(): Promise<void> {
  if (isInitialized) return;
  if (!initializationPromise) {
    initializationPromise = initializeDb()
      .then(() => {
        isInitialized = true;
      })
      .finally(() => {
        initializationPromise = null;
      });
  }
  await initializationPromise;
}
