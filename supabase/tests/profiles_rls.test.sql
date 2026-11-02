-- ============================================================================
-- Tests de sécurité de la table profiles.
-- Chaque bloc lève une erreur si une règle n'est pas respectée.
-- Exécution locale : npm run test:db
-- ============================================================================
\set ON_ERROR_STOP on

begin;

-- Deux utilisateurs fictifs (A parle arabe, B a envoyé une langue invalide).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"language":"ar"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"language":"klingon"}');

do $$ begin
  assert (select language from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'ar',
    'Le profil doit être créé avec la langue choisie';
  assert (select language from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'fr',
    'Une langue invalide doit retomber sur le français';
end $$;

-- ---------- En tant qu'utilisateur A ----------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); end $$;

do $$ begin
  assert (select count(*) from public.profiles) = 1, 'A ne doit voir que son propre profil';
  assert (select id from public.profiles) = '00000000-0000-0000-0000-00000000000a', 'A doit voir son profil';
end $$;

-- A modifie son profil : autorisé.
update public.profiles set country_code = 'MA', currency_code = 'MAD' where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select currency_code from public.profiles) = 'MAD', 'A doit pouvoir modifier sa devise';
end $$;

-- A tente de modifier B : aucune ligne touchée (B est invisible pour A).
do $$
declare touched int;
begin
  update public.profiles set display_name = 'piraté' where id = '00000000-0000-0000-0000-00000000000b';
  get diagnostics touched = row_count;
  assert touched = 0, 'A ne doit pas pouvoir modifier le profil de B';
end $$;

-- Valeurs invalides refusées.
do $$ begin
  begin
    update public.profiles set currency_code = 'USD';
    raise exception 'Une devise non prise en charge aurait dû être refusée';
  exception when check_violation then null;
  end;
end $$;

-- Colonnes système non modifiables.
do $$ begin
  begin
    update public.profiles set created_at = now() - interval '1 year';
    raise exception 'created_at ne doit pas être modifiable';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'id ne doit pas être modifiable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Pas de création ni de suppression directe.
do $$ begin
  begin
    insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000cc');
    raise exception 'Un utilisateur ne doit pas pouvoir créer de profil';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.profiles;
    raise exception 'Un utilisateur ne doit pas pouvoir supprimer de profil';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- En tant qu'utilisateur B : accueil incomplet refusé ----------
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); end $$;
do $$ begin
  begin
    update public.profiles set onboarding_completed_at = now();
    raise exception 'L''accueil ne doit pas être terminé sans pays ni devise';
  exception when check_violation then null;
  end;
end $$;
update public.profiles set country_code = 'GA', currency_code = 'XAF', onboarding_completed_at = now();
do $$ begin
  assert (select onboarding_completed_at is not null from public.profiles), 'B doit pouvoir terminer l''accueil';
  assert (select updated_at > created_at or updated_at = created_at from public.profiles), 'updated_at doit exister';
end $$;

-- ---------- Visiteur non connecté ----------
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.profiles;
    raise exception 'Un visiteur non connecté ne doit rien lire';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;

\echo '✔ profiles : toutes les règles de sécurité sont respectées'
