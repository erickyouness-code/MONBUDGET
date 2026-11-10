-- ============================================================================
-- MonBudget : création COMPLÈTE de la base, en une seule fois.
-- À coller dans Supabase → SQL Editor → New query, puis cliquer sur « Run ».
-- À exécuter UNE SEULE FOIS, sur un projet neuf.
-- Fichier généré automatiquement (npm run sql:bundle) : ne pas modifier à la main.
-- ============================================================================

-- >>>>>>>>>> 20261102000000_profiles.sql
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

-- >>>>>>>>>> 20261103000000_accounts_transactions.sql
-- ============================================================================
-- Étape 2 : comptes, catégories et transactions
--
-- Principes :
--  * Les montants sont des entiers (centimes / francs), toujours positifs ;
--    c'est le TYPE (dépense, revenu, transfert) qui donne le sens.
--  * Le solde d'un compte n'est jamais stocké : il est calculé (vue
--    account_balances), donc toujours juste.
--  * Un transfert relie deux comptes du même utilisateur et n'est jamais
--    compté comme une dépense ou un revenu.
--  * Chaque utilisateur ne voit et ne modifie que ses propres données (RLS),
--    et ne peut pas rattacher une transaction au compte de quelqu'un d'autre.
-- ============================================================================

create type public.account_type as enum ('cash', 'bank', 'mobile_money', 'savings', 'other');
create type public.transaction_type as enum ('expense', 'income', 'transfer');
create type public.category_kind as enum ('expense', 'income');
create type public.payment_method as enum ('cash', 'card', 'bank_transfer', 'mobile_money', 'check', 'other');

-- ---------------------------------------------------------------------------
-- Comptes
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 50),
  type public.account_type not null,
  currency_code text not null check (currency_code in ('MAD', 'XAF')),
  -- Solde au moment de la création du compte dans l'application (peut être négatif : découvert).
  initial_balance_minor bigint not null default 0
    check (initial_balance_minor between -100000000000000 and 100000000000000),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Permet aux transactions de vérifier que le compte appartient au même utilisateur.
  unique (id, user_id)
);

create index accounts_user_idx on public.accounts (user_id);

-- ---------------------------------------------------------------------------
-- Catégories : celles du système (user_id vide, libellé traduit dans
-- l'application via `key`) et celles créées par l'utilisateur (`name`).
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete cascade,
  kind public.category_kind not null,
  key text unique check (key ~ '^[a-z_]{2,40}$'),
  name text check (char_length(btrim(name)) between 1 and 40),
  icon text check (icon ~ '^[a-z_]{2,40}$'),
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order int not null default 100,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  constraint categories_system_or_custom check (
    (user_id is null and key is not null and name is null)
    or (user_id is not null and key is null and name is not null)
  )
);

