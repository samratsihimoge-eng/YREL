"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Activity, ArrowDownRight, ArrowUpRight, BadgeCheck, Bell, CarFront, Check, Wallet, RadioTower, MapPin,
  ChevronDown, CircleAlert, ClipboardList, Clock3, Download, LayoutDashboard,
  LogOut, Menu, RefreshCw, Search, ShieldCheck, Users, X
} from "lucide-react";
import "./admin.css";

type Booking = {
  id: string; booking_code: string; user_id: string; service_type: string;
  vehicle_type: string | null; pickup: string; dropoff: string | null;
  scheduled_at: string | null; estimated_fare: number; status: string;
  created_at: string; booking_details: Record<string, any> | null;
  assigned_driver_id: string | null; assigned_at: string | null; payment_amount: number; payment_status: string; payment_method: string | null; payment_notes: string | null; payment_updated_at: string | null;
};
type Customer = { id: string; full_name: string; phone: string | null; is_blocked: boolean };
type Driver = { user_id: string; driver_type: string; approval_status: string; created_at: string; full_name?: string | null; phone?: string | null; vehicle_type?: string | null; vehicle_number?: string | null; gear_type?: string | null; license_number?: string | null; is_blocked: boolean; is_online?: boolean; current_lat?: number | null; current_lng?: number | null; location_updated_at?: string | null; last_seen_at?: string | null };
type WalletRow = { driver_user_id: string; balance: number; is_online_blocked: boolean; updated_at: string };

const statusOptions = ["requested", "searching", "assigned", "accepted", "in_progress", "completed", "cancelled"];

