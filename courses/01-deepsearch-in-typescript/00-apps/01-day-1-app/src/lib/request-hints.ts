import { geolocation } from "@vercel/functions";

export interface RequestHints {
  latitude?: string;
  longitude?: string;
  city?: string;
  country?: string;
}

export function getRequestHints(request: Request): RequestHints {
  // Mock geolocation data for development
  if (process.env.NODE_ENV === "development") {
    request.headers.set("x-vercel-ip-country", "UK");
    request.headers.set("x-vercel-ip-country-region", "GB");
    request.headers.set("x-vercel-ip-city", "Oxford");
    request.headers.set("x-vercel-ip-latitude", "51.7520");
    request.headers.set("x-vercel-ip-longitude", "-1.2577");
  }

  const { longitude, latitude, city, country } = geolocation(request);

  console.debug("Request hints:", {
    longitude,
    latitude,
    city,
    country,
  })

  return {
    longitude,
    latitude,
    city,
    country,
  };
}

export function getRequestPromptFromHints(requestHints: RequestHints): string {
  if (!requestHints.latitude && !requestHints.longitude && !requestHints.city && !requestHints.country) {
    return "";
  }

  return `About the origin of user's request:
- lat: ${requestHints.latitude || "unknown"}
- lon: ${requestHints.longitude || "unknown"}
- city: ${requestHints.city || "unknown"}
- country: ${requestHints.country || "unknown"}
`;
}
