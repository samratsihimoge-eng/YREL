
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ArrowRight, ArrowDownUp, CarFront, CarTaxiFront, Car, BusFront, Check, Clock3, MapPin, Menu, ShieldCheck,
  UserRound, X, Navigation, CalendarDays, LogOut, Loader2, Users,
  Home as HomeIcon, ClipboardList, Bell, Headphones, BookOpen, FileText, Ban, ArrowLeft, Phone, MessageCircle, Mail, Languages, BadgeCheck
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
const SAVED_LOCATIONS_KEY = "yrel_saved_locations_v1";
const SPLASH_SEEN_KEY = "yrel_splash_seen_v1";
const LANGUAGE_STORAGE_KEY = "yrel_customer_language_v1";

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
  { fares: number[]; kmPerHour: number; extraKm: number; extraHour: number }
> = {
  Hatchback: { fares: [1150, 2150, 3150], kmPerHour: 10, extraKm: 18, extraHour: 250 },
  Sedan: { fares: [1300, 2400, 3500], kmPerHour: 10, extraKm: 20, extraHour: 275 },
  MPV: { fares: [1650, 3050, 4450], kmPerHour: 10, extraKm: 22, extraHour: 350 },
  SUV: { fares: [1900, 3500, 5100], kmPerHour: 10, extraKm: 26, extraHour: 400 },
};

const RENTAL_CITY_PACKAGES = [
  { hours: 4, km: 40 },
  { hours: 8, km: 80 },
  { hours: 12, km: 120 },
];

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
  const vehicleEmoji: Record<string, string> = {
    Auto: "🛺",
    Hatchback: "🚙",
    Sedan: "🚗",
    Ertiga: "🚐",
    SUV: "🚙",
    "Innova Crysta": "🚐",
  };
  return (
    <span className="vehicle-emoji" role="img" aria-label={vehicle}>
      {vehicleEmoji[vehicle] || "🚘"}
    </span>
  );
};

