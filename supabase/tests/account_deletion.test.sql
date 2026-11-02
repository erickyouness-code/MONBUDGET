-- ============================================================================
-- Tests : suppression de compte. Supprimer l'utilisateur (auth.users) doit
-- effacer TOUTES ses données, sans toucher à celles des autres.
-- ============================================================================
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'partant@example.com'),
  ('00000000-0000-0000-0000-0000000000e2', 'reste@example.com');

-- Jeu de données complet pour l'utilisateur qui part (E1) et un peu pour E2.
insert into public.entitlements (user_id, store, period_type, expires_at)
values ('00000000-0000-0000-0000-0000000000e1', 'app_store', 'normal', now() + interval '20 days'),
       ('00000000-0000-0000-0000-0000000000e2', 'app_store', 'normal', now() + interval '20 days');
insert into public.billing_events (id, user_id, type) values ('evt_e1', '00000000-0000-0000-0000-0000000000e1', 'INITIAL_PURCHASE');
insert into public.assistant_usage (user_id, day, requests) values ('00000000-0000-0000-0000-0000000000e1', current_date, 3);

insert into public.accounts (id, user_id, name, type, currency_code) values
  ('eeeeeeee-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'Espèces', 'cash', 'MAD'),
  ('eeeeeeee-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', 'Banque', 'bank', 'MAD'),
  ('eeeeeeee-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e2', 'Espèces', 'cash', 'MAD');
insert into public.categories (id, user_id, kind, name) values
  ('eeeeeeee-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'expense', 'Café');
insert into public.transactions (id, user_id, type, amount_minor, account_id, to_account_id, category_id) values
  ('eeeeeeee-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'expense', 2500, 'eeeeeeee-0000-0000-0000-000000000001', null, 'eeeeeeee-0000-0000-0000-0000000000c1'),
  ('eeeeeeee-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e1', 'transfer', 10000, 'eeeeeeee-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', null);
insert into public.transactions (user_id, type, amount_minor, account_id, category_id)
select '00000000-0000-0000-0000-0000000000e2', 'expense', 900, 'eeeeeeee-0000-0000-0000-000000000003', id from public.categories where key = 'food';
insert into public.budgets (user_id, category_id, effective_month, limit_minor) values
  ('00000000-0000-0000-0000-0000000000e1', 'eeeeeeee-0000-0000-0000-0000000000c1', date_trunc('month', current_date)::date, 50000),
  ('00000000-0000-0000-0000-0000000000e1', null, date_trunc('month', current_date)::date, 300000);
insert into public.savings_goals (id, user_id, name, target_minor, currency_code) values
  ('eeeeeeee-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'Voyage', 500000, 'MAD');
insert into public.goal_contributions (user_id, goal_id, amount_minor, is_initial) values
  ('00000000-0000-0000-0000-0000000000e1', 'eeeeeeee-0000-0000-0000-0000000000a1', 100000, true),
  ('00000000-0000-0000-0000-0000000000e1', 'eeeeeeee-0000-0000-0000-0000000000a1', -40000, false);
insert into public.scheduled_items (id, user_id, kind, title, amount_minor, account_id, frequency, start_date) values
  ('eeeeeeee-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', 'bill', 'Loyer', 250000, 'eeeeeeee-0000-0000-0000-000000000001', 'monthly', current_date - 40);
insert into public.scheduled_completions (user_id, item_id, due_on, status, transaction_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'eeeeeeee-0000-0000-0000-0000000000b1', current_date - 40, 'paid', 'eeeeeeee-0000-0000-0000-0000000000f1');

-- Ce que fait le serveur (fonction delete-account, clé service_role).
delete from auth.users where id = '00000000-0000-0000-0000-0000000000e1';

do $$
declare
  v_user constant uuid := '00000000-0000-0000-0000-0000000000e1';
begin
  assert not exists (select 1 from public.profiles where id = v_user), 'profil effacé';
  assert not exists (select 1 from public.accounts where user_id = v_user), 'comptes effacés';
  assert not exists (select 1 from public.categories where user_id = v_user), 'catégories personnelles effacées';
  assert not exists (select 1 from public.transactions where user_id = v_user), 'transactions effacées';
  assert not exists (select 1 from public.budgets where user_id = v_user), 'budgets effacés';
  assert not exists (select 1 from public.savings_goals where user_id = v_user), 'objectifs effacés';
  assert not exists (select 1 from public.goal_contributions where user_id = v_user), 'versements effacés';
  assert not exists (select 1 from public.scheduled_items where user_id = v_user), 'échéances effacées';
  assert not exists (select 1 from public.scheduled_completions where user_id = v_user), 'règlements effacés';
  assert not exists (select 1 from public.entitlements where user_id = v_user), 'droit d''accès effacé';
  assert not exists (select 1 from public.assistant_usage where user_id = v_user), 'consommation de l''assistant effacée';
  -- Le journal de paiement est conservé (obligations comptables) mais anonymisé.
  assert (select user_id from public.billing_events where id = 'evt_e1') is null, 'journal de paiement anonymisé';
  -- L'autre utilisateur n'est pas touché ; les catégories système restent.
  assert (select count(*) from public.transactions where user_id = '00000000-0000-0000-0000-0000000000e2') = 1, 'données de E2 intactes';
  assert exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000e2'), 'profil de E2 intact';
  assert (select count(*) from public.categories where user_id is null) = 19, 'catégories système intactes';
end $$;

rollback;
\echo '✔ suppression de compte : toutes les données de l''utilisateur effacées, rien d''autre'
