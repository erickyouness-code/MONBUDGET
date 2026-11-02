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
