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
