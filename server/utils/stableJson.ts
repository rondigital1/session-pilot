function sortValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }

  if (value && typeof value === "object") {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of sortedEntries) {
      result[key] = sortValue(entryValue);
    }
    return result;
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}
