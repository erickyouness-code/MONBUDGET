-- ============================================================================
-- Tests : comptes, catégories, transactions et soldes.
-- ============================================================================
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@example.com');

-- Étape 8 : ces utilisateurs de test ont un abonnement actif (les écritures l'exigent).
insert into public.entitlements (user_id, expires_at) select id, now() + interval '30 days' from auth.users;

-- Comptes de B (créés en administrateur pour les besoins du test).
insert into public.accounts (id, user_id, name, type, currency_code) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'Compte de B', 'bank', 'XAF');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true); end $$;

-- ---------- Comptes ----------
insert into public.accounts (id, name, type, currency_code, initial_balance_minor) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Espèces', 'cash', 'MAD', 50000),       -- 500 DH
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Banque', 'bank', 'MAD', 1000000),       -- 10 000 DH
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Mobile Money', 'mobile_money', 'MAD', 0);

do $$ begin
  assert (select count(*) from public.accounts) = 3, 'A ne doit voir que ses 3 comptes';
  assert (select user_id from public.accounts limit 1) = '00000000-0000-0000-0000-0000000000a1',
    'user_id doit être rempli automatiquement';
end $$;

-- Créer un compte au nom de B : refusé.
do $$ begin
  begin
    insert into public.accounts (user_id, name, type, currency_code)
      values ('00000000-0000-0000-0000-0000000000b2', 'Intrus', 'cash', 'MAD');
    raise exception 'A ne doit pas pouvoir créer un compte pour B';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Catégories ----------
do $$ begin
  assert (select count(*) from public.categories where user_id is null) >= 19, 'Les catégories par défaut doivent être visibles';
end $$;

insert into public.categories (id, kind, name) values ('cccccccc-0000-0000-0000-000000000001', 'expense', 'Café');

do $$ begin
  begin
    update public.categories set icon = 'hack' where key = 'food';
    if (select icon from public.categories where key = 'food') = 'hack' then
      raise exception 'Une catégorie système ne doit pas être modifiable';
    end if;
  end;
  begin
    insert into public.categories (kind, key) values ('expense', 'fausse_systeme');
    raise exception 'Un utilisateur ne doit pas créer de catégorie système';
  exception when check_violation then null;
  end;
end $$;

