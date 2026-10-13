/**
 * Dashboards and `.env` files happily keep a stray space or a pair of quotes around a value, and
 * the build inlines whatever is there. Clean one before it reaches a parser, and treat a value
 * that was only whitespace or empty quotes as never set at all.
 */
export function cleanEnv(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;

  const unquoted = isQuoted(trimmed) ? trimmed.slice(1, -1).trim() : trimmed;
  return unquoted === "" ? undefined : unquoted;
}

const isQuoted = (value: string) =>
  value.length >= 2 &&
  (value.startsWith('"') || value.startsWith("'")) &&
  value.endsWith(value[0]!);
