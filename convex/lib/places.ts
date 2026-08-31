// Google Places API (New) — the grounded "what's physically nearby" source.
// OpenAI reasons over these results; it never invents nearby businesses
// (see PLAN.md Addition 1).

const PLACES_BASE = "https://places.googleapis.com/v1";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.types",
  "places.location",
  "places.rating",
].join(",");

export type Place = {
  placeId: string;
  name: string;
  address?: string;
  website?: string;
  types: string[];
  lat?: number;
  lng?: number;
  rating?: number;
};

function requireKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY is not set on this Convex deployment. " +
        "Create a key with Places API (New) enabled and run " +
        "`npx convex env set GOOGLE_PLACES_API_KEY <key>`.",
    );
  }
  return key;
}

async function placesFetch(path: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${PLACES_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": requireKey(),
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Places error ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

function normalize(raw: any): Place | null {
  if (!raw?.id) return null;
  return {
    placeId: raw.id,
    name: raw.displayName?.text ?? raw.formattedAddress ?? "Unknown place",
    address: raw.formattedAddress,
    website: raw.websiteUri,
    types: Array.isArray(raw.types) ? raw.types : [],
    lat: raw.location?.latitude,
    lng: raw.location?.longitude,
    rating: typeof raw.rating === "number" ? raw.rating : undefined,
  };
}

function normalizeAll(result: any): Place[] {
  const places = Array.isArray(result?.places) ? result.places : [];
  return places.map(normalize).filter((p: Place | null): p is Place => p !== null);
}

/** Resolve free text ("Corner Cafe 123 Main St") to real places. */
export async function searchTextPlaces(
  textQuery: string,
  opts?: { lat?: number; lng?: number; radiusMeters?: number; maxResultCount?: number },
): Promise<Place[]> {
  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: opts?.maxResultCount ?? 5,
  };
  if (opts?.lat !== undefined && opts?.lng !== undefined) {
    body.locationBias = {
      circle: {
        center: { latitude: opts.lat, longitude: opts.lng },
        radius: opts.radiusMeters ?? 2000,
      },
    };
  }
  return normalizeAll(await placesFetch("/places:searchText", body));
}

/** Real businesses physically around a point, ranked by prominence. */
export async function searchNearbyPlaces(opts: {
  lat: number;
  lng: number;
  radiusMeters?: number;
  maxResultCount?: number;
  includedTypes?: string[];
}): Promise<Place[]> {
  const body: Record<string, unknown> = {
    maxResultCount: opts.maxResultCount ?? 20,
    locationRestriction: {
      circle: {
        center: { latitude: opts.lat, longitude: opts.lng },
        radius: opts.radiusMeters ?? 1500,
      },
    },
  };
  if (opts.includedTypes && opts.includedTypes.length > 0) {
    body.includedTypes = opts.includedTypes;
  }
  return normalizeAll(await placesFetch("/places:searchNearby", body));
}
