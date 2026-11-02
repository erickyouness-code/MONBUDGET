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
