/**
 * Local, read-only stand-in for the public Supabase client.
 *
 * Only static pages and site artwork use the remaining JSON snapshots.
 * Blog and catalogue readers use PostgreSQL, without a JSON fallback.
 * This module implements the query-builder surface used by those static readers:
 *
 *   from(table) . select(columns) . eq / neq / in / gt / gte / lt / lte / ilike / is
 *               . order(column, { ascending }) . limit(n) . range(from, to)
 *               . single() / maybeSingle() / plain await
 *
 * Writes are not implemented; operational data is persisted separately.
 *
 * Errors use the PostgREST shape ({ code, message }) so the callers in
 * modules/content/server/content.ts keep their existing `PGRST116` handling.
 */
import pages from "@/data/pages.json";
import media from "@/data/media.json";
import type { DataTables, PageRow } from "@/data/types";

type Row = Record<string, unknown>;
type TableName = Exclude<keyof DataTables, "coupons">;
type QueryError = { code?: string; message: string };
type QueryResult<T> = { data: T; error: null } | { data: null; error: QueryError };

type Trim<S extends string> = S extends ` ${infer Rest}` ? Trim<Rest>
  : S extends `${infer Rest} ` ? Trim<Rest> : S;
type SelectedColumns<S extends string> = S extends `${infer Head},${infer Tail}`
  ? Trim<Head> | SelectedColumns<Tail> : Trim<S>;
type Projection<T, S extends string> = Trim<S> extends "*" | "" ? T
  : Pick<T, Extract<SelectedColumns<S>, keyof T>>;

// JSON imports widen literal strings; snapshot tests check these vocabularies.
const TABLES: { [K in TableName]: DataTables[K][] } = {
  pages: pages as PageRow[],
  media,
};

const NO_ROWS_CODE = "PGRST116";

type Filter =
  | { op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is" | "ilike"; column: string; value: unknown }
  | { op: "in"; column: string; value: unknown[] };

/** Loose equality that matches PostgREST's text comparison (ids compare as text). */
function sameValue(cell: unknown, value: unknown): boolean {
  if (cell == null || value == null) return false;
  return cell === value || String(cell) === String(value);
}

/** Turns ISO-looking strings into epoch ms so timestamps with different offsets compare correctly. */
function comparable(value: unknown): number | string | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const time = Date.parse(value);
      if (!Number.isNaN(time)) return time;
    }
    return value;
  }
  return String(value);
}

/** Ascending comparison; nulls sort last, as in Postgres' default ordering. */
function compareValues(a: unknown, b: unknown): number {
  const left = comparable(a);
  const right = comparable(b);
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left) < String(right) ? -1 : 1;
}

function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function matches(row: Row, filter: Filter): boolean {
  const cell = row[filter.column];
  switch (filter.op) {
    case "eq":
      return sameValue(cell, filter.value);
    case "neq":
      return cell != null && !sameValue(cell, filter.value);
    case "in":
      return filter.value.some((value) => sameValue(cell, value));
    case "gt":
      return cell != null && compareValues(cell, filter.value) > 0;
    case "gte":
      return cell != null && compareValues(cell, filter.value) >= 0;
    case "lt":
      return cell != null && compareValues(cell, filter.value) < 0;
    case "lte":
      return cell != null && compareValues(cell, filter.value) <= 0;
    case "is":
      return filter.value === null ? cell == null : cell === filter.value;
    case "ilike":
      return typeof cell === "string" && likeToRegExp(String(filter.value)).test(cell);
  }
}

/** Keeps only the requested columns, the way a PostgREST projection does. */
function project(row: Row, columns: string[] | null): Row {
  if (!columns) return structuredClone(row);
  const out: Row = {};
  for (const column of columns) {
    if (column in row) out[column] = structuredClone(row[column]);
  }
  return out;
}

function parseColumns(select: string | undefined): string[] | null {
  const trimmed = (select ?? "*").trim();
  if (trimmed === "" || trimmed === "*") return null;
  if (trimmed.includes("(")) {
    throw new Error(`Embedded selects are not supported by the local data client: "${trimmed}"`);
  }
  return trimmed
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
}

