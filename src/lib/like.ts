/**
 * A `%query%` pattern for SQL `ILIKE`, with the wildcards in the query itself escaped, so a search for
 * "50%" or "a_b" looks for exactly that instead of matching everything. Postgres' default escape
 * character is the backslash.
 */
export function likeContains(query: string): string {
  return `%${query.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
