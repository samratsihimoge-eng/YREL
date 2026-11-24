"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Activity, ArrowDownRight, ArrowUpRight, BadgeCheck, Bell, CarFront, Check,
  ChevronDown, CircleAlert, ClipboardList, Clock3, Download, LayoutDashboard,
  LogOut, Menu, RefreshCw, Search, ShieldCheck, Users, X
} from "lucide-react";
import "./admin.css";

type Booking = {
  id: string; booking_code: string; user_id: string; service_type: string;
  vehicle_type: string | null; pickup: string; dropoff: string | null;
  scheduled_at: string | null; estimated_fare: number; status: string;
  created_at: string; booking_details: Record<string, any> | null;
  assigned_driver_id: string | null; assigned_at: string | null;
};
type Customer = { id: string; full_name: string; phone: string | null };
type Driver = { user_id: string; driver_type: string; approval_status: string; created_at: string };

const statusOptions = ["requested", "searching", "assigned", "accepted", "in_progress", "completed", "cancelled"];

export default function AdminPage() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [section, setSection] = useState<"overview" | "bookings" | "customers" | "drivers">("overview");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const [b, c, d] = await Promise.all([
      supabase.from("bookings").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("customers").select("id,full_name,phone").order("created_at", { ascending: false }).limit(500),
      supabase.from("driver_profiles").select("user_id,driver_type,approval_status,created_at").order("created_at", { ascending: false }).limit(300)
    ]);
    const error = b.error || c.error || d.error;
    if (error) setMessage(error.message);
    setBookings((b.data || []) as Booking[]);
    setCustomers((c.data || []) as Customer[]);
    setDrivers((d.data || []) as Driver[]);
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
    pendingDrivers: drivers.filter(d => d.approval_status === "pending").length
  }), [bookings, drivers]);

  function exportBookings() {
    const rows = [["Booking ID","Customer","Phone","Service","Vehicle","Pickup","Drop","Date","Fare","Status"], ...filteredBookings.map(b => {
      const c = customerById.get(b.user_id);
      return [b.booking_code, c?.full_name || "", c?.phone || "", b.service_type, b.vehicle_type || "", b.pickup, b.dropoff || "", b.scheduled_at || b.created_at, String(b.estimated_fare), b.status];
    })];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "yrel-bookings.csv"; link.click(); URL.revokeObjectURL(url);
  }

  const nav = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "bookings", label: "Bookings", icon: ClipboardList },
    { id: "customers", label: "Customers", icon: Users },
    { id: "drivers", label: "Drivers & Partners", icon: CarFront }
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
            <Stat icon={Activity} label="Active bookings" value={stats.active} note="Not completed or cancelled"/>
            <Stat icon={Clock3} label="Bookings today" value={stats.today} note="Created today"/>
            <Stat icon={ArrowUpRight} label="Completed fare total" value={`₹${stats.revenue.toLocaleString("en-IN")}`} note="Based on completed bookings"/>
          </div>
          <div className="admin-content-grid">
            <div className="admin-panel"><div className="admin-panel-head"><div><h3>Recent bookings</h3><p>Latest customer requests</p></div><button className="admin-text-btn" onClick={() => setSection("bookings")}>View all →</button></div><BookingTable rows={bookings.slice(0,6)} customerById={customerById} compact onStatus={updateBooking} savingId={savingId}/></div>
            <div className="admin-panel admin-side-panel"><div className="admin-panel-head"><div><h3>Driver approvals</h3><p>Partner onboarding queue</p></div><span className="admin-count">{stats.pendingDrivers}</span></div>{drivers.filter(d => d.approval_status === "pending").slice(0,5).map(d => <div className="admin-driver-row" key={d.user_id}><div className="admin-driver-avatar"><CarFront size={18}/></div><div><b>{d.driver_type === "cab_driver" ? "Cab Driver" : "Spare Driver"}</b><small>{d.user_id.slice(0,8)}…</small></div><button onClick={() => setSection("drivers")}>Review</button></div>)}{stats.pendingDrivers === 0 && <div className="admin-empty">No pending driver approvals.</div>}</div>
          </div>
        </>}
        {section === "bookings" && <div className="admin-panel admin-full-panel"><div className="admin-panel-head admin-booking-head"><div><h3>All bookings</h3><p>Search and manage customer booking requests.</p></div><button className="admin-primary" onClick={exportBookings}><Download size={16}/> Export CSV</button></div><div className="admin-toolbar"><label className="admin-search"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search booking ID, customer, phone or location"/></label><span>{filteredBookings.length} bookings</span></div><BookingTable rows={filteredBookings} customerById={customerById} onStatus={updateBooking} savingId={savingId} drivers={drivers.filter(d => d.approval_status === "approved")}/></div>}
        {section === "customers" && <div className="admin-panel admin-full-panel"><div className="admin-panel-head"><div><h3>Customers</h3><p>Customer profiles created in YREL.</p></div><span className="admin-count">{customers.length} total</span></div><div className="admin-table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Customer ID</th><th>Bookings</th></tr></thead><tbody>{customers.map(c => <tr key={c.id}><td><b>{c.full_name || "Customer"}</b></td><td>{c.phone || "—"}</td><td className="admin-mono">{c.id.slice(0,12)}…</td><td>{bookings.filter(b => b.user_id === c.id).length}</td></tr>)}</tbody></table>{customers.length === 0 && <div className="admin-empty">No customer profiles found.</div>}</div></div>}
        {section === "drivers" && <div className="admin-panel admin-full-panel"><div className="admin-panel-head"><div><h3>Drivers & partners</h3><p>Review partner profiles and control approval status.</p></div><span className="admin-count">{drivers.length} profiles</span></div><div className="admin-table-wrap"><table><thead><tr><th>Partner ID</th><th>Partner type</th><th>Joined</th><th>Approval</th><th>Action</th></tr></thead><tbody>{drivers.map(d => <tr key={d.user_id}><td className="admin-mono">{d.user_id.slice(0,14)}…</td><td>{d.driver_type === "cab_driver" ? "Cab Driver" : "Spare Driver"}</td><td>{new Date(d.created_at).toLocaleDateString("en-IN")}</td><td><StatusPill value={d.approval_status}/></td><td><select className="admin-select" value={d.approval_status} disabled={savingId === d.user_id} onChange={e => void updateDriver(d.user_id,e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></td></tr>)}</tbody></table>{drivers.length === 0 && <div className="admin-empty">No driver or partner profiles yet. New registrations will appear here.</div>}</div></div>}
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
function BookingTable({rows,customerById,onStatus,savingId,compact=false,drivers=[]}:{rows:Booking[];customerById:Map<string,Customer>;onStatus:(id:string,patch:Partial<Booking>)=>void;savingId:string;compact?:boolean;drivers?:Driver[]}) {
  return <div className="admin-table-wrap"><table><thead><tr><th>Booking</th><th>Customer</th><th>Trip</th><th>Fare</th><th>Status</th>{!compact && <th>Assign driver</th>}</tr></thead><tbody>{rows.map(b => { const c=customerById.get(b.user_id); return <tr key={b.id}><td><b className="admin-booking-code">{b.booking_code}</b><small className="admin-subcell">{new Date(b.created_at).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}</small></td><td><b>{c?.full_name || "Customer"}</b><small className="admin-subcell">{c?.phone || "Phone not added"}</small></td><td><b>{b.service_type} · {b.vehicle_type || "—"}</b><small className="admin-subcell">{b.pickup} → {b.dropoff || "—"}</small></td><td><b>₹{Number(b.estimated_fare || 0).toLocaleString("en-IN")}</b></td><td><select className="admin-select" value={b.status} disabled={savingId===b.id} onChange={e=>onStatus(b.id,{status:e.target.value})}>{Array.from(new Set([...statusOptions,b.status])).map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></td>{!compact && <td><select className="admin-select" value={b.assigned_driver_id || ""} disabled={savingId===b.id} onChange={e=>onStatus(b.id,{assigned_driver_id:e.target.value || null,assigned_at:e.target.value?new Date().toISOString():null,status:e.target.value && b.status==="requested"?"assigned":b.status})}><option value="">Unassigned</option>{drivers.map(d=><option key={d.user_id} value={d.user_id}>{d.driver_type==="cab_driver"?"Cab":"Spare"} · {d.user_id.slice(0,8)}</option>)}</select></td>}</tr>;})}</tbody></table>{rows.length===0 && <div className="admin-empty">No bookings to show.</div>}</div>;
}
