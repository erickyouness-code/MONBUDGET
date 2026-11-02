-- ============================================================================
-- Tests : calendrier financier (échéances, règlements atomiques, sécurité).
-- ============================================================================
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@example.com');

-- Étape 8 : ces utilisateurs de test ont un abonnement actif (les écritures l'exigent).
insert into public.entitlements (user_id, expires_at) select id, now() + interval '30 days' from auth.users;

insert into public.accounts (id, user_id, name, type, currency_code, initial_balance_minor) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Banque', 'bank', 'MAD', 1000000),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'B', 'bank', 'MAD', 0);
insert into public.scheduled_items (id, user_id, kind, title, amount_minor, start_date) values
  ('bbbbbbbb-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000b2', 'bill', 'Facture de B', 1000, current_date);

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true); end $$;

-- Facture d'électricité mensuelle (350 DH, compte Banque), abonnement sans compte, rappel simple.
insert into public.scheduled_items (id, kind, title, amount_minor, account_id, category_id, frequency, start_date, remind_days_before)
select 'aaaaaaaa-0000-0000-0000-0000000000e1', 'bill', 'Électricité', 35000, 'aaaaaaaa-0000-0000-0000-000000000001', id, 'monthly', current_date, 2
from public.categories where key = 'bills';
insert into public.scheduled_items (id, kind, title, amount_minor, frequency, start_date) values
  ('aaaaaaaa-0000-0000-0000-0000000000e2', 'subscription', 'Streaming', 12000, 'monthly', current_date);
insert into public.scheduled_items (id, kind, title, frequency, start_date) values
  ('aaaaaaaa-0000-0000-0000-0000000000e3', 'reminder', 'Renouveler la carte', 'once', current_date);

do $$ begin
  assert (select count(*) from public.scheduled_items) = 3, 'A ne doit voir que ses 3 échéances';
end $$;

-- Règles de forme.
do $$ begin
  begin
    insert into public.scheduled_items (kind, title, start_date) values ('bill', 'Sans montant', current_date);
    raise exception 'Une facture sans montant doit être refusée';
  exception when check_violation then null;
  end;
  begin
    insert into public.scheduled_items (kind, title, amount_minor, start_date) values ('reminder', 'Rappel payant', 100, current_date);
    raise exception 'Un rappel avec montant doit être refusé';
  exception when check_violation then null;
  end;
  begin
    insert into public.scheduled_items (kind, title, amount_minor, start_date, category_id)
    select 'income', 'Salaire', 100, current_date, id from public.categories where key = 'food';
    raise exception 'Un revenu attendu avec une catégorie de dépense doit être refusé';
  exception when check_violation then null;
  end;
  begin
    insert into public.scheduled_items (kind, title, amount_minor, start_date, account_id)
    values ('bill', 'Compte de B', 100, current_date, 'bbbbbbbb-0000-0000-0000-000000000001');
    raise exception 'Le compte de B ne doit pas être utilisable';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Payer l'électricité : transaction créée dans la même opération.
do $$
declare
  cid uuid;
begin
  cid := public.complete_occurrence('aaaaaaaa-0000-0000-0000-0000000000e1', current_date, 'paid');
  assert (select count(*) from public.transactions where description = 'Électricité' and amount_minor = 35000 and type = 'expense') = 1,
    'La dépense doit être créée';
  assert (select transaction_id is not null from public.scheduled_completions where id = cid), 'Le règlement doit pointer vers la transaction';
  assert (select balance_minor from public.account_balances where account_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 965000,
    'Le solde du compte doit baisser de 350 DH';
end $$;

-- Une échéance ne se règle qu'une fois.
do $$ begin
  begin
    perform public.complete_occurrence('aaaaaaaa-0000-0000-0000-0000000000e1', current_date, 'paid');
    raise exception 'Une échéance déjà réglée ne doit pas l''être deux fois';
  exception when unique_violation then null;
  end;
  -- Et la dépense n'a pas été créée en double (opération atomique).
  assert (select count(*) from public.transactions where description = 'Électricité') = 1, 'Pas de dépense en double';
end $$;

-- Abonnement sans compte : il faut en choisir un ; sans catégorie : « Autres ».
do $$ begin
  begin
    perform public.complete_occurrence('aaaaaaaa-0000-0000-0000-0000000000e2', current_date, 'paid');
    raise exception 'Payer sans compte doit être refusé';
  exception when not_null_violation then null;
  end;
end $$;
do $$ begin
  perform public.complete_occurrence('aaaaaaaa-0000-0000-0000-0000000000e2', current_date, 'paid', 'aaaaaaaa-0000-0000-0000-000000000001');
  assert (select c.key from public.transactions t join public.categories c on c.id = t.category_id where t.description = 'Streaming') = 'other',
    'Sans catégorie, la dépense va dans « Autres »';
end $$;

-- Ignorer : aucune transaction. Rappel « fait » : aucune transaction non plus.
do $$ begin
  perform public.complete_occurrence('aaaaaaaa-0000-0000-0000-0000000000e1', current_date + 31, 'skipped');
  perform public.complete_occurrence('aaaaaaaa-0000-0000-0000-0000000000e3', current_date, 'paid');
  assert (select count(*) from public.transactions) = 2, 'Ignorer ou faire un rappel ne crée pas de transaction';
end $$;

-- Annuler le paiement de l'électricité : la transaction disparaît, le solde revient.
do $$
declare
  cid uuid;
begin
  select id into cid from public.scheduled_completions where item_id = 'aaaaaaaa-0000-0000-0000-0000000000e1' and status = 'paid';
  perform public.undo_occurrence(cid);
  assert (select count(*) from public.transactions where description = 'Électricité') = 0, 'La dépense doit être supprimée';
  assert (select balance_minor from public.account_balances where account_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 988000,
    'Le solde doit être rétabli (seul le streaming reste)';
end $$;

-- Un règlement ne peut viser ni l'échéance ni la transaction d'un autre utilisateur.
do $$ begin
  begin
    insert into public.scheduled_completions (item_id, due_on, status) values ('bbbbbbbb-0000-0000-0000-0000000000ff', current_date, 'skipped');
    raise exception 'A ne doit pas régler l''échéance de B directement';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Régler l'échéance de B : introuvable pour A.
do $$ begin
  begin
    perform public.complete_occurrence('bbbbbbbb-0000-0000-0000-0000000000ff', current_date, 'skipped');
    raise exception 'A ne doit pas régler l''échéance de B';
  exception when no_data_found then null;
  end;
end $$;

-- Supprimer une échéance supprime ses règlements, pas les transactions déjà créées.
delete from public.scheduled_items where id = 'aaaaaaaa-0000-0000-0000-0000000000e2';
do $$ begin
  assert (select count(*) from public.scheduled_completions where item_id = 'aaaaaaaa-0000-0000-0000-0000000000e2') = 0, 'Règlements supprimés';
  assert (select count(*) from public.transactions where description = 'Streaming') = 1, 'L''historique des dépenses est conservé';
end $$;

reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.scheduled_items;
    raise exception 'Un visiteur ne doit rien lire';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;

\echo '✔ calendrier : échéances, règlements atomiques et règles de sécurité respectés'
