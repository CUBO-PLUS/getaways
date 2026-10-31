#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/6f61bccf5fb3a4ddac61b783b36527564f3cbd4a8bf439056252a731b20389c7/contract';
import endContract from '../../snapshots/6f61bccf5fb3a4ddac61b783b36527564f3cbd4a8bf439056252a731b20389c7/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ef2c5a25e0d8aafb684a93a646396237386607217b08ddc403448c802b22143d/contract';
import startContract from '../../snapshots/ef2c5a25e0d8aafb684a93a646396237386607217b08ddc403448c802b22143d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'BlogImportMapping',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('fingerprint', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('source', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sourceId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('targetId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('targetKind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'BlogImportMapping',
        constraint: 'BlogImportMapping_source_sourceId_key',
        columns: ['source', 'sourceId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'BlogImportMapping',
        constraint: 'BlogImportMapping_targetKind_targetId_key',
        columns: ['targetKind', 'targetId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
