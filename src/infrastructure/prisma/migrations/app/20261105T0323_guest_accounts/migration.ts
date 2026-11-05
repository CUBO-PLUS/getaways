#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/03338025e81ccb1e61e9bbb29b7f143a122e1f1676b5986e4065564af03abe34/contract';
import startContract from '../../snapshots/03338025e81ccb1e61e9bbb29b7f143a122e1f1676b5986e4065564af03abe34/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/2deb3c565ad1d334c7e7cef4c50b31feeae096e88fedc03cfe6b4d38384ff18a/contract';
import endContract from '../../snapshots/2deb3c565ad1d334c7e7cef4c50b31feeae096e88fedc03cfe6b4d38384ff18a/contract.json' with { type: 'json' };
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
        table: 'GuestAccount',
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
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('passwordHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('guest_account_auth_version_positive_e4ec2ac8', sql`"authVersion" > 0`),
          checkExpression(
            'guest_account_email_normalized_32441ce4',
            sql`lower(btrim(email)) = email AND email <> ''`,
          ),
          checkExpression('guest_account_name_nonempty_00a4830a', sql`btrim(name) <> ''`),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'Booking',
        column: col('guestAccountId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'GuestAccount',
        constraint: 'GuestAccount_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Booking',
        index: 'Booking_guestAccountId_idx_6d9963ad',
        columns: ['guestAccountId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Booking',
        foreignKey: {
          name: 'Booking_guestAccountId_fkey',
          columns: ['guestAccountId'],
          references: { schema: 'public', table: 'GuestAccount', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
