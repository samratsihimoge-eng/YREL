"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CarFront, ClipboardList, Clock3, LogOut, MapPin, Phone, ShieldCheck, UserRound, Wallet, RefreshCw, CheckCircle2, Power, Navigation, LocateFixed, RadioTower } from "lucide-react";
import "./partner.css";

type DriverProfile = {
  user_id: string; driver_type: "cab_driver" | "spare_driver"; approval_status: string;
  full_name: string | null; phone: string | null; vehicle_type: string | null;
  vehicle_number: string | null; gear_type: string | null; license_number: string | null; is_online: boolean; current_lat: number | null; current_lng: number | null; location_updated_at: string | null;
};
type Booking = {
  id: string; booking_code: string; service_type: string; vehicle_type: string | null;
  pickup: string; dropoff: string | null; scheduled_at: string | null;
  estimated_fare: number; status: string; created_at: string; booking_details?: Record<string, any> | null;
};
type DriverWallet = { balance: number; is_online_blocked: boolean };
type WalletTransaction = { id: string; transaction_type: string; amount: number; balance_after: number; description: string | null; payment_status: string; created_at: string; reference_id: string | null };

export default function PartnerPage() {
  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [phone, setPhone] = useState("+91");
  const [otp, setOtp] = useState("");
  const [otpReqId, setOtpReqId] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [driverType, setDriverType] = useState<"cab_driver" | "spare_driver">("cab_driver");
  const [fullName, setFullName] = useState("");
  const [vehicleType, setVehicleType] = useState("Sedan");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [gearType, setGearType] = useState("Manual");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [nearbyBookings, setNearbyBookings] = useState<Booking[]>([]);
  const [driverLocation, setDriverLocation] = useState<{lat:number; lng:number} | null>(null);
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"assigned" | "history" | "wallet" | "profile">("assigned");
  const [wallet, setWallet] = useState<DriverWallet | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadPartner = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true); setError("");
    const { data: p, error: pe } = await supabase.from("driver_profiles").select("user_id,driver_type,approval_status,full_name,phone,vehicle_type,vehicle_number,gear_type,license_number,is_online,current_lat,current_lng,location_updated_at").eq("user_id", session.user.id).maybeSingle();
    if (pe) setError(pe.message);
    setProfile(p as DriverProfile | null);
    if (p?.current_lat != null && p?.current_lng != null) setDriverLocation({lat:Number(p.current_lat),lng:Number(p.current_lng)});
    const { data: b, error: be } = await supabase.from("bookings").select("id,booking_code,service_type,vehicle_type,pickup,dropoff,scheduled_at,estimated_fare,status,created_at").eq("assigned_driver_id", session.user.id).order("created_at", { ascending: false }).limit(200);
    if (be) setError(be.message);
    setBookings((b || []) as Booking[]);
    const { data: openJobs, error: openError } = await supabase.from("bookings").select("id,booking_code,service_type,vehicle_type,pickup,dropoff,scheduled_at,estimated_fare,status,created_at,booking_details").is("assigned_driver_id", null).in("status", ["requested","searching"]).is("scheduled_at", null).order("created_at", {ascending:false}).limit(30);
    if (openError) setError(openError.message);
    setNearbyBookings((openJobs || []) as Booking[]);
    const { data: w, error: we } = await supabase.from("driver_wallets").select("balance,is_online_blocked").eq("driver_user_id", session.user.id).maybeSingle();
    if (we) setError(we.message);
    setWallet(w as DriverWallet | null);
    const { data: wt, error: wte } = await supabase.from("wallet_transactions").select("id,transaction_type,amount,balance_after,description,payment_status,created_at,reference_id").eq("driver_user_id", session.user.id).order("created_at", { ascending: false }).limit(100);
    if (wte) setError(wte.message);
    setWalletTransactions((wt || []) as WalletTransaction[]);
    setLoading(false);
  }, [session]);

  useEffect(() => { void loadPartner(); }, [loadPartner]);

  function normalizedPhone(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) return digits;
    if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
    return "";
  }
  async function authenticatePartner() {
    const mobile = normalizedPhone(phone);
    if (!mobile) { setError("Enter a valid 10-digit Indian mobile number."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/whatsapp/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: mobile })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send WhatsApp OTP.");
      setOtpReqId(result.reqId); setOtpSent(true);
      setError("6-digit WhatsApp OTP sent. Please check WhatsApp.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send WhatsApp OTP."); }
    finally { setBusy(false); }
  }

  async function verifyPartnerOtp() {
    const mobile = normalizedPhone(phone);
    if (!mobile || !otpReqId || !/^\d{6}$/.test(otp)) { setError("Enter the 6-digit WhatsApp OTP."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/whatsapp/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: mobile, reqId: otpReqId, otp, accountType: "partner" })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "OTP verification failed.");
      const { error: authError } = await supabase.auth.verifyOtp({ token_hash: result.tokenHash, type: "magiclink" });
      if (authError) throw authError;
      setOtpSent(false); setOtp(""); setOtpReqId(""); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "OTP verification failed."); }
    finally { setBusy(false); }
  }

  async function resendPartnerOtp() {
    await authenticatePartner();
  }

  async function registerProfile() {
    if (!session?.user || !fullName.trim() || !licenseNumber.trim()) { setError("Please enter your name and driving licence number."); return; }
    setBusy(true); setError("");
    const { data, error: e } = await supabase.from("driver_profiles").insert({
      user_id: session.user.id, driver_type: driverType, approval_status: "pending",
      full_name: fullName.trim(), phone: session.user.phone || normalizedPhone(phone),
      vehicle_type: driverType === "cab_driver" ? vehicleType : null,
      vehicle_number: driverType === "cab_driver" ? vehicleNumber.trim() : null,
      gear_type: driverType === "spare_driver" ? gearType : null,
      license_number: licenseNumber.trim()
    }).select("user_id,driver_type,approval_status,full_name,phone,vehicle_type,vehicle_number,gear_type,license_number").single();
    if (e) setError(e.message); else setProfile(data as DriverProfile);
    setBusy(false);
  }
  async function updateStatus(b: Booking, status: string) {
    setBusy(true); setError("");
    const { error: e } = await supabase.from("bookings").update({ status }).eq("id", b.id).eq("assigned_driver_id", session.user.id);
    if (e) setError(e.message); else setBookings(rows => rows.map(row => row.id === b.id ? { ...row, status } : row));
    setBusy(false);
  }

  const distanceKm = (a:{lat:number;lng:number}, b:{lat:number;lng:number}) => {
    const rad=(n:number)=>n*Math.PI/180, dLat=rad(b.lat-a.lat), dLng=rad(b.lng-a.lng);
    const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
    return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  };
  const nearby = useMemo(() => {
    if (!driverLocation) return [];
    return nearbyBookings.map(b => { const d=b.booking_details || {}; const lat=Number(d.pickup_lat), lng=Number(d.pickup_lng); if (d.pickup_lat == null || d.pickup_lng == null || !Number.isFinite(lat)||!Number.isFinite(lng)) return null; const km=distanceKm(driverLocation,{lat,lng}); return km<=15 ? {...b,distance_km:km} : null; }).filter(Boolean).sort((a:any,b:any)=>a.distance_km-b.distance_km) as (Booking & {distance_km:number})[];
  }, [nearbyBookings,driverLocation]);
  async function toggleOnline() {
    if (!profile || !session?.user) return;
    if (profile.is_online) { setPresenceBusy(true); const {error:e}=await supabase.from("driver_profiles").update({is_online:false,last_seen_at:new Date().toISOString()}).eq("user_id",session.user.id); if(e) setError(e.message); else setProfile({...profile,is_online:false}); setPresenceBusy(false); return; }
    if (wallet?.is_online_blocked || Number(wallet?.balance ?? 0)<-200) {setError("Wallet limit reached. Recharge before going online.");return;}
    if (!navigator.geolocation) {setError("This device does not support GPS location.");return;}
    setPresenceBusy(true); navigator.geolocation.getCurrentPosition(async pos=>{const lat=pos.coords.latitude,lng=pos.coords.longitude;const {error:e}=await supabase.from("driver_profiles").update({is_online:true,current_lat:lat,current_lng:lng,location_updated_at:new Date().toISOString(),last_seen_at:new Date().toISOString()}).eq("user_id",session.user.id);if(e)setError(e.message);else{setDriverLocation({lat,lng});setProfile({...profile,is_online:true,current_lat:lat,current_lng:lng});await loadPartner();}setPresenceBusy(false);},err=>{setError(err.code===1?"Allow location permission to go online.":"Could not get GPS location.");setPresenceBusy(false);},{enableHighAccuracy:true,timeout:15000,maximumAge:5000});
  }
  useEffect(()=>{if(!profile?.is_online||!session?.user?.id||!navigator.geolocation)return;const watchId=navigator.geolocation.watchPosition(pos=>{const lat=pos.coords.latitude,lng=pos.coords.longitude;setDriverLocation({lat,lng});void supabase.from("driver_profiles").update({current_lat:lat,current_lng:lng,location_updated_at:new Date().toISOString(),last_seen_at:new Date().toISOString()}).eq("user_id",session.user.id);},err=>setError(err.code===1?"Location permission was removed.":err.message),{enableHighAccuracy:true,maximumAge:10000,timeout:20000});const heartbeat=window.setInterval(()=>{void supabase.from("driver_profiles").update({last_seen_at:new Date().toISOString()}).eq("user_id",session.user.id);},30000);return()=>{navigator.geolocation.clearWatch(watchId);window.clearInterval(heartbeat);};},[profile?.is_online,session?.user?.id]);
  useEffect(()=>{if(!profile?.is_online)return;const channel=supabase.channel("yrel-driver-open-bookings").on("postgres_changes",{event:"*",schema:"public",table:"bookings"},()=>{void loadPartner();}).subscribe();return()=>{void supabase.removeChannel(channel);};},[profile?.is_online,loadPartner]);
  async function acceptNearbyBooking(b:Booking){if(!profile?.is_online||!driverLocation){setError("Go online and enable GPS before accepting.");return;}setBusy(true);setError("");const {data,error:e}=await supabase.from("bookings").update({assigned_driver_id:session.user.id,assigned_at:new Date().toISOString(),status:"accepted"}).eq("id",b.id).is("assigned_driver_id",null).in("status",["requested","searching"]).select("id").maybeSingle();if(e)setError(e.message);else if(!data)setError("This booking was just accepted by another driver.");else{setNearbyBookings(rows=>rows.filter(row=>row.id!==b.id));await loadPartner();}setBusy(false);}
  if (!authReady) return <main className="partner-auth"><p>Loading YREL Partner…</p></main>;
  if (!session) return <main className="partner-auth"><section className="partner-card"><div className="partner-logo">Y</div><span className="partner-eyebrow">YREL DRIVER & PARTNER APP</span><h1>Partner Login</h1><p>Sign in or register securely using a 6-digit WhatsApp OTP on your mobile number.</p><label>Mobile number</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 9876543210" inputMode="tel" autoComplete="tel"/>{!otpSent ? <button className="partner-primary" disabled={busy} onClick={() => void authenticatePartner()}>{busy ? "Sending OTP…" : "Send WhatsApp OTP"}</button> : <><label>6-digit WhatsApp OTP</label><input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter 6-digit OTP" inputMode="numeric" autoComplete="one-time-code"/><button className="partner-primary" disabled={busy || otp.length !== 6} onClick={() => void verifyPartnerOtp()}>{busy ? "Verifying…" : "Verify OTP & Continue"}</button><button className="partner-link" disabled={busy} onClick={() => void resendPartnerOtp()}>Resend OTP</button></>}{error && <p className="partner-error">{error}</p>}<a href="/">Back to Customer App</a></section></main>;

  if (!profile) return <main className="partner-auth"><section className="partner-card partner-form"><div className="partner-logo">Y</div><span className="partner-eyebrow">PARTNER REGISTRATION</span><h1>Complete your profile</h1><p>Your account will be reviewed by YREL Admin before you can accept trips.</p><label>Partner type</label><div className="partner-choice"><button className={driverType === "cab_driver" ? "active" : ""} onClick={() => setDriverType("cab_driver")}>🚕 Cab Driver</button><button className={driverType === "spare_driver" ? "active" : ""} onClick={() => setDriverType("spare_driver")}>🧑‍✈️ Spare Driver</button></div><label>Full name</label><input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name"/>{driverType === "cab_driver" && <><label>Vehicle type</label><select value={vehicleType} onChange={e => setVehicleType(e.target.value)}><option>Hatchback</option><option>Sedan</option><option>SUV</option></select><label>Vehicle registration number</label><input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="KA 01 AB 1234"/></>}{driverType === "spare_driver" && <><label>Gear type</label><select value={gearType} onChange={e => setGearType(e.target.value)}><option>Manual</option><option>Automatic</option></select></>}<label>Driving licence number</label><input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} placeholder="Driving licence number"/><button className="partner-primary" disabled={busy} onClick={() => void registerProfile()}>{busy ? "Submitting…" : "Submit for approval"}</button>{error && <p className="partner-error">{error}</p>}<button className="partner-link" onClick={() => void supabase.auth.signOut()}>Sign out</button></section></main>;

  if (profile.approval_status !== "approved") return <main className="partner-auth"><section className="partner-card"><div className="partner-logo"><ShieldCheck/></div><span className="partner-eyebrow">YREL PARTNER VERIFICATION</span><h1>Approval pending</h1><p>Your {profile.driver_type === "cab_driver" ? "Cab Driver" : "Spare Driver"} profile has been submitted. You can start receiving trips after YREL Admin approves your account.</p><div className="partner-pending">Status: {profile.approval_status}</div><button className="partner-primary" onClick={() => void loadPartner()}><RefreshCw size={17}/> Check approval</button><button className="partner-link" onClick={() => void supabase.auth.signOut()}>Sign out</button>{error && <p className="partner-error">{error}</p>}</section></main>;

  const active = bookings.filter(b => !["completed", "cancelled"].includes(b.status));
  const history = bookings.filter(b => ["completed", "cancelled"].includes(b.status));
  const visible = tab === "history" ? history : active;

  return <main className="partner-app"><header className="partner-header"><div className="partner-logo small">Y</div><div><b>YREL PARTNER</b><small>{profile.driver_type === "cab_driver" ? "CAB DRIVER" : "SPARE DRIVER"}</small></div><button onClick={() => void supabase.auth.signOut()} aria-label="Sign out"><LogOut/></button></header><section className="partner-welcome"><span>WELCOME BACK</span><h1>{profile.full_name || "Partner"}</h1><p><ShieldCheck size={15}/> Approved Partner</p></section><section className={`partner-presence ${profile.is_online ? "is-online" : "is-offline"}`}><div><span className="presence-pulse"/><div><b>{profile.is_online ? "YOU ARE ONLINE" : "YOU ARE OFFLINE"}</b><small>{profile.is_online ? "Your GPS is updating while this app is open." : "Go online to receive nearby instant bookings."}</small></div></div><button onClick={() => void toggleOnline()} disabled={presenceBusy} className={profile.is_online ? "presence-off" : "presence-on"}><Power size={17}/>{presenceBusy ? "Please wait…" : profile.is_online ? "Go Offline" : "Go Online"}</button></section><section className="partner-map-panel"><div className="partner-panel-head"><div><h2><Navigation/> Live location</h2><p>{driverLocation ? "Your current GPS position" : "Enable GPS to share your location"}</p></div></div>{driverLocation ? <><iframe title="Driver live location map" src={`https://www.openstreetmap.org/export/embed.html?bbox=${driverLocation.lng-0.012}%2C${driverLocation.lat-0.009}%2C${driverLocation.lng+0.012}%2C${driverLocation.lat+0.009}&layer=mapnik&marker=${driverLocation.lat}%2C${driverLocation.lng}`} loading="lazy"/><small>GPS: {driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)} · Updates while online</small></> : <div className="partner-empty"><LocateFixed/><b>Location not available</b><span>Tap Go Online and allow location access.</span></div>}</section><section className="partner-stats"><article><ClipboardList/><b>{bookings.length}</b><span>Total assigned</span></article><article><Clock3/><b>{active.length}</b><span>Active trips</span></article><article><Wallet/><b>₹{bookings.filter(b => b.status === "completed").reduce((s,b)=>s+Number(b.estimated_fare||0),0).toLocaleString("en-IN")}</b><span>Completed fare*</span></article></section><section className="partner-panel partner-nearby"><div className="partner-panel-head"><div><h2><RadioTower/> Nearby instant requests</h2><p>Requests within 15 km of your live GPS location</p></div><span className="partner-status">{nearby.length} nearby</span></div>{!profile.is_online ? <div className="partner-empty"><Power/><b>You are offline</b><span>Go online to receive nearby bookings.</span></div> : nearby.length===0 ? <div className="partner-empty"><CarFront/><b>No nearby requests right now</b><span>New instant bookings within 15 km will appear here.</span></div> : nearby.map(b=><article className="partner-trip" key={b.id}><div className="partner-trip-top"><b>{b.booking_code}</b><span className="partner-status">{b.distance_km.toFixed(1)} km away</span></div><div className="partner-route"><p><MapPin/><span><small>PICKUP</small>{b.pickup}</span></p><p><MapPin/><span><small>DROP</small>{b.dropoff||"—"}</span></p></div><div className="partner-trip-meta"><span>{b.vehicle_type||b.service_type}</span><b>₹{Number(b.estimated_fare||0).toLocaleString("en-IN")}</b></div><div className="partner-actions"><button disabled={busy} onClick={()=>void acceptNearbyBooking(b)}><CheckCircle2/> Accept Request</button></div></article>)}</section><nav className="partner-tabs"><button className={tab === "assigned" ? "active" : ""} onClick={() => setTab("assigned")}>My Trips</button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Trip History</button><button className={tab === "wallet" ? "active" : ""} onClick={() => setTab("wallet")}>Wallet</button><button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profile</button></nav>{tab === "wallet" ? <section className="partner-panel"><div className="partner-panel-head"><div><h2><Wallet/> My Wallet</h2><p>Wallet balance and transaction history</p></div><button onClick={() => void loadPartner()}><RefreshCw size={17}/></button></div><div className="partner-wallet-balance"><span>AVAILABLE BALANCE</span><strong>₹{Number(wallet?.balance || 0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><small>{wallet?.is_online_blocked ? "Online access blocked — recharge required" : Number(wallet?.balance || 0) <= 0 ? "Wallet is active within the ₹200 credit limit" : "Wallet active"}</small></div><div className="partner-wallet-note"><b>Recharge</b><p>Minimum recharge ₹100. Payment gateway setup is pending. Recharge will be enabled after YREL payment details are connected.</p><button disabled title="Available after payment gateway setup">Recharge Wallet · Coming soon</button></div><h3 className="partner-wallet-title">Transaction History</h3>{walletTransactions.length === 0 ? <div className="partner-empty"><Wallet/><b>No wallet transactions yet</b><span>Your recharge and deduction records will appear here.</span></div> : walletTransactions.map(t => <article className="partner-wallet-row" key={t.id}><div><b>{t.transaction_type.replaceAll("_"," ")}</b><small>{new Date(t.created_at).toLocaleString("en-IN")} {t.description ? "· " + t.description : ""}</small></div><div><strong className={t.transaction_type === "recharge" || t.transaction_type === "refund" ? "credit" : "debit"}>{t.transaction_type === "recharge" || t.transaction_type === "refund" ? "+" : "−"}₹{Number(t.amount).toFixed(2)}</strong><small>Balance ₹{Number(t.balance_after).toFixed(2)}</small></div></article>)}</section> : tab === "profile" ? <section className="partner-panel"><h2><UserRound/> My Profile</h2><p><b>Name:</b> {profile.full_name}</p><p><b>Phone:</b> {profile.phone || session.user.phone}</p><p><b>Partner type:</b> {profile.driver_type === "cab_driver" ? "Cab Driver" : "Spare Driver"}</p>{profile.vehicle_type && <p><b>Vehicle:</b> {profile.vehicle_type} · {profile.vehicle_number || "Number not added"}</p>}{profile.gear_type && <p><b>Gear:</b> {profile.gear_type}</p>}<p><b>Licence:</b> {profile.license_number || "—"}</p><p><b>Approval:</b> {profile.approval_status}</p></section> : <section className="partner-panel"><div className="partner-panel-head"><div><h2>{tab === "history" ? "Trip History" : "Assigned Trips"}</h2><p>Bookings assigned to your partner account</p></div><button onClick={() => void loadPartner()}><RefreshCw size={17}/></button></div>{loading && <p>Loading trips…</p>}{visible.length === 0 && !loading && <div className="partner-empty"><CarFront/><b>No trips here yet</b><span>New trips assigned by YREL will appear here.</span></div>}{visible.map(b => <article className="partner-trip" key={b.id}><div className="partner-trip-top"><b>{b.booking_code}</b><span className={"partner-status status-" + b.status}>{b.status.replaceAll("_"," ")}</span></div><div className="partner-route"><p><MapPin/> <span><small>PICKUP</small>{b.pickup}</span></p><p><MapPin/> <span><small>DROP</small>{b.dropoff || "—"}</span></p></div><div className="partner-trip-meta"><span>{b.vehicle_type || b.service_type}</span><b>₹{Number(b.estimated_fare || 0).toLocaleString("en-IN")}</b></div>{b.scheduled_at && <small className="partner-date">Scheduled: {new Date(b.scheduled_at).toLocaleString("en-IN")}</small>}{tab !== "history" && <div className="partner-actions">{b.status === "assigned" && <button onClick={() => void updateStatus(b,"accepted")} disabled={busy}><CheckCircle2/> Accept</button>}{["assigned","accepted"].includes(b.status) && <button onClick={() => void updateStatus(b,"in_progress")} disabled={busy}>Start Trip</button>}{b.status === "in_progress" && <button onClick={() => void updateStatus(b,"completed")} disabled={busy}>Complete Trip</button>}</div>}</article>)}</section>}<footer className="partner-footer">YREL Partner App · *Fare shown is booking estimate, not payout.</footer>{error && <div className="partner-toast">{error}</div>}</main>;
}
