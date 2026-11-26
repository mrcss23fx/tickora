-- Ticks de MT5 para el gráfico (programa 2.1). Aplicada en Supabase como «bridge_live_ticks» (26-nov-2026).
-- bridge_sync guarda, junto a las dos últimas velas, los ticks desde el envío anterior (como mucho 400);
-- la app los recibe por Realtime y los reproduce con su ritmo. Con programas anteriores, ticks queda vacío.
alter table public.bridge_live add column if not exists ticks jsonb;

CREATE OR REPLACE FUNCTION public.bridge_sync(p_key text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare uid uuid; w public.bridge_watch; lk text; e jsonb; tk jsonb;
begin
  if p_key is null or char_length(p_key) > 100 then raise exception 'Clave no válida'; end if;
  select user_id into uid from public.bridge_keys where key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex');
  if uid is null then raise exception 'Clave no válida'; end if;
  update public.bridge_keys set last_seen = now()
    where key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex') and (last_seen is null or last_seen < now() - interval '60 seconds');
  if jsonb_typeof(p_data->'live') = 'object' and jsonb_typeof(p_data->'live'->'bars') = 'array'
     and jsonb_array_length(p_data->'live'->'bars') <= 5 then
    tk := case when jsonb_typeof(p_data->'live'->'ticks') = 'array' and jsonb_array_length(p_data->'live'->'ticks') <= 400
               then p_data->'live'->'ticks' else null end;
    insert into public.bridge_live(user_id, sym, tf, bars, ticks, updated_at)
      values (uid, left(p_data->'live'->>'sym', 32), left(p_data->'live'->>'tf', 4), p_data->'live'->'bars', tk, now())
    on conflict (user_id) do update set sym = excluded.sym, tf = excluded.tf, bars = excluded.bars, ticks = excluded.ticks, updated_at = now();
  end if;
  if jsonb_typeof(p_data->'hist') = 'object' and jsonb_typeof(p_data->'hist'->'bars') = 'array'
     and jsonb_array_length(p_data->'hist'->'bars') <= 1600 then
    insert into public.bridge_hist(user_id, req, sym, tf, bars, updated_at)
      values (uid, left(p_data->'hist'->>'req', 40), left(p_data->'hist'->>'sym', 32), left(p_data->'hist'->>'tf', 4), p_data->'hist'->'bars', now())
    on conflict (user_id) do update set req = excluded.req, sym = excluded.sym, tf = excluded.tf, bars = excluded.bars, updated_at = now();
  end if;
  -- lo que ha hecho el candado (como mucho 20 por envío)
  if jsonb_typeof(p_data->'lockev') = 'array' and jsonb_array_length(p_data->'lockev') <= 20 then
    for e in select * from jsonb_array_elements(p_data->'lockev') loop
      if jsonb_typeof(e) = 'object' and (e->>'t') ~ '^[0-9]{10,14}$' then
        insert into public.bridge_lockev(user_id, ts, kind, sym, reason, cost)
          values (uid, to_timestamp((e->>'t')::bigint / 1000.0), left(coalesce(e->>'k', ''), 16), left(e->>'s', 32), left(e->>'r', 24),
                  case when (e->>'c') ~ '^-?[0-9]+(\.[0-9]+)?$' then (e->>'c')::numeric else null end);
      end if;
    end loop;
  end if;
  select cfg into lk from public.bridge_lock where user_id = uid;
  select * into w from public.bridge_watch where user_id = uid and seen_at > now() - interval '60 seconds';
  if w.user_id is null then return jsonb_strip_nulls(jsonb_build_object('lock', lk)); end if;
  return jsonb_strip_nulls(jsonb_build_object('sym', w.sym, 'tf', w.tf, 'req', w.req, 'to', w.req_to, 'n', w.req_n, 'lock', lk));
end $function$;
