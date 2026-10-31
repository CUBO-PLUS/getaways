#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/179c07693aad56fd1aeff3e0a51fc34e81b5bd7136e5fa4d51e8d03a6b80fec2/contract';
import startContract from '../../snapshots/179c07693aad56fd1aeff3e0a51fc34e81b5bd7136e5fa4d51e8d03a6b80fec2/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9490e22b8fee9c250967cfaf0d5387ee1d6fd4ab3e9e1ba7e4076c3d44aa2b4e/contract';
import endContract from '../../snapshots/9490e22b8fee9c250967cfaf0d5387ee1d6fd4ab3e9e1ba7e4076c3d44aa2b4e/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
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
        table: 'BlogCategory',
        columns: [
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'BlogPost',
        columns: [
          col('coverAlt', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('coverMediaId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('document', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('documentSchemaVersion', 'int4', {
            notNull: true,
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('excerpt', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('seoDescription', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('seoTitle', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
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
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'BlogPostCategory',
        columns: [
          col('categoryId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('postId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['postId', 'categoryId'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'BlogPublication',
        columns: [
          col('coverAlt', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('coverMediaId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('document', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('documentSchemaVersion', 'int4', {
            notNull: true,
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('excerpt', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('postId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('publishedAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('seoDescription', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('seoTitle', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['postId'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'BlogPublicationCategory',
        columns: [
          col('categoryId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('publicationPostId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['publicationPostId', 'categoryId'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'MediaAsset',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('defaultAlt', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('height', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('mimeType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('objectKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('originalName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sizeBytes', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('width', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'BlogCategory',
        constraint: 'BlogCategory_slug_key',
        columns: ['slug'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'BlogPost',
        constraint: 'BlogPost_slug_key',
        columns: ['slug'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'MediaAsset',
        constraint: 'MediaAsset_objectKey_key',
        columns: ['objectKey'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'BlogPost',
        index: 'BlogPost_coverMediaId_idx_a9883159',
        columns: ['coverMediaId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'BlogPostCategory',
        index: 'BlogPostCategory_categoryId_idx_15c304f2',
        columns: ['categoryId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'BlogPostCategory',
        index: 'BlogPostCategory_postId_idx_a7a72715',
        columns: ['postId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'BlogPublication',
        index: 'BlogPublication_coverMediaId_idx_a9883159',
        columns: ['coverMediaId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'BlogPublication',
        index: 'BlogPublication_publishedAt_idx_36121b91',
        columns: ['publishedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'BlogPublicationCategory',
        index: 'BlogPublicationCategory_categoryId_idx_15c304f2',
        columns: ['categoryId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'BlogPublicationCategory',
        index: 'BlogPublicationCategory_publicationPostId_idx_80488ebb',
        columns: ['publicationPostId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'BlogPost',
        foreignKey: {
          name: 'BlogPost_coverMediaId_fkey',
          columns: ['coverMediaId'],
          references: { schema: 'public', table: 'MediaAsset', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'BlogPostCategory',
        foreignKey: {
          name: 'BlogPostCategory_postId_fkey',
          columns: ['postId'],
          references: { schema: 'public', table: 'BlogPost', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'BlogPostCategory',
        foreignKey: {
          name: 'BlogPostCategory_categoryId_fkey',
          columns: ['categoryId'],
          references: { schema: 'public', table: 'BlogCategory', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'BlogPublication',
        foreignKey: {
          name: 'BlogPublication_postId_fkey',
          columns: ['postId'],
          references: { schema: 'public', table: 'BlogPost', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'BlogPublication',
        foreignKey: {
          name: 'BlogPublication_coverMediaId_fkey',
          columns: ['coverMediaId'],
          references: { schema: 'public', table: 'MediaAsset', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'BlogPublicationCategory',
        foreignKey: {
          name: 'BlogPublicationCategory_publicationPostId_fkey',
          columns: ['publicationPostId'],
          references: { schema: 'public', table: 'BlogPublication', columns: ['postId'] },
          onDelete: 'cascade',
          onUpdate: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'BlogPublicationCategory',
        foreignKey: {
          name: 'BlogPublicationCategory_categoryId_fkey',
          columns: ['categoryId'],
          references: { schema: 'public', table: 'BlogCategory', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
