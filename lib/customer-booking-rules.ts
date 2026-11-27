export type BookingArea = "city" | "outstation";

export type BookingPlace = {
  name: string;
  label: string;
  lat: number;
  lon: number;
  city?: string;
  state?: string;
  country?: string;
};

export const normalizePlaceName = (value?: string) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en-IN")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");

const canonicalCity = (value?: string) => {
  const city = normalizePlaceName(value);
  if (["bengaluru", "bangalore", "bengaluru urban", "bangalore urban"].includes(city)) {
    return "bengaluru";
  }
  return city;
};

export const isBengaluruUrbanPlace = (place: BookingPlace | null) =>
  Boolean(
    place &&
      place.lat >= 12.70 &&
      place.lat <= 13.30 &&
      place.lon >= 77.25 &&
      place.lon <= 77.95
  );

export const isAirportBookingPlace = (place: BookingPlace | null) => {
  if (!place) return false;
  const value = `${place.name} ${place.label}`.toLocaleLowerCase("en-IN");
  return value.includes("airport") || value.includes(" ವಿಮಾನ ನಿಲ್ದಾಣ");
};

/**
 * City/outstation is inferred from the selected settlement metadata first.
 * Only when Photon does not return two comparable city names do we use a
 * conservative local-radius fallback. Bengaluru's metro boundary is handled
 * separately because Photon often returns different locality labels there.
 */
export function detectBookingArea(
  pickup: BookingPlace | null,
  drop: BookingPlace | null
): BookingArea | null {
  if (!pickup || !drop) return null;

  const pickupState = normalizePlaceName(pickup.state);
  const dropState = normalizePlaceName(drop.state);
  if (pickupState && dropState && pickupState !== dropState) return "outstation";

  if (isBengaluruUrbanPlace(pickup) && isBengaluruUrbanPlace(drop)) return "city";

  const pickupCity = canonicalCity(pickup.city);
  const dropCity = canonicalCity(drop.city);
  if (pickupCity && dropCity) return pickupCity === dropCity ? "city" : "outstation";

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(drop.lat - pickup.lat);
  const dLon = toRadians(drop.lon - pickup.lon);
  const lat1 = toRadians(pickup.lat);
  const lat2 = toRadians(drop.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const straightKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // When Photon has no settlement metadata, do not classify a 30+ km
  // inter-town journey as a city ride. This fallback is deliberately local.
  return straightKm <= 15 ? "city" : "outstation";
}