create index categories_user_idx on public.categories (user_id);

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type public.transaction_type not null,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 100000000000000),
  occurred_on date not null default current_date
    check (occurred_on between date '2000-01-01' and (current_date + 366)),
  account_id uuid not null,
  to_account_id uuid,
  category_id uuid references public.categories (id) on delete restrict,
  payment_method public.payment_method,
  description text check (description is null or char_length(description) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Les comptes utilisés doivent appartenir au même utilisateur.
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete restrict,

  -- Transfert : deux comptes différents, pas de catégorie.
  -- Dépense / revenu : une catégorie, pas de compte destinataire.
  constraint transactions_shape check (
    (type = 'transfer' and to_account_id is not null and to_account_id <> account_id and category_id is null)
    or (type <> 'transfer' and to_account_id is null and category_id is not null)
  )
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc, created_at desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_to_account_idx on public.transactions (to_account_id);
create index transactions_category_idx on public.transactions (category_id);

-- La catégorie doit être du système ou à l'utilisateur, et du bon genre
-- (une catégorie de revenu ne peut pas servir pour une dépense).
create function public.check_transaction_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cat record;
begin
  if new.category_id is null then
    return new;
  end if;
  select c.user_id, c.kind into cat from public.categories c where c.id = new.category_id;
  if not found or (cat.user_id is not null and cat.user_id <> new.user_id) then
    raise exception 'Catégorie inconnue' using errcode = 'foreign_key_violation';
  end if;
  if cat.kind::text <> new.type::text then
    raise exception 'La catégorie ne correspond pas au type de transaction' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger transactions_check_category
  before insert or update of category_id, type on public.transactions
  for each row execute function public.check_transaction_category();

-- Mise à jour automatique de updated_at (fonction créée à l'étape 1).
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Droits et règles d'accès (RLS)
-- ---------------------------------------------------------------------------
revoke all on table public.accounts, public.categories, public.transactions from anon, authenticated;

grant select, insert, delete on table public.accounts to authenticated;
grant update (name, type, currency_code, initial_balance_minor, is_archived) on table public.accounts to authenticated;

grant select, insert, delete on table public.categories to authenticated;
grant update (name, icon, color, sort_order, is_archived) on table public.categories to authenticated;

grant select, insert, delete on table public.transactions to authenticated;
grant update (type, amount_minor, occurred_on, account_id, to_account_id, category_id, payment_method, description)
  on table public.transactions to authenticated;

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy "Comptes : lecture des siens" on public.accounts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Comptes : création pour soi" on public.accounts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Comptes : modification des siens" on public.accounts
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Comptes : suppression des siens" on public.accounts
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Catégories : système + les siennes" on public.categories
  for select to authenticated using (user_id is null or (select auth.uid()) = user_id);
create policy "Catégories : création pour soi" on public.categories
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Catégories : modification des siennes" on public.categories
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Catégories : suppression des siennes" on public.categories
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Transactions : lecture des siennes" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Transactions : création pour soi" on public.transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Transactions : modification des siennes" on public.transactions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Transactions : suppression des siennes" on public.transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Soldes calculés. security_invoker : la vue applique les règles RLS de
-- l'utilisateur qui la lit (il ne voit que ses comptes).
-- ---------------------------------------------------------------------------
create view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.initial_balance_minor
    + coalesce(sum(case
        when t.type = 'income' and t.account_id = a.id then t.amount_minor
        when t.type = 'expense' and t.account_id = a.id then -t.amount_minor
        when t.type = 'transfer' and t.account_id = a.id then -t.amount_minor
        when t.type = 'transfer' and t.to_account_id = a.id then t.amount_minor
        else 0
      end), 0)::bigint as balance_minor
from public.accounts a
left join public.transactions t
  on t.account_id = a.id or t.to_account_id = a.id
group by a.id, a.initial_balance_minor;

revoke all on public.account_balances from anon, authenticated;
grant select on public.account_balances to authenticated;

-- ---------------------------------------------------------------------------
-- Catégories par défaut (libellés traduits dans l'application)
-- ---------------------------------------------------------------------------
insert into public.categories (user_id, kind, key, icon, color, sort_order) values
  (null, 'expense', 'food',          'food',          '#5B4FE0', 10),
  (null, 'expense', 'transport',     'transport',     '#4C8DF6', 20),
  (null, 'expense', 'housing',       'housing',       '#B072E8', 30),
  (null, 'expense', 'bills',         'bills',         '#F5A524', 40),
  (null, 'expense', 'phone',         'phone',         '#2BB3C0', 50),
  (null, 'expense', 'mobile_money',  'mobile_money',  '#3CC386', 60),
  (null, 'expense', 'education',     'education',     '#6C8CF5', 70),
  (null, 'expense', 'health',        'health',        '#E5566B', 80),
  (null, 'expense', 'family',        'family',        '#F08A5D', 90),
  (null, 'expense', 'leisure',       'leisure',       '#C46BD9', 100),
  (null, 'expense', 'clothing',      'clothing',      '#8E7CF0', 110),
  (null, 'expense', 'donations',     'donations',     '#4FB59A', 120),
  (null, 'expense', 'unexpected',    'unexpected',    '#D9A13B', 130),
  (null, 'expense', 'other',         'other',         '#A3A1B8', 990),
  (null, 'income',  'salary',        'salary',        '#1E9E62', 10),
  (null, 'income',  'freelance',     'freelance',     '#3CC386', 20),
  (null, 'income',  'family_support','family_support','#F08A5D', 30),
  (null, 'income',  'sales',         'sales',         '#4C8DF6', 40),
  (null, 'income',  'other_income',  'other_income',  '#A3A1B8', 990);

-- >>>>>>>>>> 20261104000000_dashboard.sql
-- ============================================================================
-- Étape 3 : données du tableau de bord
--
-- monthly_overview : pour chacun des N derniers mois, revenus, dépenses et
-- solde total en fin de mois. Les transferts n'entrent ni dans les revenus,
-- ni dans les dépenses, ni dans le solde total (ils déplacent de l'argent
-- entre vos propres comptes).
--
-- SECURITY INVOKER : la fonction s'exécute avec les droits de l'utilisateur,
-- donc les règles RLS s'appliquent — chacun ne calcule que sur ses données.
-- ============================================================================

-- Les transactions enregistrent ce qui s'est passé : pas de date future
-- (un jour de marge pour les décalages de fuseau horaire). Les paiements à
-- venir auront leur propre espace (calendrier, étape 6).
alter table public.transactions drop constraint transactions_occurred_on_check;
alter table public.transactions add constraint transactions_occurred_on_check
  check (occurred_on between date '2000-01-01' and (current_date + 1));

create function public.monthly_overview(p_until date default current_date, p_months int default 6)
returns table (
  month date,
  income_minor bigint,
  expense_minor bigint,
  end_balance_minor bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with months as (
    select (date_trunc('month', p_until) - make_interval(months => g))::date as month
    from generate_series(0, least(greatest(p_months, 1), 24) - 1) as g
  )
  select
    m.month,
    coalesce((
      select sum(t.amount_minor) from public.transactions t
      where t.type = 'income' and t.occurred_on >= m.month and t.occurred_on < (m.month + interval '1 month')
    ), 0)::bigint,
    coalesce((
      select sum(t.amount_minor) from public.transactions t
      where t.type = 'expense' and t.occurred_on >= m.month and t.occurred_on < (m.month + interval '1 month')
    ), 0)::bigint,
    (
      -- Soldes de départ des comptes existant à la fin du mois…
      coalesce((
        select sum(a.initial_balance_minor) from public.accounts a
        where a.created_at < (m.month + interval '1 month')
      ), 0)
      -- … plus tous les revenus moins toutes les dépenses jusqu'à la fin du mois.
      + coalesce((
        select sum(case when t.type = 'income' then t.amount_minor else -t.amount_minor end)
        from public.transactions t
        where t.type in ('income', 'expense') and t.occurred_on < (m.month + interval '1 month')
      ), 0)
    )::bigint
  from months m
  order by m.month;
$$;

revoke execute on function public.monthly_overview(date, int) from public, anon;
grant execute on function public.monthly_overview(date, int) to authenticated;

-- >>>>>>>>>> 20261105000000_budgets.sql
-- ============================================================================
-- Étape 4 : budgets
--
-- Un budget est un plafond mensuel : global (category_id vide) ou par
-- catégorie de dépense. Il s'applique chaque mois à partir de
-- `effective_month`, jusqu'à ce qu'il soit modifié. Ainsi, changer un plafond
-- en décembre ne réécrit pas l'historique de novembre.
-- Une ligne avec limit_minor vide signifie « plus de budget à partir de ce mois ».
-- ============================================================================

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  effective_month date not null check (extract(day from effective_month) = 1),
  limit_minor bigint check (limit_minor is null or limit_minor between 1 and 100000000000000),
  alert_threshold_pct int not null default 80 check (alert_threshold_pct between 50 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un seul réglage par catégorie (ou global) et par mois de départ.
  constraint budgets_one_per_month unique nulls not distinct (user_id, category_id, effective_month)
);

create index budgets_user_idx on public.budgets (user_id, effective_month desc);

-- Un budget ne peut viser qu'une catégorie de DÉPENSE, du système ou à soi.
create function public.check_budget_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cat record;
begin
  if new.category_id is null then
    return new;
  end if;
  select c.user_id, c.kind into cat from public.categories c where c.id = new.category_id;
  if not found or (cat.user_id is not null and cat.user_id <> new.user_id) then
    raise exception 'Catégorie inconnue' using errcode = 'foreign_key_violation';
  end if;
  if cat.kind <> 'expense' then
    raise exception 'Un budget ne peut porter que sur une catégorie de dépense' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger budgets_check_category
  before insert or update of category_id on public.budgets
  for each row execute function public.check_budget_category();

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

revoke all on table public.budgets from anon, authenticated;
grant select, insert, delete on table public.budgets to authenticated;
grant update (limit_minor, alert_threshold_pct) on table public.budgets to authenticated;

alter table public.budgets enable row level security;

create policy "Budgets : lecture des siens" on public.budgets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Budgets : création pour soi" on public.budgets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Budgets : modification des siens" on public.budgets
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Budgets : suppression des siens" on public.budgets
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Définir (ou retirer, avec p_limit_minor vide) un budget à partir du mois en cours.
-- ---------------------------------------------------------------------------
create function public.set_budget(
  p_category_id uuid,
  p_limit_minor bigint,
  p_threshold_pct int default 80
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.budgets (category_id, effective_month, limit_minor, alert_threshold_pct)
  values (p_category_id, date_trunc('month', current_date)::date, p_limit_minor, coalesce(p_threshold_pct, 80))
  on conflict (user_id, category_id, effective_month)
  do update set limit_minor = excluded.limit_minor, alert_threshold_pct = excluded.alert_threshold_pct;
$$;

-- ---------------------------------------------------------------------------
-- État des budgets pour un mois : plafond en vigueur et montant dépensé.
-- (Les transferts ne sont jamais des dépenses.)
-- ---------------------------------------------------------------------------
create function public.budget_status(p_month date default current_date)
returns table (
  category_id uuid,
  limit_minor bigint,
  alert_threshold_pct int,
  spent_minor bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select date_trunc('month', p_month)::date as start_on,
           (date_trunc('month', p_month) + interval '1 month')::date as end_on
  ),
  latest as (
    select distinct on (b.category_id) b.category_id, b.limit_minor, b.alert_threshold_pct
    from public.budgets b, bounds
    where b.effective_month <= bounds.start_on
    order by b.category_id, b.effective_month desc
  )
  select
    l.category_id,
    l.limit_minor,
    l.alert_threshold_pct,
    coalesce((
      select sum(t.amount_minor)
      from public.transactions t, bounds
      where t.type = 'expense'
        and t.occurred_on >= bounds.start_on and t.occurred_on < bounds.end_on
        and (l.category_id is null or t.category_id = l.category_id)
    ), 0)::bigint
  from latest l
  where l.limit_minor is not null;
$$;

revoke execute on function public.set_budget(uuid, bigint, int) from public, anon;
revoke execute on function public.budget_status(date) from public, anon;
grant execute on function public.set_budget(uuid, bigint, int) to authenticated;
grant execute on function public.budget_status(date) to authenticated;

-- >>>>>>>>>> 20261106000000_savings_goals.sql
-- ============================================================================
-- Étape 5 : objectifs d'épargne
--
-- Un objectif (montant cible, date limite facultative) et ses versements.
-- Un versement positif ajoute de l'argent mis de côté, un versement négatif
-- correspond à un retrait. Le total d'un objectif ne peut jamais être négatif.
-- Les versements suivent l'épargne : ils ne modifient pas le solde des comptes.
-- ============================================================================

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  icon text not null default 'piggy' check (icon ~ '^[a-z_]{2,30}$'),
  target_minor bigint not null check (target_minor between 1 and 100000000000000),
  target_date date check (target_date is null or target_date >= date '2000-01-01'),
  currency_code text not null check (currency_code in ('MAD', 'XAF')),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index savings_goals_user_idx on public.savings_goals (user_id);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  amount_minor bigint not null check (amount_minor <> 0 and abs(amount_minor) <= 100000000000000),
  occurred_on date not null default current_date
    check (occurred_on between date '2000-01-01' and (current_date + 1)),
  note text check (note is null or char_length(note) <= 100),
  -- Montant déjà épargné à la création : compte dans le total, pas dans le rythme.
  is_initial boolean not null default false,
  created_at timestamptz not null default now(),
  -- L'objectif doit appartenir au même utilisateur ; supprimer l'objectif supprime ses versements.
  foreign key (goal_id, user_id) references public.savings_goals (id, user_id) on delete cascade
);

create index goal_contributions_goal_idx on public.goal_contributions (goal_id, occurred_on desc);

-- Un retrait ne peut pas dépasser ce qui a été mis de côté.
create function public.check_goal_not_negative()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  total bigint;
begin
  select coalesce(sum(c.amount_minor), 0) into total
  from public.goal_contributions c
  where c.goal_id = new.goal_id and (tg_op = 'INSERT' or c.id <> new.id);
  if total + new.amount_minor < 0 then
    raise exception 'Le retrait dépasse le montant épargné' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger goal_contributions_not_negative
  before insert or update of amount_minor on public.goal_contributions
  for each row execute function public.check_goal_not_negative();

create trigger savings_goals_set_updated_at
  before update on public.savings_goals
  for each row execute function public.set_updated_at();

revoke all on table public.savings_goals, public.goal_contributions from anon, authenticated;
grant select, insert, delete on table public.savings_goals to authenticated;
grant update (name, icon, target_minor, target_date, is_archived) on table public.savings_goals to authenticated;
grant select, insert, delete on table public.goal_contributions to authenticated;
grant update (amount_minor, occurred_on, note) on table public.goal_contributions to authenticated;

alter table public.savings_goals enable row level security;
alter table public.goal_contributions enable row level security;

create policy "Objectifs : lecture des siens" on public.savings_goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Objectifs : création pour soi" on public.savings_goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Objectifs : modification des siens" on public.savings_goals
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Objectifs : suppression des siens" on public.savings_goals
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Versements : lecture des siens" on public.goal_contributions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Versements : création pour soi" on public.goal_contributions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Versements : modification des siens" on public.goal_contributions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Versements : suppression des siens" on public.goal_contributions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Progression de chaque objectif : total épargné et rythme récent (90 jours),
-- qui sert à ESTIMER une date d'atteinte dans l'application.
-- ---------------------------------------------------------------------------
create view public.goal_progress
with (security_invoker = true)
as
select
  g.id as goal_id,
  coalesce(sum(c.amount_minor), 0)::bigint as saved_minor,
  coalesce(sum(c.amount_minor) filter (where c.occurred_on > current_date - 90 and not c.is_initial), 0)::bigint as saved_last_90_minor,
  max(c.occurred_on) as last_contribution_on
from public.savings_goals g
left join public.goal_contributions c on c.goal_id = g.id
group by g.id;

revoke all on public.goal_progress from anon, authenticated;
grant select on public.goal_progress to authenticated;

-- >>>>>>>>>> 20261107000000_schedule.sql
-- ============================================================================
-- Étape 6 : calendrier financier
--
-- scheduled_items : factures, abonnements, revenus attendus, paiements prévus
-- et rappels, ponctuels ou récurrents. Les dates d'échéance sont calculées
-- dans l'application à partir de start_date et de la fréquence.
-- scheduled_completions : une échéance précise marquée « payée / reçue »
-- (avec la transaction créée) ou « ignorée ».
-- ============================================================================

-- Permet de vérifier qu'un règlement pointe vers une transaction du même utilisateur.
alter table public.transactions add constraint transactions_id_user_unique unique (id, user_id);

create type public.schedule_kind as enum ('bill', 'subscription', 'income', 'payment', 'reminder');
create type public.schedule_frequency as enum ('once', 'weekly', 'monthly', 'yearly');
create type public.completion_status as enum ('paid', 'skipped');

create table public.scheduled_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.schedule_kind not null,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  -- Vide pour un simple rappel ; sinon montant positif (le sens vient du type).
  amount_minor bigint check (amount_minor is null or amount_minor between 1 and 100000000000000),
  category_id uuid references public.categories (id) on delete set null,
  account_id uuid,
  frequency public.schedule_frequency not null default 'monthly',
  interval_count int not null default 1 check (interval_count between 1 and 12),
  start_date date not null check (start_date >= date '2000-01-01'),
  end_date date check (end_date is null or end_date >= start_date),
  remind_days_before int check (remind_days_before is null or remind_days_before between 0 and 14),
  is_active boolean not null default true,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete set null (account_id),
  constraint scheduled_items_reminder_no_amount check (kind <> 'reminder' or amount_minor is null),
  constraint scheduled_items_money_has_amount check (kind = 'reminder' or amount_minor is not null)
);

create index scheduled_items_user_idx on public.scheduled_items (user_id);

create table public.scheduled_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null,
  due_on date not null,
  status public.completion_status not null,
  transaction_id uuid,
  created_at timestamptz not null default now(),
  foreign key (item_id, user_id) references public.scheduled_items (id, user_id) on delete cascade,
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete set null (transaction_id),
  -- Une échéance ne se règle qu'une fois.
  unique (item_id, due_on)
);

create index scheduled_completions_item_idx on public.scheduled_completions (item_id, due_on);

-- Catégorie : du système ou à soi, et du bon genre (revenu pour un revenu attendu).
create function public.check_schedule_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cat record;
begin
  if new.category_id is null then
    return new;
  end if;
  select c.user_id, c.kind into cat from public.categories c where c.id = new.category_id;
  if not found or (cat.user_id is not null and cat.user_id <> new.user_id) then
    raise exception 'Catégorie inconnue' using errcode = 'foreign_key_violation';
  end if;
  if (new.kind = 'income') <> (cat.kind = 'income') then
    raise exception 'La catégorie ne correspond pas au type d''échéance' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger scheduled_items_check_category
  before insert or update of category_id, kind on public.scheduled_items
  for each row execute function public.check_schedule_category();

create trigger scheduled_items_set_updated_at
  before update on public.scheduled_items
  for each row execute function public.set_updated_at();

revoke all on table public.scheduled_items, public.scheduled_completions from anon, authenticated;
grant select, insert, delete on table public.scheduled_items to authenticated;
grant update (kind, title, amount_minor, category_id, account_id, frequency, interval_count, start_date, end_date,
  remind_days_before, is_active, note) on table public.scheduled_items to authenticated;
-- L'application règle les échéances via les fonctions ci-dessous (opération atomique :
-- la dépense n'est jamais créée en double). Les droits restent limités par RLS.
grant select, insert, delete on table public.scheduled_completions to authenticated;

alter table public.scheduled_items enable row level security;
alter table public.scheduled_completions enable row level security;

create policy "Échéances : lecture des siennes" on public.scheduled_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Échéances : création pour soi" on public.scheduled_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Échéances : modification des siennes" on public.scheduled_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Échéances : suppression des siennes" on public.scheduled_items
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Règlements : lecture des siens" on public.scheduled_completions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Règlements : création pour soi" on public.scheduled_completions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Règlements : suppression des siens" on public.scheduled_completions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Régler une échéance. Si elle est « payée » et a un montant, la dépense (ou le
-- revenu) est enregistrée dans les transactions, dans la même opération.
-- SECURITY INVOKER : tout passe par les règles RLS de l'utilisateur.
-- ---------------------------------------------------------------------------
create function public.complete_occurrence(
  p_item_id uuid,
  p_due_on date,
  p_status public.completion_status,
  p_account_id uuid default null,
  p_occurred_on date default current_date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item public.scheduled_items;
  tx_id uuid;
  completion_id uuid;
  fallback_category uuid;
begin
  select * into item from public.scheduled_items where id = p_item_id;
  if not found then
    raise exception 'Échéance introuvable' using errcode = 'no_data_found';
  end if;

  if p_status = 'paid' and item.amount_minor is not null then
    if coalesce(p_account_id, item.account_id) is null then
      raise exception 'Choisissez un compte' using errcode = 'not_null_violation';
    end if;
    -- Sans catégorie choisie : « Autres » / « Autres revenus ».
    if item.category_id is null then
      select id into fallback_category from public.categories
      where key = case when item.kind = 'income' then 'other_income' else 'other' end;
    end if;
    insert into public.transactions (type, amount_minor, occurred_on, account_id, category_id, description)
    values (
      case when item.kind = 'income' then 'income'::public.transaction_type else 'expense'::public.transaction_type end,
      item.amount_minor,
      least(p_occurred_on, current_date),
      coalesce(p_account_id, item.account_id),
      coalesce(item.category_id, fallback_category),
      item.title
    )
    returning id into tx_id;
  end if;

  insert into public.scheduled_completions (item_id, due_on, status, transaction_id)
  values (p_item_id, p_due_on, p_status, tx_id)
  returning id into completion_id;
  return completion_id;
end;
$$;

-- Annuler un règlement : supprime aussi la transaction qu'il avait créée.
create function public.undo_occurrence(p_completion_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tx_id uuid;
begin
  delete from public.scheduled_completions where id = p_completion_id returning transaction_id into tx_id;
  if tx_id is not null then
    delete from public.transactions where id = tx_id;
  end if;
end;
$$;

revoke execute on function public.complete_occurrence(uuid, date, public.completion_status, uuid, date) from public, anon;
revoke execute on function public.undo_occurrence(uuid) from public, anon;
grant execute on function public.complete_occurrence(uuid, date, public.completion_status, uuid, date) to authenticated;
grant execute on function public.undo_occurrence(uuid) to authenticated;

-- >>>>>>>>>> 20261108000000_subscriptions.sql
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

-- >>>>>>>>>> 20261109000000_assistant.sql
-- ============================================================================
-- Étape 9 : assistant financier conversationnel
--
-- profiles.assistant_consent_at : date à laquelle l'utilisateur a accepté que
--   des résumés de SES données soient envoyés au fournisseur d'IA pour répondre
--   à ses questions. Null = refus (par défaut) : la fonction serveur refuse
--   alors de répondre. L'utilisateur peut retirer son accord à tout moment.
-- assistant_usage : compteur de questions par jour (limite anti-abus et
--   maîtrise des coûts) et nombre de jetons consommés. AUCUN contenu de
--   conversation n'est stocké.
-- ============================================================================

alter table public.profiles add column assistant_consent_at timestamptz;
grant update (assistant_consent_at) on table public.profiles to authenticated;

create table public.assistant_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests int not null default 0 check (requests >= 0),
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  -- Fenêtre glissante d'une minute (limite de rafale).
  window_start timestamptz not null default now(),
  window_count int not null default 0,
  primary key (user_id, day)
);

comment on table public.assistant_usage is 'Quota de l''assistant. Écrit uniquement par le serveur.';

alter table public.assistant_usage enable row level security;
revoke all on table public.assistant_usage from anon, authenticated;
-- L'utilisateur peut voir sa consommation (questions restantes), sans la modifier.
grant select on table public.assistant_usage to authenticated;
create policy "Lecture de sa propre consommation" on public.assistant_usage
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Réserve une question pour l'utilisateur. Renvoie 'ok', 'daily_limit' ou
-- 'rate_limit'. Exécutable UNIQUEMENT par le serveur (clé service_role) : un
-- utilisateur ne peut ni contourner ni remettre à zéro son quota.
-- Journée comptée en heure UTC.
-- ---------------------------------------------------------------------------
create function public.assistant_consume(p_user uuid, p_daily int, p_per_minute int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_row public.assistant_usage;
  v_recent boolean;
begin
  insert into public.assistant_usage (user_id, day) values (p_user, v_day)
  on conflict (user_id, day) do nothing;

  select * into v_row from public.assistant_usage
  where user_id = p_user and day = v_day
  for update;

  if v_row.requests >= p_daily then
    return 'daily_limit';
  end if;
  v_recent := v_row.window_start > now() - interval '1 minute';
  if v_recent and v_row.window_count >= p_per_minute then
    return 'rate_limit';
  end if;

  update public.assistant_usage set
    requests = requests + 1,
    window_start = case when v_recent then window_start else now() end,
    window_count = case when v_recent then window_count + 1 else 1 end
  where user_id = p_user and day = v_day;
  return 'ok';
end;
$$;

-- Ajoute les jetons consommés (suivi des coûts).
create function public.assistant_record_usage(p_user uuid, p_input bigint, p_output bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.assistant_usage
  set input_tokens = input_tokens + greatest(p_input, 0),
      output_tokens = output_tokens + greatest(p_output, 0)
  where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;

revoke all on function public.assistant_consume(uuid, int, int) from public, anon, authenticated;
revoke all on function public.assistant_record_usage(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.assistant_consume(uuid, int, int) to service_role;
grant execute on function public.assistant_record_usage(uuid, bigint, bigint) to service_role;
