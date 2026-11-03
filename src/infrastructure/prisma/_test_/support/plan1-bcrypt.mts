import bcrypt from "../../../../node_modules/bcryptjs/index.js";

export let comparisons = 0;
export let comparisonGate: (() => Promise<void>) | undefined;
export function pauseComparisons(gate: () => Promise<void>) {
  comparisonGate = gate;
}

export async function compare(password: string, passwordHash: string) {
  comparisons++;
  const matches = await bcrypt.compare(password, passwordHash);
  await comparisonGate?.();
  return matches;
}

export const hash = bcrypt.hash;
export default { ...bcrypt, compare };
