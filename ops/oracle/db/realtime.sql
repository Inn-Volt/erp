-- Al crear la base: el esquema de los avisos en vivo (la campanita). Supabase autoalojado oficial,
-- docker/volumes/db/realtime.sql, con el dueño escrito (supabase_admin) en vez de leerlo del entorno.
create schema if not exists _realtime;
alter schema _realtime owner to supabase_admin;
