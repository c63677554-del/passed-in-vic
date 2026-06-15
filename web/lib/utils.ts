import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { addDays, format, parseISO } from "date-fns";
import type { AuctionWeek } from "./types";

// shadcn/ui's class-name merge helper.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format an AUD integer as "$1,250,000". Returns "—" when null. */
export function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Build a Google search URL for a property address (opened in a new tab). */
export function googleSearchUrl(address: string, suburb?: string | null): string {
  const q = [address, suburb, "VIC"].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/** Turn a week-ending (auction Saturday) ISO date into a labelled week. */
export function toAuctionWeek(weekEndingDate: string): AuctionWeek {
  const end = parseISO(weekEndingDate);
  const start = addDays(end, -6);
  const label = `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
  return { weekEndingDate, label };
}
