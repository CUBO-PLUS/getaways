// Compose resolves its PostgreSQL service as `db`, not as the host's loopback.
export function databaseUrl(value, composeHost = process.env.DATABASE_COMPOSE_HOST) {
  if (!value || !composeHost) return value;
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return value;
  url.hostname = composeHost;
  url.port = "5432";
  return url.href;
}