-- ---------- Transactions ----------
insert into public.transactions (type, amount_minor, account_id, category_id, payment_method, description)
select 'expense', 12550, 'aaaaaaaa-0000-0000-0000-000000000001', id, 'cash', 'Courses' from public.categories where key = 'food';
insert into public.transactions (type, amount_minor, account_id, category_id)
select 'income', 800000, 'aaaaaaaa-0000-0000-0000-000000000002', id from public.categories where key = 'salary';
insert into public.transactions (type, amount_minor, account_id, to_account_id) values
  ('transfer', 30000, 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003');
insert into public.transactions (type, amount_minor, account_id, category_id) values
  ('expense', 1500, 'aaaaaaaa-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001');

-- Soldes attendus :
--   Espèces      : 500,00 − 125,50                 = 374,50 DH
--   Banque       : 10 000 + 8 000 − 300 (transfert) = 17 700 DH
--   Mobile Money : 0 + 300 (transfert) − 15         = 285 DH
do $$ begin
  assert (select balance_minor from public.account_balances where account_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 37450, 'Solde espèces incorrect';
  assert (select balance_minor from public.account_balances where account_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 1770000, 'Solde banque incorrect';
  assert (select balance_minor from public.account_balances where account_id = 'aaaaaaaa-0000-0000-0000-000000000003') = 28500, 'Solde Mobile Money incorrect';
  assert (select count(*) from public.account_balances) = 3, 'A ne doit voir que les soldes de ses comptes';
  -- Un transfert ne change pas le total : 374,50 + 17 700 + 285 = 18 359,50 = 10 500 + 8 000 − 125,50 − 15
  assert (select sum(balance_minor) from public.account_balances) = 1050000 + 800000 - 12550 - 1500, 'Le transfert ne doit pas changer le total';
end $$;

-- Règles de forme
do $$ begin
  begin
    insert into public.transactions (type, amount_minor, account_id, to_account_id)
      values ('transfer', 100, 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'Un transfert vers le même compte doit être refusé';
  exception when check_violation then null;
  end;
  begin
    insert into public.transactions (type, amount_minor, account_id) values ('expense', 100, 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'Une dépense sans catégorie doit être refusée';
  exception when check_violation then null;
  end;
  begin
    insert into public.transactions (type, amount_minor, account_id, category_id)
    select 'expense', 0, 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where key = 'food';
    raise exception 'Un montant nul doit être refusé';
  exception when check_violation then null;
  end;
  begin
    insert into public.transactions (type, amount_minor, account_id, category_id)
    select 'expense', -500, 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where key = 'food';
    raise exception 'Un montant négatif doit être refusé';
  exception when check_violation then null;
  end;
  begin
    insert into public.transactions (type, amount_minor, account_id, category_id)
    select 'expense', 100, 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where key = 'salary';
    raise exception 'Une catégorie de revenu ne doit pas servir pour une dépense';
  exception when check_violation then null;
  end;
end $$;

-- Sécurité : utiliser le compte de B, même en connaissant son identifiant.
do $$ begin
  begin
    insert into public.transactions (type, amount_minor, account_id, to_account_id)
      values ('transfer', 100, 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');
    raise exception 'A ne doit pas pouvoir transférer vers le compte de B';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.transactions (type, amount_minor, account_id, category_id)
    select 'expense', 100, 'bbbbbbbb-0000-0000-0000-000000000001', id from public.categories where key = 'food';
    raise exception 'A ne doit pas pouvoir dépenser depuis le compte de B';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Un compte utilisé ne peut pas être supprimé (on l'archive à la place).
do $$ begin
  begin
    delete from public.accounts where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'Un compte avec des transactions ne doit pas être supprimé';
  exception when foreign_key_violation then null;
  end;
end $$;
update public.accounts set is_archived = true where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Modification et suppression d'une transaction
update public.transactions set amount_minor = 20000 where description = 'Courses';
do $$ begin
  assert (select balance_minor from public.account_balances where account_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 30000,
    'Le solde doit suivre la modification';
end $$;
delete from public.transactions where description = 'Courses';
do $$ begin
  assert (select balance_minor from public.account_balances where account_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 50000,
    'Le solde doit suivre la suppression';
end $$;

-- Colonne propriétaire non modifiable
do $$ begin
  begin
    update public.transactions set user_id = '00000000-0000-0000-0000-0000000000b2';
    raise exception 'user_id ne doit pas être modifiable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- B ne voit rien de A ----------
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true); end $$;
do $$ begin
  assert (select count(*) from public.transactions) = 0, 'B ne doit voir aucune transaction de A';
  assert (select count(*) from public.accounts) = 1, 'B ne doit voir que son compte';
  assert (select count(*) from public.account_balances) = 1, 'B ne doit voir que son solde';
  assert (select count(*) from public.categories where user_id is not null) = 0, 'B ne doit pas voir la catégorie de A';
end $$;

-- Catégorie personnelle de A utilisée par B : refusé.
do $$ begin
  begin
    insert into public.transactions (type, amount_minor, account_id, category_id)
      values ('expense', 100, 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001');
    raise exception 'B ne doit pas utiliser une catégorie de A';
  exception when foreign_key_violation then null;
  end;
end $$;

-- ---------- Visiteur non connecté ----------
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.transactions;
    raise exception 'Un visiteur ne doit rien lire';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.account_balances;
    raise exception 'Un visiteur ne doit pas lire les soldes';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;

\echo '✔ comptes et transactions : soldes justes et règles de sécurité respectées'
