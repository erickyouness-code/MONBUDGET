-- ============================================================================
-- Étape 1 : profils utilisateurs
--
-- Un profil est créé automatiquement à l'inscription (déclencheur sur
-- auth.users). Chaque utilisateur ne peut lire et modifier QUE son profil,
-- grâce à la sécurité au niveau des lignes (RLS).
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
  country_code text check (country_code in ('MA', 'GA')),
  currency_code text check (currency_code in ('MAD', 'XAF')),
  language text not null default 'fr' check (language in ('fr', 'ar', 'en')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- On ne peut pas terminer l'accueil sans pays ni devise.
  constraint profiles_onboarding_complete check (
    onboarding_completed_at is null or (country_code is not null and currency_code is not null)
  )
);

comment on table public.profiles is 'Préférences de chaque utilisateur (pays, devise, langue). Aucune donnée bancaire.';

-- ---------------------------------------------------------------------------
-- Droits : par défaut Supabase donne tous les droits aux rôles anon et
-- authenticated. On les retire puis on n'accorde que le strict nécessaire.
-- ---------------------------------------------------------------------------
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
-- Seules ces colonnes sont modifiables par l'utilisateur (pas id, ni les dates système).
grant update (display_name, country_code, currency_code, language, onboarding_completed_at)
  on table public.profiles to authenticated;
-- Pas d'INSERT (fait par le déclencheur) ni de DELETE (suppression de compte
-- gérée côté serveur à l'étape 10).

alter table public.profiles enable row level security;

create policy "Lecture de son propre profil"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Modification de son propre profil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- Mise à jour automatique de updated_at
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Création du profil à l'inscription. La langue choisie dans l'application est
-- transmise dans les métadonnées ; toute valeur inattendue retombe sur 'fr'.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_language text := new.raw_user_meta_data ->> 'language';
begin
  insert into public.profiles (id, language)
  values (
    new.id,
    case when requested_language in ('fr', 'ar', 'en') then requested_language else 'fr' end
  );
  return new;
end;
$$;

-- Cette fonction ne doit jamais être appelée directement par un client.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
