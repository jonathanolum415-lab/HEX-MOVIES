-- The Flask backend connects with a server-side PostgreSQL role. The public
-- website must never access account tables or write movie metadata directly.
-- RLS remains enabled; revoke direct access from client-facing Supabase roles.
REVOKE ALL ON TABLE public.movies, public.admins, public.users FROM anon, authenticated;
