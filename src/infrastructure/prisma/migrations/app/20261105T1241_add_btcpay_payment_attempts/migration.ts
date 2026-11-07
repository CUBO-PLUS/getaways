#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0d32b087bdfeef5332ecc93ef9418fee8920c339af67a41247f8443589ebae7b/contract';
import endContract from '../../snapshots/0d32b087bdfeef5332ecc93ef9418fee8920c339af67a41247f8443589ebae7b/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/2deb3c565ad1d334c7e7cef4c50b31feeae096e88fedc03cfe6b4d38384ff18a/contract';
import startContract from '../../snapshots/2deb3c565ad1d334c7e7cef4c50b31feeae096e88fedc03cfe6b4d38384ff18a/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
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
        table: 'PaymentAttempt',
        columns: [
          col('bookingId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('btcAmount', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('btcDestination', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('checkoutLink', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('invoiceId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('network', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('realTotalCents', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('reviewReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('storeId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('testAmountCents', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'payment_attempt_amounts_valid_44184b03',
            sql`"realTotalCents" > 0 AND "testAmountCents" = 1`,
          ),
          checkExpression('payment_attempt_testnet_only_d4ccbaa2', sql`network = 'testnet'`),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'PaymentAttempt',
        constraint: 'PaymentAttempt_bookingId_key',
        columns: ['bookingId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'PaymentAttempt',
        constraint: 'PaymentAttempt_invoiceId_key',
        columns: ['invoiceId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PaymentAttempt',
        index: 'PaymentAttempt_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PaymentAttempt',
        foreignKey: {
          name: 'PaymentAttempt_bookingId_fkey',
          columns: ['bookingId'],
          references: { schema: 'public', table: 'Booking', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
