
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ArrowRight, CarFront, CarTaxiFront, Car, BusFront, Check, Clock3, MapPin, Menu, ShieldCheck,
  UserRound, X, Navigation, CalendarDays, LogOut, Loader2, Users
} from "lucide-react";

type Service = "cab" | "driver" | "rental";
type Area = "city" | "outstation";
type Ride =
  | "Auto"
  | "Hatchback"
  | "Sedan"
  | "Ertiga"
  | "Innova Crysta"
  | "MPV"
  | "SUV";

type Place = {
  name: string;
  label: string;
  lat: number;
  lon: number;
  city?: string;
  state?: string;
  country?: string;
};

type Booking = {
  id: string;
  booking_code: string;
  service_type: string;
  vehicle_type: string | null;
  pickup: string;
  dropoff: string | null;
  scheduled_at: string | null;
  estimated_fare: number;
  status: string;
  created_at: string;
  booking_details?: Record<string, unknown>;
};

type Customer = {
  id: string;
  customer_code: string;
  full_name: string;
  phone: string | null;
  phone_verified: boolean;
};

type SeatShareTrip = {
  id: string;
  driver_user_id: string;
  pickup: string;
  dropoff: string;
  departure_at: string;
  total_seats: number;
  available_seats: number;
  fare_per_seat: number;
  status: string;
};

type SeatShareBooking = {
  id: string;
  booking_code: string;
  trip_id: string;
  seats_booked: number;
  fare_per_seat: number;
  total_fare: number;
  status: string;
  created_at: string;
  seat_share_trips?: {
    pickup: string;
    dropoff: string;
    departure_at: string;
  } | null;
};

const PHONE_STORAGE_KEY = "yrel_pending_customer_phone";
const BOOKING_DRAFT_STORAGE_KEY = "yrel_booking_draft_v1";

const CITY_CAB: Record<string, { min: number; nonAc: number; ac: number }> = {
  Hatchback: { min: 105, nonAc: 18, ac: 22 },
  Sedan: { min: 119, nonAc: 20, ac: 24 },
  Ertiga: { min: 159, nonAc: 22, ac: 25 },
  "Innova Crysta": { min: 179, nonAc: 26, ac: 28 },
};

const OUTSTATION: Record<string, { round: number; one: number; bata: number }> = {
  Hatchback: { round: 12, one: 15, bata: 300 },
  Sedan: { round: 13, one: 16, bata: 350 },
  Ertiga: { round: 16, one: 18, bata: 400 },
  "Innova Crysta": { round: 20, one: 25, bata: 500 },
};

const RENTAL_CITY: Record<
  string,
  { fares: number[]; km: number; extraKm: number; extraMin: number }
> = {
  Hatchback: { fares: [399, 699, 899], km: 10, extraKm: 12, extraMin: 2 },
  Sedan: { fares: [449, 799, 999], km: 10, extraKm: 14, extraMin: 2.5 },
  MPV: { fares: [599, 999, 1299], km: 10, extraKm: 17, extraMin: 3 },
  SUV: { fares: [699, 1199, 1499], km: 10, extraKm: 18, extraMin: 3.5 },
};

const DRIVER_VEHICLES = ["Hatchback", "Sedan", "SUV"];

const money = (n: number) =>
  `₹${Math.round(n).toLocaleString("en-IN")}`;

const normalizeCity = (value?: string) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en-IN")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");

const getAutoCabArea = (
  pickup: Place | null,
  drop: Place | null
): Area | null => {
  if (!pickup || !drop) return null;

  const pickupState = normalizeCity(pickup.state);
  const dropState = normalizeCity(drop.state);

  // Different known states are always outstation.
  if (pickupState && dropState && pickupState !== dropState) {
    return "outstation";
  }

  const canonicalCity = (value?: string) => {
    const city = normalizeCity(value);
    if (
      city === "bengaluru" ||
      city === "bangalore" ||
      city === "bengaluru urban" ||
      city === "bangalore urban"
    ) {
      return "bengaluru";
    }
    return city;
  };

  const pickupCity = canonicalCity(pickup.city);
  const dropCity = canonicalCity(drop.city);

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRadians(pickup.lat);
  const lat2 = toRadians(drop.lat);
  const deltaLat = toRadians(drop.lat - pickup.lat);
  const deltaLon = toRadians(drop.lon - pickup.lon);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;
  const straightKm =
    6371 * 2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  // Treat two points inside Bengaluru urban coordinates as City Local,
  // even if Photon returns different locality/city labels (e.g. Hebbal).
  if (isBengaluruUrban(pickup) && isBengaluruUrban(drop)) {
    return "city";
  }

  // Keep the explicit city-name rule as a fallback for long Bengaluru routes.
  if (pickupCity === "bengaluru" && dropCity === "bengaluru") {
    return "city";
  }

  // Different known cities are outstation regardless of distance.
  if (pickupCity && dropCity && pickupCity !== dropCity) {
    return "outstation";
  }

  // Other same-city routes (and routes with incomplete city metadata)
  // use the agreed 35 km local threshold.
  return straightKm <= 35 ? "city" : "outstation";
};

const isIndia = (lat: number, lon: number) =>
  lat >= 6 && lat <= 38.5 && lon >= 68 && lon <= 97.5;

// A coordinate-based Bengaluru urban check prevents Photon from treating
// localities such as Hebbal, KR Puram and Electronic City as separate cities.
const isBengaluruUrban = (place: Place | null) =>
  Boolean(
    place &&
      place.lat >= 12.70 &&
      place.lat <= 13.30 &&
      place.lon >= 77.25 &&
      place.lon <= 77.95
  );

const isAirportPlace = (place: Place | null) => {
  if (!place) return false;

  const value = `${place.name} ${place.label}`.toLowerCase();

  return (
    value.includes("airport") ||
    value.includes(" ವಿಮಾನ ನಿಲ್ದಾಣ")
  );
};

const localDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const matchesRouteLocation = (
  tripLocation: string,
  selectedLocation: Place
) => {
  const trip = normalizeCity(tripLocation);
  const selectedLabel = normalizeCity(selectedLocation.label);
  const selectedName = normalizeCity(selectedLocation.name);
  const selectedCity = normalizeCity(selectedLocation.city);

  if (!trip) return false;

  return (
    trip === selectedLabel ||
    trip === selectedName ||
    (selectedLabel.length >= 4 && trip.includes(selectedLabel)) ||
    (selectedName.length >= 4 && trip.includes(selectedName)) ||
    (selectedCity.length >= 3 &&
      (trip === selectedCity || trip.includes(selectedCity)))
  );
};

const formatDeparture = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const VehicleIcon = ({ vehicle }: { vehicle: string }) => {
  if (vehicle === "Auto") {
    return (
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M15 17.5 18.5 9h11L33 17.5l5 4v13H10v-13l5-4Z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"/>
        <path d="M15 18h18M19 9V6h10v3M10 25h28M15 34v4m18-4v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        <circle cx="16" cy="29" r="2" fill="currentColor"/><circle cx="32" cy="29" r="2" fill="currentColor"/>
        <path d="M7 38h34" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
      </svg>
    );
  }
  const Icon = vehicle === "Hatchback" ? CarFront : vehicle === "Sedan" ? Car : vehicle === "Ertiga" || vehicle === "Innova Crysta" ? BusFront : CarFront;
  return <Icon size={25} strokeWidth={1.9} />;
};

