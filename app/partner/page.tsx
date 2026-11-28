"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CarFront, ClipboardList, Clock3, LogOut, MapPin, Phone, ShieldCheck, UserRound, Wallet, RefreshCw, CheckCircle2, Power, Navigation, LocateFixed, RadioTower, Bell, ChevronRight, House, Trophy } from "lucide-react";
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
  const [phone, setPhone] = useState("");
  const [authStep, setAuthStep] = useState<"phone" | "login" | "register">("phone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registrationUserId, setRegistrationUserId] = useState("");
  const [registrationPending, setRegistrationPending] = useState(false);
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
  const [tab, setTab] = useState<"home" | "earnings" | "rewards" | "trips" | "account">("home");
  const [accountPage, setAccountPage] = useState<"menu" | "profile" | "documents" | "vehicle" | "help" | "notifications" | "settings">("menu");
  const [tripFilter, setTripFilter] = useState<"active" | "completed" | "all">("active");
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
  async function checkPartnerPhone() {
    const mobile = normalizedPhone(phone);
    if (!mobile) { setError("Enter a valid 10-digit Indian mobile number."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/phone-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: mobile, accountType: "partner" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not check mobile number.");
      setAuthStep(result.registered ? "login" : "register");
      setError(result.registered ? "Welcome back. Send an SMS OTP to verify your Partner login." : "This number is not registered. Create your YREL Partner account.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not check mobile number."); }
    finally { setBusy(false); }
  }

  async function registerPartnerAccount() {
    const mobile = normalizedPhone(phone);
    if (!fullName.trim() || fullName.trim().length < 2) { setError("Enter your full name."); return; }
    if (!mobile) { setError("Enter a valid 10-digit Indian mobile number."); return; }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
    if (!/^\d{4}$/.test(password)) { setError("Passcode must be exactly 4 digits."); return; }
    if (password !== confirmPassword) { setError("Passcodes do not match."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: fullName.trim(), phone: mobile, email: email.trim(), password, accountType: "partner" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create partner account.");
      setRegistrationUserId(result.userId); setRegistrationPending(true);
      setError("Account created. Verify your mobile number to continue.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create account."); }
    finally { setBusy(false); }
  }
  async function sendPartnerVerificationLink() {
    if (!registrationUserId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/phone-verification/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: registrationUserId, phone: normalizedPhone(phone), accountType: "partner" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send verification link.");
      setError("Verification link sent by SMS. Open the link, then log in with your mobile number and 4-digit passcode.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send verification link."); }
    finally { setBusy(false); }
  }

  async function loginPartner() {
    const mobile = normalizedPhone(phone);
    if (!mobile) { setError("Enter a valid 10-digit Indian mobile number."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/partner/sms-otp/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: mobile })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send Partner SMS OTP.");
      setOtp(""); setOtpReqId(""); setOtpSent(true);
      setError("6-digit SMS OTP sent. Please check your messages.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send Partner SMS OTP."); }
    finally { setBusy(false); }
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
    if (!mobile || !/^\d{6}$/.test(otp)) { setError("Enter the 6-digit SMS OTP."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/partner/sms-otp/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: mobile, otp })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "OTP verification failed.");
      const { error: authError } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token
      });
      if (authError) throw authError;
      setOtpSent(false); setOtp(""); setOtpReqId(""); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "OTP verification failed."); }
    finally { setBusy(false); }
  }

  async function resendPartnerOtp() {
    await loginPartner();
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
  if (!session) return <main className="partner-auth"><section className="partner-card"><div className="partner-logo">Y</div><span className="partner-eyebrow">YREL DRIVER & PARTNER APP</span>
      {registrationPending ? <>
        <h1>Verify Mobile Number</h1><p>Your Partner account has been created. Verify that this mobile number belongs to you to continue.</p>
        <button className="partner-primary" disabled={busy} onClick={() => void sendPartnerVerificationLink()}>{busy ? "Please wait…" : "Send Verification Link by SMS"}</button>
        <p className="partner-hint">Open the SMS link. You will then return here to log in with your mobile number and 4-digit passcode.</p>
      </> : <>
        <h1>{authStep === "phone" ? "Partner Login" : authStep === "login" ? "Enter Passcode" : "Create Partner Account"}</h1>
        <label>Mobile number</label><div className="partner-phone-row"><span>+91</span><input value={phone} onChange={e => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setAuthStep("phone"); setPassword(""); setError(""); }} placeholder="10-digit mobile number" inputMode="numeric" autoComplete="tel-national" maxLength={10}/></div>
        {authStep === "phone" && <button className="partner-primary" disabled={busy} onClick={() => void checkPartnerPhone()}>{busy ? "Please wait…" : "Next"}</button>}
        {authStep === "login" && <>{!otpSent ? <><p>Verify your registered Partner mobile number with a one-time SMS code.</p><button className="partner-primary" disabled={busy} onClick={() => void loginPartner()}>{busy ? "Sending OTP…" : "Send SMS OTP"}</button></> : <><label>6-digit SMS OTP</label><input style={{display:"block",width:"100%",minHeight:58,boxSizing:"border-box",padding:"14px 16px",fontSize:20,borderRadius:16,letterSpacing:5}} inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter SMS OTP" autoComplete="one-time-code"/><button className="partner-primary" disabled={busy} onClick={() => void verifyPartnerOtp()}>{busy ? "Verifying…" : "Verify & Login"}</button><button className="partner-link" disabled={busy} onClick={() => void resendPartnerOtp()}>Resend SMS OTP</button></>}</>}
        {authStep === "register" && <>
          <label>Full name</label><input style={{display:"block",width:"100%",minHeight:58,boxSizing:"border-box",padding:"14px 16px",fontSize:18,borderRadius:16}} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" autoComplete="name"/>
          <label>Email ID</label><input style={{display:"block",width:"100%",minHeight:58,boxSizing:"border-box",padding:"14px 16px",fontSize:18,borderRadius:16}} type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" autoComplete="email"/>
          <label>Create 4-digit Passcode</label><input style={{display:"block",width:"100%",minHeight:58,boxSizing:"border-box",padding:"14px 16px",fontSize:18,borderRadius:16}} type="password" inputMode="numeric" maxLength={4} value={password} onChange={e => setPassword(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Create 4-digit passcode" autoComplete="new-password"/>
          <label>Confirm Passcode</label><input style={{display:"block",width:"100%",minHeight:58,boxSizing:"border-box",padding:"14px 16px",fontSize:18,borderRadius:16}} type="password" inputMode="numeric" maxLength={4} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Re-enter 4-digit passcode" autoComplete="new-password"/>
          <button className="partner-primary" disabled={busy} onClick={() => void registerPartnerAccount()}>{busy ? "Please wait…" : "Create Account"}</button>
        </>}
        {authStep !== "phone" && <button className="partner-link" onClick={() => { setAuthStep("phone"); setPassword(""); setConfirmPassword(""); setError(""); }}>Change mobile number</button>}
      </>}
      {error && <p className="partner-error">{error}</p>}</section></main>;

  if (!profile) return <main className="partner-auth"><section className="partner-card partner-form"><div className="partner-logo">Y</div><span className="partner-eyebrow">PARTNER REGISTRATION</span><h1>Complete your profile</h1><p>Your account will be reviewed by YREL Admin before you can accept trips.</p><label>Partner type</label><div className="partner-choice"><button className={driverType === "cab_driver" ? "active" : ""} onClick={() => setDriverType("cab_driver")}>🚕 Cab Driver</button><button className={driverType === "spare_driver" ? "active" : ""} onClick={() => setDriverType("spare_driver")}>🧑‍✈️ Spare Driver</button></div><label>Full name</label><input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name"/>{driverType === "cab_driver" && <><label>Vehicle type</label><select value={vehicleType} onChange={e => setVehicleType(e.target.value)}><option>Hatchback</option><option>Sedan</option><option>SUV</option></select><label>Vehicle registration number</label><input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="KA 01 AB 1234"/></>}{driverType === "spare_driver" && <><label>Gear type</label><select value={gearType} onChange={e => setGearType(e.target.value)}><option>Manual</option><option>Automatic</option></select></>}<label>Driving licence number</label><input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} placeholder="Driving licence number"/><button className="partner-primary" disabled={busy} onClick={() => void registerProfile()}>{busy ? "Submitting…" : "Submit for approval"}</button>{error && <p className="partner-error">{error}</p>}<button className="partner-link" onClick={() => void supabase.auth.signOut()}>Sign out</button></section></main>;

  if (profile.approval_status !== "approved") return <main className="partner-auth"><section className="partner-card"><div className="partner-logo"><ShieldCheck/></div><span className="partner-eyebrow">YREL PARTNER VERIFICATION</span><h1>Approval pending</h1><p>Your {profile.driver_type === "cab_driver" ? "Cab Driver" : "Spare Driver"} profile has been submitted. You can start receiving trips after YREL Admin approves your account.</p><div className="partner-pending">Status: {profile.approval_status}</div><button className="partner-primary" onClick={() => void loadPartner()}><RefreshCw size={17}/> Check approval</button><button className="partner-link" onClick={() => void supabase.auth.signOut()}>Sign out</button>{error && <p className="partner-error">{error}</p>}</section></main>;

  const active = bookings.filter(b => !["completed","cancelled"].includes(b.status));
  const history = bookings.filter(b => ["completed","cancelled"].includes(b.status));
  const completed = bookings.filter(b => b.status === "completed");
  const completedFare = completed.reduce((s,b)=>s+Number(b.estimated_fare||0),0);
  const today = new Date();
  const monthFare = completed.filter(b=>{const d=new Date(b.created_at);return d.getMonth()===today.getMonth()&&d.getFullYear()===today.getFullYear();}).reduce((s,b)=>s+Number(b.estimated_fare||0),0);
  const visibleTrips = tripFilter==="active"?active:tripFilter==="completed"?history:bookings;
  const walletAmount = Number(wallet?.balance||0);
  const mapSrc = driverLocation ? "https://www.openstreetmap.org/export/embed.html?bbox="+(driverLocation.lng-.014)+"%2C"+(driverLocation.lat-.010)+"%2C"+(driverLocation.lng+.014)+"%2C"+(driverLocation.lat+.010)+"&layer=mapnik&marker="+driverLocation.lat+"%2C"+driverLocation.lng : "https://www.openstreetmap.org/export/embed.html?bbox=77.50%2C12.90%2C77.70%2C13.10&layer=mapnik";
  const renderTrip = (b:Booking, actions=true) => <article className="partner-trip" key={b.id}>
    <div className="partner-trip-top"><b>{b.booking_code}</b><span className={"partner-status status-"+b.status}>{b.status.replaceAll("_"," ")}</span></div>
    <div className="partner-route"><p><MapPin/><span><small>PICKUP</small>{b.pickup}</span></p><p><MapPin/><span><small>DROP</small>{b.dropoff||"—"}</span></p></div>
    <div className="partner-trip-meta"><span>{b.vehicle_type||b.service_type}</span><b>₹{Number(b.estimated_fare||0).toLocaleString("en-IN")}</b></div>
    {b.scheduled_at&&<small className="partner-date">Scheduled · {new Date(b.scheduled_at).toLocaleString("en-IN")}</small>}
    {actions&&<div className="partner-actions">{b.status==="assigned"&&<button onClick={()=>void updateStatus(b,"accepted")} disabled={busy}>Accept</button>}{["assigned","accepted"].includes(b.status)&&<button onClick={()=>void updateStatus(b,"in_progress")} disabled={busy}>Start trip</button>}{b.status==="in_progress"&&<button onClick={()=>void updateStatus(b,"completed")} disabled={busy}>Complete trip</button>}</div>}
  </article>;
  return <main className="partner-app">
    <header className="partner-header"><div className="partner-logo small">Y</div><div><b>YREL PARTNER</b><small>{profile.driver_type==="cab_driver"?"CAB DRIVER":"SPARE DRIVER"} · PARTNER HUB</small></div><button onClick={()=>{setTab("account");setAccountPage("notifications");}} aria-label="Notifications"><Bell/><i>2</i></button></header>
    <div className="partner-shell">
      {tab==="home"&&<>
        <section className="partner-greeting"><div><span>WELCOME BACK</span><h1>Hello, {profile.full_name?.split(" ")[0]||"Partner"} 👋</h1><p>Your next ride starts with one tap.</p></div><div className="partner-avatar">{(profile.full_name||"Y").slice(0,1).toUpperCase()}</div></section>
        <section className={"partner-presence "+(profile.is_online?"is-online":"is-offline")}><div><span className="presence-pulse"/><div><b>{profile.is_online?"YOU’RE ONLINE":"YOU’RE OFFLINE"}</b><small>{profile.is_online?"Visible for nearby trip requests":"Switch on to start receiving nearby trips"}</small></div></div><button onClick={()=>void toggleOnline()} disabled={presenceBusy} className={profile.is_online?"presence-off":"presence-on"}><Power size={17}/>{presenceBusy?"Please wait…":profile.is_online?"Go Offline":"Go Online"}</button></section>
        <section className="partner-map-card"><div className="partner-map-top"><div><span className="partner-kicker">LIVE DRIVER MAP</span><h2>Your location</h2></div><button onClick={()=>void toggleOnline()}><LocateFixed size={17}/> Locate me</button></div><iframe title="YREL driver map" src={mapSrc} loading="lazy"/><div className="partner-map-caption"><span className={profile.is_online?"map-live-dot":""}/>{driverLocation?"GPS active · "+driverLocation.lat.toFixed(4)+", "+driverLocation.lng.toFixed(4):"Allow location access to share your live position"}<a href="https://www.openstreetmap.org/" target="_blank" rel="noreferrer">Open map ↗</a></div></section>
        {walletAmount<0&&<button className="partner-wallet-alert" onClick={()=>setTab("earnings")}><Wallet/><span><b>Wallet balance ₹{walletAmount.toFixed(2)}</b><small>{walletAmount< -200?"Recharge required to go online":"Within your credit limit"}</small></span><ChevronRight/></button>}
        <section className="partner-quick-stats"><article><span>Today’s trips</span><b>{completed.filter(b=>new Date(b.created_at).toDateString()===today.toDateString()).length}</b><small>Completed</small></article><article><span>This month</span><b>₹{monthFare.toLocaleString("en-IN")}</b><small>Trip estimate*</small></article><article><span>Active trips</span><b>{active.length}</b><small>In progress</small></article></section>
        <section className="partner-panel partner-nearby"><div className="partner-panel-head"><div><span className="partner-kicker">NEW OPPORTUNITIES</span><h2><RadioTower/> Nearby requests</h2><p>Instant bookings within 15 km</p></div><span className="partner-count">{nearby.length}</span></div>{!profile.is_online?<div className="partner-empty"><Power/><b>You’re offline</b><span>Go online to see nearby bookings.</span></div>:nearby.length===0?<div className="partner-empty"><CarFront/><b>No requests nearby</b><span>New eligible bookings will appear here.</span></div>:nearby.map(b=><article className="partner-trip" key={b.id}><div className="partner-trip-top"><b>{b.booking_code}</b><span className="partner-status">{b.distance_km.toFixed(1)} km away</span></div><div className="partner-route"><p><MapPin/><span><small>PICKUP</small>{b.pickup}</span></p><p><MapPin/><span><small>DROP</small>{b.dropoff||"—"}</span></p></div><div className="partner-trip-meta"><span>{b.vehicle_type||b.service_type}</span><b>₹{Number(b.estimated_fare||0).toLocaleString("en-IN")}</b></div><div className="partner-actions"><button onClick={()=>void acceptNearbyBooking(b)} disabled={busy}><CheckCircle2/> Accept trip</button></div></article>)}</section>
        <section className="partner-panel"><div className="partner-panel-head"><div><span className="partner-kicker">YOUR SCHEDULE</span><h2>Active trips</h2></div><button onClick={()=>setTab("trips")}>View all <ChevronRight size={16}/></button></div>{active.length?active.slice(0,2).map(b=>renderTrip(b)): <div className="partner-empty"><CarFront/><b>No active trips</b><span>Your accepted rides appear here.</span></div>}</section>
      </>}
      {tab==="earnings"&&<><section className="partner-page-title"><span className="partner-kicker">MONEY & PAYOUTS</span><h1>Earnings & Wallet</h1><p>Track trip earnings and wallet activity.</p></section><section className="partner-earning-hero"><span>COMPLETED TRIP ESTIMATE*</span><strong>₹{completedFare.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><div><span>This month</span><b>₹{monthFare.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div></section><section className="partner-panel"><div className="partner-panel-head"><div><span className="partner-kicker">DRIVER WALLET</span><h2><Wallet/> Available balance</h2></div><button onClick={()=>void loadPartner()}><RefreshCw size={17}/></button></div><div className="partner-wallet-balance"><span>AVAILABLE BALANCE</span><strong>₹{walletAmount.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><small>{wallet?.is_online_blocked||walletAmount< -200?"Online access blocked · Recharge required":walletAmount<0?"Within the ₹200 negative limit":"Wallet active"}</small></div><div className="partner-recharge-row"><div><b>Wallet recharge</b><small>Minimum recharge ₹100</small></div><button disabled title="Payment gateway details will be connected later">Recharge wallet</button></div><div className="partner-wallet-rule">Negative balance is allowed up to ₹200. Below −₹200, online access is paused. A successful recharge restores access automatically.</div><h3 className="partner-wallet-title">Wallet history & deductions</h3>{walletTransactions.length===0?<div className="partner-empty"><Wallet/><b>No wallet activity yet</b><span>Recharges and commission deductions appear here.</span></div>:walletTransactions.map(t=><article className="partner-wallet-row" key={t.id}><div><b>{t.transaction_type.replaceAll("_"," ")}</b><small>{new Date(t.created_at).toLocaleString("en-IN")} · {t.description||"Wallet transaction"}</small></div><div><strong className={["recharge","refund","credit"].includes(t.transaction_type)?"credit":"debit"}>{["recharge","refund","credit"].includes(t.transaction_type)?"+":"−"}₹{Number(t.amount).toFixed(2)}</strong><small>Balance ₹{Number(t.balance_after).toFixed(2)}</small></div></article>)}</section><p className="partner-footnote">*Trip estimates are not confirmed driver payouts.</p></>}
      {tab==="trips"&&<><section className="partner-page-title"><span className="partner-kicker">YOUR BOOKINGS</span><h1>My trips</h1><p>Manage current rides and review trip history.</p></section><div className="partner-filter"><button className={tripFilter==="active"?"active":""} onClick={()=>setTripFilter("active")}>Active <b>{active.length}</b></button><button className={tripFilter==="completed"?"active":""} onClick={()=>setTripFilter("completed")}>History <b>{history.length}</b></button><button className={tripFilter==="all"?"active":""} onClick={()=>setTripFilter("all")}>All <b>{bookings.length}</b></button></div><section className="partner-panel">{loading&&<p>Loading trips…</p>}{visibleTrips.length===0&&!loading?<div className="partner-empty"><CarFront/><b>No trips found</b><span>Your bookings appear here.</span></div>:visibleTrips.map(b=>renderTrip(b,tripFilter==="active"))}</section></>}
      {tab==="rewards"&&<><section className="partner-page-title"><span className="partner-kicker">YREL PARTNER CLUB</span><h1>Rewards & progress</h1><p>Your driving milestones.</p></section><section className="partner-reward-hero"><div className="partner-reward-medal">★</div><span>COMPLETED TRIPS</span><strong>{completed.length}</strong><small>Your partner journey</small></section><section className="partner-panel"><h2><ShieldCheck/> Partner milestones</h2>{[1,10,50].map(n=><div className="partner-milestone" key={n}><span>{n===1?"🚗":n===10?"⭐":"🏆"}</span><div><b>{n} completed trips</b><small>{completed.length>=n?"Milestone achieved":(n-completed.length)+" trips to go"}</small></div><em>{completed.length>=n?"UNLOCKED":"IN PROGRESS"}</em></div>)}<p className="partner-footnote">Rewards and incentive payouts will appear when enabled by YREL Admin.</p></section></>}
      {tab==="account"&&<><section className="partner-account-head"><div className="partner-avatar large">{(profile.full_name||"Y").slice(0,1).toUpperCase()}</div><div><h1>{profile.full_name||"YREL Partner"}</h1><p>{profile.driver_type==="cab_driver"?"Cab Driver":"Spare Driver"} · <span>Approved partner</span></p><small>{profile.phone||session.user.phone||"Mobile number"}</small></div></section>{accountPage==="menu"?<section className="partner-panel partner-account-menu">{[["profile","Personal profile","Name, mobile and licence details"],["vehicle","Vehicle & work details","Vehicle type, registration and gear"],["documents","Documents & verification","Licence and approval status"],["notifications","Notifications","Booking and account updates"],["help","Help & support","Get help with trips and payments"],["settings","Settings","App preferences and permissions"]].map(item=><button key={item[0]} onClick={()=>setAccountPage(item[0] as any)}><span><b>{item[1]}</b><small>{item[2]}</small></span><ChevronRight/></button>)}<button className="partner-logout" onClick={()=>void supabase.auth.signOut()}><span><b>Sign out</b><small>Securely log out of YREL Partner</small></span><LogOut/></button></section>:<section className="partner-panel"><div className="partner-panel-head"><button className="partner-back" onClick={()=>setAccountPage("menu")}>← Back</button><span className="partner-kicker">ACCOUNT</span></div>{accountPage==="profile"&&<><h2>Personal profile</h2><div className="partner-detail-row"><small>Full name</small><b>{profile.full_name||"—"}</b></div><div className="partner-detail-row"><small>Mobile number</small><b>{profile.phone||session.user.phone||"—"}</b></div><div className="partner-detail-row"><small>Email</small><b>{session.user.email||"—"}</b></div></>}{accountPage==="vehicle"&&<><h2>Vehicle & work details</h2><div className="partner-detail-row"><small>Vehicle type</small><b>{profile.vehicle_type||"Not applicable"}</b></div><div className="partner-detail-row"><small>Registration</small><b>{profile.vehicle_number||"—"}</b></div><div className="partner-detail-row"><small>Transmission</small><b>{profile.gear_type||"—"}</b></div></>}{accountPage==="documents"&&<><h2>Documents & verification</h2><div className="partner-detail-row"><small>Driving licence</small><b>{profile.license_number||"—"}</b></div><div className="partner-detail-row"><small>Approval status</small><b>{profile.approval_status}</b></div></>}{accountPage==="notifications"&&<><h2>Notifications</h2><div className="partner-empty"><Bell/><b>You’re all caught up</b><span>New booking and account updates appear here.</span></div></>}{accountPage==="help"&&<><h2>Help & support</h2><a className="partner-help-link" href="mailto:support@aviswa.in">Email support</a><div className="partner-help-topic"><b>Can’t go online?</b><p>Enable GPS permission and ensure wallet balance is not below −₹200.</p></div><div className="partner-help-topic"><b>Booking not appearing?</b><p>Keep the app open, enable GPS and switch status to Online.</p></div></>}{accountPage==="settings"&&<><h2>Settings</h2><div className="partner-detail-row"><small>Location permission</small><b>Required while online</b></div><div className="partner-detail-row"><small>Map provider</small><b>OpenStreetMap</b></div><div className="partner-detail-row"><small>Language</small><b>English</b></div></>}</section>}</>}
    </div>
    <nav className="partner-bottom-nav"><button className={tab==="home"?"active":""} onClick={()=>setTab("home")}><House/><span>Home</span></button><button className={tab==="earnings"?"active":""} onClick={()=>setTab("earnings")}><Wallet/><span>Earnings</span></button><button className={tab==="rewards"?"active":""} onClick={()=>setTab("rewards")}><Trophy/><span>Rewards</span></button><button className={tab==="trips"?"active":""} onClick={()=>setTab("trips")}><ClipboardList/><span>My Trips</span></button><button className={tab==="account"?"active":""} onClick={()=>setTab("account")}><UserRound/><span>Account</span></button></nav>
    <footer className="partner-footer">YREL Partner App · Safe rides. Better journeys.</footer>{error&&<div className="partner-toast">{error}<button onClick={()=>setError("")}>×</button></div>}
  </main>;
}