#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/6056f5828c7832d63fc2f10a5cd28d4eff3831a36ff2e75ad5a3b97b72e3709a/contract';
import startContract from '../../snapshots/6056f5828c7832d63fc2f10a5cd28d4eff3831a36ff2e75ad5a3b97b72e3709a/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/94ab05f313f0df2e8a84ea005e5bab69cd92f0ae5ed837e095da64475a9943c4/contract';
import endContract from '../../snapshots/94ab05f313f0df2e8a84ea005e5bab69cd92f0ae5ed837e095da64475a9943c4/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
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
        table: 'BlogCategorySlugAlias',
        columns: [
          col('categoryId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['slug'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ListingCategorySlugAlias',
        columns: [
          col('categoryId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('taxonomy', 'text', {
            notNull: true,
            default: lit('hp_listing_category'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['slug']),
          checkExpression(
            'listing_category_alias_taxonomy_d40a471a',
            sql`taxonomy = 'hp_listing_category'`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ListingTerm',
        constraint: 'ListingTerm_id_taxonomy_key',
        columns: ['id', 'taxonomy'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'BlogCategorySlugAlias',
        index: 'BlogCategorySlugAlias_categoryId_idx_15c304f2',
        columns: ['categoryId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ListingCategorySlugAlias',
        index: 'ListingCategorySlugAlias_categoryId_idx_15c304f2',
        columns: ['categoryId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ListingCategorySlugAlias',
        index: 'ListingCategorySlugAlias_categoryId_taxonomy_idx_ff766f92',
        columns: ['categoryId', 'taxonomy'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'BlogCategorySlugAlias',
        foreignKey: {
          name: 'BlogCategorySlugAlias_categoryId_fkey',
          columns: ['categoryId'],
          references: { schema: 'public', table: 'BlogCategory', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ListingCategorySlugAlias',
        foreignKey: {
          name: 'ListingCategorySlugAlias_categoryId_taxonomy_fkey',
          columns: ['categoryId', 'taxonomy'],
          references: { schema: 'public', table: 'ListingTerm', columns: ['id', 'taxonomy'] },
          onDelete: 'cascade',
          onUpdate: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
