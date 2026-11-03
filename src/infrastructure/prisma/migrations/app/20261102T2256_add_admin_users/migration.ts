#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1d24b7dffc9a8683f50290225c3f53f644a21598a8804dec3c879f7d65e94772/contract';
import endContract from '../../snapshots/1d24b7dffc9a8683f50290225c3f53f644a21598a8804dec3c879f7d65e94772/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/6f61bccf5fb3a4ddac61b783b36527564f3cbd4a8bf439056252a731b20389c7/contract';
import startContract from '../../snapshots/6f61bccf5fb3a4ddac61b783b36527564f3cbd4a8bf439056252a731b20389c7/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'AdminLoginThrottle',
        columns: [
          col('attempts', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('windowEndsAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['key'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'AdminUser',
        columns: [
          col('active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('authVersion', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deactivatedAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('passwordChangedAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('passwordHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('EDITOR'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'AdminUser_role_check_991f78b6',
            sql`"role" IN ('ADMIN', 'EDITOR', 'BOOKING_MANAGER')`,
          ),
          checkExpression('admin_user_auth_version_positive_e4ec2ac8', sql`"authVersion" > 0`),
          checkExpression(
            'admin_user_email_normalized_50c0b399',
            sql`email = lower(btrim(email)) AND email <> ''`,
          ),
          checkExpression('admin_user_name_nonempty_00a4830a', sql`btrim(name) <> ''`),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'AdminUser',
        constraint: 'AdminUser_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdminLoginThrottle',
        index: 'AdminLoginThrottle_windowEndsAt_idx_90090ef7',
        columns: ['windowEndsAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
