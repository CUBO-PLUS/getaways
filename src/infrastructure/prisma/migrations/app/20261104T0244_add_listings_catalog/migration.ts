#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1d24b7dffc9a8683f50290225c3f53f644a21598a8804dec3c879f7d65e94772/contract';
import startContract from '../../snapshots/1d24b7dffc9a8683f50290225c3f53f644a21598a8804dec3c879f7d65e94772/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b3b6063e6e046aeb330bcb6c54502a2d20efa4c8e4aebb86346f522aafe9258d/contract';
import endContract from '../../snapshots/b3b6063e6e046aeb330bcb6c54502a2d20efa4c8e4aebb86346f522aafe9258d/contract.json' with { type: 'json' };
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
        table: 'Listing',
        columns: [
          col('active', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('archivedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('attributes', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('baseGuests', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('checkInSeconds', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('checkOutSeconds', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('cleaningFeeCents', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('contentHtml', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('coverMediaId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('extraGuestFeeCents', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ivaBasisPoints', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('maxGuests', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('minStayNights', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('petFeeCents', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('petsAllowed', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('pricePerNightCents', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tourismBasisPoints', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('version', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('wpId', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'listing_active_bookable_29820d57',
            sql`NOT active OR ("pricePerNightCents" IS NOT NULL AND "pricePerNightCents" > 0 AND "maxGuests" IS NOT NULL AND "maxGuests" > 0)`,
          ),
          checkExpression(
            'listing_attributes_descriptive_c63c8437',
            sql`jsonb_typeof(attributes) = 'object' AND NOT (attributes ?| ARRAY['price', 'cleaning_fee', 'extra_guest_fee', 'pet_fee', 'iva', 'tourism_tax', 'pricePerNightCents', 'cleaningFeeCents', 'extraGuestFeeCents', 'petFeeCents', 'ivaBasisPoints', 'tourismBasisPoints'])`,
          ),
          checkExpression(
            'listing_guests_valid_ecea1ec8',
            sql`("maxGuests" IS NULL OR "maxGuests" > 0) AND ("baseGuests" IS NULL OR ("baseGuests" > 0 AND "maxGuests" IS NOT NULL AND "baseGuests" <= "maxGuests"))`,
          ),
          checkExpression(
            'listing_min_stay_positive_b5341822',
            sql`"minStayNights" IS NULL OR "minStayNights" > 0`,
          ),
          checkExpression(
            'listing_money_nonnegative_2dcdefbe',
            sql`("pricePerNightCents" IS NULL OR "pricePerNightCents" >= 0) AND ("cleaningFeeCents" IS NULL OR "cleaningFeeCents" >= 0) AND ("extraGuestFeeCents" IS NULL OR "extraGuestFeeCents" >= 0) AND ("petFeeCents" IS NULL OR "petFeeCents" >= 0)`,
          ),
          checkExpression(
            'listing_tax_basis_points_range_75fe593b',
            sql`("ivaBasisPoints" IS NULL OR "ivaBasisPoints" BETWEEN 0 AND 10000) AND ("tourismBasisPoints" IS NULL OR "tourismBasisPoints" BETWEEN 0 AND 10000)`,
          ),
          checkExpression(
            'listing_time_seconds_range_6e2bad98',
            sql`("checkInSeconds" IS NULL OR "checkInSeconds" BETWEEN 0 AND 86399) AND ("checkOutSeconds" IS NULL OR "checkOutSeconds" BETWEEN 0 AND 86399)`,
          ),
          checkExpression('listing_version_positive_efca705d', sql`"version" > 0`),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'ListingMedia',
        columns: [
          col('alt', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('listingId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('mediaId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('roomGroup', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['listingId', 'mediaId']),
          checkExpression('listing_media_position_nonnegative_c03c2ccb', sql`position >= 0`),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'ListingTerm',
        columns: [
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('taxonomy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('wpId', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ListingTermAssignment',
        columns: [
          col('listingId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('termId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['listingId', 'termId'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'MediaAsset',
        column: col('legacyMediaId', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'Listing',
        constraint: 'Listing_wpId_key',
        columns: ['wpId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Listing',
        constraint: 'Listing_slug_key',
        columns: ['slug'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ListingTerm',
        constraint: 'ListingTerm_taxonomy_slug_key',
        columns: ['taxonomy', 'slug'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'MediaAsset',
        constraint: 'MediaAsset_legacyMediaId_key',
        columns: ['legacyMediaId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Listing',
        index: 'Listing_coverMediaId_idx_a9883159',
        columns: ['coverMediaId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ListingMedia',
        index: 'ListingMedia_listingId_idx_953decda',
        columns: ['listingId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ListingMedia',
        index: 'ListingMedia_listingId_position_idx_4f3a403f',
        columns: ['listingId', 'position'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ListingMedia',
        index: 'ListingMedia_mediaId_idx_6b06655c',
        columns: ['mediaId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ListingTermAssignment',
        index: 'ListingTermAssignment_listingId_idx_953decda',
        columns: ['listingId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ListingTermAssignment',
        index: 'ListingTermAssignment_termId_idx_1b74c9af',
        columns: ['termId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Listing',
        foreignKey: {
          name: 'Listing_coverMediaId_fkey',
          columns: ['coverMediaId'],
          references: { schema: 'public', table: 'MediaAsset', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ListingMedia',
        foreignKey: {
          name: 'ListingMedia_listingId_fkey',
          columns: ['listingId'],
          references: { schema: 'public', table: 'Listing', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ListingMedia',
        foreignKey: {
          name: 'ListingMedia_mediaId_fkey',
          columns: ['mediaId'],
          references: { schema: 'public', table: 'MediaAsset', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ListingTermAssignment',
        foreignKey: {
          name: 'ListingTermAssignment_listingId_fkey',
          columns: ['listingId'],
          references: { schema: 'public', table: 'Listing', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ListingTermAssignment',
        foreignKey: {
          name: 'ListingTermAssignment_termId_fkey',
          columns: ['termId'],
          references: { schema: 'public', table: 'ListingTerm', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
