# YREL — premium cab & driver booking website

This project rebuilds the uploaded YREL HTML experience as a Next.js application with Supabase authentication and a PostgreSQL database.

## Included
- Premium responsive YREL interface
- Cab booking: Auto, Hatchback, Sedan and SUV
- Driver booking request
- Instant and scheduled booking requests
- Indicative fare estimate
- Phone OTP login using Supabase Auth
- Persistent booking history scoped to the signed-in user
- PostgreSQL schema and Row Level Security (RLS)

## Important production boundary
This is a full-stack application starter, not a deployed ride-hailing operation. It stores real booking requests in Supabase. It does **not** yet have a live driver network, GPS tracking, maps/routing, payment collection, SMS dispatch, or automated driver matching. The uploaded HTML's driver assignment was simulated; this version deliberately does not invent a real driver assignment. An operations/admin workflow and driver app must be connected before promising dispatch to customers.

## Setup
1. Create a Supabase project.
2. In Supabase → SQL Editor, run `supabase/schema.sql`.
3. In Supabase → Authentication → Providers, enable **Phone** and configure an SMS provider. Test OTP delivery before launch.
4. Copy `.env.example` to `.env.local` and add the Supabase Project URL and anon/publishable key. Never put a Supabase service-role key in browser code.
5. Install Node.js 20+ then run:
   ```bash
   npm install
   npm run dev
   ```
6. Open `http://localhost:3000`.

## Deploy
Push the project to a private Git repository, import it into Vercel, and add the two `NEXT_PUBLIC_SUPABASE_*` environment variables. Deploy only after testing phone OTP, RLS, and booking creation in a staging project.

## Before public launch
- Add verified business contact details, service area, fare rules, cancellation/refund terms and privacy policy.
- Replace the distance input with a trusted routing/maps provider and server-calculated fare. Never trust a fare supplied by the browser for charging.
- Add an authenticated operations dashboard / server-side admin role to confirm requests, assign vetted drivers and update statuses.
- Add driver onboarding, driver identity checks, live availability and dispatch.
- Add payment provider integration only after server-side order creation and webhook verification.
- Configure rate limits, CAPTCHA/abuse protection, backups, monitoring and transactional notifications.
- Review local transport, tax, privacy and consumer requirements before operating.

## Data security
The supplied SQL enables RLS. Customers can only read their own bookings and create requests for their own user ID. Customers cannot directly update status or assign a driver. Keep privileged operations on a trusted server using a service-role secret stored only in server environment variables.
