"use client";

import { useMemo, useState } from "react";
// react-map-gl v7 imports from "react-map-gl".
// On v8+ this moved to "react-map-gl/mapbox" — change the line below if you upgrade.
import Map, { Marker, NavigationControl, type ViewState } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { PassedInResult } from "@/lib/types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Melbourne CBD — initial camera.
const INITIAL_VIEW: Partial<ViewState> = {
  longitude: 144.9631,
  latitude: -37.8136,
  zoom: 10,
};

interface Props {
  results: PassedInResult[];
  selectedId: string | null;
  onSelect: (result: PassedInResult) => void;
}

export function PropertyMap({ results, selectedId, onSelect }: Props) {
  const [viewState, setViewState] = useState(INITIAL_VIEW);

  // Only render markers that have coordinates.
  const markers = useMemo(
    () => results.filter((r) => r.property.lat != null && r.property.lng != null),
    [results]
  );

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground">
        Set <code className="mx-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> in web/.env.local to load the map.
      </div>
    );
  }

  return (
    <Map
      {...viewState}
      onMove={(e) => setViewState(e.viewState)}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle="mapbox://styles/mapbox/light-v11"
      style={{ width: "100%", height: "100%" }}
    >
      <NavigationControl position="bottom-right" />

      {markers.map((r) => {
        const selected = r.id === selectedId;
        return (
          <Marker
            key={r.id}
            longitude={r.property.lng!}
            latitude={r.property.lat!}
            anchor="center"
            onClick={(e) => {
              // Stop the click from bubbling to the map (which would deselect).
              e.originalEvent.stopPropagation();
              onSelect(r);
            }}
          >
            {/* The "dot" — grows + rings when selected. */}
            <button
              aria-label={r.property.address}
              className={[
                "block rounded-full border-2 border-white shadow-md transition-all",
                selected
                  ? "h-5 w-5 bg-red-600 ring-4 ring-red-600/30"
                  : "h-3.5 w-3.5 bg-red-500 hover:h-4 hover:w-4",
              ].join(" ")}
            />
          </Marker>
        );
      })}
    </Map>
  );
}
