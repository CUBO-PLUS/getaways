import { NextResponse } from "next/server";

import { getBlockedRanges, NotFoundError, requireBookableListing } from "@/modules/bookings/server/bookings";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function parsePublicListingId(raw: string): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new NotFoundError(`"${raw}" is not a valid listing id.`);
  }
  return id;
}

/* The public calendar: the dates a listing has taken. A hidden listing answers 404. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const id = parsePublicListingId((await params).id);
    await requireBookableListing(id);
    const blocked = await getBlockedRanges(id);
    return NextResponse.json({ ok: true, data: { blocked } });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    console.error("Unexpected error in GET /api/listings/[id]/availability:", error);
    return NextResponse.json({ ok: false, error: "Unexpected server error. Please try again." }, { status: 500 });
  }
}
