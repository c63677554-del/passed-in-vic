"use client";

import type { ReactNode } from "react";
import { ExternalLink, BedDouble, Bath, Car, MapPin } from "lucide-react";
import type { PassedInResult } from "@/lib/types";
import { formatPrice, googleSearchUrl } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  result: PassedInResult | null;
  onClose: () => void;
}

/** Slide-out detail panel for a single passed-in property. */
export function PropertySidebar({ result, onClose }: Props) {
  const open = result !== null;
  const p = result?.property;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {result && p && (
          <>
            <SheetHeader className="space-y-2 text-left">
              <Badge variant="destructive" className="w-fit">
                Passed In
              </Badge>
              <SheetTitle className="text-xl leading-tight">{p.address}</SheetTitle>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {[p.suburb, p.state, p.postcode].filter(Boolean).join(" ")}
              </p>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Key figures */}
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Passed-in bid" value={formatPrice(result.passed_in_price)} />
                <Stat label="Vendor bid" value={formatPrice(result.vendor_bid)} />
              </div>

              {/* Property attributes */}
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {p.property_type && <Badge variant="secondary">{p.property_type}</Badge>}
                {p.bedrooms != null && <Feature icon={<BedDouble className="h-4 w-4" />} n={p.bedrooms} />}
                {p.bathrooms != null && <Feature icon={<Bath className="h-4 w-4" />} n={p.bathrooms} />}
                {p.carspaces != null && <Feature icon={<Car className="h-4 w-4" />} n={p.carspaces} />}
              </div>

              {/* Agent / agency */}
              {(result.agent || result.agency) && (
                <div className="text-sm">
                  <p className="text-muted-foreground">Listing agent</p>
                  <p className="font-medium">
                    {[result.agent, result.agency].filter(Boolean).join(" · ")}
                  </p>
                </div>
              )}

              {/* Prominent external search — opens a Google search in a new tab. */}
              <Button asChild size="lg" className="w-full">
                <a
                  href={googleSearchUrl(p.address, p.suburb)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Search Property
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function Feature({ icon, n }: { icon: ReactNode; n: number }) {
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      {icon}
      <span className="font-medium text-foreground">{n}</span>
    </span>
  );
}
