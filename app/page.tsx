
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ArrowRight,
  CarFront,
  Check,
  Clock3,
  MapPin,
  Menu,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  Zap,
  Navigation,
  CalendarDays,
} from "lucide-react";

type Ride = "Auto" | "Hatchback" | "Sedan" | "SUV";

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
};

const fares: Record<Ride, number> = {
  Auto: 14,
  Hatchback: 18,
  Sedan: 23,
  SUV: 31,
};

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const isIndia = (country?: string) =>
  !!country &&
  ["india", "ಭಾರತ", "भारत"].includes(country.trim().toLowerCase());

function isInsideIndia(lat: number, lon: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= 6 &&
    lat <= 38.5 &&
    lon >= 68 &&
    lon <= 97.5
  );
}

function straightDistance(a: Place, b: Place) {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(dLon / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const [tab, setTab] = useState<"cab" | "driver">("cab");
  const [ride, setRide] = useState<Ride>("Sedan");
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [distance, setDistance] = useState("0");
  const [distanceReady, setDistanceReady] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [menu, setMenu] = useState(false);
  const [language, setLanguage] = useState<"en" | "kn" | "hi">("en");

  const [pickupPlaces, setPickupPlaces] = useState<Place[]>([]);
  const [dropPlaces, setDropPlaces] = useState<Place[]>([]);
  const [pickupPoint, setPickupPoint] = useState<Place | null>(null);
  const [dropPoint, setDropPoint] = useState<Place | null>(null);

  const [searchCenter, setSearchCenter] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  const [locating, setLocating] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);

  const labels = {
    en: {
      pickup: "PICKUP LOCATION",
      drop: "DROP LOCATION",
      pickupHint: "Search village, area, street or PIN code",
      dropHint: "Where are you going?",
      current: "Use current location",
      km: "ROAD DISTANCE (KM)",
    },
    kn: {
      pickup: "ಪಿಕಪ್ ಸ್ಥಳ",
      drop: "ಡ್ರಾಪ್ ಸ್ಥಳ",
      pickupHint: "ಹಳ್ಳಿ, ಏರಿಯಾ, ರಸ್ತೆ ಅಥವಾ ಪಿನ್ ಕೋಡ್ ಹುಡುಕಿ",
      dropHint: "ನೀವು ಎಲ್ಲಿಗೆ ಹೋಗಬೇಕು?",
      current: "ಪ್ರಸ್ತುತ ಸ್ಥಳ ಬಳಸಿ",
      km: "ರಸ್ತೆ ದೂರ (ಕಿ.ಮೀ.)",
    },
    hi: {
      pickup: "पिकअप स्थान",
      drop: "ड्रॉप स्थान",
      pickupHint: "गाँव, इलाका, सड़क या पिन कोड खोजें",
      dropHint: "आप कहाँ जाना चाहते हैं?",
      current: "वर्तमान स्थान इस्तेमाल करें",
      km: "सड़क दूरी (कि.मी.)",
    },
  }[language];

  const photonLang =
    language === "kn" ? "kn" : language === "hi" ? "hi" : "en";

  // Capture GPS for nearby search without changing the pickup field.
  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        if (isInsideIndia(lat, lon)) {
          setSearchCenter({ lat, lon });
        }
      },
      () => {
        // User can still search Indian locations manually.
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  }, []);

  async function searchPlaces(
    query: string,
    setter: (places: Place[]) => void,
    signal: AbortSignal
  ) {
    const cleanQuery = query.trim();

    if (cleanQuery.length < 3) {
      setter([]);
      return;
    }

    try {
      const lat = searchCenter?.lat ?? 20.5937;
      const lon = searchCenter?.lon ?? 78.9629;

      const url =
        `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}` +
        `&lang=en&limit=20&lat=${lat}&lon=${lon}&zoom=14`;

      const response = await fetch(url, { signal });

      if (!response.ok) {
        throw new Error("Location search unavailable");
      }

      const data = await response.json();

      const places: Place[] = (data.features || [])
        .map((feature: any) => {
          const p = feature.properties || {};
          const coordinates = feature.geometry?.coordinates || [];

          const resultLat = Number(coordinates[1]);
          const resultLon = Number(coordinates[0]);
          const country = p.country || "";

          const parts = [
            p.name,
            p.street,
            p.district,
            p.city,
            p.state,
            p.postcode,
            country,
          ].filter(
            (value: string, index: number, array: string[]) =>
              value && array.indexOf(value) === index
          );

          return {
            name: p.name || "Location",
            label: parts.join(", "),
            lat: resultLat,
            lon: resultLon,
            city: p.city || p.district || "",
            state: p.state || "",
            country,
          } as Place;
        })
        .filter(
          (place: Place) =>
            isIndia(place.country) &&
            isInsideIndia(place.lat, place.lon)
        );

      // When GPS is available, show nearer matching results first.
      if (searchCenter) {
        places.sort((a, b) => {
          const distanceA = Math.hypot(
            a.lat - searchCenter.lat,
            (a.lon - searchCenter.lon) *
              Math.cos((searchCenter.lat * Math.PI) / 180)
          );

          const distanceB = Math.hypot(
            b.lat - searchCenter.lat,
            (b.lon - searchCenter.lon) *
              Math.cos((searchCenter.lat * Math.PI) / 180)
          );

          return distanceA - distanceB;
        });
      }

      setter(places.slice(0, 8));
    } catch (error: any) {
      if (error.name !== "AbortError") setter([]);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(() => {
      searchPlaces(pickup, setPickupPlaces, controller.signal);
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pickup, photonLang, searchCenter]);

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(() => {
      searchPlaces(drop, setDropPlaces, controller.signal);
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [drop, photonLang, searchCenter]);

  function choosePlace(place: Place, type: "pickup" | "drop") {
    if (type === "pickup") {
      setPickup(place.label);
      setPickupPoint(place);
      setPickupPlaces([]);
      setSearchCenter({ lat: place.lat, lon: place.lon });
    } else {
      setDrop(place.label);
      setDropPoint(place);
      setDropPlaces([]);
    }

    setDistance("0");
    setDistanceReady(false);
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setNotice("Your browser does not support GPS.");
      return;
    }

    setLocating(true);
    setNotice("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        if (!isInsideIndia(latitude, longitude)) {
          setLocating(false);
          setNotice("YREL currently supports locations within India only.");
          return;
        }

        setSearchCenter({ lat: latitude, lon: longitude });

        try {
          const response = await fetch(
            `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}&lang=en`
          );

          if (!response.ok) throw new Error("Reverse search failed");

          const data = await response.json();
          const p = data.features?.[0]?.properties || {};

          const country = p.country || "India";

          const parts = [
            p.name,
            p.street,
            p.district,
            p.city,
            p.state,
            p.postcode,
            country,
          ].filter(Boolean);

          const place: Place = {
            name: p.name || "Current location",
            label:
              parts.join(", ") ||
              `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
            lat: latitude,
            lon: longitude,
            city: p.city || p.district || "",
            state: p.state || "",
            country,
          };

          setPickup(place.label);
          setPickupPoint(place);
          setPickupPlaces([]);
          setDistance("0");
          setDistanceReady(false);
        } catch {
          const place: Place = {
            name: "Current location",
            label: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
            lat: latitude,
            lon: longitude,
            country: "India",
          };

          setPickup(place.label);
          setPickupPoint(place);
          setPickupPlaces([]);
        }

        setLocating(false);
      },
      (error) => {
        setLocating(false);

        setNotice(
          error.code === 1
            ? "Location permission was denied. Please allow location access in your browser settings."
            : "Could not get your location. Please try again."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      }
    );
  }

  // Calculate route only after both locations have been selected.
  useEffect(() => {
    if (!pickupPoint || !dropPoint) return;

    let cancelled = false;

    setRouteLoading(true);
    setDistance("0");
    setDistanceReady(false);
    setNotice("");

    const directKm = straightDistance(pickupPoint, dropPoint);

    const controller = new AbortController();

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${pickupPoint.lon},${pickupPoint.lat};${dropPoint.lon},${dropPoint.lat}?overview=false`,
      { signal: controller.signal }
    )
      .then((response) => {
        if (!response.ok) throw new Error("Route service unavailable");
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;

        const route = data.routes?.[0];

        if (data.code !== "Ok" || !route) {
          setNotice("Road route not found. Please select another location.");
          return;
        }

        const km = Number(route.distance) / 1000;

        // Reject obviously incorrect routes, such as 449 km
        // between two places only a few kilometres apart.
        const maximumReasonableKm = Math.max(
          directKm * 5,
          directKm + 30,
          40
        );

        if (
          !Number.isFinite(km) ||
          km <= 0 ||
          km > 3000 ||
          km > maximumReasonableKm
        ) {
          setNotice(
            "The road distance looks incorrect. Please select the pickup and drop locations again."
          );
          return;
        }

        setDistance(km.toFixed(1));
        setDistanceReady(true);

        setNotice(
          `Road distance: ${km.toFixed(1)} km · Approx. ${Math.round(
            route.duration / 60
          )} min`
        );
      })
      .catch((error) => {
        if (!cancelled && error.name !== "AbortError") {
          setNotice("Could not calculate road distance right now.");
        }
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pickupPoint, dropPoint]);

  const estimate = useMemo(
    () =>
      Math.max(
        60,
        Math.round(Number(distance || 0) * fares[ride] + 45)
      ),
    [distance, ride]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadBookings(data.session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);

      if (currentSession) {
        loadBookings(currentSession.user.id);
      } else {
        setBookings([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadBookings(uid: string) {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error) setBookings(data || []);
  }

  async function sendLoginLink() {
    const cleanEmail = email.trim().toLowerCase();

    if (
      !cleanEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      setNotice("Please enter a valid email address.");
      return;
    }

    setBusy(true);
    setNotice("");

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    setBusy(false);

    if (error) {
      setNotice(error.message);
    } else {
      setLinkSent(true);
      setNotice("Login link sent. Please check your email inbox.");
    }
  }

  async function book() {
    if (!session) {
      setAuthOpen(true);
      return;
    }

    if (!pickup.trim() || (tab === "cab" && !drop.trim())) {
      setNotice("Please enter your pickup and destination.");
      return;
    }

    if (tab === "cab" && (!pickupPoint || !dropPoint)) {
      setNotice(
        "Please select pickup and destination from the India location suggestions."
      );
      return;
    }

    if (tab === "cab" && (!distanceReady || Number(distance) <= 0)) {
      setNotice(
        "Please wait until the correct road distance is calculated."
      );
      return;
    }

    if (when === "later" && (!date || !time)) {
      setNotice("Choose your preferred date and time.");
      return;
    }

    setBusy(true);
    setNotice("");

    const payload = {
      user_id: session.user.id,
      service_type: tab,
      vehicle_type: tab === "cab" ? ride : null,
      pickup: pickup.trim(),
      dropoff: tab === "cab" ? drop.trim() : null,
      scheduled_at:
        when === "later"
          ? new Date(`${date}T${time}`).toISOString()
          : null,
      estimated_fare: tab === "cab" ? estimate : 0,
      status: "requested",
    };

    const { data, error } = await supabase
      .from("bookings")
      .insert(payload)
      .select()
      .single();

    setBusy(false);

    if (error) {
      setNotice(error.message);
      return;
    }

    setBookings((current) => [data, ...current]);

    setNotice(
      `Request received — ${data.booking_code}. We’ll confirm your booking shortly.`
    );

    setPickup("");
    setDrop("");
    setPickupPoint(null);
    setDropPoint(null);
    setPickupPlaces([]);
    setDropPlaces([]);
    setDistance("0");
    setDistanceReady(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setNotice("You’re signed out.");
  }

  return (
    <main>
      <header className="nav">
        <a className="brand" href="#">
          <span className="brandmark">Y</span> YREL
          <span className="branddot">.</span>
        </a>

        <nav>
          <a href="#services">Services</a>
          <a href="#how">How it works</a>
          <a href="#bookings">My bookings</a>
        </nav>

        <div className="navright">
          {session ? (
            <>
              <span className="userchip">
                <UserRound size={15} />
                {session.user.email || "Member"}
              </span>
              <button className="textbtn" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <button className="login" onClick={() => setAuthOpen(true)}>
              Log in <ArrowRight size={15} />
            </button>
          )}

          <button
            className="menubtn"
            onClick={() => setMenu(!menu)}
            aria-label="Open menu"
          >
            <Menu />
          </button>
        </div>
      </header>

      {menu && (
        <div className="mobilemenu">
          <a href="#services" onClick={() => setMenu(false)}>
            Services
          </a>
          <a href="#how" onClick={() => setMenu(false)}>
            How it works
          </a>
          <a href="#bookings" onClick={() => setMenu(false)}>
            My bookings
          </a>
        </div>
      )}

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <Sparkles size={14} /> MOVE BETTER WITH YREL
          </div>

          <h1>
            Your city.
            <br />
            <em>Your ride.</em>
            <br />
            Your time.
          </h1>

          <p className="lead">
            A better way to get there. Book a ride or a professional driver,
            on your schedule.
          </p>

          <div className="trust">
            <span>
              <ShieldCheck size={16} /> Thoughtful, reliable rides
            </span>
            <span>
              <Zap size={15} /> Simple booking
            </span>
          </div>
        </div>

        <div className="hero-art">
          <div className="orbit o1"></div>
          <div className="orbit o2"></div>
          <div className="art-glow"></div>
          <div className="car-emoji">🚘</div>

          <div className="floating f1">
            <span className="dotgreen"></span>
            Ride made easy
          </div>

          <div className="floating f2">
            <MapPin size={15} />
            Your destination awaits
          </div>

          <div className="art-caption">
            THE CITY IS YOURS TO EXPLORE
          </div>
        </div>
      </section>

      <section className="booking-wrap" id="services">
        <div className="booking-card">
          <div className="booking-head">
            <div>
              <div className="eyebrow dark">LET’S GET YOU MOVING</div>
              <h2>Where to next?</h2>
            </div>

            <div className="switch">
              <button
                className={tab === "cab" ? "active" : ""}
                onClick={() => setTab("cab")}
              >
                <CarFront size={17} /> Book a cab
              </button>

              <button
                className={tab === "driver" ? "active" : ""}
                onClick={() => setTab("driver")}
              >
                <UserRound size={16} /> Book a driver
              </button>
            </div>
          </div>

          <div className="languagebar">
            <span>LOCATION LANGUAGE</span>

            {(
              [
                ["en", "English"],
                ["kn", "ಕನ್ನಡ"],
                ["hi", "हिन्दी"],
              ] as const
            ).map(([value, name]) => (
              <button
                key={value}
                className={language === value ? "langactive" : ""}
                onClick={() => setLanguage(value)}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="formgrid">
            <div className="locationbox">
              <label className="field">
                <span>
                  <MapPin size={15} /> {labels.pickup}
                </span>

                <input
                  value={pickup}
                  onChange={(event) => {
                    setPickup(event.target.value);
                    setPickupPoint(null);
                    setDistance("0");
                    setDistanceReady(false);
                  }}
                  placeholder={labels.pickupHint}
                />
              </label>

              {pickupPlaces.length > 0 && (
                <div className="suggestions">
                  {pickupPlaces.map((place, index) => (
                    <button
                      key={`${place.label}-${index}`}
                      onClick={() => choosePlace(place, "pickup")}
                    >
                      <MapPin size={14} />
                      <span>{place.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <button
                className="gpsbtn"
                onClick={useCurrentLocation}
                disabled={locating}
              >
                <Navigation size={14} />
                {locating ? "Getting location…" : labels.current}
              </button>
            </div>

            {tab === "cab" && (
              <div className="locationbox">
                <label className="field">
                  <span>
                    <MapPin size={15} /> {labels.drop}
                  </span>

                  <input
                    value={drop}
                    onChange={(event) => {
                      setDrop(event.target.value);
                      setDropPoint(null);
                      setDistance("0");
                      setDistanceReady(false);
                    }}
                    placeholder={labels.dropHint}
                  />
                </label>

                {dropPlaces.length > 0 && (
                  <div className="suggestions">
                    {dropPlaces.map((place, index) => (
                      <button
                        key={`${place.label}-${index}`}
                        onClick={() => choosePlace(place, "drop")}
                      >
                        <MapPin size={14} />
                        <span>{place.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {tab === "cab" && (
            <>
              <div className="ride-label">CHOOSE YOUR RIDE</div>

              <div className="rides">
                {(
                  ["Auto", "Hatchback", "Sedan", "SUV"] as Ride[]
                ).map((vehicle, index) => (
                  <button
                    key={vehicle}
                    onClick={() => setRide(vehicle)}
                    className={`ride ${
                      ride === vehicle ? "selected" : ""
                    }`}
                  >
                    <span className="rideicon">
                      {["🛺", "🚗", "🚙", "🚐"][index]}
                    </span>

                    <b>{vehicle}</b>

                    <small>
                      From{" "}
                      {money(
                        fares[vehicle] * Number(distance || 0) + 45
                      )}
                    </small>

                    {ride === vehicle && (
                      <span className="tick">
                        <Check size={12} />
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <label className="field compact">
                <span>
                  {labels.km}
                  {routeLoading ? " · CALCULATING…" : ""}
                </span>

                <input
                  type="number"
                  min="1"
                  max="3000"
                  value={distance}
                  readOnly
                />
              </label>

              <div className="fare">
                <div>
                  <small>ESTIMATED FARE</small>
                  <strong>
                    {distanceReady ? money(estimate) : "Calculating…"}
                  </strong>
                  <small className="muted">
                    Indicative estimate · final fare may vary
                  </small>
                </div>

                <span className="farebadge">YREL VALUE</span>
              </div>
            </>
          )}

          <div className="schedule">
            <button
              className={when === "now" ? "chosen" : ""}
              onClick={() => setWhen("now")}
            >
              <Zap size={15} /> Book now
            </button>

            <button
              className={when === "later" ? "chosen" : ""}
              onClick={() => setWhen("later")}
            >
              <Clock3 size={15} /> Schedule for later
            </button>
          </div>

          {when === "later" && (
            <div className="formgrid">
              <label className="field">
                <span>
                  <CalendarDays size={14} /> DATE
                </span>

                <input
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>

              <label className="field">
                <span>
                  <Clock3 size={14} /> TIME
                </span>

                <input
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </label>
            </div>
          )}

          <button
            className="bookbtn"
            disabled={busy || routeLoading}
            onClick={book}
          >
            {busy
              ? "Please wait…"
              : session
              ? "Request booking"
              : "Continue to login"}

            <ArrowRight size={17} />
          </button>

          {notice && <p className="notice">{notice}</p>}

          <p className="secure">
            <ShieldCheck size={13} />
            Your details are handled securely.
          </p>
        </div>
      </section>

      <section className="features" id="how">
        <div className="sectionintro">
          <div className="eyebrow dark">THE YREL DIFFERENCE</div>

          <h2>
            Getting there should
            <br />
            <em>feel this easy.</em>
          </h2>
        </div>

        <div className="featuregrid">
          <article>
            <span>01</span>
            <div className="featureicon">⌖</div>
            <h3>Simple by design</h3>
            <p>
              Tell us where you are and where you’re headed. Booking should
              never be complicated.
            </p>
          </article>

          <article>
            <span>02</span>
            <div className="featureicon">◷</div>
            <h3>Your time matters</h3>
            <p>
              Need a ride now or planning ahead? Choose the timing that works
              for you.
            </p>
          </article>

          <article>
            <span>03</span>
            <div className="featureicon">✳</div>
            <h3>More ways to move</h3>
            <p>
              Choose a vehicle or book a driver for the journey you have in
              mind.
            </p>
          </article>
        </div>
      </section>

      <section className="history" id="bookings">
        <div>
          <div className="eyebrow">YOUR YREL</div>
          <h2>Booking history</h2>
          <p>All your requests, together in one place.</p>
        </div>

        {!session ? (
          <button
            className="outline"
            onClick={() => setAuthOpen(true)}
          >
            Log in to view bookings <ArrowRight size={15} />
          </button>
        ) : bookings.length === 0 ? (
          <p className="empty">Your bookings will appear here.</p>
        ) : (
          <div className="historylist">
            {bookings.map((booking) => (
              <article key={booking.id}>
                <div className="historyicon">
                  {booking.service_type === "cab" ? "🚘" : "🧑‍✈️"}
                </div>

                <div className="historymain">
                  <b>
                    {booking.service_type === "cab"
                      ? `${booking.vehicle_type} ride`
                      : "Driver booking"}
                  </b>

                  <span>
                    {booking.pickup}
                    {booking.dropoff ? ` → ${booking.dropoff}` : ""}
                  </span>

                  <small>
                    {new Date(booking.created_at).toLocaleString("en-IN")}
                  </small>
                </div>

                <div className="historyright">
                  <b>
                    {booking.estimated_fare
                      ? money(booking.estimated_fare)
                      : "Quote pending"}
                  </b>

                  <span className={`status ${booking.status}`}>
                    {booking.status}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        <a className="brand" href="#">
          <span className="brandmark">Y</span> YREL
          <span className="branddot">.</span>
        </a>

        <span>Your ride. Your fun. Just YREL it.</span>
        <span>© {new Date().getFullYear()} YREL</span>
      </footer>

      {authOpen && (
        <div
          className="modalback"
          onClick={() => setAuthOpen(false)}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <button
              className="close"
              onClick={() => setAuthOpen(false)}
              aria-label="Close login"
            >
              <X />
            </button>

            <div className="brand">
              <span className="brandmark">Y</span> YREL
              <span className="branddot">.</span>
            </div>

            <h2>
              {linkSent ? "Check your inbox" : "Welcome aboard."}
            </h2>

            <p>
              {linkSent
                ? "Open the login link we sent to your email to sign in."
                : "Sign in with your email address to book your next ride."}
            </p>

            <label className="field">
              <span>EMAIL ADDRESS</span>

              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                disabled={linkSent}
                autoComplete="email"
              />
            </label>

            <button
              className="bookbtn"
              disabled={busy}
              onClick={sendLoginLink}
            >
              {busy ? "Please wait…" : "Send login link"}
              <ArrowRight size={16} />
            </button>

            {notice && <p className="notice">{notice}</p>}

            {linkSent && (
              <button
                className="textbtn"
                onClick={() => {
                  setLinkSent(false);
                  setNotice("");
                }}
              >
                Use another email address
              </button>
            )}

            <small className="modalhint">
              A secure sign-in link will be sent by Supabase to your email.
            </small>
          </div>
        </div>
      )}
    </main>
  );
}