class LocalQuery<T extends Row, Selected = T> implements PromiseLike<QueryResult<Selected[]>> {
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean }[] = [];
  private columns: string[] | null = null;
  private rangeFrom = 0;
  private rangeTo = Number.POSITIVE_INFINITY;
  private error: QueryError | null;
  private readonly rowsOfTable: Row[];

  constructor(table: TableName) {
    const known = Object.prototype.hasOwnProperty.call(TABLES, table);
    this.error = known ? null : { message: `Unknown table "${table}" in the local data client` };
    this.rowsOfTable = known ? TABLES[table] : [];
  }

  select<S extends string = "*">(columns?: S): LocalQuery<T, Projection<T, S>> {
    try {
      this.columns = parseColumns(columns);
    } catch (error) {
      this.error ??= { message: (error as Error).message };
    }
    return this as LocalQuery<T, Projection<T, S>>;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ op: "neq", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ op: "in", column, value: values });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ op: "gt", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ op: "gte", column, value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ op: "lt", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ op: "lte", column, value });
    return this;
  }

  ilike(column: string, pattern: string) {
    this.filters.push({ op: "ilike", column, value: pattern });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ op: "is", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.rangeFrom = 0;
    this.rangeTo = count - 1;
    return this;
  }

  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  private run(): { rows: Selected[]; error: QueryError | null } {
    if (this.error) return { rows: [], error: this.error };
    let matched = this.rowsOfTable.filter((row) => this.filters.every((filter) => matches(row, filter)));
    // Multi-column sort: apply the least significant key first, stable sort keeps earlier keys.
    for (const { column, ascending } of [...this.orderBy].reverse()) {
      matched = [...matched].sort((a, b) => {
        const cmp = compareValues(a[column], b[column]);
        return ascending ? cmp : -cmp;
      });
    }
    const end = Number.isFinite(this.rangeTo) ? this.rangeTo + 1 : undefined;
    return { rows: matched.slice(this.rangeFrom, end).map((row) => project(row, this.columns) as Selected), error: null };
  }

  async single(): Promise<QueryResult<Selected>> {
    const { rows, error } = this.run();
    if (error) return { data: null, error };
    if (rows.length === 0) return { data: null, error: { code: NO_ROWS_CODE, message: "The result contains 0 rows" } };
    if (rows.length > 1) {
      return { data: null, error: { code: NO_ROWS_CODE, message: "JSON object requested, multiple rows returned" } };
    }
    return { data: rows[0], error: null };
  }

  async maybeSingle(): Promise<QueryResult<Selected | null>> {
    const { rows, error } = this.run();
    if (error) return { data: null, error };
    if (rows.length > 1) {
      return { data: null, error: { code: NO_ROWS_CODE, message: "JSON object requested, multiple rows returned" } };
    }
    return { data: rows[0] ?? null, error: null };
  }

  then<A = QueryResult<Selected[]>, B = never>(
    onfulfilled?: ((value: QueryResult<Selected[]>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    const { rows, error } = this.run();
    const result: QueryResult<Selected[]> = error ? { data: null, error } : { data: rows, error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

export type LocalSupabaseClient = {
  from<K extends TableName>(table: K): LocalQuery<DataTables[K]>;
};

/**
 * True when the local data snapshot is available. The data ships with the
 * repo, so this is always true. modules/content/server/content.ts keeps the check so its callers
 * do not change.
 */
export function hasPublicSupabaseConfig(): boolean {
  return true;
}

let _publicClient: LocalSupabaseClient | null = null;

/** Read-only client over data/*.json. No network, no environment variables. */
export function publicSupabaseClient(): LocalSupabaseClient {
  if (!_publicClient) {
    _publicClient = { from: <K extends TableName>(table: K) => new LocalQuery<DataTables[K]>(table) };
  }
  return _publicClient;
}
