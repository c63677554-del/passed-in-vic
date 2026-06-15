import { supabase } from "./supabase";
import { toAuctionWeek } from "./utils";
import type { AuctionWeek, PassedInResult } from "./types";

/** Distinct auction weeks that have at least one passed-in result, newest first. */
export async function fetchAuctionWeeks(): Promise<AuctionWeek[]> {
  const { data, error } = await supabase
    .from("auction_results")
    .select("week_ending_date")
    .eq("status", "passed_in")
    .order("week_ending_date", { ascending: false });

  if (error) throw error;

  // De-duplicate dates (one row per week) and build labels.
  const unique = Array.from(new Set((data ?? []).map((r) => r.week_ending_date)));
  return unique.map(toAuctionWeek);
}

/** All passed-in properties (with geocode) for a given auction week. */
export async function fetchPassedIn(weekEndingDate: string): Promise<PassedInResult[]> {
  // PostgREST embed: join the parent property onto each result row.
  // `!inner` drops results whose property somehow went missing.
  const { data, error } = await supabase
    .from("auction_results")
    .select("*, property:properties!inner(*)")
    .eq("status", "passed_in")
    .eq("week_ending_date", weekEndingDate);

  if (error) throw error;

  const rows = (data ?? []) as unknown as PassedInResult[];
  // Only keep rows we can actually place on the map.
  return rows.filter((r) => r.property?.lat != null && r.property?.lng != null);
}
