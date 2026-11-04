import "server-only";

import { getBlockedRangesForListings, nightsForStay, rangesOverlapPublic } from "@/modules/bookings/server/bookings";

/*
 * Date-aware search for the /properties archive.
 *
 * When a guest arrives from the homepage search bar carrying dates, the
 * archive should not show them properties that are already taken for that
 * week. This resolves "which of these listings is unavailable for this range",
 * so the archive can drop them from the grid and say how many it dropped --
 * silently returning fewer results would read as "we only have three
 * properties" rather than "three are already booked".
 *
 * A pair of dates that is incomplete or nonsensical (check-out on or before
 * check-in) is treated as no date filter at all rather than as an error: the
 * dates are optional refinements on a browse page, not a booking request.
 */

export type SearchDates = { checkIn: string; checkOut: string } | null;

export function parseSearchDates(
  checkIn: string | undefined,
  checkOut: string | undefined
): SearchDates {
  if (!checkIn || !checkOut) return null;
  try { nightsForStay(checkIn, checkOut); }
  catch { return null; }
  return { checkIn, checkOut };
}

export async function unavailableListingIds(
  listingIds: number[],
  dates: SearchDates
): Promise<Set<number>> {
  if (!dates || listingIds.length === 0) return new Set();

  const blockedByListing = await getBlockedRangesForListings(listingIds);
  const unavailable = new Set<number>();
  for (const [listingId, ranges] of blockedByListing) {
    const clash = ranges.some((range) =>
      rangesOverlapPublic(dates.checkIn, dates.checkOut, range.start_date, range.end_date)
    );
    if (clash) unavailable.add(listingId);
  }
  return unavailable;
}
