import "server-only";

import { compare, hash } from "bcryptjs";
import { Temporal } from "temporal-polyfill/full";
import { db } from "../../../infrastructure/prisma/db.ts";

export type UserRole = "ADMIN" | "EDITOR" | "BOOKING_MANAGER";
export type UserActor = { id: number; authVersion: number };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function normalizeUserEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email");
  return email;
}

export function validateUserPassword(value: string) {
  const length = [...value].length;
  if (length < 8 || length > 32 || Buffer.byteLength(value, "utf8") > 72) throw new Error("Invalid password length");
}

function validateRole(role: UserRole) {
  if (!["ADMIN", "EDITOR", "BOOKING_MANAGER"].includes(role)) throw new Error("Invalid role");
}

function publicUser(user: { id: number; email: string; name: string; role: UserRole; active: boolean; authVersion: number; createdAt: { toString(): string }; updatedAt: { toString(): string }; deactivatedAt: { toString(): string } | null }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, active: user.active, authVersion: user.authVersion, createdAt: user.createdAt.toString(), updatedAt: user.updatedAt.toString(), deactivatedAt: user.deactivatedAt?.toString() ?? null };
}

// All user mutations share this transaction-scoped lock, including bootstrap and recovery.
async function lockUsers(tx: Transaction) {
  await tx.query(db.raw.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(726104813, 1)`.returnsRow({ locked: "pg/int4@1" }).build());
}

async function actorUser(tx: Transaction, actor: UserActor, admin = false) {
  const user = await tx.orm.public.AdminUser.where({ id: actor.id }).forUpdate().first();
  if (!user || !user.active || user.authVersion !== actor.authVersion || (admin && user.role !== "ADMIN")) throw new Error("Unauthorized");
  return user;
}

async function reserveReauthentication(request: Request, actor: UserActor) {
  const user = await db.orm.public.AdminUser.where({ id: actor.id, authVersion: actor.authVersion, active: true }).select("email").first();
  if (!user) throw new Error("Unauthorized");
  const { reserveLoginAttempt } = await import("../../auth/server/login-throttle");
  const retryAfter = await reserveLoginAttempt(request, user.email);
  if (retryAfter) throw new Error(`Reauthentication rate limited: ${retryAfter}`);
}

async function verifyPassword(password: string, passwordHash: string) {
  validateUserPassword(password);
  if (!await compare(password, passwordHash)) throw new Error("Invalid credentials");
}

export async function listUsers(actor: UserActor) {
  return db.transaction(async (tx) => {
    await lockUsers(tx);
    await actorUser(tx, actor, true);
    return (await tx.orm.public.AdminUser.all()).map(publicUser);
  });
}

export async function createUser(actor: UserActor, input: { email: string; name: string; password: string; role: UserRole; currentPassword: string }, request: Request) {
  await reserveReauthentication(request, actor);
  const email = normalizeUserEmail(input.email);
  const name = input.name.trim();
  if (!name || name.length > 200) throw new Error("Invalid name");
  validateRole(input.role);
  validateUserPassword(input.password);
  const passwordHash = await hash(input.password, 12);
  return db.transaction(async (tx) => {
    await lockUsers(tx);
    const admin = await actorUser(tx, actor, true);
    await verifyPassword(input.currentPassword, admin.passwordHash);
    if (await tx.orm.public.AdminUser.where({ email }).first()) throw new Error("Email already exists");
    return publicUser(await tx.orm.public.AdminUser.create({ email, name, passwordHash, role: input.role }));
  });
}

export async function setUserAccess(actor: UserActor, userId: number, access: { name: string; role: UserRole; active: boolean; currentPassword: string }, request: Request) {
  await reserveReauthentication(request, actor);
  validateRole(access.role);
  if (typeof access.active !== "boolean") throw new Error("Invalid active status");
  const name = access.name.trim();
  if (!name || name.length > 200) throw new Error("Invalid name");
  return db.transaction(async (tx) => {
    await lockUsers(tx);
    const admin = await actorUser(tx, actor, true);
    await verifyPassword(access.currentPassword, admin.passwordHash);
    const user = await tx.orm.public.AdminUser.where({ id: userId }).first();
    if (!user) throw new Error("User not found");
    if (actor.id === userId && (!access.active || access.role !== "ADMIN")) throw new Error("Cannot revoke your own admin access");
    if (user.active && user.role === "ADMIN" && (!access.active || access.role !== "ADMIN")) {
      const admins = await tx.orm.public.AdminUser.where({ active: true, role: "ADMIN" }).all();
      if (admins.length <= 1) throw new Error("Cannot remove the last active administrator");
    }
    const changed = user.active !== access.active || user.role !== access.role;
    const updated = await tx.orm.public.AdminUser.where({ id: userId, authVersion: user.authVersion }).update({
      name, role: access.role, active: access.active, authVersion: user.authVersion + (changed ? 1 : 0),
      deactivatedAt: access.active ? null : user.deactivatedAt ?? Temporal.Now.instant(),
    });
    if (!updated) throw new Error("User not found");
    return publicUser(updated);
  });
}

export async function changeOwnPassword(actor: UserActor, currentPassword: string, newPassword: string, confirmation: string, request: Request) {
  await reserveReauthentication(request, actor);
  validateUserPassword(newPassword);
  if (newPassword !== confirmation) throw new Error("Password confirmation does not match");
  const passwordHash = await hash(newPassword, 12);
  return db.transaction(async (tx) => {
    await lockUsers(tx);
    const user = await actorUser(tx, actor);
    await verifyPassword(currentPassword, user.passwordHash);
    const updated = await tx.orm.public.AdminUser.where({ id: user.id, authVersion: user.authVersion }).update({ passwordHash, passwordChangedAt: Temporal.Now.instant(), authVersion: user.authVersion + 1 });
    if (!updated) throw new Error("User changed concurrently");
  });
}

export async function resetUserPassword(actor: UserActor, userId: number, adminPassword: string, newPassword: string, confirmation: string, request: Request) {
  await reserveReauthentication(request, actor);
  if (actor.id === userId) throw new Error("Use the own-password change operation");
  validateUserPassword(newPassword);
  if (newPassword !== confirmation) throw new Error("Password confirmation does not match");
  const passwordHash = await hash(newPassword, 12);
  return db.transaction(async (tx) => {
    await lockUsers(tx);
    const admin = await actorUser(tx, actor, true);
    await verifyPassword(adminPassword, admin.passwordHash);
    const user = await tx.orm.public.AdminUser.where({ id: userId }).first();
    if (!user) throw new Error("User not found");
    const updated = await tx.orm.public.AdminUser.where({ id: userId, authVersion: user.authVersion }).update({ passwordHash, passwordChangedAt: Temporal.Now.instant(), authVersion: user.authVersion + 1 });
    if (!updated) throw new Error("User changed concurrently");
  });
}

/** Operator-only: do not expose through a web endpoint. */
export async function bootstrapAdmin(input: { email: string; name: string; password: string }) {
  const email = normalizeUserEmail(input.email);
  const name = input.name.trim();
  if (!name || name.length > 200) throw new Error("Invalid name");
  validateUserPassword(input.password);
  const passwordHash = await hash(input.password, 12);
  return db.transaction(async (tx) => {
    await lockUsers(tx);
    if (await tx.orm.public.AdminUser.first()) throw new Error("Bootstrap requires an empty user table");
    return publicUser(await tx.orm.public.AdminUser.create({ email, name, passwordHash, role: "ADMIN" }));
  });
}

/** Operator-only recovery: callers must verify operator identity and explicit confirmation. */
export async function recoverAdmin(emailInput: string, password: string) {
  const email = normalizeUserEmail(emailInput);
  validateUserPassword(password);
  const passwordHash = await hash(password, 12);
  return db.transaction(async (tx) => {
    await lockUsers(tx);
    const user = await tx.orm.public.AdminUser.where({ email }).first();
    if (!user) throw new Error("User not found");
    const updated = await tx.orm.public.AdminUser.where({ id: user.id, authVersion: user.authVersion }).update({ role: "ADMIN", active: true, deactivatedAt: null, passwordHash, passwordChangedAt: Temporal.Now.instant(), authVersion: user.authVersion + 1 });
    if (!updated) throw new Error("User changed concurrently");
  });
}