export default function Home() {
  const [service, setService] = useState<Service>("cab");
  const [area, setArea] = useState<Area>("city");
  const [tripType, setTripType] = useState<"one-way" | "round-trip">(
    "round-trip"
  );
  const [ride, setRide] = useState<Ride>("Sedan");
  const [ac, setAc] = useState<"AC" | "Non-AC">("AC");

  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [pickupPoint, setPickupPoint] = useState<Place | null>(null);
  const [dropPoint, setDropPoint] = useState<Place | null>(null);
  const [pickupOptions, setPickupOptions] = useState<Place[]>([]);
  const [dropOptions, setDropOptions] = useState<Place[]>([]);
  const [activeSearch, setActiveSearch] = useState<
    "pickup" | "drop" | null
  >(null);

  const [distance, setDistance] = useState<number | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchCenter, setSearchCenter] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  const [schedule, setSchedule] = useState<"now" | "later">("now");
  const [date, setDate] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [time, setTime] = useState("");
  const [hours, setHours] = useState(2);
  const [days, setDays] = useState(1);
  const [packageIndex, setPackageIndex] = useState(0);
  const [gear, setGear] = useState<"Manual" | "Automatic">("Manual");
  const [driverVehicle, setDriverVehicle] = useState("Sedan");

  // Seat Sharing state
  const [seatShareMode, setSeatShareMode] = useState(false);
  const [seatCount, setSeatCount] = useState(1);
  const [seatTrips, setSeatTrips] = useState<SeatShareTrip[]>([]);
  const [selectedSeatTrip, setSelectedSeatTrip] =
    useState<SeatShareTrip | null>(null);
  const [seatSearchLoading, setSeatSearchLoading] = useState(false);
  const [seatBookingLoading, setSeatBookingLoading] = useState(false);
  const [seatSearchDone, setSeatSearchDone] = useState(false);
  const [seatBookings, setSeatBookings] = useState<SeatShareBooking[]>([]);

  const [session, setSession] = useState<any>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [profileSetupOpen, setProfileSetupOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profilePhoneDraft, setProfilePhoneDraft] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [language, setLanguage] = useState<"en" | "kn" | "hi">("en");

  const autoCabArea = getAutoCabArea(pickupPoint, dropPoint);
  const airportRoute =
    isAirportPlace(pickupPoint) || isAirportPlace(dropPoint);

  // Seat Sharing is only for intercity/outstation journeys, plus
  // Bengaluru city-to-Bengaluru-airport journeys. A normal Bengaluru
  // locality-to-locality route (e.g. pickup to Hebbal) must never show it.
  const bengaluruAirportRoute = Boolean(
    airportRoute &&
      isBengaluruUrban(pickupPoint) &&
      isBengaluruUrban(dropPoint)
  );

  const seatShareEligible = Boolean(
    pickupPoint &&
      dropPoint &&
      (autoCabArea === "outstation" || bengaluruAirportRoute)
  );

  const bookingArea: Area | null =
    service === "cab" || service === "rental" ? autoCabArea : area;
  const rentalBookingArea = getAutoCabArea(pickupPoint, dropPoint);

  const words = {
    en: {
      tagline: "Your city. Your fun. Just YREL it.",
      pickup: "Pickup location",
      drop: "Destination",
      book: "Book now",
      login: "Continue with Google",
      history: "Your bookings",
    },
    kn: {
      tagline: "ನಿಮ್ಮ ಪ್ರಯಾಣ, ನಿಮ್ಮ ಆಯ್ಕೆ.",
      pickup: "ಪಿಕಪ್ ಸ್ಥಳ",
      drop: "ತಲುಪುವ ಸ್ಥಳ",
      book: "ಈಗ ಬುಕ್ ಮಾಡಿ",
      login: "Google ಮೂಲಕ ಮುಂದುವರಿಯಿರಿ",
      history: "ನಿಮ್ಮ ಬುಕ್ಕಿಂಗ್‌ಗಳು",
    },
    hi: {
      tagline: "आपकी सवारी, आपका तरीका।",
      pickup: "पिकअप स्थान",
      drop: "गंतव्य",
      book: "अभी बुक करें",
      login: "Google से जारी रखें",
      history: "आपकी बुकिंग",
    },
  }[language];

  async function loadBookings(userId: string) {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      setBookings(data as Booking[]);
    }
  }

  async function loadSeatShareBookings(userId: string) {
    const { data, error } = await supabase
      .from("seat_share_bookings")
      .select(`
        id,
        booking_code,
        trip_id,
        seats_booked,
        fare_per_seat,
        total_fare,
        status,
        created_at,
        seat_share_trips (
          pickup,
          dropoff,
          departure_at
        )
      `)
      .eq("customer_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      setSeatBookings(data as unknown as SeatShareBooking[]);
    } else if (error) {
      console.error("Seat Sharing history error:", error.message);
    }
  }

  async function loadCustomer(userId: string) {
    setProfileLoading(true);

    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_code, full_name, phone, phone_verified")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      setNotice(`Customer profile error: ${error.message}`);
      setCustomer(null);
      setProfileLoading(false);
      return;
    }

    if (data) {
      setCustomer(data as Customer);
      setProfileSetupOpen(false);
      localStorage.removeItem(PHONE_STORAGE_KEY);

      await Promise.all([
        loadBookings(userId),
        loadSeatShareBookings(userId),
      ]);
    } else {
      setCustomer(null);
      setProfileSetupOpen(true);
      const pendingPhone =
        localStorage.getItem(PHONE_STORAGE_KEY) || "";
      setPhone(pendingPhone);
      setBookings([]);
      setSeatBookings([]);
    }

    setProfileLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;

      setSession(data.session);

      if (data.session?.user) {
        void loadCustomer(data.session.user.id);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => {
        if (!mounted) return;

        setSession(next);

        if (next?.user) {
          window.setTimeout(() => {
            if (mounted) void loadCustomer(next.user.id);
          }, 0);
        } else {
          setCustomer(null);
          setBookings([]);
          setSeatBookings([]);
          setProfileSetupOpen(false);
        }
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!seatShareEligible) {
      setSeatShareMode(false);
      setSeatTrips([]);
      setSelectedSeatTrip(null);
      setSeatSearchDone(false);
          }
  }, [seatShareEligible]);
      
  // Restore unfinished booking form after login redirect or page refresh.
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(BOOKING_DRAFT_STORAGE_KEY);
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        if (draft.service) setService(draft.service);
        if (draft.area) setArea(draft.area);
        if (draft.tripType) setTripType(draft.tripType);
        if (draft.ride) setRide(draft.ride);
        if (draft.ac) setAc(draft.ac);
        if (typeof draft.pickup === "string") setPickup(draft.pickup);
        if (typeof draft.drop === "string") setDrop(draft.drop);
        if (draft.pickupPoint) setPickupPoint(draft.pickupPoint);
        if (draft.dropPoint) setDropPoint(draft.dropPoint);
        if (draft.distance !== undefined) setDistance(draft.distance);
        if (draft.eta !== undefined) setEta(draft.eta);
        if (draft.schedule) setSchedule(draft.schedule);
        if (typeof draft.date === "string") setDate(draft.date);
        if (typeof draft.arrivalDate === "string") setArrivalDate(draft.arrivalDate);
        if (typeof draft.time === "string") setTime(draft.time);
        if (typeof draft.hours === "number") setHours(draft.hours);
        if (typeof draft.days === "number") setDays(draft.days);
        if (typeof draft.packageIndex === "number") setPackageIndex(draft.packageIndex);
        if (draft.gear) setGear(draft.gear);
        if (typeof draft.driverVehicle === "string") setDriverVehicle(draft.driverVehicle);
        if (typeof draft.seatShareMode === "boolean") setSeatShareMode(draft.seatShareMode);
        if (typeof draft.seatCount === "number") {
          setSeatCount(Math.max(1, Math.min(4, draft.seatCount)));
        }
        if (draft.language) setLanguage(draft.language);
      }
    } catch (error) {
      console.error("Unable to restore YREL booking draft:", error);
      localStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
    } finally {
      setDraftRestored(true);
    }
  }, []);

  // Save booking choices so Google Login does not clear the form.
  useEffect(() => {
    if (!draftRestored) return;

    const draft = {
      service, area, tripType, ride, ac,
      pickup, drop, pickupPoint, dropPoint,
      distance, eta, schedule, date, arrivalDate, time,
      hours, days, packageIndex, gear, driverVehicle,
      seatShareMode, seatCount, language,
    };

    try {
      localStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error("Unable to save YREL booking draft:", error);
    }
  }, [
    draftRestored, service, area, tripType, ride, ac,
    pickup, drop, pickupPoint, dropPoint, distance, eta,
    schedule, date, arrivalDate, time, hours, days,
    packageIndex, gear, driverVehicle, seatShareMode,
    seatCount, language,
  ]);

  async function searchPlaces(
    value: string,
    kind: "pickup" | "drop"
  ) {
    if (value.trim().length < 3) {
      if (kind === "pickup") setPickupOptions([]);
      else setDropOptions([]);
      return;
    }
    try {
      const near = searchCenter
        ? `&lat=${searchCenter.lat}&lon=${searchCenter.lon}`
        : "";

      const url =
        `https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&limit=8&lang=en${near}`;

      const res = await fetch(url);
      const json = await res.json();

      const options: Place[] = (json.features || [])
        .map((f: any) => {
          const p = f.properties || {};
                    // Use actual settlement fields only. District/county can cover
          // multiple towns and must not be mistaken for a city.
          const city =
            p.city ||
            p.town ||
            p.village ||
            p.municipality ||
            p.locality ||
            "";
          const state = p.state || "";
          const name =
            p.name || p.street || p.postcode || city || "Location";

          return {
            name,
            city,
            state,
            country: p.country,
            label: [name, city, state]
              .filter(Boolean)
              .filter((v, i, a) => a.indexOf(v) === i)
              .join(", "),
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
          };
        })
        .filter((p: Place) => isIndia(p.lat, p.lon));

      if (kind === "pickup") setPickupOptions(options);
      else setDropOptions(options);
    } catch {
      setNotice(
        "Location search is temporarily unavailable. Please try again."
      );
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (activeSearch === "pickup") {
        void searchPlaces(pickup, "pickup");
      }
    }, 350);

    return () => clearTimeout(t);
  }, [pickup, activeSearch, searchCenter]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (activeSearch === "drop") {
        void searchPlaces(drop, "drop");
      }
    }, 350);

    return () => clearTimeout(t);
  }, [drop, activeSearch, searchCenter]);

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setNotice("GPS is not supported on this device.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude: lat, longitude: lon } = coords;

        if (!isIndia(lat, lon)) {
          setNotice("YREL currently supports locations within India only.");
          setLocating(false);
          return;
        }

        setSearchCenter({ lat, lon });

        try {
          const res = await fetch(
            `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`
          );
          const json = await res.json();
          const p = json.features?.[0]?.properties || {};

          const name = p.name || p.street || "Current location";
          const city =
  p.city ||
  p.town ||
  p.village ||
  p.municipality ||
  p.locality ||
  p.district ||
  p.county ||
  "";
          const state = p.state || "";

          const place: Place = {
            name,
            city,
            state,
            lat,
            lon,
            label: [name, city, state].filter(Boolean).join(", "),
          };

          setPickup(place.label);
          setPickupPoint(place);
          setActiveSearch(null);
        } catch {
          setPickup("Current location");
          setPickupPoint({
            name: "Current location",
            label: "Current location",
            lat,
            lon,
          });
        }

        setLocating(false);
      },
      () => {
        setNotice("Please allow location permission and try again.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  useEffect(() => {
    if (!pickupPoint || !dropPoint) {
      setDistance(null);
      setEta(null);
      return;
    }

    let cancelled = false;

    setRouteLoading(true);

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${pickupPoint.lon},${pickupPoint.lat};${dropPoint.lon},${dropPoint.lat}?overview=false`
    )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;

        const route = json.routes?.[0];

        if (route && route.distance > 0) {
          setDistance(route.distance / 1000);
          setEta(Math.round(route.duration / 60));
        } else {
          setDistance(null);
          setEta(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDistance(null);
          setEta(null);
        }
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pickupPoint, dropPoint, area, service]);

  const fare = useMemo(() => {
    const travelDate =
      date && time ? new Date(`${date}T${time}`) : new Date();

    const hour = travelDate.getHours();
    const autoNight = hour >= 22 || hour < 5;
    const cabNight = hour >= 23 || hour < 5;

    if (service === "cab" && bookingArea === "city") {
      if (ride === "Auto") {
        const base = distance
          ? Math.max(36, 36 + Math.max(0, distance - 2) * 18)
          : 0;

        return base ? (autoNight ? base * 1.5 : base) : 0;
      }

      const rate = CITY_CAB[ride];

      const base =
        rate && distance
          ? Math.max(
              rate.min,
              rate.min +
                Math.max(0, distance - 4) *
                  (ac === "AC" ? rate.ac : rate.nonAc)
            )
          : 0;

      return base ? base + (cabNight ? 50 : 0) : 0;
    }

    if (service === "cab" && bookingArea === "outstation") {
      const rate = OUTSTATION[ride];
      return rate && distance
        ? distance * rate.one + rate.bata
        : 0;
    }

    if (service === "driver" && area === "city") {
      return tripType === "round-trip"
        ? 299 + Math.max(0, hours - 2) * 60 * 2.5
        : 399 + Math.max(0, hours - 2) * 60 * 2.5;
    }

        if (service === "driver" && area === "outstation") {
      if (tripType === "one-way") {
        return distance !== null
          ? 1000 + Math.max(0, distance - 250) * 2
          : 0;
      }

      return days === 1 ? 1300 : 1499 * days;
    }

    if (service === "rental" && rentalBookingArea === "city") {
      return RENTAL_CITY[ride]?.fares[packageIndex] || 0;
    }

    if (service === "rental" && rentalBookingArea === "outstation") {
      const rate = OUTSTATION[ride];
      const totalKm = distance ? distance * 2 : 0;

      return rate
        ? Math.max(totalKm, days * 300) * rate.round +
            rate.bata * days
        : 0;
    }

    return 0;
  }, [
    service,
    bookingArea,
    rentalBookingArea,
    area,
    ride,
    ac,
    distance,
    tripType,
    days,
    hours,
    packageIndex,
    date,
    time,
  ]);

  function choosePlace(place: Place, kind: "pickup" | "drop") {
    if (kind === "pickup") {
      setPickup(place.label);
      setPickupPoint(place);
      setPickupOptions([]);
    } else {
      setDrop(place.label);
      setDropPoint(place);
      setDropOptions([]);
    }

    setActiveSearch(null);
    setSeatTrips([]);
    setSelectedSeatTrip(null);
    setSeatSearchDone(false);
  }

  function changeService(next: Service) {
    setService(next);
    setArea("city");
    setTripType(next === "cab" ? "one-way" : "round-trip");
    setDistance(null);
    setEta(null);
    setNotice("");

    setSeatShareMode(false);
    setSeatTrips([]);
    setSelectedSeatTrip(null);
    setSeatSearchDone(false);

    if (next === "cab" || next === "driver") {
      setRide("Sedan");
    }

    if (next === "rental") {
      setRide("Hatchback");
    }
  }

  function closeAuth() {
    setAuthOpen(false);
    setNotice("");
  }

  async function startGoogleLogin() {
    const digits = phone.replace(/\D/g, "");

    if (!/^[6-9]\d{9}$/.test(digits)) {
      setNotice(
        "ದಯವಿಟ್ಟು ಸರಿಯಾದ 10 ಅಂಕಿಯ Indian mobile number ನಮೂದಿಸಿ."
      );
      return;
    }

    setBusy(true);
    setNotice("");

    localStorage.setItem(PHONE_STORAGE_KEY, digits);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "https://yrel-lilac.vercel.app",
      },
    });

    if (error) {
      setBusy(false);
      setNotice(error.message);
      localStorage.removeItem(PHONE_STORAGE_KEY);
    }
  }

  async function createCustomerProfile() {
    const name = fullName.trim();

    const digits = (
      phone ||
      localStorage.getItem(PHONE_STORAGE_KEY) ||
      ""
    ).replace(/\D/g, "");

    if (!name || name.length < 2) {
      setNotice("ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.");
      return;
    }

    if (!session?.user) {
      setNotice(
        "Google Login session ಸಿಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ Login ಮಾಡಿ."
      );
      return;
    }

    if (!/^[6-9]\d{9}$/.test(digits)) {
      setNotice(
        "ದಯವಿಟ್ಟು ಸರಿಯಾದ 10 ಅಂಕಿಯ Indian mobile number ನಮೂದಿಸಿ."
      );
      return;
    }

    setBusy(true);
    setNotice("");

    const { data, error } = await supabase
      .from("customers")
      .insert({
        id: session.user.id,
        full_name: name,
        phone: `+91${digits}`,
        phone_verified: false,
      })
      .select(
        "id, customer_code, full_name, phone, phone_verified"
      )
      .single();

    setBusy(false);

    if (error) {
      if (error.code === "23505") {
        setNotice(
          "ಈ Google Account‌ಗೆ Customer Profile ಈಗಾಗಲೇ ಇದೆ. ಪುಟವನ್ನು Refresh ಮಾಡಿ."
        );
      } else {
        setNotice(`Profile save failed: ${error.message}`);
      }

      return;
    }

    setCustomer(data as Customer);
    setProfileSetupOpen(false);
    setAuthOpen(false);
    localStorage.removeItem(PHONE_STORAGE_KEY);
    setFullName("");

    setNotice(
      `ಸ್ವಾಗತ ${data.full_name}! ನಿಮ್ಮ Customer ID: ${data.customer_code}`
    );

    await Promise.all([
      loadBookings(session.user.id),
      loadSeatShareBookings(session.user.id),
    ]);
  }

  async function saveCustomerProfile() {
    if (!customer || !session?.user) return;

    const name = profileNameDraft.trim();
    const digits = profilePhoneDraft.replace(/\D/g, "");

    if (name.length < 2) {
      setNotice("ದಯವಿಟ್ಟು ಸರಿಯಾದ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setNotice("ದಯವಿಟ್ಟು ಸರಿಯಾದ 10 ಅಂಕಿಯ Indian mobile number ನಮೂದಿಸಿ.");
      return;
    }

    setBusy(true);
    setNotice("");
    const { data, error } = await supabase
      .from("customers")
      .update({
        full_name: name,
        phone: `+91${digits}`,
        phone_verified: customer.phone === `+91${digits}` ? customer.phone_verified : false,
      })
      .eq("id", session.user.id)
      .select("id, customer_code, full_name, phone, phone_verified")
      .single();
    setBusy(false);

    if (error) {
      setNotice(`Profile update failed: ${error.message}`);
      return;
    }

    setCustomer(data as Customer);
    setProfileEditMode(false);
    setNotice("ನಿಮ್ಮ Profile ಯಶಸ್ವಿಯಾಗಿ Update ಆಗಿದೆ.");
  }

  function getScheduledAt() {
    if (
      schedule === "now" &&
      service === "cab" &&
      bookingArea === "city" &&
      !seatShareMode
    ) {
      return null;
    }

    if (!date || !time) return undefined;

    return new Date(`${date}T${time}`).toISOString();
  }

  async function searchSeatShareTrips() {
    setNotice("");

    if (!pickupPoint || !dropPoint) {
      setNotice(
        "Please select pickup and destination from the location suggestions."
      );
      return;
    }

    if (!seatShareEligible) {
      setNotice(
        "Seat Sharing is available for Outstation and Airport routes only."
      );
      return;
    }

    if (!date || !time) {
      setNotice(
        "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪ್ರಯಾಣದ ದಿನಾಂಕ ಮತ್ತು Preferred Time ಆಯ್ಕೆಮಾಡಿ."
      );
      return;
    }

    if (new Date(`${date}T${time}`).getTime() < Date.now()) {
      setNotice("Please select a future preferred date and time.");
      return;
    }

    setSeatSearchLoading(true);
    setSeatSearchDone(false);
    setSeatTrips([]);
    setSelectedSeatTrip(null);

    // Search the complete selected calendar day.
    // The customer's preferred time is recorded but is NOT
    // used to restrict the driver's departure times.
    const dayStart = new Date(`${date}T00:00:00`);
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);

    const { data, error } = await supabase
      .from("seat_share_trips")
      .select(
        "id, driver_user_id, pickup, dropoff, departure_at, total_seats, available_seats, fare_per_seat, status"
      )
      .eq("status", "published")
      .gte("departure_at", dayStart.toISOString())
      .lt("departure_at", nextDay.toISOString())
      .gte("available_seats", seatCount)
      .order("departure_at", { ascending: true });

    setSeatSearchLoading(false);
    setSeatSearchDone(true);

    if (error) {
      setNotice(`Seat Sharing search failed: ${error.message}`);
      return;
    }

    const matchingTrips = ((data || []) as SeatShareTrip[]).filter(
      (trip) => {
        const futureTrip =
          new Date(trip.departure_at).getTime() > Date.now();

        const enoughSeats = trip.available_seats >= seatCount;

        const pickupMatches = matchesRouteLocation(
          trip.pickup,
          pickupPoint
        );

        const dropMatches = matchesRouteLocation(
          trip.dropoff,
          dropPoint
        );

        return (
          futureTrip &&
          enoughSeats &&
          pickupMatches &&
          dropMatches
        );
      }
    );

    setSeatTrips(matchingTrips);

    if (matchingTrips.length === 0) {
      setNotice(
        "ಈ ದಿನಾಂಕಕ್ಕೆ ಈ Route‌ನಲ್ಲಿ ಹೊಂದಾಣಿಕೆಯ Published Trips ಸದ್ಯಕ್ಕೆ ಲಭ್ಯವಿಲ್ಲ."
      );
    } else {
      setNotice(
        `${matchingTrips.length} matching trip(s) found for your selected date.`
      );
    }
  }

  async function bookSeatShareTrip() {
    setNotice("");

    if (!session?.user) {
      setAuthOpen(true);
      return;
    }

    if (!customer) {
      setProfileSetupOpen(true);
      return;
    }

    if (!selectedSeatTrip) {
      setNotice("Please select a Seat Sharing trip.");
      return;
    }

    if (seatCount < 1 || seatCount > 4) {
      setNotice("You can book between 1 and 4 seats.");
      return;
    }

    if (selectedSeatTrip.available_seats < seatCount) {
      setNotice(
        "ಈಗ ಆಯ್ಕೆ ಮಾಡಿದಷ್ಟು Seats ಲಭ್ಯವಿಲ್ಲ. ಮತ್ತೆ Check Timings ಮಾಡಿ."
      );
      return;
    }

    setSeatBookingLoading(true);

    const { data, error } = await supabase.rpc(
      "book_seat_share_trip",
      {
        p_trip_id: selectedSeatTrip.id,
        p_seats: seatCount,
      }
    );

    setSeatBookingLoading(false);

    if (error) {
      setNotice(
        `Seat Sharing booking failed: ${error.message}`
      );
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result?.booking_code) {
      setNotice(
        "Booking response was incomplete. Please check your Booking History before trying again."
      );
      return;
    }

    setNotice(
      `Your Seat Sharing booking is successful! Booking ID: ${result.booking_code}. ${result.seats_booked} seat(s) confirmed. Total: ${money(Number(result.total_fare))}.`
    );

    setSelectedSeatTrip(null);
    setSeatTrips([]);
    setSeatSearchDone(false);

    await loadSeatShareBookings(session.user.id);
  }

  async function book() {
    setNotice("");

    if (seatShareMode) {
      await bookSeatShareTrip();
      return;
    }

    if (!session?.user) {
      setAuthOpen(true);
      return;
    }

    if (!customer) {
      setProfileSetupOpen(true);
      return;
    }

    if (!pickup.trim()) {
      setNotice("Please select a pickup location.");
      return;
    }

    if (!drop.trim()) {
      setNotice("Please select a destination.");
      return;
    }

    if (!pickupPoint || !dropPoint) {
      setNotice(
        "Please choose both locations from the suggestions."
      );
      return;
    }

    if ((service === "cab" || service === "rental") && !bookingArea) {
      setNotice(
        "Please select both locations from the suggestions so we can detect City / Outstation."
      );
      return;
    }

    
    const needsRoadDistance =
  service === "cab" ||
  (service === "rental" && rentalBookingArea === "outstation") ||
  (service === "driver" &&
    area === "outstation" &&
    tripType === "one-way");

    if (
      needsRoadDistance &&
      (distance === null || routeLoading)
    ) {
      setNotice(
        "Please wait while we calculate the road distance."
      );
      return;
    }


    if (schedule === "later" && (!date || !time)) {
      setNotice("Please select your pickup date and time.");
      return;
    }

    if (
      (service !== "cab" || bookingArea === "outstation") &&
      (!date || !time)
    ) {
      setNotice("Please select your travel date and time.");
      return;
    }    if (!fare) {
      setNotice(
        "Fare could not be calculated. Please check your locations."
      );
      return;
    }

    const scheduledAt = getScheduledAt();

    if (scheduledAt === undefined) {
      setNotice("Please select date and time.");
      return;
    }

    const serviceLabel =
      service === "cab"
        ? bookingArea === "city"
          ? "cab_city"
          : "cab_outstation"
        : service === "driver"
          ? area === "city"
            ? "driver_city"
            : "driver_outstation"
          : area === "city"
            ? "rental_city"
            : "rental_outstation";

    const details = {
      service,
      area: bookingArea,
      trip_type: service === "cab" ? "one-way" : tripType,
      ac_preference:
        service === "rental" || service === "cab" ? ac : null,
      distance_km: distance,
      eta_minutes: eta,
      hours:
        service === "driver" && area === "city" ? hours : null,
      days:
        (service === "driver" && area === "outstation") || (service === "rental" && rentalBookingArea === "outstation") ? days : null,
      rental_package:
        service === "rental" && rentalBookingArea === "city"
          ? [
              "1 hour / 10 km",
              "2 hours / 20 km",
              "3 hours / 30 km",
            ][packageIndex]
          : null,
      gear: service === "driver" ? gear : null,
      customer_vehicle_class:
        service === "driver" ? driverVehicle : null,
      note:
        service === "rental" && ac
          ? "AC/Non-AC is a preference only; same fare. Subject to availability."
          : null,
      toll_parking: "Actual charges, if applicable, are extra.",
    };

    setBusy(true);

    const { data, error } = await supabase
      .from("bookings")
      .insert({
        user_id: session.user.id,
        service_type: serviceLabel,
        vehicle_type:
          service === "driver"
            ? `Driver (${driverVehicle})`
            : ride,
        pickup,
        dropoff: drop,
        scheduled_at: scheduledAt,
        estimated_fare: fare,
        status: "requested",
        booking_details: details,
      })
      .select("*")
      .single();

    setBusy(false);

    if (error) {
      setNotice(`Booking failed: ${error.message}`);
      return;
    }

    setNotice(
      `Your booking is successful! Booking ID: ${data.booking_code}. We will notify you when a driver is assigned.`
    );

    await loadBookings(session.user.id);

    setPickup("");
    setDrop("");
    setPickupPoint(null);
    setDropPoint(null);
    setDistance(null);
    setEta(null);
  }

  async function signOut() {
    await supabase.auth.signOut();

    localStorage.removeItem(PHONE_STORAGE_KEY);

    setSession(null);
    setCustomer(null);
    setBookings([]);
    setSeatBookings([]);
  }

  const vehicleOptions =
    service === "cab"
      ? bookingArea === "city"
        ? ["Auto", "Hatchback", "Sedan", "Ertiga", "Innova Crysta"]
        : ["Hatchback", "Sedan", "Ertiga", "Innova Crysta"]
      : service === "rental"
        ? rentalBookingArea === "city"
          ? ["Hatchback", "Sedan", "MPV", "SUV"]
          : ["Hatchback", "Sedan", "Ertiga", "Innova Crysta"]
        : [];

  const needsDate =
    seatShareMode ||
    service !== "cab" ||
    bookingArea === "outstation" ||
    schedule === "later";

  const selectedSeatFare = selectedSeatTrip
    ? Number(selectedSeatTrip.fare_per_seat) * seatCount
    : 0;

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="YREL home">
          
<img
  className="brand-logo"
  src="https://raw.githubusercontent.com/samratsihimoge-eng/YREL/main/Yrel_logo_png.png"
  alt="YREL — Run with Fun"
/>
        </a>

        <nav className="desktop-nav">
          <a href="#services">Services</a>
          <a href="#how">How it works</a>
          <a href="#history">My bookings</a>
        </nav>

        <div className="top-actions">
          <select
            className="language-select"
            value={language}
            onChange={(e) =>
              setLanguage(e.target.value as "en" | "kn" | "hi")
            }
            aria-label="Language"
          >
            <option value="en">English</option>
            <option value="kn">ಕನ್ನಡ</option>
            <option value="hi">हिन्दी</option>
          </select>

          {session ? (
            <>
              {customer && (
                <button
                  className="profile-button"
                  onClick={() => {
                    setProfileNameDraft(customer.full_name);
                    setProfilePhoneDraft((customer.phone || "").replace(/^\+91/, ""));
                    setProfileEditMode(false);
                    setNotice("");
                    setProfileOpen(true);
                  }}
                  aria-label="Customer profile"
                  title="My profile"
                >
                  <UserRound size={17} />
                </button>
              )}
              <button className="login-button" onClick={signOut}>
                <LogOut size={16} /> Sign out
              </button>
            </>
          ) : (
            <button
              className="login-button"
              onClick={() => {
                setNotice("");
                setAuthOpen(true);
              }}
            >
              <UserRound size={16} /> Login
            </button>
          )}

          <button
            className="mobile-menu"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      {menuOpen && (
        <nav className="mobile-nav">
          <a href="#services" onClick={() => setMenuOpen(false)}>
            Services
          </a>
          <a href="#how" onClick={() => setMenuOpen(false)}>
            How it works
          </a>
          <a href="#history" onClick={() => setMenuOpen(false)}>
            My bookings
          </a>
        </nav>
      )}

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            SIMPLE. SAFE. RELIABLE.
          </span>

          
<h1>
  Your city.
  <br />
  <em>Your fun.</em>
  <br />
  Just YREL it.
</h1>
          

          <p>
            Book a cab, hire a professional driver, or reserve a rental
            car — all in one place.
          </p>

          <div className="hero-points">
            <span>
              <ShieldCheck size={17} /> Instant booking
            </span>
            <span>
              <MapPin size={17} /> Pan India service
            </span>
          </div>
        </div>

        <div className="hero-art">
          <div className="sun-disc" />
          <div className="road-line" />
          <div className="hero-car">
            <CarFront size={104} strokeWidth={1.2} />
          </div>
          <div className="floating-tag">
            <span className="tag-icon">
              <Navigation size={17} />
            </span>
            <span>
              <b>Your journey starts here</b>
              <small>Book in a few simple steps</small>
            </span>
          </div>
        </div>
      </section>

      <section className="booking-section" id="services">
        <div className="section-heading">
          <div>
            <span className="eyebrow">BOOK YOUR RIDE</span>
            <h2>What do you need today?</h2>
          </div>
          <span className="secure-note">
            <ShieldCheck size={15} /> Secure booking
          </span>
        </div>

        <div className="service-tabs">
          <button
            className={
              service === "cab" ? "service-tab active" : "service-tab"
            }
            onClick={() => changeService("cab")}
          >
            <CarFront />
            <span>Book a Cab</span>
          </button>

          <button
            className={
              service === "driver" ? "service-tab active" : "service-tab"
            }
            onClick={() => changeService("driver")}
          >
            <UserRound />
            <span>Book a Driver</span>
          </button>

          <button
            className={
              service === "rental" ? "service-tab active" : "service-tab"
            }
            onClick={() => changeService("rental")}
          >
            <Navigation />
            <span>Cab Rentals</span>
          </button>
        </div>

        <div className="booking-card">
          <div className="card-topline">
            <div>
              <span className="step-label">01 / SERVICE DETAILS</span>
              <h3>
                {service === "cab"
                  ? "Where are you heading?"
                  : service === "driver"
                    ? "Hire a driver for your car"
                    : "Rent a cab for your journey"}
              </h3>
            </div>
            <span className="card-icon">
              <CarFront />
            </span>
          </div>

          {service === "cab" ? (
            <div className="auto-area-note">
              <span className="auto-area-dot" />
              {bookingArea === "city"
                ? "City ride detected"
                : bookingArea === "outstation"
                  ? "Outstation ride detected · One Way"
                  : "Select pickup and destination to detect City / Outstation"}
            </div>
          ) : service === "driver" ? (
            <div className="choice-row">
              <button
                className={area === "city" ? "choice active" : "choice"}
                onClick={() => {
                  setArea("city");
                  setDistance(null);
                }}
              >
                City
              </button>
              <button
                className={area === "outstation" ? "choice active" : "choice"}
                onClick={() => {
                  setArea("outstation");
                  setDistance(null);
                }}
              >
                Outstation
              </button>
            </div>
          ) : (
            <div className="auto-area-note">
              <span className="auto-area-dot" />
              {rentalBookingArea === "city"
                ? "City rental detected"
                : rentalBookingArea === "outstation"
                  ? "Outstation rental detected"
                  : "Select pickup and destination to detect City / Outstation"}
            </div>
          )}

          {service === "driver" && (
            <div className="choice-row secondary-choice">
              <button
                className={
                  tripType === "one-way" ? "choice active" : "choice"
                }
                onClick={() => {
                  setTripType("one-way");
                  setHours(2);
                }}
              >
                One Way
              </button>
              <button
                className={
                  tripType === "round-trip" ? "choice active" : "choice"
                }
                onClick={() => setTripType("round-trip")}
              >
                Round Trip
              </button>
            </div>
          )}

          <div className="location-grid">
            <div className="field-wrap">
              <label>{words.pickup}</label>

              <div className="location-input">
                <MapPin size={18} />
                <input
                  value={pickup}
                  onChange={(e) => {
                    setPickup(e.target.value);
                    setPickupPoint(null);
                    setSeatTrips([]);
                    setSelectedSeatTrip(null);
                    setSeatSearchDone(false);
                  }}
                  onFocus={() => setActiveSearch("pickup")}
                  placeholder="Enter pickup area, street or village"
                />

                <button
                  className="gps-button"
                  onClick={useCurrentLocation}
                  disabled={locating}
                  title="Use current location"
                >
                  {locating ? (
                    <Loader2 className="spin" />
                  ) : (
                    <Navigation size={17} />
                  )}
                </button>
              </div>

              {activeSearch === "pickup" &&
                pickupOptions.length > 0 && (
                  <div className="suggestions">
                    {pickupOptions.map((p, i) => (
                      <button
                        key={`${p.label}-${i}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choosePlace(p, "pickup")}
                      >
                        <MapPin size={15} />
                        <span>{p.label}</span>
                      </button>
                    ))}
                  </div>
                )}
            </div>

            <div className="field-wrap">
              <label>{words.drop}</label>

              <div className="location-input">
                <MapPin size={18} />
                <input
                  value={drop}
                  onChange={(e) => {
                    setDrop(e.target.value);
                    setDropPoint(null);
                    setSeatTrips([]);
                    setSelectedSeatTrip(null);
                    setSeatSearchDone(false);
                  }}
                  onFocus={() => setActiveSearch("drop")}
                  placeholder="Enter destination"
                />
              </div>

              {activeSearch === "drop" &&
                dropOptions.length > 0 && (
                  <div className="suggestions">
                    {dropOptions.map((p, i) => (
                      <button
                        key={`${p.label}-${i}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choosePlace(p, "drop")}
                      >
                        <MapPin size={15} />
                        <span>{p.label}</span>
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>

          {service === "cab" && (
            <>
              <div className="field-label">Choose your vehicle</div>

              <div className="vehicle-grid">
                {seatShareEligible && (
                  <button
                    className={
                      seatShareMode
                        ? "vehicle-option selected"
                        : "vehicle-option"
                    }
                    onClick={() => {
                      setSeatShareMode(true);
                      setSeatTrips([]);
                      setSelectedSeatTrip(null);
                      setSeatSearchDone(false);
                      setNotice("");
                    }}
                  >
                    <Users size={22} />
                    <span>Seat Sharing</span>
                    {seatShareMode && (
                      <Check className="vehicle-check" size={15} />
                    )}
                  </button>
                )}

                {vehicleOptions.map((v) => (
                  <button
                    key={v}
                    className={
                      !seatShareMode && ride === v
                        ? "vehicle-option selected"
                        : "vehicle-option"
                    }
                    onClick={() => {
                      setSeatShareMode(false);
                      setRide(v as Ride);
                      setSeatTrips([]);
                      setSelectedSeatTrip(null);
                      setSeatSearchDone(false);
                      setNotice("");
                    }}
                  >
                    <VehicleIcon vehicle={v} />
                    <span>{v}</span>
                    {!seatShareMode && ride === v && (
                      <Check className="vehicle-check" size={15} />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {service === "cab" && seatShareMode && (
            <div className="seat-share-panel">
              <div className="seat-share-heading">
                <Users size={21} />
                <div>
                  <b>Seat Sharing</b>
                  <small>Share your journey and pay per seat.</small>
                </div>
              </div>

              <p className="hint">
                Select your preferred travel date and time. We will show
                all matching published trips on that date, including
                trips departing earlier or later than your preferred
                time.
              </p>

              <div className="seat-counter">
                <div>
                  <b>Number of seats</b>
                  <small>Choose 1 to 4 seats</small>
                </div>

                <div className="stepper">
                  <button
                    type="button"
                    onClick={() =>
                      setSeatCount((n) => Math.max(1, n - 1))
                    }
                    disabled={seatCount <= 1}
                    aria-label="Decrease seats"
                  >
                    −
                  </button>

                  <strong>{seatCount}</strong>

                  <button
                    type="button"
                    onClick={() =>
                      setSeatCount((n) => Math.min(4, n + 1))
                    }
                    disabled={seatCount >= 4}
                    aria-label="Increase seats"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="option-fields date-fields">
                <label>
                  Preferred travel date
                  <input
                    type="date"
                    value={date}
                    min={localDateString()}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setSeatTrips([]);
                      setSelectedSeatTrip(null);
                      setSeatSearchDone(false);
                    }}
                  />
                </label>

                <label>
                  Preferred time
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => {
                      setTime(e.target.value);
                      setSeatTrips([]);
                      setSelectedSeatTrip(null);
                      setSeatSearchDone(false);
                    }}
                  />
                </label>
              </div>

              <button
                type="button"
                className="book-button full"
                onClick={searchSeatShareTrips}
                disabled={seatSearchLoading}
              >
                {seatSearchLoading ? (
                  <Loader2 className="spin" />
                ) : (
                  <Clock3 size={18} />
                )}
                <span>Check Timings</span>
                <ArrowRight size={18} />
              </button>

              {seatSearchDone && (
                <div className="seat-results">
                  <div className="seat-results-heading">
                    <b>Available Seat Sharing Trips</b>
                    <span>
                      {seatTrips.length} found
                    </span>
                  </div>

                  {seatTrips.length === 0 ? (
                    <div className="empty-history">
                      No matching published trips found for this route
                      and date.
                    </div>
                  ) : (
                    <div className="seat-trip-list">
                      {seatTrips.map((trip) => {
                        const selected =
                          selectedSeatTrip?.id === trip.id;

                        return (
                          <button
                            type="button"
                            key={trip.id}
                            className={
                              selected
                                ? "seat-trip-card selected"
                                : "seat-trip-card"
                            }
                            onClick={() => {
                              setSelectedSeatTrip(trip);
                              setNotice("");
                            }}
                          >
                            <div className="seat-trip-top">
                              <b>{formatDeparture(trip.departure_at)}</b>
                              {selected && <Check size={17} />}
                            </div>

                            <div className="seat-trip-route">
                              <span>
                                <MapPin size={15} />
                                {trip.pickup}
                              </span>
                              <ArrowRight size={15} />
                              <span>
                                <MapPin size={15} />
                                {trip.dropoff}
                              </span>
                            </div>

                            <div className="seat-trip-bottom">
                              <span>
                                <Users size={15} />
                                {trip.available_seats} seat(s) available
                              </span>
                              <strong>
                                {money(Number(trip.fare_per_seat))}
                                <small> / seat</small>
                              </strong>
                            </div>

                            {selected && (
                              <div className="selected-trip-note">
                                Selected trip
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedSeatTrip && (
                    <div className="seat-booking-summary">
                      <div>
                        <span>Selected seats</span>
                        <b>{seatCount}</b>
                      </div>
                      <div>
                        <span>Fare per seat</span>
                        <b>
                          {money(
                            Number(selectedSeatTrip.fare_per_seat)
                          )}
                        </b>
                      </div>
                      <div className="seat-total">
                        <span>Total fare</span>
                        <strong>{money(selectedSeatFare)}</strong>
                      </div>

                      <button
                        type="button"
                        className="book-button full"
                        onClick={bookSeatShareTrip}
                        disabled={seatBookingLoading}
                      >
                        {seatBookingLoading ? (
                          <Loader2 className="spin" />
                        ) : (
                          <Check size={18} />
                        )}
                        <span>Confirm Instant Booking</span>
                        <ArrowRight size={18} />
                      </button>

                      <p className="hint">
                        Booking is confirmed instantly when seats are
                        successfully reserved.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {service === "cab" &&
            !seatShareMode &&
            ride !== "Auto" && (
              <div className="choice-row compact-choice">
                <span className="choice-caption">AC preference</span>
                <button
                  className={
                    ac === "AC" ? "choice active" : "choice"
                  }
                  onClick={() => setAc("AC")}
                >
                  AC
                </button>
                <button
                  className={
                    ac === "Non-AC" ? "choice active" : "choice"
                  }
                  onClick={() => setAc("Non-AC")}
                >
                  Non-AC
                </button>
              </div>
            )}

          {service === "rental" && rentalBookingArea === "city" && (
            <>
              <div className="field-label">
                Select rental package
              </div>

              <div className="package-grid">
                {(RENTAL_CITY[ride] || RENTAL_CITY.Hatchback).fares.map(
                  (f, i) => (
                    <button
                      key={i}
                      className={
                        packageIndex === i
                          ? "package-option selected"
                          : "package-option"
                      }
                      onClick={() => setPackageIndex(i)}
                    >
                      <b>
                        {i + 1} {i === 0 ? "Hour" : "Hours"}
                      </b>
                      <small>{(i + 1) * 10} KM included</small>
                      <strong>{money(f)}</strong>
                    </button>
                  )
                )}
              </div>

              <p className="hint">
                Extra kilometres and extra time are charged separately.
                AC / Non-AC has the same fare.
              </p>
            </>
          )}

          {service === "driver" && (
            <>
              <div className="field-label">Your car details</div>

              <div className="option-fields">
                <label>
                  Gear
                  <select
                    value={gear}
                    onChange={(e) =>
                      setGear(e.target.value as "Manual" | "Automatic")
                    }
                  >
                    <option>Manual</option>
                    <option>Automatic</option>
                  </select>
                </label>

                <label>
                  Vehicle type
                  <select
                    value={driverVehicle}
                    onChange={(e) => setDriverVehicle(e.target.value)}
                  >
                    {DRIVER_VEHICLES.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>

              {area === "city" && tripType === "round-trip" && (
                <label className="wide-field">
                  Required hours (minimum 2)
                  <input
                    type="number"
                    min="2"
                    max="24"
                    value={hours}
                    onChange={(e) =>
                      setHours(
                        Math.max(2, Number(e.target.value) || 2)
                      )
                    }
                  />
                </label>
              )}
            </>
          )}
          {service === "driver" &&
            area === "outstation" &&
            tripType === "round-trip" && (
              <div className="option-fields date-fields">
                <label>
                  Departure Date
                  <input
                    type="date"
                    value={date}
                    min={localDateString()}
                    onChange={(e) => {
                      const selected = e.target.value;
                      setDate(selected);

                      if (
                        selected &&
                        arrivalDate &&
                        arrivalDate < selected
                      ) {
                        setArrivalDate(selected);
                        setDays(1);
                      } else if (selected && arrivalDate) {
                        const start = new Date(
                          `${selected}T00:00:00`
                        );
                        const end = new Date(
                          `${arrivalDate}T00:00:00`
                        );
                        setDays(
                          Math.max(
                            1,
                            Math.round(
                              (end.getTime() - start.getTime()) /
                                86400000
                            ) + 1
                          )
                        );
                      }
                    }}
                  />
                </label>

                <label>
                  Arrival Date
                  <input
                    type="date"
                    value={arrivalDate}
                    min={date || localDateString()}
                    onChange={(e) => {
                      const selected = e.target.value;
                      setArrivalDate(selected);

                      if (date && selected) {
                        const start = new Date(`${date}T00:00:00`);
                        const end = new Date(
                          `${selected}T00:00:00`
                        );
                        setDays(
                          Math.max(
                            1,
                            Math.round(
                              (end.getTime() - start.getTime()) /
                                86400000
                            ) + 1
                          )
                        );
                      }
                    }}
                  />
                </label>

                <label>
                  Departure time
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </label>

                <p className="hint">
                  Number of days: {days}
                </p>
              </div>
            )}

          {service === "rental" && rentalBookingArea === "outstation" && (
            <label className="wide-field">
              Number of days
              <input
                type="number"
                min="1"
                max="30"
                value={days}
                onChange={(e) =>
                  setDays(
                    Math.max(
                      1,
                      Math.min(30, Number(e.target.value) || 1)
                    )
                  )
                }
              />
            </label>
          )}
          {service === "cab" &&
            bookingArea === "city" &&
            !seatShareMode && (
              <>
                <div className="schedule-row">
                  <button
                    type="button"
                    className={
                      schedule === "now" ? "pill active" : "pill"
                    }
                    aria-pressed={schedule === "now"}
                    onClick={() => setSchedule("now")}
                  >
                    Instant Booking
                  </button>

                  <button
                    type="button"
                    className={
                      schedule === "later" ? "pill active" : "pill"
                    }
                    aria-pressed={schedule === "later"}
                    onClick={() => setSchedule("later")}
                  >
                    Advance Booking
                  </button>
                </div>

                {schedule === "later" && (
                  <div className="option-fields date-fields">
                    <label>
                      Pickup date
                      <input
                        type="date"
                        value={date}
                        min={localDateString()}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </label>

                    <label>
                      Pickup time
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                      />
                    </label>
                  </div>
                )}
              </>
            )}

          {(service === "cab" && bookingArea === "outstation") ||
            (service === "driver" && area === "city") ||
            (service === "driver" && area === "outstation" && tripType === "one-way") ||
            service === "rental" ? (
              <div className="option-fields date-fields">
                <label>
                  {service === "rental" && rentalBookingArea === "outstation"
                    ? "Departure date"
                    : "Pickup date"}
                  <input
                    type="date"
                    value={date}
                    min={localDateString()}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>

                <label>
                  Pickup time
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </label>
              </div>
            ) : null}
        
          {!seatShareMode && (
            <>
              <div className="fare-panel">
                <div className="fare-info">
                  <span className="step-label">ESTIMATED FARE</span>
                  <strong>{fare ? money(fare) : "—"}</strong>
                  <small>
                    {routeLoading
                      ? "Calculating road distance…"
                      : distance !== null
                        ? `${distance.toFixed(1)} km${
                            eta ? ` · ${eta} min approx.` : ""
                          }`
                        : "Select pickup and destination to estimate"}
                  </small>
                </div>

                <button
                  className="book-button"
                  onClick={book}
                  disabled={busy || routeLoading || profileLoading}
                >
                  {busy && <Loader2 className="spin" />}
                  {words.book}
                  <ArrowRight size={18} />
                </button>
              </div>

              {service === "cab" &&
                bookingArea === "outstation" && (
                  <p className="hint">
                    One-way outstation fare. Toll and parking are extra
                    at actuals. Final fare may vary based on completed
                    trip.
                  </p>
                )}

              {service === "driver" &&
                area === "outstation" && (
                  <p className="hint">
                    One day (up to 12 hours): ₹1,300. Two or more days:
                    ₹1,499 per day. For 2+ days, food is to be provided
                    separately by the customer. Extra hour on a one-day
                    booking: ₹130.
                  </p>
                )}

              {service === "rental" &&
                area === "outstation" && (
                  <p className="hint">
                    Round trip only. Minimum 300 km per day. AC /
                    Non-AC is a preference at the same fare. Toll and
                    parking are extra at actuals.
                  </p>
                )}
            </>
          )}

          {notice &&
            !authOpen &&
            !profileSetupOpen && (
              <div
                className={
                  notice.toLowerCase().includes("successful") ||
                  notice.toLowerCase().includes("ಸ್ವಾಗತ")
                    ? "notice success"
                    : "notice"
                }
              >
                {notice}
              </div>
            )}
        </div>
      </section>

      <section className="trust-strip" id="how">
        <div>
          <ShieldCheck />
          <span>
            <b>Reliable bookings</b>
            <small>Booking updates from YREL</small>
          </span>
        </div>

        <div>
          <MapPin />
          <span>
            <b>India-wide locations</b>
            <small>Search cities, towns and villages</small>
          </span>
        </div>

        <div>
          <Clock3 />
          <span>
            <b>Simple scheduling</b>
            <small>Choose a time that works</small>
          </span>
        </div>
      </section>

      {session && (
        <section className="history-section" id="history">
          <div className="section-heading">
            <div>
              <span className="eyebrow">YOUR ACCOUNT</span>
              <h2>{words.history}</h2>
            </div>
            <span className="history-count">
              {bookings.length + seatBookings.length} recent
            </span>
          </div>

          {profileLoading ? (
            <div className="empty-history">
              Loading your customer account…
            </div>
          ) : !customer ? (
            <div className="empty-history">
              Complete your customer profile to view bookings and book
              a ride.
            </div>
          ) : (
            <>
              <div
                className="empty-history"
                style={{
                  marginBottom: 16,
                  textAlign: "left",
                }}
              >
                <b>{customer.full_name}</b>
                <br />
                Customer ID: <b>{customer.customer_code}</b>
                <br />
                <small>
                  Mobile: {customer.phone || "Not provided"} ·{" "}
                  {customer.phone_verified ? "Verified" : "Not verified"}
                </small>
              </div>

              {bookings.length === 0 &&
              seatBookings.length === 0 ? (
                <div className="empty-history">
                  Your bookings will appear here after you book a
                  service.
                </div>
              ) : (
                <div className="history-list">
                  {bookings.map((b) => (
                    <article className="history-item" key={b.id}>
                      <div className="history-icon">
                        <CarFront />
                      </div>

                      <div className="history-main">
                        <b>{b.booking_code}</b>
                        <span>
                          {b.service_type.replaceAll("_", " ")} ·{" "}
                          {b.vehicle_type || "YREL service"}
                        </span>
                        <small>
                          {b.pickup} → {b.dropoff || "—"}
                        </small>
                        <small>
                          {new Date(b.created_at).toLocaleString()}
                        </small>
                      </div>

                      <div className="history-right">
                        <b>{money(Number(b.estimated_fare))}</b>
                        <span className="status">{b.status}</span>
                      </div>
                    </article>
                  ))}

                  {seatBookings.map((b) => (
                    <article className="history-item" key={b.id}>
                      <div className="history-icon">
                        <Users />
                      </div>

                      <div className="history-main">
                        <b>{b.booking_code}</b>
                        <span>
                          Seat Sharing · {b.seats_booked} seat(s)
                        </span>
                        <small>
                          {b.seat_share_trips?.pickup || "Pickup"} →{" "}
                          {b.seat_share_trips?.dropoff || "Destination"}
                        </small>
                        <small>
                          {b.seat_share_trips?.departure_at
                            ? formatDeparture(
                                b.seat_share_trips.departure_at
                              )
                            : new Date(b.created_at).toLocaleString()}
                        </small>
                      </div>

                      <div className="history-right">
                        <b>{money(Number(b.total_fare))}</b>
                        <span className="status">{b.status}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      <footer className="footer">
        <a className="brand" href="#" aria-label="YREL home">
          
<img
  className="brand-logo"
  src="https://raw.githubusercontent.com/samratsihimoge-eng/YREL/main/Yrel_logo_png.png"
  alt="YREL — Run with Fun"
/>
        </a>

        <span>
          © {new Date().getFullYear()} YREL. All rights reserved.
        </span>

        <span className="footer-tagline">
          Your city. Your fun. Just YREL it.
        </span>
      </footer>

      {authOpen && (
        <div className="modal-backdrop" onClick={closeAuth}>
          <div
            className="auth-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={closeAuth}>
              <X />
            </button>

            <div className="modal-symbol">
              <UserRound />
            </div>

            <span className="eyebrow">WELCOME TO YREL</span>
            <h2>Continue with Google</h2>

            <p>
              Enter your 10-digit mobile number, then sign in securely
              with your Google Account.
            </p>

            <label className="wide-field">
              Mobile number
              <div className="location-input">
                <span>+91</span>
                <input
                  className="phone-number-input"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  value={phone}
                  onChange={(e) =>
                    setPhone(
                      e.target.value.replace(/\D/g, "").slice(0, 10)
                    )
                  }
                  placeholder="10-digit mobile number"
                />
              </div>
            </label>

            <p className="hint">
              Your mobile number is saved as unverified until phone
              verification is added.
            </p>

            <button
              className="book-button full"
              onClick={startGoogleLogin}
              disabled={busy}
            >
              {busy && <Loader2 className="spin" />}
              <span>Continue with Google</span>
              <ArrowRight size={18} />
            </button>

            {notice && <div className="notice">{notice}</div>}
          </div>
        </div>
      )}

      {profileOpen && customer && session && (
        <div className="modal-backdrop" onClick={() => setProfileOpen(false)}>
          <div className="auth-modal profile-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setProfileOpen(false)} aria-label="Close profile">
              <X />
            </button>
            <div className="modal-symbol"><UserRound /></div>
            <span className="eyebrow">YOUR YREL ACCOUNT</span>
            <h2>Customer Profile</h2>
            <div className="profile-details">
              <div><small>Customer ID</small><b>{customer.customer_code}</b></div>
              <div>
                <small>Full name</small>
                {profileEditMode ? (
                  <input className="email-input" value={profileNameDraft} onChange={(e) => setProfileNameDraft(e.target.value)} placeholder="Full name" />
                ) : <b>{customer.full_name}</b>}
              </div>
              <div>
                <small>Mobile number</small>
                {profileEditMode ? (
                  <div className="location-input profile-phone-input">
                    <span>+91</span>
                    <input className="phone-number-input" type="tel" inputMode="numeric" maxLength={10} value={profilePhoneDraft} onChange={(e) => setProfilePhoneDraft(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile number" />
                  </div>
                ) : <b>{customer.phone || "Not provided"} · {customer.phone_verified ? "Verified" : "Not verified"}</b>}
              </div>
              <div><small>Email ID</small><b className="profile-email">{session.user.email || "Not available"}</b></div>
            </div>
            <p className="hint">Google ಮೂಲಕ Login ಆಗಿರುವ Email ID ಅನ್ನು ಇಲ್ಲಿ ತೋರಿಸಲಾಗುತ್ತದೆ. Email ಬದಲಾವಣೆ Google Account ಮೂಲಕವೇ ಮಾಡಬೇಕು.</p>
            {profileEditMode ? (
              <button className="book-button full" onClick={saveCustomerProfile} disabled={busy}>
                {busy && <Loader2 className="spin" />} Save changes <ArrowRight size={18} />
              </button>
            ) : (
              <button className="book-button full" onClick={() => { setProfileNameDraft(customer.full_name); setProfilePhoneDraft((customer.phone || "").replace(/^\+91/, "")); setProfileEditMode(true); setNotice(""); }}>
                Edit profile
              </button>
            )}
            {notice && <div className="notice">{notice}</div>}
          </div>
        </div>
      )}

      {profileSetupOpen && session && (
        <div className="modal-backdrop">
          <div
            className="auth-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-symbol">
              <UserRound />
            </div>

            <span className="eyebrow">NEW YREL CUSTOMER</span>
            <h2>Complete your profile</h2>

            <p>
              Welcome! Enter your name to create your YREL Customer ID.
            </p>

            <label className="wide-field">
              Full name
              <input
                className="email-input"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
              />
            </label>

            <label className="wide-field">
              Mobile number
              <div className="location-input">
                <span>+91</span>
                <input
                  className="phone-number-input"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  value={phone}
                  onChange={(e) =>
                    setPhone(
                      e.target.value.replace(/\D/g, "").slice(0, 10)
                    )
                  }
                  placeholder="10-digit mobile number"
                />
              </div>
            </label>

            <p className="hint">
              This number has not been verified. You can verify it
              later using WhatsApp or SMS OTP.
            </p>

            <button
              className="book-button full"
              onClick={createCustomerProfile}
              disabled={busy || profileLoading}
            >
              {busy && <Loader2 className="spin" />}
              <span>Create Customer Account</span>
              <ArrowRight size={18} />
            </button>

            {notice && <div className="notice">{notice}</div>}

            <button
              className="pill"
              onClick={signOut}
              disabled={busy}
            >
              Cancel and sign out
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
