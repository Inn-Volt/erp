-- Al crear la base: cuánto dura la sesión (Supabase autoalojado oficial, docker/volumes/db/jwt.sql).
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
