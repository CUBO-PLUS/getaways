import type { Temporal } from "temporal-polyfill/full";

export function publicationInstant(value?: string): Temporal.Instant;
export function exactInstant(value: unknown): Temporal.Instant | null;
