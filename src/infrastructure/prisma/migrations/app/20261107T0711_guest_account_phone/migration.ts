#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/037777a4bf2bc4f8541a71ef82b3d78039573f89b113ecf5038b9f87007998f0/contract';
import startContract from '../../snapshots/037777a4bf2bc4f8541a71ef82b3d78039573f89b113ecf5038b9f87007998f0/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/6056f5828c7832d63fc2f10a5cd28d4eff3831a36ff2e75ad5a3b97b72e3709a/contract';
import endContract from '../../snapshots/6056f5828c7832d63fc2f10a5cd28d4eff3831a36ff2e75ad5a3b97b72e3709a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'GuestAccount',
        column: col('phone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'GuestAccount',
        constraint: 'guest_account_phone_nonempty_f790acfb',
        expression: sql`"phone" IS NULL OR btrim("phone") <> ''`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
