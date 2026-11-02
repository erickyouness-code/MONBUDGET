-- ============================================================================
-- Étape 9 : assistant financier conversationnel
--
-- profiles.assistant_consent_at : date à laquelle l'utilisateur a accepté que
--   des résumés de SES données soient envoyés au fournisseur d'IA pour répondre
--   à ses questions. Null = refus (par défaut) : la fonction serveur refuse
--   alors de répondre. L'utilisateur peut retirer son accord à tout moment.
-- assistant_usage : compteur de questions par jour (limite anti-abus et
--   maîtrise des coûts) et nombre de jetons consommés. AUCUN contenu de
--   conversation n'est stocké.
-- ============================================================================

alter table public.profiles add column assistant_consent_at timestamptz;
grant update (assistant_consent_at) on table public.profiles to authenticated;

create table public.assistant_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests int not null default 0 check (requests >= 0),
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  -- Fenêtre glissante d'une minute (limite de rafale).
  window_start timestamptz not null default now(),
  window_count int not null default 0,
  primary key (user_id, day)
);

comment on table public.assistant_usage is 'Quota de l''assistant. Écrit uniquement par le serveur.';

alter table public.assistant_usage enable row level security;
revoke all on table public.assistant_usage from anon, authenticated;
-- L'utilisateur peut voir sa consommation (questions restantes), sans la modifier.
grant select on table public.assistant_usage to authenticated;
create policy "Lecture de sa propre consommation" on public.assistant_usage
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Réserve une question pour l'utilisateur. Renvoie 'ok', 'daily_limit' ou
-- 'rate_limit'. Exécutable UNIQUEMENT par le serveur (clé service_role) : un
-- utilisateur ne peut ni contourner ni remettre à zéro son quota.
-- Journée comptée en heure UTC.
-- ---------------------------------------------------------------------------
create function public.assistant_consume(p_user uuid, p_daily int, p_per_minute int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_row public.assistant_usage;
  v_recent boolean;
begin
  insert into public.assistant_usage (user_id, day) values (p_user, v_day)
  on conflict (user_id, day) do nothing;

  select * into v_row from public.assistant_usage
  where user_id = p_user and day = v_day
  for update;

  if v_row.requests >= p_daily then
    return 'daily_limit';
  end if;
  v_recent := v_row.window_start > now() - interval '1 minute';
  if v_recent and v_row.window_count >= p_per_minute then
    return 'rate_limit';
  end if;

  update public.assistant_usage set
    requests = requests + 1,
    window_start = case when v_recent then window_start else now() end,
    window_count = case when v_recent then window_count + 1 else 1 end
  where user_id = p_user and day = v_day;
  return 'ok';
end;
$$;

-- Ajoute les jetons consommés (suivi des coûts).
create function public.assistant_record_usage(p_user uuid, p_input bigint, p_output bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.assistant_usage
  set input_tokens = input_tokens + greatest(p_input, 0),
      output_tokens = output_tokens + greatest(p_output, 0)
  where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;

revoke all on function public.assistant_consume(uuid, int, int) from public, anon, authenticated;
revoke all on function public.assistant_record_usage(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.assistant_consume(uuid, int, int) to service_role;
grant execute on function public.assistant_record_usage(uuid, bigint, bigint) to service_role;
