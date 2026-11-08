"use client";

import { useState } from "react";

import { trimShortMonth } from "@/shared/utils/time";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/atoms/ui/button";
import { Calendar } from "@/components/atoms/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/ui/popover";
import { cn } from "@/shared/ui/utils";

type BookingDatePickerProps = {
  id: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
  className?: string;
  /** Shown while no date is chosen. The booking form asks you to "Select date";
      the homepage search bar invites you to "Add dates". */
  placeholder?: string;
  blocked?: { start_date: string; end_date: string }[];
  checkout?: boolean;
};

function isoToDate(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function dateToIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/*
 * "Sat 5 Sep", not "05/09/2026".
 *
 * A slashed numeric date is what a browser's own date input shows, and it read
 * as one -- the field looked like a form control borrowed from somewhere else
 * rather than part of this site. The weekday is the useful half of a booking
 * date anyway: people choose a Friday, not the fifth.
 *
 * The year appears only when it is not this one, so the common case stays
 * short and a stay booked across new year is still unambiguous.
 */
function formatDate(value: string | undefined, placeholder: string) {
  const date = isoToDate(value);
  if (!date) return placeholder;
  const thisYear = date.getFullYear() === new Date().getFullYear();
  /*
   * The weekday goes when the year has to be shown.
   *
   * Both together need 163px in a field the sidebar gives 134, so the value
   * would be cut mid-word. For a date next year the year is the part that
   * disambiguates and the weekday is the part a guest can work out, so it is
   * the weekday that leaves.
   */
  return trimShortMonth(
    new Intl.DateTimeFormat(
      "en-GB",
      thisYear
        ? { weekday: "short", day: "numeric", month: "short" }
        : { day: "numeric", month: "short", year: "numeric" }
    ).format(date)
  );
}

export default function BookingDatePicker({ id, value, min, onChange, className, placeholder = "Select date", blocked = [], checkout = false }: BookingDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = isoToDate(value);
  const minDate = isoToDate(min);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          /* data-empty lets the CSS mute the "Select date" placeholder the same
             way ::placeholder mutes it in the sibling text fields -- without it
             a chosen date and an unchosen one looked identical. */
          data-empty={value ? undefined : "true"}
          className={cn(`group/date h-auto w-full min-h-12 justify-start gap-1.75 rounded-[10px] border-text/18
            bg-background px-2.5 py-0 text-left text-[15px] font-semibold leading-[normal]
            transition-[border-color,box-shadow] duration-150 ease-[ease] hover:border-text/42
            focus-visible:outline-none focus-visible:border-heading focus-visible:shadow-[0_0_0_3px_rgba(15,23,39,0.12)]`, className)}
        >
          <CalendarDays className="flex-none text-muted-text" size={17} aria-hidden="true" />
          <span className="truncate tabular-nums group-data-[empty]/date:text-muted-text group-data-[empty]/date:font-normal">
            {formatDate(value, placeholder)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-70 w-[min(320px,calc(100vw_-_32px))] rounded-[10px] border-text/12 bg-[rgb(253,253,252)]
        p-3 text-heading shadow-[0_18px_42px_rgba(15,23,39,0.16)]
        [&_[data-slot=calendar]_button]:max-[900.001px]:min-w-10 [&_[data-slot=calendar]_button]:max-[900.001px]:min-h-10" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate ?? minDate}
          disabled={(date) => {
            const day = dateToIso(date);
            return Boolean((min && day < min) || blocked.some((range) => (checkout ? day > range.start_date : day >= range.start_date) && day < range.end_date));
          }}
          modifiers={{ booked: (date) => blocked.some((range) => dateToIso(date) >= range.start_date && dateToIso(date) < range.end_date) }}
          modifiersClassNames={{ booked: "[&>button]:bg-red-100 [&>button]:text-red-800 [&>button]:line-through" }}
          onSelect={(date) => {
            if (!date) return;
            onChange(dateToIso(date));
            setOpen(false);
          }}
        />
        {blocked.length > 0 && <p className="mt-2 text-xs text-red-800">Marked dates have booked nights.</p>}
      </PopoverContent>
    </Popover>
  );
}
