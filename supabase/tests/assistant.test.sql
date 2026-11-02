-- ============================================================================
-- Tests : assistant (consentement, quota côté serveur).
-- ============================================================================
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'assistant@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 'autre@example.com');

-- ---------- Consentement : désactivé par défaut, modifiable par l'utilisateur ----------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true); end $$;
do $$ begin
  assert (select assistant_consent_at from public.profiles) is null, 'Le consentement doit être refusé par défaut';
end $$;
update public.profiles set assistant_consent_at = now();
do $$ begin
  assert (select assistant_consent_at from public.profiles) is not null, 'L''utilisateur doit pouvoir donner son accord';
end $$;
update public.profiles set assistant_consent_at = null;
do $$ begin
  assert (select assistant_consent_at from public.profiles) is null, 'L''utilisateur doit pouvoir retirer son accord';
end $$;

-- ---------- Quota : l'utilisateur ne peut ni l'appeler ni le modifier ----------
do $$ begin
  begin
    perform public.assistant_consume('00000000-0000-0000-0000-0000000000d1', 1000, 1000);
    raise exception 'Un utilisateur ne doit pas pouvoir réserver de quota lui-même';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.assistant_record_usage('00000000-0000-0000-0000-0000000000d1', 0, 0);
    raise exception 'Un utilisateur ne doit pas pouvoir écrire sa consommation';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assistant_usage (user_id, day) values ('00000000-0000-0000-0000-0000000000d1', current_date);
    raise exception 'Un utilisateur ne doit pas pouvoir écrire dans assistant_usage';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Serveur (service_role) : limites par minute et par jour ----------
reset role;
set local role service_role;
do $$ begin
  assert public.assistant_consume('00000000-0000-0000-0000-0000000000d1', 3, 2) = 'ok', '1re question acceptée';
  assert public.assistant_consume('00000000-0000-0000-0000-0000000000d1', 3, 2) = 'ok', '2e question acceptée';
  assert public.assistant_consume('00000000-0000-0000-0000-0000000000d1', 3, 2) = 'rate_limit', '3e question dans la minute : refusée';
end $$;
-- Une minute plus tard : la rafale est oubliée, mais la limite du jour s'applique.
update public.assistant_usage set window_start = now() - interval '2 minutes'
where user_id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin
  assert public.assistant_consume('00000000-0000-0000-0000-0000000000d1', 3, 2) = 'ok', 'Nouvelle minute : acceptée';
  update public.assistant_usage set window_start = now() - interval '2 minutes'
  where user_id = '00000000-0000-0000-0000-0000000000d1';
  assert public.assistant_consume('00000000-0000-0000-0000-0000000000d1', 3, 2) = 'daily_limit', 'Limite du jour atteinte';
  perform public.assistant_record_usage('00000000-0000-0000-0000-0000000000d1', 1200, 300);
  perform public.assistant_record_usage('00000000-0000-0000-0000-0000000000d1', 800, -5);
  assert (select requests from public.assistant_usage where user_id = '00000000-0000-0000-0000-0000000000d1') = 3, 'Seules les questions acceptées sont comptées';
  assert (select input_tokens from public.assistant_usage where user_id = '00000000-0000-0000-0000-0000000000d1') = 2000, 'Jetons d''entrée cumulés';
  assert (select output_tokens from public.assistant_usage where user_id = '00000000-0000-0000-0000-0000000000d1') = 300, 'Jetons négatifs ignorés';
  assert public.assistant_consume('00000000-0000-0000-0000-0000000000d2', 3, 2) = 'ok', 'Le quota est propre à chaque utilisateur';
end $$;

-- ---------- Lecture : chacun ne voit que sa consommation ----------
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true); end $$;
do $$ begin
  assert (select count(*) from public.assistant_usage) = 1, 'B ne voit que sa propre ligne';
  assert (select requests from public.assistant_usage) = 1, 'B voit son compteur';
end $$;

rollback;
\echo '✔ assistant : consentement et quota protégés côté serveur'
