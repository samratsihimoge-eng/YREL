# YREL Customer App — Rebuilt UI Version 2

**Scope:** Customer app only. This implementation is isolated at `/customer-v2` and does not modify the current customer homepage or the separate Partner/Admin apps.

## Design direction
- Cream background, deep purple headers and panels, orange gradient primary actions.
- Compact, premium mobile-first layout with rounded cards, subtle shadows, clear typography and consistent iconography.
- Branded YREL header and tagline: “Your City, Your Fun. Just YREL it.”
- Bottom navigation: Home, Bookings, Saved, Menu.
- No customer wallet. Customer pays the driver directly after the trip by Cash or UPI.
- No driver/admin login or admin screens in this customer app.

## Screens implemented
1. Splash
2. Customer login entry
3. Home dashboard
4. All services
5. Cab/driver booking details
6. Choose your ride
7. Booking summary and direct-to-driver payment information
8. Searching for driver
9. Driver assigned with trip-start PIN
10. Live trip tracking
11. My bookings with status filters
12. Booking details
13. Saved locations
14. Offers and rewards
15. Notifications
16. Help and support
17. Customer profile
18. Language selection
19. Customer menu
20. Cab rentals with city packages and outstation minimum-distance rules
21. Seat sharing with seat-count control

## Project files
- `app/customer-v2/page.tsx`
- `app/customer-v2/customer-v2.css`

## Open
Run the Next.js project and visit `/customer-v2`.

## Integration notes
This is a clean, navigable UI rebuild/prototype. Live Supabase authentication, Photon/OSRM routing, live booking creation, driver matching, payment processing and real-time tracking must be connected to the existing service APIs before production use. The demo booking cards and driver details are illustrative UI content, not live records. Existing production routes and database are untouched by this branch addition.
