-- ============================================================================
-- Tests : abonnement Premium (droit d'accès, verrouillage côté serveur).
-- ============================================================================
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'premium@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'expire@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'sans@example.com');

-- A : essai en cours ; B : abonnement expiré hier ; C : jamais abonné.
insert into public.entitlements (user_id, product_id, store, period_type, expires_at, will_renew) values
  ('00000000-0000-0000-0000-0000000000a1', 'monbudget_premium_monthly', 'app_store', 'trial', now() + interval '3 days', true),
  ('00000000-0000-0000-0000-0000000000b2', 'monbudget_premium_monthly', 'play_store', 'normal', now() - interval '1 day', false);

insert into public.accounts (id, user_id, name, type, currency_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Espèces', 'cash', 'MAD'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'Espèces', 'cash', 'MAD');
-- Une ancienne transaction de B (de l'époque où il était abonné).
insert into public.transactions (id, user_id, type, amount_minor, account_id, category_id)
select 'bbbbbbbb-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b2', 'expense', 5000, 'bbbbbbbb-0000-0000-0000-000000000001', id
from public.categories where key = 'food';

set local role authenticated;

-- ---------- A (essai actif) : tout est permis ----------
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true); end $$;
do $$ begin
  assert public.has_premium(), 'A doit avoir accès pendant l''essai';
  assert (select period_type from public.entitlements) = 'trial', 'A doit voir son essai';
end $$;
insert into public.transactions (type, amount_minor, account_id, category_id)
select 'expense', 1000, 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where key = 'food';
do $$ begin perform public.set_budget(null, 500000, 80); end $$;

-- L'utilisateur ne peut PAS s'accorder l'accès lui-même.
do $$ begin
  begin
    update public.entitlements set expires_at = now() + interval '10 years';
    raise exception 'Un utilisateur ne doit pas pouvoir prolonger son abonnement';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.billing_events (id, type) values ('fake', 'INITIAL_PURCHASE');
    raise exception 'Un utilisateur ne doit pas écrire dans le journal des paiements';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- B (expiré) : lecture et suppression oui, création non ----------
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true); end $$;
do $$ begin
  assert not public.has_premium(), 'B ne doit plus avoir accès';
  assert (select count(*) from public.transactions) = 1, 'B doit toujours pouvoir lire ses données';
  begin
    insert into public.transactions (type, amount_minor, account_id, category_id)
    select 'expense', 1000, 'bbbbbbbb-0000-0000-0000-000000000001', id from public.categories where key = 'food';
    raise exception 'B ne doit pas pouvoir créer de transaction sans abonnement';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_budget(null, 100000, 80);
    raise exception 'B ne doit pas pouvoir créer de budget sans abonnement';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.savings_goals (name, target_minor, currency_code) values ('Voyage', 100000, 'MAD');
    raise exception 'B ne doit pas pouvoir créer d''objectif sans abonnement';
  exception when insufficient_privilege then null;
  end;
end $$;
-- Modifier : aucune ligne touchée (la règle restrictive masque la ligne).
do $$
declare n int;
begin
  update public.transactions set amount_minor = 1 where id = 'bbbbbbbb-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  assert n = 0, 'B ne doit pas pouvoir modifier ses transactions sans abonnement';
end $$;
-- Supprimer ses données reste possible.
delete from public.transactions where id = 'bbbbbbbb-0000-0000-0000-0000000000f1';
do $$ begin
  assert (select count(*) from public.transactions) = 0, 'B doit pouvoir supprimer ses données';
end $$;

-- ---------- C (jamais abonné) : peut créer son compte, pas de transaction ----------
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true); end $$;
insert into public.accounts (name, type, currency_code) values ('Espèces', 'cash', 'MAD');
do $$ begin
  assert (select count(*) from public.entitlements) = 0, 'C n''a pas de droit d''accès';
  assert (select count(*) from public.entitlements where user_id = '00000000-0000-0000-0000-0000000000a1') = 0, 'C ne voit pas celui de A';
end $$;

-- Visiteur non connecté.
reset role;
set local role anon;
do $$ begin
  begin
    perform public.has_premium();
    raise exception 'Un visiteur ne doit pas appeler has_premium';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;

\echo '✔ abonnement : accès Premium vérifié par le serveur, écritures verrouillées sans abonnement'
