#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/9490e22b8fee9c250967cfaf0d5387ee1d6fd4ab3e9e1ba7e4076c3d44aa2b4e/contract';
import startContract from '../../snapshots/9490e22b8fee9c250967cfaf0d5387ee1d6fd4ab3e9e1ba7e4076c3d44aa2b4e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/ef2c5a25e0d8aafb684a93a646396237386607217b08ddc403448c802b22143d/contract';
import endContract from '../../snapshots/ef2c5a25e0d8aafb684a93a646396237386607217b08ddc403448c802b22143d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'BlogPost',
        column: col('firstPublishedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
