// Database row shapes — mirror /supabase/schema.sql (Step 3).

export type AuctionStatus =
  | "passed_in"
  | "sold"
  | "withdrawn"
  | "sold_prior"
  | "sold_after";

export interface Property {
  id: string;
  address: string;
  address_key: string;
  suburb: string | null;
  postcode: string | null;
  state: string;
  lat: number | null;
  lng: number | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  carspaces: number | null;
  created_at: string;
}

export interface AuctionResult {
  id: string;
  property_id: string;
  week_ending_date: string; // ISO date, e.g. "2026-06-13"
  status: AuctionStatus;
  passed_in_price: number | null;
  vendor_bid: number | null;
  agent: string | null;
  agency: string | null;
  source: string | null;
  created_at: string;
}

// Shape returned by the joined query (auction_results + embedded property).
export interface PassedInResult extends AuctionResult {
  property: Property;
}

// One selectable auction week for the floating filter control.
export interface AuctionWeek {
  weekEndingDate: string; // "2026-06-13"
  label: string;          // "7 Jun – 13 Jun 2026"
}
