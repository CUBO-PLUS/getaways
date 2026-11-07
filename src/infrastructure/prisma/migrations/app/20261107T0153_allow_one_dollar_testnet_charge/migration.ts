#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/037777a4bf2bc4f8541a71ef82b3d78039573f89b113ecf5038b9f87007998f0/contract';
import endContract from '../../snapshots/037777a4bf2bc4f8541a71ef82b3d78039573f89b113ecf5038b9f87007998f0/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/0d32b087bdfeef5332ecc93ef9418fee8920c339af67a41247f8443589ebae7b/contract';
import startContract from '../../snapshots/0d32b087bdfeef5332ecc93ef9418fee8920c339af67a41247f8443589ebae7b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'PaymentAttempt',
        constraint: 'payment_attempt_amounts_valid_44184b03',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'PaymentAttempt',
        constraint: 'payment_attempt_amounts_valid_5ba9d6f2',
        expression: sql`"realTotalCents" > 0 AND "testAmountCents" IN (1, 100)`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
