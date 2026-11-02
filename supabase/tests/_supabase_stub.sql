-- ============================================================================
-- Reproduction minimale de l'environnement Supabase pour tester les
-- migrations sur un PostgreSQL ordinaire (rôles, schéma auth, auth.uid()).
-- NE PAS exécuter sur un vrai projet Supabase : ces objets y existent déjà.
-- ============================================================================
create role anon nologin;
create role authenticated nologin;
-- Rôle du serveur (clé service_role) : ignore les règles RLS, comme sur Supabase.
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Comme sur Supabase : l'identifiant de l'utilisateur vient du jeton (JWT).
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase accorde par défaut tous les droits sur les nouvelles tables :
-- on reproduit ce comportement pour vérifier que nos migrations les retirent bien.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated;
