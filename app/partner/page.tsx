"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CarFront, ClipboardList, Clock3, LogOut, MapPin, Phone, ShieldCheck, UserRound, Wallet, RefreshCw, CheckCircle2 } from "lucide-react";
import "./partner.css";

type DriverProfile = {
  user_id: string; driver_type: "cab_driver" | "spare_driver"; approval_status: string;
  full_name: string | null; phone: string | null; vehicle_type: string | null;
  vehicle_number: string | null; gear_type: string | null; license_number: string | null;
};
type Booking = {
  id: string; booking_code: string; service_type: string; vehicle_type: string | null;
  pickup: string; dropoff: string | null; scheduled_at: string | null;
  estimated_fare: number; status: string; created_at: string;
};

export default function PartnerPage() {
  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [phone, setPhone] = useState("+91");
  const [otp, setOtp] = useState("");
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
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"assigned" | "history" | "profile">("assigned");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadPartner = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true); setError("");
    const { data: p, error: pe } = await supabase.from("driver_profiles").select("user_id,driver_type,approval_status,full_name,phone,vehicle_type,vehicle_number,gear_type,license_number").eq("user_id", session.user.id).maybeSingle();
    if (pe) setError(pe.message);
    setProfile(p as DriverProfile | null);
    const { data: b, error: be } = await supabase.from("bookings").select("id,booking_code,service_type,vehicle_type,pickup,dropoff,scheduled_at,estimated_fare,status,created_at").eq("assigned_driver_id", session.user.id).order("created_at", { ascending: false }).limit(200);
    if (be) setError(be.message);
    setBookings((b || []) as Booking[]);
    setLoading(false);
  }, [session]);

  useEffect(() => { void loadPartner(); }, [loadPartner]);

  async function sendOtp() {
    setBusy(true); setError("");
    const { error: e } = await supabase.auth.signInWithOtp({ phone: phone.replace(/[\s()-]/g, "") });
    if (e) setError(e.message); else setOtpSent(true);
    setBusy(false);
  }
  async function verifyOtp() {
    setBusy(true); setError("");
    const { error: e } = await supabase.auth.verifyOtp({ phone: phone.replace(/[\s()-]/g, ""), token: otp, type: "sms" });
    if (e) setError(e.message);
    setBusy(false);
  }
  async function registerProfile() {
    if (!session?.user || !fullName.trim() || !licenseNumber.trim()) { setError("Please enter your name and driving licence number."); return; }
    setBusy(true); setError("");
    const { data, error: e } = await supabase.from("driver_profiles").insert({
      user_id: session.user.id, driver_type: driverType, approval_status: "pending",
      full_name: fullName.trim(), phone: session.user.phone || phone,
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

  if (!authReady) return <main className="partner-auth"><p>Loading YREL Partner…</p></main>;
  if (!session) return <main className="partner-auth"><section className="partner-card"><div className="partner-logo">Y</div><span className="partner-eyebrow">YREL DRIVER & PARTNER APP</span><h1>Partner Login</h1><p>Sign in with your registered mobile number to access your driver dashboard.</p><label>Mobile number</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 9876543210" disabled={otpSent}/>{otpSent && <><label>6-digit OTP</label><input value={otp} onChange={e => setOtp(e.target.value)} inputMode="numeric" maxLength={6} placeholder="Enter OTP"/></>}<button className="partner-primary" disabled={busy} onClick={() => void (otpSent ? verifyOtp() : sendOtp())}>{busy ? "Please wait…" : otpSent ? "Verify OTP" : "Send OTP"}</button>{error && <p className="partner-error">{error}</p>}<a href="/">Back to Customer App</a></section></main>;

  if (!profile) return <main className="partner-auth"><section className="partner-card partner-form"><div className="partner-logo">Y</div><span className="partner-eyebrow">PARTNER REGISTRATION</span><h1>Complete your profile</h1><p>Your account will be reviewed by YREL Admin before you can accept trips.</p><label>Partner type</label><div className="partner-choice"><button className={driverType === "cab_driver" ? "active" : ""} onClick={() => setDriverType("cab_driver")}>🚕 Cab Driver</button><button className={driverType === "spare_driver" ? "active" : ""} onClick={() => setDriverType("spare_driver")}>🧑‍✈️ Spare Driver</button></div><label>Full name</label><input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name"/>{driverType === "cab_driver" && <><label>Vehicle type</label><select value={vehicleType} onChange={e => setVehicleType(e.target.value)}><option>Hatchback</option><option>Sedan</option><option>SUV</option></select><label>Vehicle registration number</label><input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="KA 01 AB 1234"/></>}{driverType === "spare_driver" && <><label>Gear type</label><select value={gearType} onChange={e => setGearType(e.target.value)}><option>Manual</option><option>Automatic</option></select></>}<label>Driving licence number</label><input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} placeholder="Driving licence number"/><button className="partner-primary" disabled={busy} onClick={() => void registerProfile()}>{busy ? "Submitting…" : "Submit for approval"}</button>{error && <p className="partner-error">{error}</p>}<button className="partner-link" onClick={() => void supabase.auth.signOut()}>Sign out</button></section></main>;

  if (profile.approval_status !== "approved") return <main className="partner-auth"><section className="partner-card"><div className="partner-logo"><ShieldCheck/></div><span className="partner-eyebrow">YREL PARTNER VERIFICATION</span><h1>Approval pending</h1><p>Your {profile.driver_type === "cab_driver" ? "Cab Driver" : "Spare Driver"} profile has been submitted. You can start receiving trips after YREL Admin approves your account.</p><div className="partner-pending">Status: {profile.approval_status}</div><button className="partner-primary" onClick={() => void loadPartner()}><RefreshCw size={17}/> Check approval</button><button className="partner-link" onClick={() => void supabase.auth.signOut()}>Sign out</button>{error && <p className="partner-error">{error}</p>}</section></main>;

  const active = bookings.filter(b => !["completed", "cancelled"].includes(b.status));
  const history = bookings.filter(b => ["completed", "cancelled"].includes(b.status));
  const visible = tab === "history" ? history : active;

  return <main className="partner-app"><header className="partner-header"><div className="partner-logo small">Y</div><div><b>YREL PARTNER</b><small>{profile.driver_type === "cab_driver" ? "CAB DRIVER" : "SPARE DRIVER"}</small></div><button onClick={() => void supabase.auth.signOut()} aria-label="Sign out"><LogOut/></button></header><section className="partner-welcome"><span>WELCOME BACK</span><h1>{profile.full_name || "Partner"}</h1><p><ShieldCheck size={15}/> Approved Partner</p></section><section className="partner-stats"><article><ClipboardList/><b>{bookings.length}</b><span>Total assigned</span></article><article><Clock3/><b>{active.length}</b><span>Active trips</span></article><article><Wallet/><b>₹{bookings.filter(b => b.status === "completed").reduce((s,b)=>s+Number(b.estimated_fare||0),0).toLocaleString("en-IN")}</b><span>Completed fare*</span></article></section><nav className="partner-tabs"><button className={tab === "assigned" ? "active" : ""} onClick={() => setTab("assigned")}>My Trips</button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Trip History</button><button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profile</button></nav>{tab === "profile" ? <section className="partner-panel"><h2><UserRound/> My Profile</h2><p><b>Name:</b> {profile.full_name}</p><p><b>Phone:</b> {profile.phone || session.user.phone}</p><p><b>Partner type:</b> {profile.driver_type === "cab_driver" ? "Cab Driver" : "Spare Driver"}</p>{profile.vehicle_type && <p><b>Vehicle:</b> {profile.vehicle_type} · {profile.vehicle_number || "Number not added"}</p>}{profile.gear_type && <p><b>Gear:</b> {profile.gear_type}</p>}<p><b>Licence:</b> {profile.license_number || "—"}</p><p><b>Approval:</b> {profile.approval_status}</p></section> : <section className="partner-panel"><div className="partner-panel-head"><div><h2>{tab === "history" ? "Trip History" : "Assigned Trips"}</h2><p>Bookings assigned to your partner account</p></div><button onClick={() => void loadPartner()}><RefreshCw size={17}/></button></div>{loading && <p>Loading trips…</p>}{visible.length === 0 && !loading && <div className="partner-empty"><CarFront/><b>No trips here yet</b><span>New trips assigned by YREL will appear here.</span></div>}{visible.map(b => <article className="partner-trip" key={b.id}><div className="partner-trip-top"><b>{b.booking_code}</b><span className={"partner-status status-" + b.status}>{b.status.replaceAll("_"," ")}</span></div><div className="partner-route"><p><MapPin/> <span><small>PICKUP</small>{b.pickup}</span></p><p><MapPin/> <span><small>DROP</small>{b.dropoff || "—"}</span></p></div><div className="partner-trip-meta"><span>{b.vehicle_type || b.service_type}</span><b>₹{Number(b.estimated_fare || 0).toLocaleString("en-IN")}</b></div>{b.scheduled_at && <small className="partner-date">Scheduled: {new Date(b.scheduled_at).toLocaleString("en-IN")}</small>}{tab !== "history" && <div className="partner-actions">{b.status === "assigned" && <button onClick={() => void updateStatus(b,"accepted")} disabled={busy}><CheckCircle2/> Accept</button>}{["assigned","accepted"].includes(b.status) && <button onClick={() => void updateStatus(b,"in_progress")} disabled={busy}>Start Trip</button>}{b.status === "in_progress" && <button onClick={() => void updateStatus(b,"completed")} disabled={busy}>Complete Trip</button>}</div>}</article>)}</section>}<footer className="partner-footer">YREL Partner App · *Fare shown is booking estimate, not payout.</footer>{error && <div className="partner-toast">{error}</div>}</main>;
}