export default function AdminPage() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [section, setSection] = useState<"overview" | "bookings" | "customers" | "drivers" | "wallet">("overview");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const [b, c, d, w] = await Promise.all([
      supabase.from("bookings").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("customers").select("id,full_name,phone,is_blocked").order("created_at", { ascending: false }).limit(500),
      supabase.from("driver_profiles").select("user_id,driver_type,approval_status,created_at,full_name,phone,vehicle_type,vehicle_number,gear_type,license_number,is_blocked,is_online,current_lat,current_lng,location_updated_at,last_seen_at").order("created_at", { ascending: false }).limit(300),
      supabase.from("driver_wallets").select("driver_user_id,balance,is_online_blocked,updated_at").order("updated_at", { ascending: false }).limit(500)
    ]);
    const error = b.error || c.error || d.error || w.error;
    if (error) setMessage(error.message);
    setBookings((b.data || []) as Booking[]);
    setCustomers((c.data || []) as Customer[]);
    setDrivers((d.data || []) as Driver[]);
    setWallets((w.data || []) as WalletRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const current = data.session?.user || null;
      setUser(current);
      setIsAdmin(current?.app_metadata?.role === "admin");
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const current = session?.user || null;
      setUser(current);
      setIsAdmin(current?.app_metadata?.role === "admin");
      setAuthLoading(false);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { if (isAdmin) void loadData(); }, [isAdmin, loadData]);

  async function login() {
    setLoginBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/admin` }
    });
    if (error) { setMessage(error.message); setLoginBusy(false); }
  }

  async function updateBooking(id: string, patch: Partial<Booking>) {
    setSavingId(id);
    const { error } = await supabase.from("bookings").update(patch).eq("id", id);
    if (error) setMessage(error.message);
    else {
      setBookings(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
      setMessage("Booking updated successfully.");
    }
    setSavingId("");
  }

  async function createDirectBooking() {
    if (!customers.length) { setMessage("Create a customer profile before entering a direct booking."); return; }
    const customerList = customers.map((c,i)=>`${i+1}. ${c.full_name} · ${c.phone || "No phone"}`).join("\n");
    const pick = window.prompt("Select customer number:\n"+customerList);
    if (pick === null) return;
    const customer = customers[Number(pick)-1];
    if (!customer) { setMessage("Invalid customer number."); return; }
    if (customer.is_blocked) { setMessage("This customer is blocked. Unblock before creating a booking."); return; }
    const service_type = window.prompt("Service type (cab / driver / rental)", "cab");
    if (!service_type) return;
    const vehicle_type = window.prompt("Vehicle type (Auto / Hatchback / Sedan / SUV)", "Sedan");
    if (vehicle_type === null) return;
    const pickup = window.prompt("Pickup location");
    if (!pickup?.trim()) return;
    const dropoff = window.prompt("Drop location");
    if (dropoff === null) return;
    const fareText = window.prompt("Estimated fare in INR", "0");
    if (fareText === null || !Number.isFinite(Number(fareText)) || Number(fareText)<0) { setMessage("Enter a valid fare."); return; }
    const scheduledText = window.prompt("Scheduled date/time (optional, ISO format) or leave blank", "");
    if (scheduledText === null) return;
    setSavingId("new-booking");
    const { error } = await supabase.from("bookings").insert({ user_id: customer.id, service_type: service_type.trim(), vehicle_type: vehicle_type.trim() || null, pickup: pickup.trim(), dropoff: dropoff.trim() || null, estimated_fare: Number(fareText), payment_amount: 0, payment_status: "pending", scheduled_at: scheduledText.trim() || null, status: "requested", booking_details: { created_by_admin: true, entry_type: "direct_admin" } });
    if (error) setMessage(error.message);
    else { setMessage("Direct booking created."); await loadData(); }
    setSavingId("");
  }

  async function editPayment(b: Booking) {
    const amountText = window.prompt("Actual payment amount received (INR)", String(b.payment_amount ?? 0));
    if (amountText === null || !Number.isFinite(Number(amountText)) || Number(amountText)<0) { if (amountText !== null) setMessage("Enter a valid payment amount."); return; }
    const payment_status = window.prompt("Payment status (pending / paid / partial / refunded / disputed)", b.payment_status || "pending");
    if (!payment_status) return;
    const payment_method = window.prompt("Payment method (cash / UPI / card / bank / other)", b.payment_method || "");
    if (payment_method === null) return;
    const payment_notes = window.prompt("Payment adjustment note / issue reason", b.payment_notes || "");
    if (payment_notes === null) return;
    if (!window.confirm("Save payment adjustment? This records an admin payment change.")) return;
    setSavingId(b.id);
    const patch = { payment_amount: Number(amountText), payment_status: payment_status.trim().toLowerCase(), payment_method: payment_method.trim() || null, payment_notes: payment_notes.trim() || null, payment_updated_at: new Date().toISOString() };
    const { error } = await supabase.from("bookings").update(patch).eq("id", b.id);
    if (error) setMessage(error.message);
    else { setBookings(items=>items.map(x=>x.id===b.id?{...x,...patch}:x)); setMessage("Payment details updated."); }
    setSavingId("");
  }

  async function updateDriver(id: string, approval_status: string) {
    setSavingId(id);
    const { error } = await supabase.from("driver_profiles").update({ approval_status }).eq("user_id", id);
    if (error) setMessage(error.message);
    else {
      setDrivers(current => current.map(item => item.user_id === id ? { ...item, approval_status } : item));
      setMessage("Driver profile updated.");
    }
    setSavingId("");
  }

  async function editCustomer(c: Customer) {
    const full_name = window.prompt("Customer full name", c.full_name || "");
    if (full_name === null) return;
    const phone = window.prompt("Customer phone number", c.phone || "");
    if (phone === null) return;
    setSavingId(c.id);
    const { error } = await supabase.from("customers").update({ full_name: full_name.trim(), phone: phone.trim() || null }).eq("id", c.id);
    if (error) setMessage(error.message);
    else { setCustomers(items => items.map(x => x.id === c.id ? { ...x, full_name: full_name.trim(), phone: phone.trim() || null } : x)); setMessage("Customer profile saved."); }
    setSavingId("");
  }

  async function toggleCustomerBlock(c: Customer) {
    const next = !c.is_blocked;
    if (!window.confirm(next ? "Temporarily block this customer profile?" : "Unblock this customer profile?")) return;
    setSavingId(c.id);
    const { error } = await supabase.from("customers").update({ is_blocked: next, blocked_at: next ? new Date().toISOString() : null }).eq("id", c.id);
    if (error) setMessage(error.message);
    else { setCustomers(items => items.map(x => x.id === c.id ? { ...x, is_blocked: next } : x)); setMessage(next ? "Customer marked as blocked in Admin." : "Customer block removed."); }
    setSavingId("");
  }

  async function deleteCustomerProfile(c: Customer) {
    if (!window.confirm("Delete this customer PROFILE only? Login account and booking history will remain.")) return;
    setSavingId(c.id);
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) setMessage(error.message);
    else { setCustomers(items => items.filter(x => x.id !== c.id)); setMessage("Customer profile deleted. Login account and bookings were kept."); }
    setSavingId("");
  }

  async function editDriver(d: Driver) {
    const full_name = window.prompt("Driver full name", d.full_name || "");
    if (full_name === null) return;
    const phone = window.prompt("Phone number", d.phone || "");
    if (phone === null) return;
    const vehicle_type = window.prompt("Vehicle type", d.vehicle_type || "");
    if (vehicle_type === null) return;
    const vehicle_number = window.prompt("Vehicle number", d.vehicle_number || "");
    if (vehicle_number === null) return;
    const gear_type = window.prompt("Gear type (Manual / Automatic)", d.gear_type || "");
    if (gear_type === null) return;
    const license_number = window.prompt("Driving licence number", d.license_number || "");
    if (license_number === null) return;
    setSavingId(d.user_id);
    const patch = { full_name: full_name.trim() || null, phone: phone.trim() || null, vehicle_type: vehicle_type.trim() || null, vehicle_number: vehicle_number.trim() || null, gear_type: gear_type.trim() || null, license_number: license_number.trim() || null };
    const { error } = await supabase.from("driver_profiles").update(patch).eq("user_id", d.user_id);
    if (error) setMessage(error.message);
    else { setDrivers(items => items.map(x => x.user_id === d.user_id ? { ...x, ...patch } : x)); setMessage("Driver profile saved."); }
    setSavingId("");
  }

  async function toggleDriverBlock(d: Driver) {
    const next = !d.is_blocked;
    if (!window.confirm(next ? "Temporarily block this driver profile?" : "Unblock this driver profile?")) return;
    setSavingId(d.user_id);
    const { error } = await supabase.from("driver_profiles").update({ is_blocked: next, blocked_at: next ? new Date().toISOString() : null }).eq("user_id", d.user_id);
    if (error) setMessage(error.message);
    else { setDrivers(items => items.map(x => x.user_id === d.user_id ? { ...x, is_blocked: next } : x)); setMessage(next ? "Driver marked as blocked in Admin." : "Driver block removed."); }
    setSavingId("");
  }

  async function deleteDriverProfile(d: Driver) {
    if (!window.confirm("Delete this driver PROFILE only? Login account and booking history will remain.")) return;
    setSavingId(d.user_id);
    const { error } = await supabase.from("driver_profiles").delete().eq("user_id", d.user_id);
    if (error) setMessage(error.message);
    else { setDrivers(items => items.filter(x => x.user_id !== d.user_id)); setMessage("Driver profile deleted. Login account and bookings were kept."); }
    setSavingId("");
  }

  const customerById = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);
  const filteredBookings = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return bookings;
    return bookings.filter(b => [b.booking_code, b.pickup, b.dropoff, b.service_type, b.status, customerById.get(b.user_id)?.full_name, customerById.get(b.user_id)?.phone].some(v => String(v || "").toLowerCase().includes(term)));
  }, [bookings, search, customerById]);

  const stats = useMemo(() => ({
    total: bookings.length,
    active: bookings.filter(b => !["completed", "cancelled"].includes(b.status)).length,
    today: bookings.filter(b => new Date(b.created_at).toDateString() === new Date().toDateString()).length,
    revenue: bookings.filter(b => b.status === "completed").reduce((sum, b) => sum + Number(b.estimated_fare || 0), 0),
    pendingDrivers: drivers.filter(d => d.approval_status === "pending").length,
    onlineDrivers: drivers.filter(d => d.is_online && d.approval_status === "approved" && !d.is_blocked).length
  }), [bookings, drivers]);

  function exportBookings() {
    const rows = [["Booking ID","Customer","Phone","Service","Vehicle","Pickup","Drop","Date","Fare","Status"], ...filteredBookings.map(b => {
      const c = customerById.get(b.user_id);
      return [b.booking_code, c?.full_name || "", c?.phone || "", b.service_type, b.vehicle_type || "", b.pickup, b.dropoff || "", b.scheduled_at || b.created_at, String(b.estimated_fare), b.status];
    })];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("
");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "yrel-bookings.csv"; link.click(); URL.revokeObjectURL(url);
  }

  const nav = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "bookings", label: "Bookings", icon: ClipboardList },
    { id: "customers", label: "Customers", icon: Users },
    { id: "drivers", label: "Drivers & Partners", icon: CarFront },
    { id: "wallet", label: "Wallets", icon: Wallet }
  ] as const;

  if (authLoading) return <main className="admin-auth"><div className="admin-auth-card"><div className="admin-mark">Y</div><p>Loading secure admin access…</p></div></main>;

  if (!user) return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <div className="admin-mark">Y</div>
        <span className="admin-kicker">YREL CONTROL CENTRE</span>
        <h1>Admin sign in</h1>
        <p>Sign in with your authorised Google account to manage bookings, customers and driver partners.</p>
        <button className="admin-primary admin-login-btn" onClick={login} disabled={loginBusy}>{loginBusy ? "Opening Google…" : "Continue with Google"}</button>
        {message && <p className="admin-error">{message}</p>}
        <a className="admin-back" href="/">← Back to YREL Customer App</a>
      </div>
    </main>
  );

  if (!isAdmin) return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <div className="admin-lock"><ShieldCheck size={30}/></div>
        <h1>Admin access not enabled</h1>
        <p>This Google account is signed in, but it has not been granted the secure <b>admin</b> role. Customer accounts cannot access the Admin Panel.</p>
        <button className="admin-outline" onClick={() => supabase.auth.signOut()}><LogOut size={17}/> Sign out</button>
        <a className="admin-back" href="/">← Back to YREL Customer App</a>
      </div>
    </main>
  );

  return (
    <main className="admin-app">
      <aside className={`admin-sidebar ${mobileNav ? "open" : ""}`}>
        <div className="admin-brand"><div className="admin-brand-icon">Y</div><div><b>YREL</b><small>ADMIN CONSOLE</small></div><button className="admin-close-nav" onClick={() => setMobileNav(false)}><X size={19}/></button></div>
        <div className="admin-nav-label">WORKSPACE</div>
        {nav.map(item => { const Icon = item.icon; return <button key={item.id} className={`admin-nav-item ${section === item.id ? "selected" : ""}`} onClick={() => { setSection(item.id); setMobileNav(false); }}><Icon size={19}/><span>{item.label}</span>{item.id === "drivers" && stats.pendingDrivers > 0 && <em>{stats.pendingDrivers}</em>}</button>; })}
        <div className="admin-sidebar-bottom"><div className="admin-secure"><ShieldCheck size={18}/><span>Secure admin session</span></div><button onClick={() => supabase.auth.signOut()}><LogOut size={18}/> Sign out</button></div>
      </aside>
      {mobileNav && <button className="admin-nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
      <section className="admin-main">
        <header className="admin-topbar">
          <button className="admin-menu-toggle" onClick={() => setMobileNav(true)}><Menu size={21}/></button>
          <div><span className="admin-kicker">YREL OPERATIONS</span><h1>{nav.find(n => n.id === section)?.label}</h1></div>
          <div className="admin-top-actions"><span className="admin-live"><i/> LIVE DATA</span><button className="admin-icon-btn" onClick={() => void loadData()} title="Refresh"><RefreshCw size={18}/></button><div className="admin-avatar">{String(user.email || "A").charAt(0).toUpperCase()}</div></div>
        </header>
        {message && <div className="admin-message"><CircleAlert size={17}/>{message}<button onClick={() => setMessage("")}><X size={16}/></button></div>}
        {section === "overview" && <>
          <div className="admin-welcome"><div><h2>Good to see you, Admin.</h2><p>Here’s what’s happening across your YREL bookings today.</p></div><button className="admin-outline" onClick={() => void loadData()}><RefreshCw size={16}/> Refresh data</button></div>
          <div className="admin-stat-grid">
            <Stat icon={ClipboardList} label="Total bookings" value={stats.total} note="All recorded requests"/>
            <Stat icon={RadioTower} label="Drivers online" value={stats.onlineDrivers} note="Live partner availability"/>
            <Stat icon={Activity} label="Active bookings" value={stats.active} note="Not completed or cancelled"/>
            <Stat icon={Clock3} label="Bookings today" value={stats.today} note="Created today"/>
            <Stat icon={ArrowUpRight} label="Completed fare total" value={`₹${stats.revenue.toLocaleString("en-IN")}`} note="Based on completed bookings"/>
          </div>
          <div className="admin-panel admin-live-fleet"><div className="admin-panel-head"><div><h3>Live driver network</h3><p>Current GPS locations from online partners</p></div><span className="admin-count">{stats.onlineDrivers} online</span></div>{drivers.filter(d=>d.is_online&&d.current_lat!=null&&d.current_lng!=null).length ? <><iframe title="YREL live driver locations" src={`https://www.openstreetmap.org/export/embed.html?bbox=${Math.min(...drivers.filter(d=>d.is_online&&d.current_lng!=null).map(d=>Number(d.current_lng)))-0.02}%2C${Math.min(...drivers.filter(d=>d.is_online&&d.current_lat!=null).map(d=>Number(d.current_lat)))-0.015}%2C${Math.max(...drivers.filter(d=>d.is_online&&d.current_lng!=null).map(d=>Number(d.current_lng)))+0.02}%2C${Math.max(...drivers.filter(d=>d.is_online&&d.current_lat!=null).map(d=>Number(d.current_lat)))+0.015}&layer=mapnik`} loading="lazy"/><div className="admin-fleet-list">{drivers.filter(d=>d.is_online&&d.current_lat!=null&&d.current_lng!=null).map(d=><div key={d.user_id}><span className="fleet-dot"/><b>{d.full_name||"YREL Partner"}</b><small>{d.driver_type==="cab_driver"?"Cab Driver":"Spare Driver"} · {Number(d.current_lat).toFixed(4)}, {Number(d.current_lng).toFixed(4)}</small><time>{d.location_updated_at?new Date(d.location_updated_at).toLocaleTimeString("en-IN"):"GPS pending"}</time></div>)}</div></> : <div className="admin-empty"><MapPin/><p>No active driver GPS locations yet.</p>Approved partners appear here when they switch Online and share GPS.</div>}</div><div className="admin-content-grid">
            <div className="admin-panel"><div className="admin-panel-head"><div><h3>Recent bookings</h3><p>Latest customer requests</p></div><button className="admin-text-btn" onClick={() => setSection("bookings")}>View all →</button></div><BookingTable rows={bookings.slice(0,6)} customerById={customerById} compact onStatus={updateBooking} savingId={savingId} onPayment={editPayment}/></div>
            <div className="admin-panel admin-side-panel"><div className="admin-panel-head"><div><h3>Driver approvals</h3><p>Partner onboarding queue</p></div><span className="admin-count">{stats.pendingDrivers}</span></div>{drivers.filter(d => d.approval_status === "pending").slice(0,5).map(d => <div className="admin-driver-row" key={d.user_id}><div className="admin-driver-avatar"><CarFront size={18}/></div><div><b>{d.driver_type === "cab_driver" ? "Cab Driver" : "Spare Driver"}</b><small>{d.user_id.slice(0,8)}…</small></div><button onClick={() => setSection("drivers")}>Review</button></div>)}{stats.pendingDrivers === 0 && <div className="admin-empty">No pending driver approvals.</div>}</div>
          </div>
        </>}
        {section === "bookings" && <div className="admin-panel admin-full-panel"><div className="admin-panel-head admin-booking-head"><div><h3>All bookings</h3><p>Search and manage customer booking requests.</p></div><div className="admin-actions"><button className="admin-primary" disabled={savingId==="new-booking"} onClick={()=>void createDirectBooking()}>+ Direct booking</button><button className="admin-primary" onClick={exportBookings}><Download size={16}/> Export CSV</button></div></div><div className="admin-toolbar"><label className="admin-search"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search booking ID, customer, phone or location"/></label><span>{filteredBookings.length} bookings</span></div><BookingTable rows={filteredBookings} customerById={customerById} onStatus={updateBooking} savingId={savingId} onPayment={editPayment} drivers={drivers.filter(d => d.approval_status === "approved")}/></div>}
        {section === "customers" && <div className="admin-panel admin-full-panel"><div className="admin-panel-head"><div><h3>Customers</h3><p>Customer profiles created in YREL.</p></div><span className="admin-count">{customers.length} total</span></div><div className="admin-table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Customer ID</th><th>Bookings</th><th>Profile controls</th></tr></thead><tbody>{customers.map(c => <tr key={c.id}><td><b>{c.full_name || "Customer"}</b><small className="admin-subcell">{c.is_blocked ? "Blocked" : "Active"}</small></td><td>{c.phone || "—"}</td><td className="admin-mono">{c.id.slice(0,12)}…</td><td>{bookings.filter(b => b.user_id === c.id).length}</td><td><div className="admin-actions"><button className="admin-outline" disabled={savingId===c.id} onClick={()=>void editCustomer(c)}>Edit</button><button className="admin-outline" disabled={savingId===c.id} onClick={()=>void toggleCustomerBlock(c)}>{c.is_blocked ? "Unblock" : "Block"}</button><button className="admin-outline" disabled={savingId===c.id} onClick={()=>void deleteCustomerProfile(c)}>Delete profile</button></div></td></tr>)}</tbody></table>{customers.length === 0 && <div className="admin-empty">No customer profiles found.</div>}</div></div>}
        {section === "wallet" && <div className="admin-panel admin-full-panel"><div className="admin-panel-head"><div><h3>Driver Wallets</h3><p>Read-only wallet balances and online restriction status. Recharge and ledger adjustments are not enabled until payment and server-side settlement are configured.</p></div><span className="admin-count">{wallets.length} wallets</span></div><div className="admin-table-wrap"><table><thead><tr><th>Driver</th><th>Partner type</th><th>Available balance</th><th>Online access</th><th>Last updated</th></tr></thead><tbody>{wallets.map(w=>{const d=drivers.find(x=>x.user_id===w.driver_user_id);return <tr key={w.driver_user_id}><td><b>{d?.full_name || "Partner"}</b><small className="admin-subcell">{d?.phone || w.driver_user_id.slice(0,12)+"…"}</small></td><td>{d?.driver_type==="cab_driver"?"Cab Driver":d?.driver_type==="spare_driver"?"Spare Driver":"—"}</td><td><b>₹{Number(w.balance).toFixed(2)}</b></td><td><StatusPill value={w.is_online_blocked?"blocked":"active"}/></td><td>{new Date(w.updated_at).toLocaleString("en-IN")}</td></tr>})}</tbody></table>{wallets.length===0&&<div className="admin-empty">No driver wallets found.</div>}</div></div>}
        {section === "drivers" && <div className="admin-panel admin-full-panel"><div className="admin-panel-head"><div><h3>Drivers & partners</h3><p>Review partner profiles and control approval status.</p></div><span className="admin-count">{drivers.length} profiles</span></div><div className="admin-table-wrap"><table><thead><tr><th>Driver</th><th>Partner type</th><th>Vehicle</th><th>Joined</th><th>Online / GPS</th><th>Status</th><th>Approval</th><th>Profile controls</th></tr></thead><tbody>{drivers.map(d => <tr key={d.user_id}><td><b>{d.full_name || "Driver"}</b><small className="admin-subcell">{d.phone || d.user_id.slice(0,12)+"…"}</small></td><td>{d.driver_type === "cab_driver" ? "Cab Driver" : "Spare Driver"}</td><td>{d.vehicle_type || "—"} {d.vehicle_number || ""}</td><td>{new Date(d.created_at).toLocaleDateString("en-IN")}</td><td><StatusPill value={d.is_online?"online":"offline"}/><small className="admin-subcell">{d.current_lat!=null&&d.current_lng!=null?`${Number(d.current_lat).toFixed(4)}, ${Number(d.current_lng).toFixed(4)}`:"Location unavailable"}</small></td><td><StatusPill value={d.is_blocked ? "blocked" : d.approval_status}/></td><td><select className="admin-select" value={d.approval_status} disabled={savingId === d.user_id} onChange={e => void updateDriver(d.user_id,e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></td><td><div className="admin-actions"><button className="admin-outline" disabled={savingId===d.user_id} onClick={()=>void editDriver(d)}>Edit</button><button className="admin-outline" disabled={savingId===d.user_id} onClick={()=>void toggleDriverBlock(d)}>{d.is_blocked ? "Unblock" : "Block"}</button><button className="admin-outline" disabled={savingId===d.user_id} onClick={()=>void deleteDriverProfile(d)}>Delete profile</button></div></td></tr>)}</tbody></table>{drivers.length === 0 && <div className="admin-empty">No driver or partner profiles yet. New registrations will appear here.</div>}</div></div>}
        <footer className="admin-footer"><span>© {new Date().getFullYear()} YREL Technologies Private Limited</span><span>Admin Console · Version 1.0</span></footer>
        {loading && <div className="admin-loading"><RefreshCw size={15}/> Syncing latest data…</div>}
      </section>
    </main>
  );
}

function Stat({icon: Icon,label,value,note}:{icon:any;label:string;value:string|number;note:string}) {
  return <article className="admin-stat"><div className="admin-stat-icon"><Icon size={20}/></div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}
function StatusPill({value}:{value:string}) { return <span className={`admin-status status-${value.toLowerCase().replace(/[^a-z_]/g,"")}`}>{value.replaceAll("_"," ")}</span>; }
function BookingTable({rows,customerById,onStatus,savingId,compact=false,drivers=[],onPayment}:{rows:Booking[];customerById:Map<string,Customer>;onStatus:(id:string,patch:Partial<Booking>)=>void;savingId:string;compact?:boolean;drivers?:Driver[];onPayment:(booking:Booking)=>void}) {
  return <div className="admin-table-wrap"><table><thead><tr><th>Booking</th><th>Customer</th><th>Trip</th><th>Fare</th><th>Payment</th><th>Status</th>{!compact && <th>Assign driver</th>}</tr></thead><tbody>{rows.map(b => { const c=customerById.get(b.user_id); return <tr key={b.id}><td><b className="admin-booking-code">{b.booking_code}</b><small className="admin-subcell">{new Date(b.created_at).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}</small></td><td><b>{c?.full_name || "Customer"}</b><small className="admin-subcell">{c?.phone || "Phone not added"}</small></td><td><b>{b.service_type} · {b.vehicle_type || "—"}</b><small className="admin-subcell">{b.pickup} → {b.dropoff || "—"}</small></td><td><b>₹{Number(b.estimated_fare || 0).toLocaleString("en-IN")}</b></td><td><b>₹{Number(b.payment_amount || 0).toLocaleString("en-IN")}</b><small className="admin-subcell">{b.payment_status || "pending"}</small><button className="admin-outline" disabled={savingId===b.id} onClick={()=>void onPayment(b)}>Edit payment</button></td><td><select className="admin-select" value={b.status} disabled={savingId===b.id} onChange={e=>onStatus(b.id,{status:e.target.value})}>{Array.from(new Set([...statusOptions,b.status])).map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></td>{!compact && <td><select className="admin-select" value={b.assigned_driver_id || ""} disabled={savingId===b.id} onChange={e=>onStatus(b.id,{assigned_driver_id:e.target.value || null,assigned_at:e.target.value?new Date().toISOString():null,status:e.target.value && b.status==="requested"?"assigned":b.status})}><option value="">Unassigned</option>{drivers.map(d=><option key={d.user_id} value={d.user_id}>{d.driver_type==="cab_driver"?"Cab":"Spare"} · {d.user_id.slice(0,8)}</option>)}</select></td>}</tr>;})}</tbody></table>{rows.length===0 && <div className="admin-empty">No bookings to show.</div>}</div>;
}
