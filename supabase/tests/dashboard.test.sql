-- ============================================================================
-- Tests : monthly_overview (revenus, dépenses, solde de fin de mois).
-- ============================================================================
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@example.com');

-- Comptes créés « il y a longtemps » pour que leur solde initial compte dans l'historique.
insert into public.accounts (id, user_id, name, type, currency_code, initial_balance_minor, created_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Espèces', 'cash', 'MAD', 100000, '2026-01-01'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'Banque', 'bank', 'MAD', 500000, '2026-01-01'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'B', 'bank', 'MAD', 99999900, '2026-01-01');

-- Septembre : salaire 8 000, courses 1 000. Octobre : courses 2 000 + transfert 3 000.
insert into public.transactions (user_id, type, amount_minor, occurred_on, account_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', 'income', 800000, '2026-09-25', 'aaaaaaaa-0000-0000-0000-000000000002', id from public.categories where key = 'salary';
insert into public.transactions (user_id, type, amount_minor, occurred_on, account_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', 'expense', 100000, '2026-09-30', 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where key = 'food';
insert into public.transactions (user_id, type, amount_minor, occurred_on, account_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', 'expense', 200000, '2026-10-01', 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where key = 'food';
insert into public.transactions (user_id, type, amount_minor, occurred_on, account_id, to_account_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'transfer', 300000, '2026-10-05', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');
-- Une grosse dépense de B, qui ne doit jamais apparaître chez A.
insert into public.transactions (user_id, type, amount_minor, occurred_on, account_id, category_id)
select '00000000-0000-0000-0000-0000000000b2', 'expense', 7777700, '2026-10-02', 'bbbbbbbb-0000-0000-0000-000000000001', id from public.categories where key = 'food';

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true); end $$;

do $$
declare
  sep record;
  oct record;
  nov record;
begin
  assert (select count(*) from public.monthly_overview('2026-11-15', 6)) = 6, '6 mois attendus';
  assert (select min(month) from public.monthly_overview('2026-11-15', 6)) = '2026-06-01', 'Le premier mois doit être juin';

  select * into sep from public.monthly_overview('2026-11-15', 6) where month = '2026-09-01';
  select * into oct from public.monthly_overview('2026-11-15', 6) where month = '2026-10-01';
  select * into nov from public.monthly_overview('2026-11-15', 6) where month = '2026-11-01';

  assert sep.income_minor = 800000 and sep.expense_minor = 100000, 'Totaux de septembre incorrects';
  -- 6 000 de départ + 8 000 − 1 000 = 13 000 DH
  assert sep.end_balance_minor = 1300000, format('Solde fin septembre incorrect : %s', sep.end_balance_minor);
  -- Le transfert de 3 000 ne compte ni en dépense ni dans le solde total.
  assert oct.income_minor = 0 and oct.expense_minor = 200000, 'Le transfert ne doit pas compter en octobre';
  assert oct.end_balance_minor = 1100000, format('Solde fin octobre incorrect : %s', oct.end_balance_minor);
  assert nov.end_balance_minor = 1100000, 'Novembre sans mouvement : solde inchangé';

  -- Le solde de fin de mois correspond à la somme des soldes des comptes.
  assert nov.end_balance_minor = (select sum(balance_minor) from public.account_balances), 'Incohérence avec account_balances';

  -- Bornes du nombre de mois.
  assert (select count(*) from public.monthly_overview('2026-11-15', 0)) = 1, 'Au moins un mois';
  assert (select count(*) from public.monthly_overview('2026-11-15', 500)) = 24, 'Au plus 24 mois';
end $$;

-- Date future refusée (au-delà d'un jour de marge).
do $$ begin
  begin
    insert into public.transactions (type, amount_minor, occurred_on, account_id, category_id)
    select 'expense', 100, current_date + 10, 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where key = 'food';
    raise exception 'Une transaction datée dans le futur doit être refusée';
  exception when check_violation then null;
  end;
end $$;

-- B ne voit que ses propres chiffres.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true); end $$;
do $$ begin
  assert (select expense_minor from public.monthly_overview('2026-11-15', 6) where month = '2026-10-01') = 7777700, 'B doit voir sa dépense';
  assert (select income_minor from public.monthly_overview('2026-11-15', 6) where month = '2026-09-01') = 0, 'B ne doit pas voir le salaire de A';
end $$;

-- Visiteur non connecté : refusé.
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.monthly_overview();
    raise exception 'Un visiteur ne doit pas pouvoir appeler monthly_overview';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;

\echo '✔ tableau de bord : totaux mensuels et soldes de fin de mois justes'
