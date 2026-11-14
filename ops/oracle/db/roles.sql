-- Al crear la base por primera vez: las claves de los roles que usan los servicios (login, API,
-- archivos). Tomado del Supabase autoalojado oficial (docker/volumes/db/roles.sql), sin
-- supabase_functions_admin: ese rol lo crea la pieza de webhooks, que la ERP no usa.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
