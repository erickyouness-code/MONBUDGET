-- ============================================================================
-- Étape 8 : abonnement Premium
--
-- entitlements : droit d'accès de chaque utilisateur. Écrit UNIQUEMENT par le
--   serveur (fonctions Edge avec la clé service_role), à partir de l'état
--   officiel renvoyé par RevenueCat (App Store / Google Play).
-- billing_events : journal des notifications reçues (anti-doublon, audit).
-- has_premium() : utilisé par les règles RLS. Sans abonnement actif (essai
--   compris), l'utilisateur peut LIRE, EXPORTER et SUPPRIMER ses données, mais
--   pas en créer ou en modifier.
-- ============================================================================

create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  product_id text,
  store text check (store in ('app_store', 'play_store', 'stripe', 'promotional', 'manual', 'unknown')),
  period_type text check (period_type in ('trial', 'intro', 'normal', 'prepaid')),
  -- Fin de la période payée ou de l'essai (null : aucun accès).
  expires_at timestamptz,
  will_renew boolean not null default false,
  billing_issue boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.entitlements is 'Droit d''accès Premium. Écrit uniquement par le serveur (RevenueCat).';

create table public.billing_events (
  id text primary key,                 -- identifiant de l'événement RevenueCat
  user_id uuid references auth.users (id) on delete set null,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;
alter table public.billing_events enable row level security;

revoke all on table public.entitlements, public.billing_events from anon, authenticated;
-- L'utilisateur peut seulement LIRE son propre droit d'accès. Aucune écriture.
grant select on table public.entitlements to authenticated;

create policy "Abonnement : lecture du sien" on public.entitlements
  for select to authenticated using ((select auth.uid()) = user_id);
-- billing_events : aucune règle → inaccessible aux utilisateurs (seul le serveur y écrit).

-- ---------------------------------------------------------------------------
-- Accès Premium actif ? (essai compris). SECURITY DEFINER : lit la table même
-- si elle était un jour restreinte, mais uniquement pour l'utilisateur courant.
-- ---------------------------------------------------------------------------
create function public.has_premium()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = (select auth.uid()) and e.expires_at > now()
  );
$$;

revoke execute on function public.has_premium() from public, anon;
grant execute on function public.has_premium() to authenticated;

-- ---------------------------------------------------------------------------
-- Verrouillage des écritures sans abonnement.
-- Les comptes restent libres (création du compte « Espèces » à l'inscription),
-- ainsi que la LECTURE et la SUPPRESSION de toutes les données.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['transactions', 'budgets', 'savings_goals', 'goal_contributions', 'scheduled_items', 'scheduled_completions', 'categories']
  loop
    execute format(
      'create policy "Premium requis pour créer" on public.%I as restrictive for insert to authenticated with check ((select public.has_premium()))',
      t
    );
    if t not in ('scheduled_completions') then
      execute format(
        'create policy "Premium requis pour modifier" on public.%I as restrictive for update to authenticated using ((select public.has_premium()))',
        t
      );
    end if;
  end loop;
end;
$$;
