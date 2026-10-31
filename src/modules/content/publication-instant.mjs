import { Temporal } from "temporal-polyfill/full";

const OFFSET_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export function publicationInstant(value) {
  if (value === undefined) return Temporal.Now.instant();
  if (typeof value !== "string" || !OFFSET_TIMESTAMP.test(value)) {
    throw new RangeError("publication timestamp must be ISO-8601 with an offset and at most six fractional digits");
  }
  return Temporal.Instant.from(value);
}

export function exactInstant(value) {
  if (value instanceof Temporal.Instant) return value;
  try {
    return publicationInstant(value);
  } catch {
    return null;
  }
}
