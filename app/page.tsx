"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ArrowRight, CarFront, Check, Clock3, MapPin, Menu, ShieldCheck,
  UserRound, X, Navigation, CalendarDays, LogOut, Loader2
} from "lucide-react";

type Service = "cab" | "driver" | "rental";
type Area = "city" | "outstation";
type Ride = "Auto" | "Hatchback" | "Sedan" | "Ertiga" | "Innova Crysta" | "MPV" | "SUV";
type Place = { name: string; label: string; lat: number; lon: number; city?: string; state?: string; country?: string };
type Booking = {
  id: string; booking_code: string; service_type: string; vehicle_type: string | null;
  pickup: string; dropoff: string | null; scheduled_at: string | null;
  estimated_fare: number; status: string; created_at: string; booking_details?: Record<string, unknown>;
};

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
const RENTAL_CITY: Record<string, { fares: number[]; km: number; extraKm: number; extraMin: number }> = {
  Hatchback: { fares: [399, 699, 899], km: 10, extraKm: 12, extraMin: 2 },
  Sedan: { fares: [449, 799, 999], km: 10, extraKm: 14, extraMin: 2.5 },
  MPV: { fares: [599, 999, 1299], km: 10, extraKm: 17, extraMin: 3 },
  SUV: { fares: [699, 1199, 1499], km: 10, extraKm: 18, extraMin: 3.5 },
};
const DRIVER_VEHICLES = ["Hatchback", "Sedan", "SUV"];
const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const normalizeCity = (value?: string) => (value || "").trim().toLocaleLowerCase("en-IN").replace(/\\s+/g, " ");
const getAutoCabArea = (pickup: Place | null, drop: Place | null): Area | null => {
  if (!pickup?.city || !drop?.city) return null;
  return normalizeCity(pickup.city) === normalizeCity(drop.city) ? "city" : "outstation";
};
const isIndia = (lat: number, lon: number) => lat >= 6 && lat <= 38.5 && lon >= 68 && lon <= 97.5;
const distanceBetween = (a: Place, b: Place) => {
  const r = 6371, rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

export default function Home() {
  const [service, setService] = useState<Service>("cab");
  const [area, setArea] = useState<Area>("city");
  const [tripType, setTripType] = useState<"one-way" | "round-trip">("round-trip");
  const [ride, setRide] = useState<Ride>("Sedan");
  const [ac, setAc] = useState<"AC" | "Non-AC">("AC");
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [pickupPoint, setPickupPoint] = useState<Place | null>(null);
  const [dropPoint, setDropPoint] = useState<Place | null>(null);
  const [pickupOptions, setPickupOptions] = useState<Place[]>([]);
  const [dropOptions, setDropOptions] = useState<Place[]>([]);
  const [activeSearch, setActiveSearch] = useState<"pickup" | "drop" | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchCenter, setSearchCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [schedule, setSchedule] = useState<"now" | "later">("now");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [hours, setHours] = useState(2);
  const [days, setDays] = useState(1);
  const [packageIndex, setPackageIndex] = useState(0);
  const [gear, setGear] = useState<"Manual" | "Automatic">("Manual");
  const [driverVehicle, setDriverVehicle] = useState("Sedan");
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [language, setLanguage] = useState<"en" | "kn" | "hi">("en");

  const autoCabArea = getAutoCabArea(pickupPoint, dropPoint);\n  const bookingArea: Area | null = service === "cab" ? autoCabArea : area;\n\n  const words = {
    en: { tagline: "Your ride. Your way.", pickup: "Pickup location", drop: "Destination", book: "Book now", login: "Login with email", history: "Your bookings" },
    kn: { tagline: "ನಿಮ್ಮ ಪ್ರಯಾಣ, ನಿಮ್ಮ ಆಯ್ಕೆ.", pickup: "ಪಿಕಪ್ ಸ್ಥಳ", drop: "ತಲುಪುವ ಸ್ಥಳ", book: "ಈಗ ಬುಕ್ ಮಾಡಿ", login: "ಇಮೇಲ್ ಮೂಲಕ ಲಾಗಿನ್", history: "ನಿಮ್ಮ ಬುಕ್ಕಿಂಗ್‌ಗಳು" },
    hi: { tagline: "आपकी सवारी, आपका तरीका।", pickup: "पिकअप स्थान", drop: "गंतव्य", book: "अभी बुक करें", login: "ईमेल से लॉगिन", history: "आपकी बुकिंग" },
  }[language];

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadBookings(data.session.user.id);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) loadBookings(next.user.id);
      else setBookings([]);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadBookings(userId: string) {
    const { data } = await supabase.from("bookings").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
    if (data) setBookings(data as Booking[]);
  }

  async function searchPlaces(value: string, kind: "pickup" | "drop") {
    if (value.trim().length < 3) {
      kind === "pickup" ? setPickupOptions([]) : setDropOptions([]);
      return;
    }
    try {
      const near = searchCenter ? `&lat=${searchCenter.lat}&lon=${searchCenter.lon}` : "";
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&limit=8&lang=en${near}`;
      const res = await fetch(url);
      const json = await res.json();
      const options: Place[] = (json.features || []).map((f: any) => {
        const p = f.properties || {};
        const city = p.city || p.town || p.village || p.municipality || "";
        const state = p.state || "";
        const name = p.name || p.street || p.postcode || city || "Location";
        return { name, city, state, country: p.country, label: [name, city, state].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", "), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
      }).filter((p: Place) => isIndia(p.lat, p.lon));
      if (kind === "pickup") setPickupOptions(options); else setDropOptions(options);
    } catch {
      setNotice("Location search is temporarily unavailable. Please try again.");
    }
  }

  useEffect(() => {
    const t = setTimeout(() => { if (activeSearch === "pickup") searchPlaces(pickup, "pickup"); }, 350);
    return () => clearTimeout(t);
  }, [pickup, activeSearch, searchCenter]);
  useEffect(() => {
    const t = setTimeout(() => { if (activeSearch === "drop") searchPlaces(drop, "drop"); }, 350);
    return () => clearTimeout(t);
  }, [drop, activeSearch, searchCenter]);

  async function useCurrentLocation() {
    if (!navigator.geolocation) { setNotice("GPS is not supported on this device."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const { latitude: lat, longitude: lon } = coords;
      if (!isIndia(lat, lon)) { setNotice("YREL currently supports locations within India only."); setLocating(false); return; }
      setSearchCenter({ lat, lon });
      try {
        const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`);
        const json = await res.json();
        const p = json.features?.[0]?.properties || {};
        const name = p.name || p.street || "Current location";
        const city = p.city || p.town || p.village || "";
        const state = p.state || "";
        const place: Place = { name, city, state, lat, lon, label: [name, city, state].filter(Boolean).join(", ") };
        setPickup(place.label); setPickupPoint(place); setActiveSearch(null);
      } catch { setPickup("Current location"); setPickupPoint({ name: "Current location", label: "Current location", lat, lon }); }
      setLocating(false);
    }, () => { setNotice("Please allow location permission and try again."); setLocating(false); }, { enableHighAccuracy: true, timeout: 12000 });
  }

  useEffect(() => {
    if (!pickupPoint || !dropPoint) { setDistance(null); setEta(null); return; }
    let cancelled = false;
    setRouteLoading(true);
    fetch(`https://router.project-osrm.org/route/v1/driving/${pickupPoint.lon},${pickupPoint.lat};${dropPoint.lon},${dropPoint.lat}?overview=false`)
      .then(r => r.json()).then(json => {
        if (cancelled) return;
        const route = json.routes?.[0];
        if (route && route.distance > 0) { setDistance(route.distance / 1000); setEta(Math.round(route.duration / 60)); }
        else { setDistance(null); setEta(null); }
      }).catch(() => { if (!cancelled) { setDistance(null); setEta(null); } })
      .finally(() => { if (!cancelled) setRouteLoading(false); });
    return () => { cancelled = true; };
  }, [pickupPoint, dropPoint, area, service]);

  const fare = useMemo(() => {
    const travelDate = date && time ? new Date(`${date}T${time}`) : new Date();
    const hour = travelDate.getHours();
    const autoNight = hour >= 22 || hour < 5;
    const cabNight = hour >= 23 || hour < 5;
    if (service === "cab" && bookingArea === "city") {
      if (ride === "Auto") {
        const base = distance ? Math.max(36, 36 + Math.max(0, distance - 2) * 18) : 0;
        return base ? (autoNight ? base * 1.5 : base) : 0;
      }
      const rate = CITY_CAB[ride];
      const base = rate && distance ? Math.max(rate.min, rate.min + Math.max(0, distance - 4) * (ac === "AC" ? rate.ac : rate.nonAc)) : 0;
      return base ? base + (cabNight ? 50 : 0) : 0;
    }
    if (service === "cab" && bookingArea === "outstation") {
      const rate = OUTSTATION[ride];
      return rate && distance ? distance * rate.one + rate.bata : 0;
    }
    if (service === "driver" && area === "city") return tripType === "round-trip" ? 299 + Math.max(0, hours - 2) * 60 * 2.5 : 399 + Math.max(0, hours - 2) * 60 * 2.5;
    if (service === "driver" && area === "outstation") return days === 1 ? 1300 : 1499 * days;
    if (service === "rental" && area === "city") return RENTAL_CITY[ride]?.fares[packageIndex] || 0;
    if (service === "rental" && area === "outstation") {
      const rate = OUTSTATION[ride];
      const totalKm = distance ? distance * 2 : 0;
      return rate ? (Math.max(totalKm, days * 300) * rate.round) + rate.bata * days : 0;
    }
    return 0;
  }, [service, bookingArea, area, ride, ac, distance, tripType, days, hours, packageIndex, date, time]);

  function choosePlace(place: Place, kind: "pickup" | "drop") {
    if (kind === "pickup") { setPickup(place.label); setPickupPoint(place); setPickupOptions([]); }
    else { setDrop(place.label); setDropPoint(place); setDropOptions([]); }
    setActiveSearch(null);
  }

  function changeService(next: Service) {
    setService(next); setArea("city"); setTripType(next === "cab" ? "one-way" : "round-trip");
    setDistance(null); setEta(null); setNotice("");
    if (next === "cab") setRide("Sedan");
    if (next === "driver") setRide("Sedan");
    if (next === "rental") setRide("Hatchback");
  }

  async function sendLoginLink() {
    if (!email.trim()) { setNotice("Please enter your email address."); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined } });
    setBusy(false);
    if (error) setNotice(error.message);
    else { setLinkSent(true); setNotice("Login link sent. Please check your email."); }
  }

  function getScheduledAt() {
    if (schedule === "now" && service === "cab" && bookingArea === "city") return null;
    if (!date || !time) return undefined;
    return new Date(`${date}T${time}`).toISOString();
  }

  async function book() {
    setNotice("");
    if (!session?.user) { setAuthOpen(true); return; }
    if (!pickup.trim()) { setNotice("Please select a pickup location."); return; }
    if (!drop.trim()) { setNotice("Please select a destination."); return; }
    if (!pickupPoint || !dropPoint) { setNotice("Please choose both locations from the suggestions."); return; }
    if (service === "cab" && !bookingArea) { setNotice("Please select both locations from the suggestions so we can detect City / Outstation."); return; }\n    if (distance === null || routeLoading) { setNotice("Please wait while we calculate the road distance."); return; }
    if (schedule === "later" && (!date || !time)) { setNotice("Please select your pickup date and time."); return; }
    if ((service !== "cab" || bookingArea === "outstation") && (!date || !time)) { setNotice("Please select your travel date and time."); return; }
    if (!fare) { setNotice("Fare could not be calculated. Please check your locations."); return; }

    const scheduledAt = getScheduledAt();
    if (scheduledAt === undefined) { setNotice("Please select date and time."); return; }
    const serviceLabel = service === "cab" ? (bookingArea === "city" ? "cab_city" : "cab_outstation") : service === "driver" ? (area === "city" ? "driver_city" : "driver_outstation") : (area === "city" ? "rental_city" : "rental_outstation");
    const details = {
      service, area: bookingArea, trip_type: service === "cab" ? "one-way" : tripType, ac_preference: service === "rental" || service === "cab" ? ac : null,
      distance_km: distance, eta_minutes: eta, hours: service === "driver" && area === "city" ? hours : null,
      days: service !== "cab" && area === "outstation" ? days : null,
      rental_package: service === "rental" && area === "city" ? ["1 hour / 10 km", "2 hours / 20 km", "3 hours / 30 km"][packageIndex] : null,
      gear: service === "driver" ? gear : null,
      customer_vehicle_class: service === "driver" ? driverVehicle : null,
      note: service === "rental" && ac ? "AC/Non-AC is a preference only; same fare. Subject to availability." : null,
      toll_parking: "Actual charges, if applicable, are extra.",
    };
    setBusy(true);
    const { data, error } = await supabase.from("bookings").insert({
      user_id: session.user.id, service_type: serviceLabel, vehicle_type: service === "driver" ? `Driver (${driverVehicle})` : ride,
      pickup, dropoff: drop, scheduled_at: scheduledAt, estimated_fare: fare, status: "requested", booking_details: details,
    }).select("*").single();
    setBusy(false);
    if (error) { setNotice(`Booking failed: ${error.message}`); return; }
    setNotice(`Your booking is successful! Booking ID: ${data.booking_code}. We will notify you when a driver is assigned.`);
    await loadBookings(session.user.id);
    setPickup(""); setDrop(""); setPickupPoint(null); setDropPoint(null); setDistance(null); setEta(null);
  }

  async function signOut() { await supabase.auth.signOut(); setSession(null); setBookings([]); }

  const vehicleOptions = service === "cab" ? (bookingArea === "city" ? ["Auto", "Hatchback", "Sedan", "Ertiga", "Innova Crysta"] : ["Hatchback", "Sedan", "Ertiga", "Innova Crysta"]) : service === "rental" ? (area === "city" ? ["Hatchback", "Sedan", "MPV", "SUV"] : ["Hatchback", "Sedan", "Ertiga", "Innova Crysta"]) : [];
  const needsDate = service !== "cab" || bookingArea === "outstation" || schedule === "later";

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">Y</span><span>YREL<small>RIDE WITH EASE</small></span></a>
        <nav className="desktop-nav"><a href="#services">Services</a><a href="#how">How it works</a><a href="#history">My bookings</a></nav>
        <div className="top-actions">
          <select className="language-select" value={language} onChange={e => setLanguage(e.target.value as any)} aria-label="Language">
            <option value="en">English</option><option value="kn">ಕನ್ನಡ</option><option value="hi">हिन्दी</option>
          </select>
          {session ? <button className="login-button" onClick={signOut}><LogOut size={16}/> Sign out</button> : <button className="login-button" onClick={() => setAuthOpen(true)}><UserRound size={16}/> Login</button>}
          <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">{menuOpen ? <X/> : <Menu/>}</button>
        </div>
      </header>
      {menuOpen && <nav className="mobile-nav"><a href="#services" onClick={() => setMenuOpen(false)}>Services</a><a href="#how" onClick={() => setMenuOpen(false)}>How it works</a><a href="#history" onClick={() => setMenuOpen(false)}>My bookings</a></nav>}

      <section className="hero">
        <div className="hero-copy"><span className="eyebrow"><span className="eyebrow-dot"/> SIMPLE. SAFE. RELIABLE.</span><h1>{words.tagline}<br/><em>Go places with YREL.</em></h1><p>Book a cab, hire a professional driver, or reserve a rental car — all in one place.</p><div className="hero-points"><span><ShieldCheck size={17}/> Reliable service</span><span><MapPin size={17}/> Across India</span></div></div>
        <div className="hero-art"><div className="sun-disc"/><div className="road-line"/><div className="hero-car"><CarFront size={104} strokeWidth={1.2}/></div><div className="floating-tag"><span className="tag-icon"><Navigation size={17}/></span><span><b>Your journey starts here</b><small>Book in a few simple steps</small></span></div></div>
      </section>

      <section className="booking-section" id="services">
        <div className="section-heading"><div><span className="eyebrow">BOOK YOUR RIDE</span><h2>What do you need today?</h2></div><span className="secure-note"><ShieldCheck size={15}/> Secure booking</span></div>
        <div className="service-tabs">
          <button className={service === "cab" ? "service-tab active" : "service-tab"} onClick={() => changeService("cab")}><CarFront/><span>Book a Cab</span></button>
          <button className={service === "driver" ? "service-tab active" : "service-tab"} onClick={() => changeService("driver")}><UserRound/><span>Book a Driver</span></button>
          <button className={service === "rental" ? "service-tab active" : "service-tab"} onClick={() => changeService("rental")}><Navigation/><span>Cab Rentals</span></button>
        </div>

        <div className="booking-card">
          <div className="card-topline"><div><span className="step-label">01 / SERVICE DETAILS</span><h3>{service === "cab" ? "Where are you heading?" : service === "driver" ? "Hire a driver for your car" : "Rent a cab for your journey"}</h3></div><span className="card-icon"><CarFront/></span></div>
          {service === "cab" ? (
            <div className="auto-area-note">
              <span className="auto-area-dot" />
              {bookingArea === "city" ? "City ride detected" : bookingArea === "outstation" ? "Outstation ride detected · One Way" : "Select pickup and destination to detect City / Outstation"}
            </div>
          ) : (
            <div className="choice-row">
              <button className={area === "city" ? "choice active" : "choice"} onClick={() => {setArea("city"); setDistance(null);}}>City</button>
              <button className={area === "outstation" ? "choice active" : "choice"} onClick={() => {setArea("outstation"); setDistance(null);}}>Outstation</button>
            </div>
          )}

          {service === "driver" && <div className="choice-row secondary-choice">
            <button className={tripType === "one-way" ? "choice active" : "choice"} onClick={() => setTripType("one-way")}>One Way</button>
            <button className={tripType === "round-trip" ? "choice active" : "choice"} onClick={() => setTripType("round-trip")}>Round Trip</button>
          </div>}
          <div className="location-grid">
            <div className="field-wrap">
              <label>{words.pickup}</label>
              <div className="location-input"><MapPin size={18}/><input value={pickup} onChange={e => {setPickup(e.target.value);setPickupPoint(null);}} onFocus={() => setActiveSearch("pickup")} placeholder="Enter pickup area, street or village"/><button className="gps-button" onClick={useCurrentLocation} disabled={locating} title="Use current location">{locating ? <Loader2 className="spin"/> : <Navigation size={17}/>}</button></div>
              {activeSearch === "pickup" && pickupOptions.length > 0 && <div className="suggestions">{pickupOptions.map((p, i) => <button key={`${p.label}-${i}`} onMouseDown={e => e.preventDefault()} onClick={() => choosePlace(p, "pickup")}><MapPin size={15}/><span>{p.label}</span></button>)}</div>}
            </div>
            <div className="field-wrap">
              <label>{words.drop}</label>
              <div className="location-input"><MapPin size={18}/><input value={drop} onChange={e => {setDrop(e.target.value);setDropPoint(null);}} onFocus={() => setActiveSearch("drop")} placeholder="Enter destination"/></div>
              {activeSearch === "drop" && dropOptions.length > 0 && <div className="suggestions">{dropOptions.map((p, i) => <button key={`${p.label}-${i}`} onMouseDown={e => e.preventDefault()} onClick={() => choosePlace(p, "drop")}><MapPin size={15}/><span>{p.label}</span></button>)}</div>}
            </div>
          </div>

          {(service === "cab" || service === "rental") && <><div className="field-label">Choose your vehicle</div><div className="vehicle-grid">{vehicleOptions.map(v => <button key={v} className={ride === v ? "vehicle-option selected" : "vehicle-option"} onClick={() => setRide(v as Ride)}><CarFront size={22}/><span>{v}</span>{ride === v && <Check className="vehicle-check" size={15}/>}</button>)}</div>
            {ride !== "Auto" && <div className="choice-row compact-choice"><span className="choice-caption">AC preference</span><button className={ac === "AC" ? "choice active" : "choice"} onClick={() => setAc("AC")}>AC</button><button className={ac === "Non-AC" ? "choice active" : "choice"} onClick={() => setAc("Non-AC")}>Non-AC</button></div>}
          </>}

          {service === "rental" && area === "city" && <><div className="field-label">Select rental package</div><div className="package-grid">{(RENTAL_CITY[ride] || RENTAL_CITY.Hatchback).fares.map((f, i) => <button key={i} className={packageIndex === i ? "package-option selected" : "package-option"} onClick={() => setPackageIndex(i)}><b>{i + 1} {i === 0 ? "Hour" : "Hours"}</b><small>{(i + 1) * 10} KM included</small><strong>{money(f)}</strong></button>)}</div><p className="hint">Extra kilometres and extra time are charged separately. AC / Non-AC has the same fare.</p></>}
          {service === "driver" && <><div className="field-label">Your car details</div><div className="option-fields"><label>Gear<select value={gear} onChange={e => setGear(e.target.value as any)}><option>Manual</option><option>Automatic</option></select></label><label>Vehicle type<select value={driverVehicle} onChange={e => setDriverVehicle(e.target.value)}>{DRIVER_VEHICLES.map(v => <option key={v}>{v}</option>)}</select></label></div>{area === "city" && <label className="wide-field">Required hours (minimum 2)<input type="number" min="2" max="24" value={hours} onChange={e => setHours(Math.max(2, Number(e.target.value) || 2))}/></label>}</>}
          {service !== "cab" && area === "outstation" && <label className="wide-field">Number of days<input type="number" min="1" max="30" value={days} onChange={e => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}/></label>}

          {service === "cab" && bookingArea === "city" && <div className="schedule-row"><span><CalendarDays size={17}/> When do you need the cab?</span><button className={schedule === "now" ? "pill active" : "pill"} onClick={() => setSchedule("now")}>Now</button><button className={schedule === "later" ? "pill active" : "pill"} onClick={() => setSchedule("later")}>Later</button></div>}
          {needsDate && <div className="option-fields date-fields"><label>Travel date<input type="date" value={date} min={new Date().toISOString().slice(0,10)} onChange={e => setDate(e.target.value)}/></label><label>Pickup time<input type="time" value={time} onChange={e => setTime(e.target.value)}/></label></div>}

          <div className="fare-panel">
            <div className="fare-info"><span className="step-label">ESTIMATED FARE</span><strong>{fare ? money(fare) : "—"}</strong><small>{routeLoading ? "Calculating road distance…" : distance !== null ? `${distance.toFixed(1)} km${eta ? ` · ${eta} min approx.` : ""}` : "Select pickup and destination to estimate"}</small></div>
            <button className="book-button" onClick={book} disabled={busy || routeLoading}>{busy ? <Loader2 className="spin"/> : null}{words.book}<ArrowRight size={18}/></button>
          </div>
          {service === "cab" && bookingArea === "outstation" && <p className="hint">One-way outstation fare. Toll and parking are extra at actuals. Final fare may vary based on completed trip.</p>}
          {service === "driver" && area === "outstation" && <p className="hint">One day (up to 12 hours): ₹1,300. Two or more days: ₹1,499 per day. For 2+ days, food is to be provided separately by the customer. Extra hour on a one-day booking: ₹130.</p>}
          {service === "rental" && area === "outstation" && <p className="hint">Round trip only. Minimum 300 km per day. AC / Non-AC is a preference at the same fare. Toll and parking are extra at actuals.</p>}
          {notice && <div className={notice.toLowerCase().includes("successful") || notice.toLowerCase().includes("sent") ? "notice success" : "notice"}>{notice}</div>}
        </div>
      </section>

      <section className="trust-strip" id="how"><div><ShieldCheck/><span><b>Reliable bookings</b><small>Booking updates from YREL</small></span></div><div><MapPin/><span><b>India-wide locations</b><small>Search cities, towns and villages</small></span></div><div><Clock3/><span><b>Simple scheduling</b><small>Choose a time that works</small></span></div></section>

      {session && <section className="history-section" id="history"><div className="section-heading"><div><span className="eyebrow">YOUR ACCOUNT</span><h2>{words.history}</h2></div><span className="history-count">{bookings.length} recent</span></div>
        {bookings.length === 0 ? <div className="empty-history">Your bookings will appear here after you book a service.</div> : <div className="history-list">{bookings.map(b => <article className="history-item" key={b.id}><div className="history-icon"><CarFront/></div><div className="history-main"><b>{b.booking_code}</b><span>{b.service_type.replaceAll("_", " ")} · {b.vehicle_type || "YREL service"}</span><small>{b.pickup} → {b.dropoff || "—"}</small><small>{new Date(b.created_at).toLocaleString()}</small></div><div className="history-right"><b>{money(Number(b.estimated_fare))}</b><span className="status">{b.status}</span></div></article>)}</div>}
      </section>}

      <footer className="footer"><a className="brand" href="#"><span className="brand-mark">Y</span><span>YREL<small>RIDE WITH EASE</small></span></a><span>© {new Date().getFullYear()} YREL. All rights reserved.</span><span>Made for easier journeys.</span></footer>

      {authOpen && <div className="modal-backdrop" onClick={() => setAuthOpen(false)}><div className="auth-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setAuthOpen(false)}><X/></button><div className="modal-symbol"><UserRound/></div><span className="eyebrow">WELCOME TO YREL</span><h2>{linkSent ? "Check your email" : "Login to continue"}</h2><p>{linkSent ? "We sent you a secure sign-in link. Open it on this device to continue." : "Enter your email address and we’ll send you a secure login link."}</p>{!linkSent && <><input className="email-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/><button className="book-button full" onClick={sendLoginLink} disabled={busy}>{busy ? "Sending…" : words.login}<ArrowRight size={18}/></button></>}{notice && <div className="notice">{notice}</div>}</div></div>}
    </main>
  );
}
