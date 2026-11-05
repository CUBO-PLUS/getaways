#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/03338025e81ccb1e61e9bbb29b7f143a122e1f1676b5986e4065564af03abe34/contract';
import endContract from '../../snapshots/03338025e81ccb1e61e9bbb29b7f143a122e1f1676b5986e4065564af03abe34/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b3b6063e6e046aeb330bcb6c54502a2d20efa4c8e4aebb86346f522aafe9258d/contract';
import startContract from '../../snapshots/b3b6063e6e046aeb330bcb6c54502a2d20efa4c8e4aebb86346f522aafe9258d/contract.json' with { type: 'json' };
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
        table: 'Booking',
        columns: [
          col('adminNotes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('agreedListingTitle', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('cancellationReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('cancelledAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('cancelledBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('checkIn', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('checkOut', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('checkoutSessionId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('cleaningFeeCents', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('couponCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('currency', 'text', {
            notNull: true,
            default: lit('USD'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('discountCents', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('extraGuestFeeCents', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('guestEmail', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('guestName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('guestNotes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('guestPhone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('guests', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('listingId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nights', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('paymentReference', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('paymentReviewRequired', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('petFeeCents', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('pricePerNightCents', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('pricingReviewRequired', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('pricingSnapshot', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('taxCents', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('totalAmountCents', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('version', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'booking_amounts_nonnegative_7fdc2176',
            sql`"pricePerNightCents" >= 0 AND "cleaningFeeCents" >= 0 AND "petFeeCents" >= 0 AND "extraGuestFeeCents" >= 0 AND "discountCents" >= 0 AND "taxCents" >= 0 AND "totalAmountCents" >= 0`,
          ),
          checkExpression('booking_currency_usd_261bd47b', sql`currency = 'USD'`),
          checkExpression(
            'booking_guest_fields_nonempty_16c46ccc',
            sql`"guestName" <> '' AND "guestEmail" <> '' AND "agreedListingTitle" <> ''`,
          ),
          checkExpression(
            'booking_guests_positive_b4d03f1a',
            sql`"guests" IS NULL OR "guests" > 0`,
          ),
          checkExpression(
            'booking_pricing_review_consistent_87ed60fc',
            sql`("pricingSnapshot" IS NULL) = "pricingReviewRequired"`,
          ),
          checkExpression(
            'booking_status_valid_c9b680e8',
            sql`status IN ('pending_payment', 'confirmed', 'cancelled')`,
          ),
          checkExpression(
            'booking_stay_valid_2d172355',
            sql`nights > 0 AND "checkIn" < "checkOut"`,
          ),
          checkExpression('booking_version_positive_341aaa74', sql`version > 0`),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Booking',
        constraint: 'Booking_checkoutSessionId_key',
        columns: ['checkoutSessionId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Booking',
        constraint: 'Booking_paymentReference_key',
        columns: ['paymentReference'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Booking',
        index: 'Booking_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Booking',
        index: 'Booking_listingId_idx_953decda',
        columns: ['listingId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Booking',
        index: 'Booking_listingId_status_checkIn_idx_91c07b52',
        columns: ['listingId', 'status', 'checkIn'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Booking',
        foreignKey: {
          name: 'Booking_listingId_fkey',
          columns: ['listingId'],
          references: { schema: 'public', table: 'Listing', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
