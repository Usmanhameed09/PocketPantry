const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1";

type LatLng = {
  latitude: number;
  longitude: number;
};

type GoogleMapsSearchMode = "category" | "all";

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
};

type LegacyPlaceSearchResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  business_status?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  types?: string[];
};

type LegacyPlaceDetailsResult = {
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  url?: string;
};

export type GoogleMapsLeadCandidate = {
  placeId: string;
  business: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  distance: string;
  distanceMiles?: number;
  businessType: string;
  source: "Google Maps";
  website?: string;
  googleMapsUri?: string;
  importable: boolean;
  reason?: string;
};

function getGoogleMapsApiKey() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
  }

  return apiKey;
}

function metersFromMiles(miles: number) {
  return Math.max(160.934, Math.min(miles * 1609.34, 50000));
}

function titleCaseType(value?: string) {
  if (!value) return "";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizePhone(value?: string) {
  return value?.trim() || "";
}

function formatDistanceMiles(value?: number) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  const rounded = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${rounded} mi`;
}

function haversineMiles(from: LatLng, to: LatLng) {
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDistance = toRadians(to.latitude - from.latitude);
  const lngDistance = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(latDistance / 2) ** 2 +
    Math.sin(lngDistance / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

async function geocodeZipcode(zipcode: string) {
  const apiKey = getGoogleMapsApiKey();
  const params = new URLSearchParams({
    address: zipcode,
    components: `country:US|postal_code:${zipcode}`,
    key: apiKey,
  });

  const response = await fetch(`${GOOGLE_GEOCODE_URL}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google geocoding failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{
      geometry?: {
        location?: {
          lat?: number;
          lng?: number;
        };
      };
      formatted_address?: string;
    }>;
    error_message?: string;
  };

  if (payload.status !== "OK" || !payload.results?.[0]?.geometry?.location) {
    throw new Error(payload.error_message || "Could not find that ZIP code.");
  }

  const location = payload.results[0].geometry.location;
  return {
    center: {
      latitude: Number(location.lat),
      longitude: Number(location.lng),
    },
    formattedAddress: payload.results[0].formatted_address || zipcode,
  };
}

async function placesFetch<T>(pathname: string, body: Record<string, unknown>) {
  const apiKey = getGoogleMapsApiKey();
  const response = await fetch(`${GOOGLE_PLACES_URL}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.primaryType,places.types,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Google Places failed (${response.status}): ${message}`);
  }

  return response.json() as Promise<T>;
}

async function searchNearby(center: LatLng, radiusMeters: number) {
  try {
    const payload = await placesFetch<{ places?: GooglePlace[] }>("/places:searchNearby", {
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center,
          radius: radiusMeters,
        },
      },
    });

    return payload.places || [];
  } catch {
    return searchNearbyLegacy(center, radiusMeters);
  }
}

async function searchByCategory(category: string, zipcode: string, center: LatLng, radiusMeters: number) {
  try {
    const payload = await placesFetch<{ places?: GooglePlace[] }>("/places:searchText", {
      textQuery: `${category} near ${zipcode}`,
      pageSize: 20,
      locationRestriction: {
        circle: {
          center,
          radius: radiusMeters,
        },
      },
      rankPreference: "DISTANCE",
    });

    return payload.places || [];
  } catch {
    return searchByCategoryLegacy(category, zipcode);
  }
}

