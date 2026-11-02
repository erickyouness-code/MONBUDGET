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
