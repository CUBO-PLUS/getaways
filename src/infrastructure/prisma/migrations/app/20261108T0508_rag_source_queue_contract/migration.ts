#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/593e975c2cf39bb4737ae52f0ef84454570bd41f10de8a659f5728692cbad57f/contract';
import endContract from '../../snapshots/593e975c2cf39bb4737ae52f0ef84454570bd41f10de8a659f5728692cbad57f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b7ab6bf5623ca895f4113457d39b0c3ef5ce50e183af2b6d47c814df4fe8c62a/contract';
import startContract from '../../snapshots/b7ab6bf5623ca895f4113457d39b0c3ef5ce50e183af2b6d47c814df4fe8c62a/contract.json' with { type: 'json' };
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
        table: 'RagSourceQueue',
        columns: [
          col('attempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('availableAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('generation', 'int8', {
            notNull: true,
            default: lit('1'),
            codecRef: { codecId: 'pg/int8@1' },
          }),
          col('lastError', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('leaseToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('lockedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('sourceId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sourceType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['sourceType', 'sourceId']),
          checkExpression(
            'rag_source_queue_counters_valid_a1c33900',
            sql`generation > 0 AND attempts >= 0`,
          ),
          checkExpression(
            'rag_source_queue_status_valid_d3be0e7c',
            sql`status IN ('pending', 'processing', 'failed')`,
          ),
          checkExpression(
            'rag_source_queue_type_valid_ed9c1704',
            sql`"sourceType" IN ('blog', 'listing')`,
          ),
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'RagSourceQueue',
        index: 'RagSourceQueue_status_availableAt_idx_98697328',
        columns: ['status', 'availableAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