const RoadAnimation = () => (
  <div className="yrel-road-animation" aria-label="YREL auto rickshaw, uniformed driver and passenger cab">
    <div className="road-surface"><span className="road-markings" /></div>
    <svg className="road-auto-illustration" viewBox="0 0 150 90" role="img" aria-label="Auto rickshaw">
      <g stroke="#263238" strokeWidth="3" strokeLinejoin="round">
        <path d="M20 59 L27 34 Q31 24 44 24 L83 24 Q94 25 101 39 L111 57 L119 59 L119 70 L17 70 Z" fill="#f6bd19"/>
        <path d="M37 31 L78 31 L89 45 L32 45 Z" fill="#bde7f4"/>
        <path d="M84 31 L96 42 L101 55 L91 55 Z" fill="#bde7f4"/>
        <path d="M15 58 L31 58 M108 58 L124 58" fill="none"/>
        <circle cx="39" cy="70" r="10" fill="#30343b"/><circle cx="39" cy="70" r="4" fill="#d9e0e4"/>
        <circle cx="101" cy="70" r="10" fill="#30343b"/><circle cx="101" cy="70" r="4" fill="#d9e0e4"/>
      </g>
      <path d="M24 22 L39 13 L79 13 L88 23" fill="none" stroke="#d88900" strokeWidth="5" strokeLinecap="round"/>
      <rect x="13" y="49" width="14" height="8" rx="3" fill="#e84b35"/>
    </svg>
    <svg className="road-driver-illustration" viewBox="0 0 100 110" role="img" aria-label="Friendly driver waving">
      <circle cx="48" cy="31" r="18" fill="#b9784c"/>
      <path d="M29 27 Q30 8 48 8 Q67 8 68 27 L61 22 L56 16 L42 19 L34 29 Z" fill="#263238"/>
      <path d="M27 15 Q48 1 69 15 L66 20 L30 20 Z" fill="#fff" stroke="#d9d9d9" strokeWidth="2"/>
      <path d="M39 32 Q48 37 57 32" fill="none" stroke="#5b3428" strokeWidth="2" strokeLinecap="round"/>
      <path d="M35 48 L61 48 L65 55 L31 55 Z" fill="#fff" stroke="#d9d9d9" strokeWidth="2"/>
      <path d="M26 58 Q47 48 69 58 L78 101 L18 101 Z" fill="#fff" stroke="#9da7ad" strokeWidth="3"/>
      <path d="M28 62 L12 45 L7 28" fill="none" stroke="#b9784c" strokeWidth="10" strokeLinecap="round"/>
      <path className="driver-wave-hand" d="M7 28 L3 13 M7 28 L15 12 M7 28 L1 24" fill="none" stroke="#b9784c" strokeWidth="6" strokeLinecap="round"/>
      <path d="M40 29 Q48 34 56 29" fill="none" stroke="#5b3428" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="41" cy="25" r="2" fill="#263238"/><circle cx="56" cy="25" r="2" fill="#263238"/>
    </svg>
    <svg className="road-cab-illustration" viewBox="0 0 170 90" role="img" aria-label="YREL passenger cab">
      <g stroke="#263238" strokeWidth="3" strokeLinejoin="round">
        <path d="M14 55 L26 34 Q31 26 45 26 L106 26 Q119 27 128 42 L143 55 L153 58 L153 72 L12 72 Z" fill="#fffaf1"/>
        <path d="M37 33 L72 33 L72 50 L28 50 Z" fill="#b9e3f2"/>
        <path d="M78 33 L105 33 Q116 34 123 50 L78 50 Z" fill="#b9e3f2"/>
        <path d="M15 57 L151 57" fill="none"/>
        <circle cx="43" cy="72" r="11" fill="#30343b"/><circle cx="43" cy="72" r="4" fill="#d9e0e4"/>
        <circle cx="123" cy="72" r="11" fill="#30343b"/><circle cx="123" cy="72" r="4" fill="#d9e0e4"/>
      </g>
      <path d="M15 57 L27 57" stroke="#f36a22" strokeWidth="7"/>
      <path d="M130 48 L145 51" stroke="#f36a22" strokeWidth="7"/>
      <path d="M82 18 L119 18" stroke="#f36a22" strokeWidth="5" strokeLinecap="round"/>
    </svg>
  </div>
);

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
  const [authReady, setAuthReady] = useState(false);
  const [splashVisible, setSplashVisible] = useState(false);
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
  const [bookingFilter, setBookingFilter] = useState<"all" | "active" | "completed" | "cancelled">("all");
  const [trackingBookingId, setTrackingBookingId] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [instantSearchBooking, setInstantSearchBooking] = useState<Booking | null>(null);
  const [instantSearchSeconds, setInstantSearchSeconds] = useState(60);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSection, setMenuSection] = useState<"list" | "how" | "services" | "privacy" | "terms" | "cancellation" | "language" | "saved">("list");
  const [bottomPanel, setBottomPanel] = useState<"support" | "notifications" | "bookings" | "profile" | null>(null);
  const [pinMapTarget, setPinMapTarget] = useState<"pickup" | "drop" | null>(null);
  const [pinMapCoords, setPinMapCoords] = useState<[number, number]>([12.9716, 77.5946]);
  const [draftRestored, setDraftRestored] = useState(false);
  const [savedLocations, setSavedLocations] = useState<Place[]>([]);
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

  function loadSavedLocations(userId?: string) {
    try {
      const key = `${SAVED_LOCATIONS_KEY}_${userId || "guest"}`;
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      setSavedLocations(Array.isArray(items) ? items : []);
    } catch { setSavedLocations([]); }
  }

  function saveCurrentPickup() {
    if (!pickupPoint) { setNotice("ಮೊದಲು Pickup location ಆಯ್ಕೆಮಾಡಿ."); return; }
    const key = `${SAVED_LOCATIONS_KEY}_${session?.user?.id || "guest"}`;
    const next = [...savedLocations.filter(p => p.label !== pickupPoint.label), pickupPoint];
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setSavedLocations(next);
      setNotice("Pickup location Saved Locations‌ಗೆ ಸೇರಿಸಲಾಗಿದೆ.");
    } catch { setNotice("Location save ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ."); }
  }

  function useSavedLocation(place: Place, kind: "pickup" | "drop") {
    if (kind === "pickup") { setPickup(place.label); setPickupPoint(place); }
    else { setDrop(place.label); setDropPoint(place); }
    setDistance(null); setEta(null); setActiveSearch(null); setMenuSection("list");
  }

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

  async function cancelCustomerBooking(booking: Booking) {
    const status = booking.status.toLowerCase();
    const cancellable = ["requested", "accepted", "assigned", "driver_assigned", "driver_arrived"].includes(status);
    if (!cancellable || !session?.user?.id || cancellingBookingId) return;
    const arrived = status === "driver_arrived";
    const message = arrived
      ? "The driver has reached the pickup point. A ₹30 cancellation charge may apply. Do you want to continue?"
      : "Cancel this booking? No cancellation fee applies before the driver reaches the pickup point.";
    if (!window.confirm(message)) return;
    setCancellingBookingId(booking.id);
    const details = {
      ...(booking.booking_details || {}),
      cancellation_reason: "Cancelled by customer",
      cancellation_fee: arrived ? 30 : 0,
      cancelled_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled", booking_details: details })
      .eq("id", booking.id)
      .eq("user_id", session.user.id);
    setCancellingBookingId(null);
    if (error) {
      setNotice("Booking cancellation failed. Please try again or contact YREL Support.");
      return;
    }
    await loadBookings(session.user.id);
    setTrackingBookingId(null);
    if (instantSearchBooking?.id === booking.id) setInstantSearchBooking(null);
    setNotice(arrived
      ? "Booking cancelled. The ₹30 cancellation charge is recorded for this booking."
      : "Booking cancelled successfully. No cancellation fee.");
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
      setAuthReady(true);

      if (data.session?.user) {
        void loadCustomer(data.session.user.id);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => {
        if (!mounted) return;

        setSession(next);
        setAuthReady(true);

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

  // Show splash only on a fresh app visit, never after an authenticated login.
  useEffect(() => {
    if (!authReady) return;
    if (session) {
      setSplashVisible(false);
      return;
    }
    const seen = window.sessionStorage.getItem("yrel_splash_seen_v2");
    if (seen) {
      setSplashVisible(false);
      return;
    }
    window.sessionStorage.setItem("yrel_splash_seen_v2", "1");
    setSplashVisible(true);
    const splashTimer = window.setTimeout(() => setSplashVisible(false), 2200);
    return () => window.clearTimeout(splashTimer);
  }, [authReady, session]);

  useEffect(() => {
    if (!splashVisible && authReady && !session) setAuthOpen(true);
  }, [splashVisible, authReady, session]);

  useEffect(() => {
    if (!instantSearchBooking) return;
    if (instantSearchSeconds <= 0) {
      const expiredBooking = instantSearchBooking;
      setInstantSearchBooking(null);
      void (async () => {
        await supabase.from("bookings").update({ status: "cancelled", booking_details: { ...(expiredBooking.booking_details || {}), cancellation_reason: "No driver accepted within 1 minute", cancellation_fee: 0, cancelled_at: new Date().toISOString() } }).eq("id", expiredBooking.id).eq("status", "requested");
        if (session?.user?.id) await loadBookings(session.user.id);
        setNotice("Sorry, no driver accepted within 1 minute. Your request was closed with no cancellation fee.");
      })();
      return;
    }
    const timer = window.setTimeout(() => setInstantSearchSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [instantSearchBooking, instantSearchSeconds, session]);

  useEffect(() => {
    if (!instantSearchBooking?.id) return;
    const channel = supabase.channel(`yrel-booking-${instantSearchBooking.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${instantSearchBooking.id}` }, (payload) => {
        const updated = payload.new as Booking;
        if (["accepted", "assigned", "driver_assigned", "driver_arrived", "ongoing"].includes((updated.status || "").toLowerCase())) {
          setInstantSearchBooking(null);
          setNotice(`A driver has been assigned to booking ${updated.booking_code}. Open My Bookings → Active to view trip details and tracking.`);
          if (session?.user?.id) void loadBookings(session.user.id);
        }
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [instantSearchBooking?.id, session]);

  useEffect(() => {
    if (!seatShareEligible) {
      setSeatShareMode(false);
      setSeatTrips([]);
      setSelectedSeatTrip(null);
      setSeatSearchDone(false);
          }
  }, [seatShareEligible]);
      

  useEffect(() => {
    if (!pinMapTarget) return;
    let cancelled = false;
    const initMap = () => {
      const L = (window as any).L;
      const el = document.getElementById("yrel-pin-map");
      if (!L || !el || cancelled) return;
      const map = L.map(el).setView(pinMapCoords, 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
      const marker = L.marker(pinMapCoords, { draggable: true }).addTo(map);
      const update = (latlng: any) => setPinMapCoords([latlng.lat, latlng.lng]);
      map.on("click", (event: any) => { marker.setLatLng(event.latlng); update(event.latlng); });
      marker.on("dragend", () => update(marker.getLatLng()));
      window.setTimeout(() => map.invalidateSize(), 120);
      (window as any).__yrelPinMap = map;
    };
    if ((window as any).L) initMap();
    else {
      if (!document.querySelector('link[data-yrel-leaflet]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet"; link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.dataset.yrelLeaflet = "1"; document.head.appendChild(link);
      }
      let script = document.querySelector('script[data-yrel-leaflet]') as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.dataset.yrelLeaflet = "1"; document.body.appendChild(script);
      }
      script.addEventListener("load", initMap, { once: true });
    }
    return () => { cancelled = true; try { (window as any).__yrelPinMap?.remove(); } catch {} };
  }, [pinMapTarget]);

  async function saveSelectedMapPin() {
    if (!pinMapTarget) return;
    const lat = pinMapCoords[0], lon = pinMapCoords[1];
    if (!isIndia(lat, lon)) { setNotice("YREL currently supports locations within India only."); return; }
    try {
      const response = await fetch("https://photon.komoot.io/reverse?lat=" + lat + "&lon=" + lon + "&lang=en");
      const json = await response.json();
      const p = json.features?.[0]?.properties || {};
      const name = p.name || p.street || p.locality || "Pinned location";
      const city = p.city || p.town || p.village || p.municipality || p.locality || "";
      const state = p.state || "";
      const place: Place = { name, city, state, lat, lon, label: [name, city, state].filter(Boolean).join(", ") };
      if (pinMapTarget === "pickup") { setPickup(place.label); setPickupPoint(place); }
      else { setDrop(place.label); setDropPoint(place); }
      setDistance(null); setEta(null); setPinMapTarget(null); setActiveSearch(null);
    } catch { setNotice("Could not identify this map pin. Please move the pin and try again."); }
  }

  // English is the default; persist only the customer's explicit language choice.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === "en" || saved === "kn" || saved === "hi") setLanguage(saved);
    } catch { /* Keep English if storage is unavailable. */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); }
    catch { /* Language remains active for this visit. */ }
  }, [language]);

  // Show the branded splash once per browser session, never after OAuth returns.
  useEffect(() => {
    try {
      const isOAuthReturn = sessionStorage.getItem("yrel_oauth_in_progress") === "1";
      if (isOAuthReturn) {
        sessionStorage.removeItem("yrel_oauth_in_progress");
        sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
        return;
      }
      if (!sessionStorage.getItem(SPLASH_SEEN_KEY)) {
        setSplashVisible(true);
        sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
        const timer = window.setTimeout(() => setSplashVisible(false), 1350);
        return () => window.clearTimeout(timer);
      }
    } catch { /* Continue without splash if browser storage is unavailable. */ }
  }, []);

  // Restore unfinished booking form only when returning from Google OAuth.
  useEffect(() => {
    try {
      const restoreAfterLogin = sessionStorage.getItem("yrel_restore_booking_after_login") === "1";
      sessionStorage.removeItem("yrel_restore_booking_after_login");
      const savedDraft = restoreAfterLogin ? localStorage.getItem(BOOKING_DRAFT_STORAGE_KEY) : null;
      if (!restoreAfterLogin) localStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
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
      seatShareMode, seatCount,
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
    seatCount,
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
    sessionStorage.setItem("yrel_oauth_in_progress", "1");
    sessionStorage.setItem("yrel_restore_booking_after_login", "1");

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
    if (schedule === "now" && !seatShareMode) return null;
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

    if (!fare) {
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
          ? `${RENTAL_CITY_PACKAGES[packageIndex].hours} hours / ${RENTAL_CITY_PACKAGES[packageIndex].km} km`
          : null,
      rental_included_hours:
        service === "rental" && rentalBookingArea === "city"
          ? RENTAL_CITY_PACKAGES[packageIndex].hours
          : null,
      rental_included_km:
        service === "rental" && rentalBookingArea === "city"
          ? RENTAL_CITY_PACKAGES[packageIndex].km
          : null,
      rental_extra_hour_charge:
        service === "rental" && rentalBookingArea === "city"
          ? RENTAL_CITY[ride]?.extraHour ?? null
          : null,
      rental_extra_km_charge:
        service === "rental" && rentalBookingArea === "city"
          ? RENTAL_CITY[ride]?.extraKm ?? null
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

    if (schedule === "now") {
      setInstantSearchBooking(data as Booking);
      setInstantSearchSeconds(60);
      setNotice("");
    } else {
      setNotice(`Advance booking ${data.booking_code} is confirmed as a request. YREL will notify you when a driver is assigned.`);
    }

    await loadBookings(session.user.id);

    setPickup("");
    setDrop("");
    setPickupPoint(null);
    setDropPoint(null);
    setDistance(null);
    setEta(null);
  }

  async function signOut() {
    // Show the mandatory login screen immediately while Supabase clears the session.
    setProfileOpen(false);
    setProfileSetupOpen(false);
    setMenuOpen(false);
    setBottomPanel(null);
    setAuthOpen(true);
    setNotice("");

    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthOpen(false);
      setNotice("Sign out failed. Please try again.");
      return;
    }

    localStorage.removeItem(PHONE_STORAGE_KEY);
    setSession(null);
    setCustomer(null);
    setBookings([]);
    setSeatBookings([]);
    setProfileEditMode(false);
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
      {splashVisible && (
        <div className="yrel-splash-screen" role="status" aria-label="YREL loading">
          <img src="https://raw.githubusercontent.com/samratsihimoge-eng/YREL/main/Yrel_logo_png.png" alt="YREL" />
          <span>Your city. Your fun. Just YREL it.</span>
          <div className="yrel-splash-loader" />
        </div>
      )}
      <header className="topbar yrel-fixed-header">
        <button className="header-menu-button header-menu-left" onClick={() => { if (menuOpen) { setMenuOpen(false); setMenuSection("list"); } else { setBottomPanel(null); setMenuOpen(true); setMenuSection("list"); } }} aria-label="Toggle menu"><Menu size={23} /></button>
        <a className="brand header-brand" href="#" aria-label="YREL home">
          <img className="brand-logo" src="https://raw.githubusercontent.com/samratsihimoge-eng/YREL/main/Yrel_logo_png.png" alt="YREL logo" />
        </a>
        <button className="header-notification-button" onClick={() => { setMenuOpen(false); setMenuSection("list"); setBottomPanel(bottomPanel === "notifications" ? null : "notifications"); }} aria-label="Notifications" title="Notifications"><Bell size={22} /></button>
      </header>

      {pinMapTarget && (
        <div className="pin-map-backdrop" onClick={() => setPinMapTarget(null)}>
          <section className="pin-map-panel" onClick={(e) => e.stopPropagation()}>
            <div className="pin-map-heading"><strong>{pinMapTarget === "pickup" ? "Choose pickup location" : "Choose destination"}</strong><button type="button" onClick={() => setPinMapTarget(null)} aria-label="Close map"><X size={21}/></button></div>
            <p>Map ಮೇಲೆ pin ಅನ್ನು drag ಮಾಡಿ ಅಥವಾ ಬೇಕಾದ ಜಾಗದಲ್ಲಿ tap ಮಾಡಿ.</p>
            <div id="yrel-pin-map" className="yrel-pin-map" />
            <button type="button" className="pin-map-confirm" onClick={saveSelectedMapPin}>Use this location</button>
          </section>
        </div>
      )}

      {menuOpen && (
        <div className="app-panel-backdrop" onClick={() => { setMenuOpen(false); setMenuSection("list"); }}>
          <section className="app-menu-panel" onClick={(e) => e.stopPropagation()}>
            <div className="app-panel-heading">
              <span className="app-panel-mark"><Menu size={19} /></span>
              <h2>{menuSection === "list" ? "Menu" : ({
                how: "How it works", services: "Services", privacy: "Privacy Policy",
                terms: "Terms & Conditions", cancellation: "Cancellation Policy", language: "Language", saved: "Saved Locations"
              } as const)[menuSection]}</h2>
              <button className="app-panel-close" onClick={() => { if (menuSection !== "list") setMenuSection("list"); else setMenuOpen(false); }} aria-label={menuSection !== "list" ? "Back to menu" : "Close menu"}>{menuSection !== "list" ? <ArrowLeft size={20} /> : <X size={20} />}</button>
            </div>
            {menuSection === "list" ? (
              <div className="app-menu-options">
                <button onClick={() => setMenuSection("how")}><BookOpen size={20} /><span>How it works</span><ArrowRight size={17} /></button>
                <button onClick={() => setMenuSection("services")}><CarFront size={20} /><span>Services</span><ArrowRight size={17} /></button>
                <button onClick={() => setMenuSection("privacy")}><ShieldCheck size={20} /><span>Privacy Policy</span><ArrowRight size={17} /></button>
                <button onClick={() => setMenuSection("terms")}><FileText size={20} /><span>Terms & Conditions</span><ArrowRight size={17} /></button>
                <button onClick={() => setMenuSection("cancellation")}><Ban size={20} /><span>{language === "kn" ? "ರದ್ದತಿ ನೀತಿ" : language === "hi" ? "रद्द करने की नीति" : "Cancellation Policy"}</span><ArrowRight size={17} /></button>
                <button onClick={() => { loadSavedLocations(session?.user?.id); setMenuSection("saved"); }}><MapPin size={20} /><span>Saved Locations</span><ArrowRight size={17} /></button>
                <button onClick={() => setMenuSection("language")}><Languages size={20} /><span>Language</span><ArrowRight size={17} /></button>
              </div>
            ) : (
              <div className="app-menu-detail">
                {menuSection === "how" && <>
                  <p>Book a ride or driver service easily with YREL.</p>
                  <h3>1. Choose a service</h3><p>Select Cab, Driver or Cab Rentals.</p>
                  <h3>2. Enter locations</h3><p>Choose Pickup and Destination. Review the distance and estimated fare.</p>
                  <h3>3. Choose a time</h3><p>Select instant or advance booking.</p>
                  <h3>4. Confirm your booking</h3><p>Tap Book Now. View booking status and updates in My Bookings.</p>
                </>}
                {menuSection === "services" && <>
                  <h3>Cab</h3><p>Choose a suitable vehicle for city and outstation trips.</p>
                  <h3>Driver</h3><p>Book a professional driver to drive your own vehicle.</p>
                  <h3>Cab Rentals</h3><p>Rent a cab by the hour or by the day.</p>
                  <h3>Seat Sharing</h3><p>Book a seat when available on eligible outstation or airport routes.</p>
                </>}
                {menuSection === "privacy" && <>
                  <p>YREL uses information needed to provide bookings and customer support.</p>
                  <h3>Information we use</h3><p>Your name, mobile number, account details, pickup and destination, and booking details.</p>
                  <h3>How we use information</h3><p>To manage bookings, contact drivers, provide customer support, maintain safety and improve our service.</p>
                  <h3>Contact</h3><p>For privacy questions, contact yrelcabs@gmail.com.</p>
                </>}
                {menuSection === "terms" && <>
                  <p>The following basic terms apply when you make a booking using YREL.</p>
                  <h3>Booking information</h3><p>Customers are responsible for providing a correct contact number, pickup, destination and travel time.</p>
                  <h3>Fare and service</h3><p>Review the estimated fare and service details before booking. Additional distance or time may incur extra charges.</p>
                  <h3>Safety</h3><p>Check driver and vehicle details before starting the trip. Share the OTP only with the driver when required.</p>
                  <h3>Support</h3><p>Contact YREL Support for service-related questions.</p>
                </>}
                {menuSection === "cancellation" && <>
                  <p>Cancellation charges depend on the driver's arrival status.</p>
                  <h3>Before the driver arrives</h3><p>No cancellation fee applies if you cancel before the driver reaches the pickup location.</p>
                  <h3>After the driver arrives</h3><p>A ₹30 cancellation fee applies if you cancel after the driver reaches the pickup location.</p>
                  <h3>If the driver cancels</h3><p>No cancellation fee applies if the driver cancels or does not arrive.</p>
                  <h3>If no driver accepts</h3><p>No cancellation fee applies if no driver accepts an instant cab request within one minute.</p>
                </>}
                {menuSection === "saved" && <div className="saved-locations-panel">
                  <p>ನಿಮ್ಮ Pickup ಸ್ಥಳವನ್ನು ಉಳಿಸಿ. ಮುಂದಿನ ಬಾರಿ Pickup ಅಥವಾ Destination ಆಗಿ ಬಳಸಬಹುದು.</p>
                  <button type="button" className="saved-location-save" onClick={saveCurrentPickup}>＋ Save current pickup location</button>
                  {savedLocations.length === 0 ? <p className="saved-location-empty">ಇನ್ನೂ ಯಾವುದೇ ಸ್ಥಳವನ್ನು ಉಳಿಸಿಲ್ಲ.</p> : savedLocations.map((place, index) => <div className="saved-location-row" key={`${place.label}-${index}`}><span><MapPin size={17}/><b>{place.label}</b></span><div><button onClick={() => useSavedLocation(place,"pickup")}>Use Pickup</button><button onClick={() => useSavedLocation(place,"drop")}>Use Drop</button></div></div>)}
                </div>}
                {menuSection === "language" && <div className="language-options">
                  <button className={language === "en" ? "language-option active" : "language-option"} onClick={() => { setLanguage("en"); setMenuSection("list"); }}><span>🇬🇧</span> English {language === "en" && <Check size={18}/>}</button>
                  <button className={language === "kn" ? "language-option active" : "language-option"} onClick={() => { setLanguage("kn"); setMenuSection("list"); }}><span>ಕ</span> ಕನ್ನಡ {language === "kn" && <Check size={18}/>}</button>
                  <button className={language === "hi" ? "language-option active" : "language-option"} onClick={() => { setLanguage("hi"); setMenuSection("list"); }}><span>अ</span> हिन्दी {language === "hi" && <Check size={18}/>}</button>
                </div>}
              </div>
            )}
          </section>
        </div>
      )}
      <section className="booking-section" id="services">

        <div className="service-tabs">
          <button
            className={
              service === "cab" ? "service-tab active" : "service-tab"
            }
            onClick={() => changeService("cab")}
          >
            <span className="service-emoji" aria-hidden="true">🚕</span>
            <span>Book a Cab</span>
          </button>

          <button
            className={
              service === "driver" ? "service-tab active" : "service-tab"
            }
            onClick={() => changeService("driver")}
          >
            <span className="service-emoji" aria-hidden="true">🧑‍✈️</span>
            <span>Book a Driver</span>
          </button>

          <button
            className={
              service === "rental" ? "service-tab active" : "service-tab"
            }
            onClick={() => changeService("rental")}
          >
            <span className="service-emoji" aria-hidden="true">🚙</span>
            <span>Cab Rentals</span>
          </button>
        </div>

        <div className="booking-card">
          {service === "driver" && (
            <div className="choice-row">
              <button className={area === "city" ? "choice active" : "choice"} onClick={() => { setArea("city"); setDistance(null); }}>City</button>
              <button className={area === "outstation" ? "choice active" : "choice"} onClick={() => { setArea("outstation"); setDistance(null); }}>Outstation</button>
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
              

              <div className="location-input">
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
              <button type="button" className="pin-location-link" onClick={() => { setPinMapCoords(pickupPoint ? [pickupPoint.lat, pickupPoint.lon] : [12.9716,77.5946]); setPinMapTarget("pickup"); }}>Pin location</button>

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

            <button type="button" className="location-swap-button"
              onClick={() => {
                setPickup(drop); setDrop(pickup);
                setPickupPoint(dropPoint); setDropPoint(pickupPoint);
                setPickupOptions([]); setDropOptions([]); setActiveSearch(null);
                setDistance(null); setEta(null); setSeatTrips([]); setSelectedSeatTrip(null);
                setSeatSearchDone(false); setSeatShareMode(false);
              }}
              aria-label="Swap pickup and destination" title="Swap pickup and destination">
              <ArrowDownUp size={18} />
            </button>

            <div className="field-wrap">
              

              <div className="location-input">
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
              <button type="button" className="pin-location-link" onClick={() => { setPinMapCoords(dropPoint ? [dropPoint.lat,dropPoint.lon] : pickupPoint ? [pickupPoint.lat,pickupPoint.lon] : [12.9716,77.5946]); setPinMapTarget("drop"); }}>Pin location</button>

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

          {!seatShareMode && (
            <div className="booking-mode-block">
              <div className="booking-switch-row">
                <div className="schedule-row">
                  <button type="button" className={schedule === "now" ? "pill active" : "pill"} aria-pressed={schedule === "now"} onClick={() => { setSchedule("now"); setDate(""); setTime(""); }}>Instant</button>
                  <button type="button" className={schedule === "later" ? "pill active" : "pill"} aria-pressed={schedule === "later"} onClick={() => setSchedule("later")}>Advance</button>
                </div>
                {(service === "cab" || service === "rental") && !seatShareMode && ride !== "Auto" && (
                  <div className="choice-row compact-choice" aria-label="AC preference">
                    <button type="button" className={ac === "AC" ? "choice active" : "choice"} onClick={() => setAc("AC")}>AC</button>
                    <button type="button" className={ac === "Non-AC" ? "choice active" : "choice"} onClick={() => setAc("Non-AC")}>Non-AC</button>
                  </div>
                )}
              </div>
              {schedule === "later" && (
                <div className="option-fields date-fields">
                  <label>Pickup date<input type="date" value={date} min={localDateString()} onChange={(e) => setDate(e.target.value)} /></label>
                  <label>Pickup time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
                </div>
              )}
            </div>
          )}

          {service === "cab" && pickupPoint && dropPoint && distance !== null && !routeLoading && (
            <>
              <div className="field-label">Choose vehicle</div>

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
                      <b>{RENTAL_CITY_PACKAGES[i].hours} Hours</b>
                      <small>{RENTAL_CITY_PACKAGES[i].km} KM included</small>
                      <strong>{money(f)}</strong>
                    </button>
                  )
                )}
              </div>

              <p className="hint">
                Extra time: {money((RENTAL_CITY[ride] || RENTAL_CITY.Hatchback).extraHour)} per hour.
                Extra distance: {money((RENTAL_CITY[ride] || RENTAL_CITY.Hatchback).extraKm)} per KM.
                AC / Non-AC has the same fare. Extra charges are calculated after the trip
                from the actual additional time and kilometres.
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
            tripType === "round-trip" &&
            schedule === "later" && (
              <div className="option-fields date-fields">
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
                        const end = new Date(`${selected}T00:00:00`);
                        setDays(Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1));
                      }
                    }}
                  />
                </label>
                <p className="hint">Number of days: {days}</p>
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
          {!seatShareMode && pickupPoint && dropPoint && distance !== null && !routeLoading && (
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
                  <small className="area-status-inline">
                    {bookingArea === "city" ? "City booking" : bookingArea === "outstation" ? "Outstation booking" : "Select locations to detect City / Outstation"}
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
                <span className="secure-note fare-secure-note"><ShieldCheck size={15} /> Secure booking</span>
              </div>
              {service === "cab" &&
                bookingArea === "outstation" && (
                  <p className="hint fare-disclaimer">
                    One-way outstation fare. Toll and parking are extra
                    at actuals. Final fare may vary based on completed
                    trip.
                  </p>
                )}

              {service === "driver" &&
                area === "outstation" && (
                  <p className="hint fare-disclaimer">
                    One day (up to 12 hours): ₹1,300. Two or more days:
                    ₹1,499 per day. For 2+ days, food is to be provided
                    separately by the customer. Extra hour on a one-day
                    booking: ₹130.
                  </p>
                )}

              {service === "rental" &&
                rentalBookingArea === "outstation" && (
                  <p className="hint fare-disclaimer">
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

      <section className="dashboard-brand-banner dashboard-brand-banner-bottom" aria-label="YREL tagline">
        <h1><span>Your city.</span> <em>Your fun.</em> <strong>Just YREL it.</strong></h1>
        <p><span className="banner-live-dot" /> Instant Booking <i>•</i> Pan India Service</p>
      </section>

      {instantSearchBooking && (
        <section className="instant-search-screen" role="dialog" aria-live="polite" aria-label="Searching for a YREL driver">
          <div className="instant-search-orbit"><span>Y</span></div>
          <h2>Finding your YREL driver</h2>
          <p>We are checking for an available driver near your pickup location.</p>
          <strong className="instant-search-countdown">00:{String(instantSearchSeconds).padStart(2,"0")}</strong>
          <small>Booking ID: {instantSearchBooking.booking_code}</small>
          <button className="instant-search-cancel" onClick={() => cancelCustomerBooking(instantSearchBooking)} disabled={cancellingBookingId===instantSearchBooking.id}>{cancellingBookingId===instantSearchBooking.id ? "Cancelling…" : "Cancel Booking"}</button>
        </section>
      )}

      <nav className={`yrel-bottom-nav${instantSearchBooking ? " search-mode" : ""}`} aria-label="Main navigation">
        <button aria-label="Home" title="Home" onClick={() => { setInstantSearchBooking(null); setBottomPanel(null); setMenuOpen(false); setMenuSection("list"); window.scrollTo({ top: 0, behavior: "smooth" }); }}><HomeIcon size={22} /></button>
        <button aria-label="Profile" title="Profile" onClick={() => {
          if (session && customer) {
            setProfileNameDraft(customer.full_name);
            setProfilePhoneDraft((customer.phone || "").replace(/^\+91/, ""));
            setProfileEditMode(false);
            setNotice("");
            setMenuOpen(false); setMenuSection("list"); setBottomPanel(bottomPanel === "profile" ? null : "profile");
          } else {
            setNotice("");
            setAuthOpen(true);
          }
        }}><UserRound size={22} /></button>
        <button aria-label="My Bookings" title="My Bookings" onClick={() => { if (!session) setAuthOpen(true); else { setMenuOpen(false); setMenuSection("list"); setBookingFilter("active"); setBottomPanel(bottomPanel === "bookings" ? null : "bookings"); } }}><ClipboardList size={22} /></button>
        <button className="support-nav-button" aria-label="Support" onClick={() => { setMenuOpen(false); setMenuSection("list"); setBottomPanel(bottomPanel === "support" ? null : "support"); }}><Headphones size={21} /><span>Support</span></button>
      </nav>

      {bottomPanel && (
        <div className="app-panel-backdrop bottom-panel-backdrop" onClick={() => setBottomPanel(null)}>
          <section className={`app-menu-panel bottom-info-panel bottom-info-panel-${bottomPanel}`} onClick={(e) => e.stopPropagation()}>
            <div className="app-panel-heading">
              <span className="app-panel-mark">{bottomPanel === "support" ? <Headphones size={19} /> : bottomPanel === "bookings" ? <ClipboardList size={19} /> : bottomPanel === "profile" ? <UserRound size={19} /> : <Bell size={19} />}</span>
              <h2>{bottomPanel === "support" ? "Support" : bottomPanel === "bookings" ? "My Bookings" : bottomPanel === "profile" ? "Customer Profile" : "Notifications"}</h2>
              {bottomPanel === "notifications" && <button className="app-panel-close" onClick={() => setBottomPanel(null)} aria-label="Close notifications"><X size={20} /></button>}
            </div>
            {bottomPanel === "support" ? (
              <div className="app-menu-detail support-actions">
                <p>YREL ಸಹಾಯಕ್ಕಾಗಿ ನಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸಿ.</p>
                <a className="support-call" href="tel:+919742809306"><Phone size={19} /> Call YREL Support</a>
                <a className="support-whatsapp" href="https://wa.me/919742809306" target="_blank" rel="noreferrer"><MessageCircle size={19} /> WhatsApp Support</a>
                <a className="support-chat" href="mailto:yrelcabs@gmail.com"><Mail size={19} /> Chat / Email Support</a>
              </div>
            ) : bottomPanel === "bookings" ? (
              <div className="app-menu-detail">
                {!session ? <div className="history-empty"><ClipboardList size={30}/><b>Login to view your bookings</b></div> : bookings.length + seatBookings.length === 0 ? <div className="history-empty"><ClipboardList size={30}/><b>No bookings yet</b><span>Your YREL trips will appear here.</span></div> : <>
                  <div className="history-filters" role="tablist" aria-label="Filter bookings">
                    {(["all","active","completed","cancelled"] as const).map((filter) => <button key={filter} role="tab" aria-selected={bookingFilter===filter} className={bookingFilter===filter ? "active" : ""} onClick={() => setBookingFilter(filter)}>{filter === "all" ? "All" : filter === "active" ? "Active" : filter === "completed" ? "Completed" : "Cancelled"}</button>)}
                  </div>
                  <div className="history-list">
                    {bookings.filter((b) => { const s=b.status.toLowerCase(); return bookingFilter==="all" || (bookingFilter==="completed" && s==="completed") || (bookingFilter==="cancelled" && s==="cancelled") || (bookingFilter==="active" && !["completed","cancelled"].includes(s)); }).map((b) => <article className="history-item" key={b.id}><div className="history-icon"><CarFront size={18} /></div><div className="history-main"><b>{b.booking_code}</b><span>{b.service_type.replaceAll("_"," ")} · {b.vehicle_type || "YREL service"}</span><small>{b.pickup} → {b.dropoff || "—"}</small><small>{new Date(b.created_at).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</small><div className="history-actions">{["requested","accepted","assigned","driver_assigned","driver_arrived"].includes(b.status.toLowerCase()) && <button type="button" className="history-action-cancel" disabled={cancellingBookingId===b.id} onClick={() => cancelCustomerBooking(b)}><Ban size={15}/>{cancellingBookingId===b.id ? "Cancelling…" : "Cancel Booking"}</button>}{["accepted","assigned","driver_assigned","driver_arrived","ongoing"].includes(b.status.toLowerCase()) && <button type="button" className="history-action-track" onClick={() => setTrackingBookingId(trackingBookingId===b.id ? null : b.id)}><MapPin size={15}/>{trackingBookingId===b.id ? "Hide Tracking" : "Track Driver"}</button>}</div>{trackingBookingId===b.id && <div className="driver-tracking-panel"><b>Driver & trip status</b><span>Status: {b.status.replaceAll("_"," ")}</span>{typeof b.booking_details?.driver_name === "string" && <span>Driver: {b.booking_details.driver_name}</span>}{typeof b.booking_details?.driver_phone === "string" && <a href={"tel:"+b.booking_details.driver_phone}>Call driver: {b.booking_details.driver_phone}</a>}{typeof b.booking_details?.vehicle_number === "string" && <span>Vehicle: {b.booking_details.vehicle_number}</span>}{typeof b.booking_details?.driver_latitude === "number" && typeof b.booking_details?.driver_longitude === "number" ? <a href={"https://www.google.com/maps?q="+b.booking_details.driver_latitude+","+b.booking_details.driver_longitude} target="_blank" rel="noreferrer">Open driver location in Maps</a> : <small>Live driver location will appear here when the assigned driver app shares GPS coordinates.</small>}</div>}</div><div className="history-right"><b>{money(Number(b.estimated_fare))}</b><span className={"status status-"+b.status.toLowerCase()}>{b.status.replaceAll("_"," ")}</span></div></article>)}
                    {seatBookings.filter((b) => { const s=b.status.toLowerCase(); return bookingFilter==="all" || (bookingFilter==="completed" && s==="completed") || (bookingFilter==="cancelled" && s==="cancelled") || (bookingFilter==="active" && !["completed","cancelled"].includes(s)); }).map((b) => <article className="history-item" key={b.id}><div className="history-icon"><Users size={18} /></div><div className="history-main"><b>{b.booking_code}</b><span>Seat Sharing · {b.seats_booked} seat(s)</span><small>{b.seat_share_trips?.pickup || "Pickup"} → {b.seat_share_trips?.dropoff || "Destination"}</small><small>{new Date(b.created_at).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</small></div><div className="history-right"><b>{money(Number(b.total_fare))}</b><span className={"status status-"+b.status.toLowerCase()}>{b.status.replaceAll("_"," ")}</span></div></article>)}
                  </div>
                </>}
              </div>
            ) : bottomPanel === "profile" ? (
              <div className="app-menu-detail compact-profile-panel">
                {customer && session ? <>
                  <div className="compact-profile-row"><small><BadgeCheck size={15} /> Customer ID</small><b>{customer.customer_code}</b></div>
                  <div className="compact-profile-row"><small><UserRound size={15} /> Full name</small>{profileEditMode ? <input className="email-input" value={profileNameDraft} onChange={(e) => setProfileNameDraft(e.target.value)} placeholder="Full name" /> : <b>{customer.full_name}</b>}</div>
                  <div className="compact-profile-row"><small><Phone size={15} /> Mobile number</small>{profileEditMode ? <div className="location-input profile-phone-input"><span>+91</span><input className="phone-number-input" type="tel" inputMode="numeric" maxLength={10} value={profilePhoneDraft} onChange={(e) => setProfilePhoneDraft(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile number" /></div> : <b>{customer.phone || "Not provided"} · {customer.phone_verified ? "Verified" : "Not verified"}</b>}</div>
                  <div className="compact-profile-row"><small><Mail size={15} /> Email ID</small><b className="profile-email">{session.user.email || "Not available"}</b></div>
                  <p className="compact-profile-hint">Google ಮೂಲಕ Login ಆಗಿರುವ Email ID ಅನ್ನು ಇಲ್ಲಿ ತೋರಿಸಲಾಗುತ್ತದೆ. Email ಬದಲಾವಣೆ Google Account ಮೂಲಕವೇ ಮಾಡಬೇಕು.</p>
                  {profileEditMode ? <button className="book-button full compact-profile-action" onClick={saveCustomerProfile} disabled={busy}>{busy && <Loader2 className="spin" />} Save changes <ArrowRight size={18} /></button> : <button className="book-button full compact-profile-action" onClick={() => { setProfileNameDraft(customer.full_name); setProfilePhoneDraft((customer.phone || "").replace(/^\+91/, "")); setProfileEditMode(true); setNotice(""); }}>Edit profile</button>}
                  <button className="profile-signout-button compact-profile-action" onClick={signOut}><LogOut size={17} /> Sign out</button>
                  {notice && <div className="notice">{notice}</div>}
                </> : <p>ನಿಮ್ಮ Profile ನೋಡಲು ದಯವಿಟ್ಟು Login ಮಾಡಿ.</p>}
              </div>
            ) : (
              <div className="app-menu-detail">
                {session ? <>{bookings.length ? <div className="notification-list">{bookings.slice(0,5).map((b) => <article className="notification-card" key={b.id}><div className="notification-symbol"><Bell size={20} /></div><div className="notification-content"><div className="notification-topline"><b>{b.booking_code}</b><time dateTime={b.created_at}>{new Date(b.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div><strong className="notification-status">{b.status.replaceAll("_"," ")}</strong><p>{b.pickup} → {b.dropoff || "—"}</p></div></article>)}</div> : <div className="notifications-empty"><Bell size={28}/><b>No notifications yet</b></div>}</> : <div className="notifications-empty"><Bell size={28}/><b>Please log in to view notifications</b></div>}
              </div>
            )}
          </section>
        </div>
      )}

      {!authOpen && !instantSearchBooking && <RoadAnimation />}
      <footer className={`footer ${authOpen ? "yrel-login-footer" : "yrel-app-footer"}`}>
        <span>© {new Date().getFullYear()} YREL Technologies Private Limited</span>
        <span className="yrel-app-version">App Version 1.0</span>
        <img
          className="yrel-footer-logo"
          src="https://raw.githubusercontent.com/samratsihimoge-eng/YREL/main/Yrel_logo_png.png"
          alt="YREL logo"
        />
      </footer>

      {authOpen && (
        <div className="yrel-login-screen" role="dialog" aria-modal="true" aria-label="Customer login">
          <div className="yrel-login-content">
            <div className="yrel-login-brandline">
              <h1><span>Your city.</span><span>Your fun.</span><span className="yrel-slogan-highlight">Just YREL it.</span></h1>
              <p>Instant Booking <span>•</span> Pan India Service</p>
            </div>
            <div className="yrel-login-form">
              <label className="wide-field">
                <span className="yrel-mobile-prompt">Enter your 10-digit mobile number</span>
                <div className="location-input">
                  <span>+91</span>
                  <input
                    className="phone-number-input"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Enter mobile number"
                  />
                </div>
              </label>
              <button className="book-button full" onClick={startGoogleLogin} disabled={busy}>
                {busy && <Loader2 className="spin" />}
                <span>Continue with Google</span>
                <ArrowRight size={18} />
              </button>
              {notice && <div className="notice">{notice}</div>}
            </div>
            <RoadAnimation />
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
