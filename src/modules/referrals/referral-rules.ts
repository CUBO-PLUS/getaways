export type ReferralCode = {
  code: string;
  active: boolean;
};

/** Format-only check; whether a code is active is always checked on the server. */
export function normalizeReferralCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return /^[A-Z0-9-]{4,24}$/.test(code) ? code : null;
}

export function validateReferral(
  input: string,
  referrals: ReferralCode[]
): string | null {
  const code = normalizeReferralCode(input);
  if (!code) return null;
  return referrals.some((item) => item.code === code && item.active)
    ? code
    : null;
}
