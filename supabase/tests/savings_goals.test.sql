-- ============================================================================
-- Tests : objectifs d'épargne et versements.
-- ============================================================================
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@example.com');

-- Étape 8 : ces utilisateurs de test ont un abonnement actif (les écritures l'exigent).
insert into public.entitlements (user_id, expires_at) select id, now() + interval '30 days' from auth.users;

insert into public.savings_goals (id, user_id, name, target_minor, currency_code) values
  ('bbbbbbbb-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2', 'Objectif de B', 100000, 'MAD');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true); end $$;

insert into public.savings_goals (id, name, icon, target_minor, target_date, currency_code) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Téléphone', 'phone', 300000, current_date + 120, 'MAD');

-- Versements : 1 000 de départ (déjà épargnés), 500 il y a 10 jours, retrait de 200 hier.
insert into public.goal_contributions (goal_id, amount_minor, occurred_on, is_initial) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 100000, current_date - 5, true);
insert into public.goal_contributions (goal_id, amount_minor, occurred_on) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 50000, current_date - 10),
  ('aaaaaaaa-0000-0000-0000-00000000000a', -20000, current_date - 1);

do $$ begin
  assert (select saved_minor from public.goal_progress where goal_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 130000,
    'Total épargné incorrect (attendu 1 300 DH)';
  assert (select saved_last_90_minor from public.goal_progress where goal_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 30000,
    'Rythme sur 90 jours incorrect (attendu 300 DH, montant de départ exclu)';
  assert (select last_contribution_on from public.goal_progress where goal_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = current_date - 1,
    'Date du dernier versement incorrecte';
  assert (select count(*) from public.goal_progress) = 1, 'A ne doit voir que son objectif';
end $$;

-- Retrait supérieur à l'épargne : refusé.
do $$ begin
  begin
    insert into public.goal_contributions (goal_id, amount_minor) values ('aaaaaaaa-0000-0000-0000-00000000000a', -130001);
    raise exception 'Un retrait supérieur au montant épargné doit être refusé';
  exception when check_violation then null;
  end;
  -- Modifier un versement pour rendre le total négatif : refusé aussi.
  begin
    update public.goal_contributions set amount_minor = -500000 where amount_minor = -20000;
    raise exception 'Une modification rendant le total négatif doit être refusée';
  exception when check_violation then null;
  end;
end $$;

-- Retrait exact de tout le reste : autorisé (total = 0).
insert into public.goal_contributions (goal_id, amount_minor) values ('aaaaaaaa-0000-0000-0000-00000000000a', -130000);
do $$ begin
  assert (select saved_minor from public.goal_progress where goal_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0, 'Le total doit être 0';
end $$;

-- Règles de validité.
do $$ begin
  begin
    insert into public.goal_contributions (goal_id, amount_minor) values ('aaaaaaaa-0000-0000-0000-00000000000a', 0);
    raise exception 'Un versement nul doit être refusé';
  exception when check_violation then null;
  end;
  begin
    insert into public.goal_contributions (goal_id, amount_minor, occurred_on) values ('aaaaaaaa-0000-0000-0000-00000000000a', 100, current_date + 30);
    raise exception 'Un versement daté dans le futur doit être refusé';
  exception when check_violation then null;
  end;
  begin
    insert into public.savings_goals (name, target_minor, currency_code) values ('Rien', 0, 'MAD');
    raise exception 'Un objectif à 0 doit être refusé';
  exception when check_violation then null;
  end;
  -- Verser sur l'objectif de B (identifiant connu) : refusé.
  begin
    insert into public.goal_contributions (goal_id, amount_minor) values ('bbbbbbbb-0000-0000-0000-00000000000b', 100);
    raise exception 'A ne doit pas pouvoir verser sur l''objectif de B';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Supprimer l'objectif supprime ses versements.
delete from public.savings_goals where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.goal_contributions) = 0, 'Les versements doivent être supprimés avec l''objectif';
end $$;

-- B ne voit pas A et inversement.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true); end $$;
do $$ begin
  assert (select count(*) from public.savings_goals) = 1, 'B ne doit voir que son objectif';
end $$;

reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.goal_progress;
    raise exception 'Un visiteur ne doit rien lire';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;

\echo '✔ objectifs d''épargne : totaux justes, retraits limités et règles de sécurité respectées'
