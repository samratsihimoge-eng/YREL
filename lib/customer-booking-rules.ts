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

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(drop.lat - pickup.lat);
  const dLon = toRadians(drop.lon - pickup.lon);
  const lat1 = toRadians(pickup.lat);
  const lat2 = toRadians(drop.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const straightKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // A long cross-city route must not become a City ride merely because
  // Photon assigns both endpoints to the same broad municipal label.
  if (pickupCity && dropCity && pickupCity !== dropCity) return "outstation";
  if (pickupCity && dropCity) return straightKm <= 20 ? "city" : "outstation";

  // When Photon has incomplete settlement metadata, keep the local fallback
  // tighter so a 30+ km inter-town journey is not priced as a City ride.
  return straightKm <= 15 ? "city" : "outstation";
}
