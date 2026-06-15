"use client";

import type { AuctionWeek } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  weeks: AuctionWeek[];
  value: string | null;
  onChange: (weekEndingDate: string) => void;
}

/** Floating, centred week picker that sits over the top of the map. */
export function WeekSelector({ weeks, value, onChange }: Props) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-10 -translate-x-1/2">
      <div className="rounded-full border bg-background/90 px-2 py-1.5 shadow-lg backdrop-blur">
        <Select value={value ?? undefined} onValueChange={onChange}>
          <SelectTrigger className="w-[230px] rounded-full border-0 shadow-none focus:ring-0">
            <SelectValue placeholder="Select auction week" />
          </SelectTrigger>
          <SelectContent>
            {weeks.map((w) => (
              <SelectItem key={w.weekEndingDate} value={w.weekEndingDate}>
                {w.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