async function legacyFetch<T>(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google legacy Places failed (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

async function fetchLegacyPlaceDetails(placeId: string) {
  const apiKey = getGoogleMapsApiKey();
  const params = new URLSearchParams({
    place_id: placeId,
    fields: "formatted_phone_number,international_phone_number,website,url",
    key: apiKey,
  });

  const payload = await legacyFetch<{
    status?: string;
    result?: LegacyPlaceDetailsResult;
  }>(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`);

  if (payload.status !== "OK" || !payload.result) {
    return {};
  }

  return payload.result;
}

async function enrichLegacyPlaces(places: LegacyPlaceSearchResult[]): Promise<GooglePlace[]> {
  const topPlaces = places.slice(0, 20);
  const detailResults: Array<GooglePlace | null> = await Promise.all(
    topPlaces.map(async (place) => {
      if (!place.place_id) {
        return null;
      }

      const details = await fetchLegacyPlaceDetails(place.place_id);
      return {
        id: place.place_id,
        displayName: { text: place.name || "" },
        formattedAddress: place.formatted_address,
        location: {
          latitude: place.geometry?.location?.lat,
          longitude: place.geometry?.location?.lng,
        },
        businessStatus: place.business_status,
        primaryType: place.types?.[0],
        types: place.types,
        nationalPhoneNumber: details.formatted_phone_number,
        internationalPhoneNumber: details.international_phone_number,
        websiteUri: details.website,
        googleMapsUri: details.url,
      } satisfies GooglePlace;
    })
  );

  return detailResults.filter((place): place is GooglePlace => place !== null);
}

async function searchNearbyLegacy(center: LatLng, radiusMeters: number) {
  const apiKey = getGoogleMapsApiKey();
  const params = new URLSearchParams({
    location: `${center.latitude},${center.longitude}`,
    radius: String(Math.round(radiusMeters)),
    key: apiKey,
  });

  const payload = await legacyFetch<{
    status?: string;
    results?: LegacyPlaceSearchResult[];
  }>(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`);

  if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
    throw new Error(`Google legacy Nearby Search failed: ${payload.status || "unknown error"}`);
  }

  return enrichLegacyPlaces(payload.results || []);
}

async function searchByCategoryLegacy(category: string, zipcode: string) {
  const apiKey = getGoogleMapsApiKey();
  const params = new URLSearchParams({
    query: `${category} in ${zipcode}`,
    key: apiKey,
  });

  const payload = await legacyFetch<{
    status?: string;
    results?: LegacyPlaceSearchResult[];
  }>(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`);

  if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
    throw new Error(`Google legacy Text Search failed: ${payload.status || "unknown error"}`);
  }

  return enrichLegacyPlaces(payload.results || []);
}

function normalizePlaceToLeadCandidate(place: GooglePlace, searchCenter: LatLng): GoogleMapsLeadCandidate | null {
  if (!place.id || !place.displayName?.text || !place.formattedAddress) {
    return null;
  }

  const distanceMiles =
    place.location?.latitude !== undefined && place.location?.longitude !== undefined
      ? haversineMiles(searchCenter, {
          latitude: Number(place.location.latitude),
          longitude: Number(place.location.longitude),
        })
      : undefined;

  const phone = normalizePhone(place.nationalPhoneNumber || place.internationalPhoneNumber);
  const businessType = titleCaseType(place.primaryType || place.types?.[0]) || "Business";
  const importable = Boolean(phone);

  return {
    placeId: place.id,
    business: place.displayName.text.trim(),
    contact: "Front Desk",
    phone,
    email: "",
    address: place.formattedAddress,
    distance: formatDistanceMiles(distanceMiles),
    distanceMiles,
    businessType,
    source: "Google Maps",
    website: place.websiteUri,
    googleMapsUri: place.googleMapsUri,
    importable,
    reason: importable ? undefined : "No phone number available from Google Maps.",
  };
}

export async function searchGoogleMapsLeads(params: {
  zipcode: string;
  radiusMiles: number;
  category?: string;
  mode: GoogleMapsSearchMode;
}) {
  const zipcode = params.zipcode.trim();
  if (!zipcode) {
    throw new Error("ZIP code is required.");
  }

  const radiusMiles = Number(params.radiusMiles);
  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) {
    throw new Error("Radius must be greater than 0.");
  }

  const { center, formattedAddress } = await geocodeZipcode(zipcode);
  const radiusMeters = metersFromMiles(radiusMiles);

  const rawPlaces =
    params.mode === "category" && params.category?.trim()
      ? await searchByCategory(params.category.trim(), zipcode, center, radiusMeters)
      : await searchNearby(center, radiusMeters);

  const ignoredTypes = new Set([
    "route",
    "street_address",
    "postal_code",
    "locality",
    "neighborhood",
    "political",
    "premise",
    "subpremise",
  ]);

  const deduped = new Map<string, GoogleMapsLeadCandidate>();
  for (const place of rawPlaces) {
    if (place.businessStatus && place.businessStatus !== "OPERATIONAL") {
      continue;
    }

    if (place.primaryType && ignoredTypes.has(place.primaryType)) {
      continue;
    }

    const candidate = normalizePlaceToLeadCandidate(place, center);
    if (!candidate) {
      continue;
    }

    if (!deduped.has(candidate.placeId)) {
      deduped.set(candidate.placeId, candidate);
    }
  }

  const strictRadiusCandidates = [...deduped.values()].filter((candidate) => {
    if (candidate.distanceMiles === null || candidate.distanceMiles === undefined) {
      return true;
    }

    return candidate.distanceMiles <= radiusMiles;
  });

  return {
    center,
    formattedAddress,
    radiusMiles,
    mode: params.mode,
    category: params.category?.trim() || "",
    candidates: strictRadiusCandidates.sort((a, b) => {
      const aDistance = a.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      const bDistance = b.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      return aDistance - bDistance;
    }),
  };
}
