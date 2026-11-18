-- Run this in Supabase SQL Editor. Enable Phone Auth and configure an SMS provider.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text unique not null default ('YR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_type text not null check (service_type in ('cab','driver')),
  vehicle_type text check (vehicle_type in ('Auto','Hatchback','Sedan','SUV')),
  pickup text not null,
  dropoff text,
  scheduled_at timestamptz,
  estimated_fare integer not null default 0 check (estimated_fare >= 0),
  status text not null default 'requested' check (status in ('requested','confirmed','driver_assigned','in_progress','completed','cancelled')),
  driver_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cab_requires_dropoff check (service_type <> 'cab' or dropoff is not null)
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  vehicle_type text,
  vehicle_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.drivers enable row level security;

create policy "Users read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users read own bookings" on public.bookings for select to authenticated using (auth.uid() = user_id);
create policy "Users create own bookings" on public.bookings for insert to authenticated with check (auth.uid() = user_id);
-- Do not allow customers to self-assign drivers or alter status. Status/dispatch changes are admin operations.

create policy "Authenticated users see active driver options" on public.drivers for select to authenticated using (is_active = true);

create index if not exists bookings_user_created_idx on public.bookings(user_id, created_at desc);
create index if not exists bookings_status_idx on public.bookings(status);
