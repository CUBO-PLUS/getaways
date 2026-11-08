"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { addDaysIso, stayFromCheckIn, todayIso } from "@/modules/bookings/booking-dates";

/*
 * One set of dates for the whole listing page.
 *
 * The phone booking bar asks for the dates and the booking form takes the
 * reservation; they are different components at opposite ends of a long page,
 * and if each keeps its own state the guest picks dates in the bar, presses
 * Reserve now, and lands on a form that has forgotten them. That is the bug
 * this exists to prevent -- it is the whole reason the bar was worth building.
 *
 * The provider is optional. Where no provider is above it, useBookingDates
 * falls back to component-local state, so BookingWidget still works on its own
 * (the checkout page mounts one with no bar anywhere).
 */

export type BookingDates = {
  checkIn: string;
  checkOut: string;
  /** Moves check-out forward when the new check-in would leave too few nights. */
  setCheckIn: (value: string) => void;
  setCheckOut: (value: string) => void;
  minStay: number;
  blocked: { start_date: string; end_date: string }[];
  setBlocked: (ranges: { start_date: string; end_date: string }[]) => void;
};

const BookingDatesContext = createContext<BookingDates | null>(null);

function useDatesState(minStay: number): BookingDates {
  const [checkIn, setCheckInState] = useState(() => addDaysIso(todayIso(), 1));
  const [checkOut, setCheckOut] = useState(() => addDaysIso(addDaysIso(todayIso(), 1), minStay));
  const [blocked, setBlocked] = useState<BookingDates["blocked"]>([]);

  const setCheckIn = useCallback(
    (next: string) => {
      setCheckInState(next);
      setCheckOut((current) => stayFromCheckIn(next, current, minStay).checkOut);
    },
    [minStay]
  );

  return useMemo(
    () => ({ checkIn, checkOut, setCheckIn, setCheckOut, minStay, blocked, setBlocked }),
    [checkIn, checkOut, setCheckIn, minStay, blocked]
  );
}

export function BookingDatesProvider({ minNights, children }: { minNights?: string; children: ReactNode }) {
  const minStay = Math.max(1, Number(minNights || 1) || 1);
  const value = useDatesState(minStay);
  return <BookingDatesContext.Provider value={value}>{children}</BookingDatesContext.Provider>;
}

export function useBookingDates(minStay: number): BookingDates {
  const shared = useContext(BookingDatesContext);
  // Called unconditionally -- hooks cannot be skipped on a branch. The local
  // state is simply unused when a provider is above.
  const local = useDatesState(minStay);
  return shared ?? local;
}
