"use client";

import { useEffect, useState } from "react";
import { PropertyMap } from "@/components/PropertyMap";
import { WeekSelector } from "@/components/WeekSelector";
import { PropertySidebar } from "@/components/PropertySidebar";
import { fetchAuctionWeeks, fetchPassedIn } from "@/lib/queries";
import type { AuctionWeek, PassedInResult } from "@/lib/types";

export default function Home() {
  const [weeks, setWeeks] = useState<AuctionWeek[]>([]);
  const [week, setWeek] = useState<string | null>(null);
  const [results, setResults] = useState<PassedInResult[]>([]);
  const [selected, setSelected] = useState<PassedInResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Load the list of available weeks once; default to the most recent.
  useEffect(() => {
    fetchAuctionWeeks()
      .then((w) => {
        setWeeks(w);
        if (w.length) setWeek(w[0].weekEndingDate);
      })
      .catch(console.error);
  }, []);

  // Re-fetch properties whenever the selected week changes.
  useEffect(() => {
    if (!week) return;
    setLoading(true);
    setSelected(null);
    fetchPassedIn(week)
      .then(setResults)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [week]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      <PropertyMap
        results={results}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
      />

      <WeekSelector weeks={weeks} value={week} onChange={setWeek} />

      {/* Result count / loading chip, bottom-left. */}
      <div className="absolute bottom-4 left-4 z-10 rounded-full bg-background/90 px-3 py-1.5 text-sm shadow-lg backdrop-blur">
        {loading ? "Loading…" : `${results.length} passed in`}
      </div>

      <PropertySidebar result={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
