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
