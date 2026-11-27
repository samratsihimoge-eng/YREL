-- Booking RLS checks and the driver presence guard need to read the
-- signed-in driver's wallet. Existing SELECT RLS policies restrict rows
-- to the wallet owner or an admin. Do not grant wallet writes to clients.
GRANT SELECT ON TABLE public.driver_wallets TO authenticated;
