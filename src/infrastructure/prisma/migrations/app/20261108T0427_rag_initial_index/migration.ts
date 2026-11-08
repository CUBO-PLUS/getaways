#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/94ab05f313f0df2e8a84ea005e5bab69cd92f0ae5ed837e095da64475a9943c4/contract';
import startContract from '../../snapshots/94ab05f313f0df2e8a84ea005e5bab69cd92f0ae5ed837e095da64475a9943c4/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b7ab6bf5623ca895f4113457d39b0c3ef5ce50e183af2b6d47c814df4fe8c62a/contract';
import endContract from '../../snapshots/b7ab6bf5623ca895f4113457d39b0c3ef5ce50e183af2b6d47c814df4fe8c62a/contract.json' with { type: 'json' };
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
        table: 'RagChunk',
        columns: [
          col('contentHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('embedding', 'vector(768)', {
            notNull: true,
            codecRef: { codecId: 'pg/vector@1', typeParams: { length: 768 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ordinal', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('section', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sourceId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('text', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tokenCount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('rag_chunk_valid_c19e923c', sql`ordinal >= 0 AND btrim(text) <> ''`),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'RagSource',
        columns: [
          col('canonicalUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('contentHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('embeddingDimensions', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('embeddingModel', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('embeddingRevision', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('extractorVersion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('indexedAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('sourceId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sourceType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'rag_source_type_valid_ed9c1704',
            sql`"sourceType" IN ('blog', 'listing')`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'RagChunk',
        constraint: 'RagChunk_sourceId_ordinal_key',
        columns: ['sourceId', 'ordinal'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'RagSource',
        constraint: 'RagSource_sourceType_sourceId_key',
        columns: ['sourceType', 'sourceId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'RagChunk',
        index: 'RagChunk_sourceId_idx_d92a2571',
        columns: ['sourceId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'RagSource',
        index: 'RagSource_sourceType_idx_d8b2a801',
        columns: ['sourceType'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'RagChunk',
        foreignKey: {
          name: 'RagChunk_sourceId_fkey',
          columns: ['sourceId'],
          references: { schema: 'public', table: 'RagSource', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
