-- ============================================================================
-- Tests : budgets (plafonds, historique, dépenses, sécurité).
-- ============================================================================
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@example.com');

insert into public.accounts (id, user_id, name, type, currency_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Espèces', 'cash', 'MAD'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'B', 'cash', 'MAD');

-- A : ce mois-ci, 600 DH d'alimentation, 150 DH de transport, un salaire et un transfert.
insert into public.transactions (user_id, type, amount_minor, occurred_on, account_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', 'expense', 60000, date_trunc('month', current_date)::date, 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where key = 'food';
insert into public.transactions (user_id, type, amount_minor, occurred_on, account_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', 'expense', 15000, date_trunc('month', current_date)::date, 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where key = 'transport';
insert into public.transactions (user_id, type, amount_minor, occurred_on, account_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', 'income', 900000, date_trunc('month', current_date)::date, 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where key = 'salary';
-- Dépense du mois précédent : ne doit pas compter ce mois-ci.
insert into public.transactions (user_id, type, amount_minor, occurred_on, account_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', 'expense', 99900, (date_trunc('month', current_date) - interval '1 day')::date, 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where key = 'food';
-- B dépense beaucoup en alimentation : jamais visible chez A.
insert into public.transactions (user_id, type, amount_minor, occurred_on, account_id, category_id)
select '00000000-0000-0000-0000-0000000000b2', 'expense', 5000000, date_trunc('month', current_date)::date, 'bbbbbbbb-0000-0000-0000-000000000001', id from public.categories where key = 'food';

-- Budget de B (pour vérifier l'isolement).
insert into public.budgets (user_id, category_id, effective_month, limit_minor)
select '00000000-0000-0000-0000-0000000000b2', id, date_trunc('month', current_date)::date, 100 from public.categories where key = 'food';

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true); end $$;

-- Budget global 5 000 DH, alimentation 700 DH (seuil 80 %).
do $$ begin perform public.set_budget(null, 500000, 80); end $$;
do $$ begin perform public.set_budget((select id from public.categories where key = 'food'), 70000, 80); end $$;

do $$
declare
  g record;
  f record;
begin
  assert (select count(*) from public.budget_status()) = 2, 'A doit avoir exactement 2 budgets';
  select * into g from public.budget_status() where category_id is null;
  select * into f from public.budget_status() where category_id = (select id from public.categories where key = 'food');
  -- Global : toutes les dépenses du mois (600 + 150), pas le revenu, pas le mois précédent.
  assert g.limit_minor = 500000 and g.spent_minor = 75000, format('Budget global incorrect : %s / %s', g.spent_minor, g.limit_minor);
  assert f.limit_minor = 70000 and f.spent_minor = 60000, format('Budget alimentation incorrect : %s', f.spent_minor);
end $$;

-- Modifier le plafond le même mois : mise à jour, pas de doublon.
do $$ begin perform public.set_budget(null, 600000, 90); end $$;
do $$ begin
  assert (select count(*) from public.budgets where category_id is null) = 1, 'Pas de doublon pour le même mois';
  assert (select limit_minor from public.budget_status() where category_id is null) = 600000, 'Le plafond doit être modifié';
  assert (select alert_threshold_pct from public.budget_status() where category_id is null) = 90, 'Le seuil doit être modifié';
end $$;

-- Historique : un ancien réglage (mois précédent) reste valable pour ce mois-là.
insert into public.budgets (category_id, effective_month, limit_minor)
values (null, (date_trunc('month', current_date) - interval '1 month')::date, 300000);
do $$ begin
  assert (select limit_minor from public.budget_status((date_trunc('month', current_date) - interval '1 month')::date) where category_id is null) = 300000,
    'Le mois précédent garde son ancien plafond';
  assert (select spent_minor from public.budget_status((date_trunc('month', current_date) - interval '1 month')::date) where category_id is null) = 99900,
    'Dépenses du mois précédent incorrectes';
  assert (select limit_minor from public.budget_status() where category_id is null) = 600000, 'Le mois en cours garde le nouveau plafond';
end $$;

-- Retirer un budget : il disparaît à partir de ce mois.
do $$ begin perform public.set_budget((select id from public.categories where key = 'food'), null, 80); end $$;
do $$ begin
  assert (select count(*) from public.budget_status() where category_id is not null) = 0, 'Le budget alimentation doit être retiré';
end $$;

-- Règles de validité.
do $$ begin
  begin
    perform public.set_budget((select id from public.categories where key = 'salary'), 1000, 80);
    raise exception 'Un budget sur une catégorie de revenu doit être refusé';
  exception when check_violation then null;
  end;
  begin
    perform public.set_budget(null, 0, 80);
    raise exception 'Un plafond nul doit être refusé';
  exception when check_violation then null;
  end;
  begin
    perform public.set_budget(null, 1000, 20);
    raise exception 'Un seuil d''alerte de 20 %% doit être refusé';
  exception when check_violation then null;
  end;
  begin
    insert into public.budgets (user_id, category_id, effective_month, limit_minor)
      values ('00000000-0000-0000-0000-0000000000b2', null, date_trunc('month', current_date)::date, 100);
    raise exception 'A ne doit pas créer de budget pour B';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B ne voit que son budget et ses dépenses.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true); end $$;
do $$ begin
  assert (select count(*) from public.budget_status()) = 1, 'B ne doit voir que son budget';
  assert (select spent_minor from public.budget_status()) = 5000000, 'B doit voir ses propres dépenses';
  assert (select count(*) from public.budgets) = 1, 'B ne doit pas voir les budgets de A';
end $$;

reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.budget_status();
    raise exception 'Un visiteur ne doit pas lire les budgets';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;

\echo '✔ budgets : plafonds, historique et règles de sécurité respectés'
