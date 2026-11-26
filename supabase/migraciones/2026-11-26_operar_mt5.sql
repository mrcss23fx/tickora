-- Operar en tu MT5 desde el gráfico de Tickora (programa 2.2).
-- La app deja la orden en bridge_orders (trade_send); el programa la recoge en su siguiente bridge_sync
-- (cada medio segundo mientras miras el gráfico), la comprueba (cuenta demo o permitida, lote máximo, stop,
-- las normas de tu plan) y la ejecuta. El resultado vuelve en el siguiente envío. Las órdenes de más de 10 s no se ejecutan.
-- El estado de la cuenta (saldo, posiciones y órdenes abiertas) llega a bridge_acct.

create table if not exists public.bridge_acct (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.bridge_acct enable row level security;
drop policy if exists "bridge_acct: ver lo mío" on public.bridge_acct;
create policy "bridge_acct: ver lo mío" on public.bridge_acct for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.bridge_orders (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  cmd jsonb not null,
  line text not null,
  status text not null default 'new' check (status in ('new', 'taken', 'done', 'error', 'expired')),
  result jsonb,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists bridge_orders_user_idx on public.bridge_orders (user_id, status, id);
alter table public.bridge_orders enable row level security;
drop policy if exists "bridge_orders: ver lo mío" on public.bridge_orders;
create policy "bridge_orders: ver lo mío" on public.bridge_orders for select to authenticated using (user_id = (select auth.uid()));

do $$ begin
  begin alter publication supabase_realtime add table public.bridge_acct; exception when duplicate_object then null; end;
end $$;

-- La app pide una orden. Devuelve su número.
create or replace function public.trade_send(p_cmd jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); op text; sym text; side text; kind text; lots numeric; price numeric; sl numeric; tp numeric; tk bigint;
  num_re text := '^[0-9]+(\.[0-9]+)?$'; ln text; nid bigint; ver numeric;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  if jsonb_typeof(p_cmd) <> 'object' then raise exception 'Orden no válida'; end if;
  op := p_cmd->>'op';
  if op not in ('open', 'close', 'modify', 'cancel', 'omodify') then raise exception 'Orden no válida'; end if;
  sym := p_cmd->>'sym';
  if sym is null or sym !~ '^[A-Za-z0-9._#+-]{1,32}$' then raise exception 'Mercado no válido'; end if;
  select max(case when (last_info->>'version') ~ '^[0-9]+(\.[0-9]+)?$' then (last_info->>'version')::numeric else 0 end) into ver
    from public.bridge_keys where user_id = uid and last_seen > now() - interval '3 minutes';
  if coalesce(ver, 0) < 2.2 then raise exception 'Tu MT5 no está conectado con el programa 2.2'; end if;
  if (select count(*) from public.bridge_orders where user_id = uid and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Demasiadas órdenes seguidas: espera un minuto';
  end if;
  update public.bridge_orders set status = 'expired', done_at = now()
    where user_id = uid and status = 'new' and created_at < now() - interval '15 seconds';
  -- números (vacío = 0)
  lots  := case when coalesce(p_cmd->>'lots', '')  ~ num_re then (p_cmd->>'lots')::numeric  else 0 end;
  price := case when coalesce(p_cmd->>'price', '') ~ num_re then (p_cmd->>'price')::numeric else 0 end;
  sl    := case when coalesce(p_cmd->>'sl', '')    ~ num_re then (p_cmd->>'sl')::numeric    else 0 end;
  tp    := case when coalesce(p_cmd->>'tp', '')    ~ num_re then (p_cmd->>'tp')::numeric    else 0 end;
  tk    := case when coalesce(p_cmd->>'ticket', '') ~ '^[0-9]{1,20}$' then (p_cmd->>'ticket')::bigint else 0 end;
  side := coalesce(p_cmd->>'side', ''); kind := coalesce(p_cmd->>'kind', 'mkt');
  if op = 'open' then
    if side not in ('buy', 'sell') or kind not in ('mkt', 'lim', 'stp') then raise exception 'Orden no válida'; end if;
    if lots <= 0 or lots > 1000 then raise exception 'Lote no válido'; end if;
    if sl <= 0 then raise exception 'Sin stop no se abre: es tu plan'; end if;
    if kind <> 'mkt' and price <= 0 then raise exception 'Falta el precio de la orden'; end if;
  else
    if tk <= 0 then raise exception 'Falta la operación'; end if;
    if op = 'close' and (lots < 0 or lots > 1000) then raise exception 'Lote no válido'; end if;
  end if;
  -- lo que lee el programa: id|op|mercado|lado|tipo|lotes|precio|stop|objetivo|ticket (se completa con el id)
  ln := op || '|' || sym || '|' || side || '|' || kind || '|' || lots::text || '|' || price::text || '|' || sl::text || '|' || tp::text || '|' || tk::text;
  insert into public.bridge_orders(user_id, cmd, line)
    values (uid, jsonb_build_object('op', op, 'sym', sym, 'side', side, 'kind', kind, 'lots', lots, 'price', price, 'sl', sl, 'tp', tp, 'ticket', tk), ln)
    returning id into nid;
  return nid;
end $$;
revoke all on function public.trade_send(jsonb) from public, anon;
grant execute on function public.trade_send(jsonb) to authenticated;

-- El programa de MT5: además de lo de antes, el estado de la cuenta (acct), los resultados de las órdenes (ordres)
-- y recoge las órdenes nuevas (ord: «id|op|…;id|op|…»).
create or replace function public.bridge_sync(p_key text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare uid uuid; w public.bridge_watch; lk text; e jsonb; tk jsonb; ords text; out jsonb;
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
  if jsonb_typeof(p_data->'lockev') = 'array' and jsonb_array_length(p_data->'lockev') <= 20 then
    for e in select * from jsonb_array_elements(p_data->'lockev') loop
      if jsonb_typeof(e) = 'object' and (e->>'t') ~ '^[0-9]{10,14}$' then
        insert into public.bridge_lockev(user_id, ts, kind, sym, reason, cost)
          values (uid, to_timestamp((e->>'t')::bigint / 1000.0), left(coalesce(e->>'k', ''), 16), left(e->>'s', 32), left(e->>'r', 24),
                  case when (e->>'c') ~ '^-?[0-9]+(\.[0-9]+)?$' then (e->>'c')::numeric else null end);
      end if;
    end loop;
  end if;
  -- estado de la cuenta (saldo, posiciones, órdenes)
  if jsonb_typeof(p_data->'acct') = 'object' and octet_length((p_data->'acct')::text) <= 40000 then
    insert into public.bridge_acct(user_id, data, updated_at) values (uid, p_data->'acct', now())
    on conflict (user_id) do update set data = excluded.data, updated_at = now();
  end if;
  -- resultados de las órdenes que pidió la app
  if jsonb_typeof(p_data->'ordres') = 'array' and jsonb_array_length(p_data->'ordres') <= 20 then
    for e in select * from jsonb_array_elements(p_data->'ordres') loop
      if jsonb_typeof(e) = 'object' and (e->>'i') ~ '^[0-9]{1,18}$' then
        update public.bridge_orders set status = case when (e->>'ok') = '1' then 'done' else 'error' end,
               result = jsonb_build_object('ok', (e->>'ok') = '1', 'c', left(e->>'c', 12), 'm', left(e->>'m', 200), 't', left(e->>'t', 24), 'p', left(e->>'p', 24)),
               done_at = now()
          where id = (e->>'i')::bigint and user_id = uid and status in ('new', 'taken');
      end if;
    end loop;
  end if;
  -- órdenes nuevas (de menos de 10 s): se marcan como recogidas para que no se ejecuten dos veces
  update public.bridge_orders set status = 'expired', done_at = now()
    where user_id = uid and status = 'new' and created_at < now() - interval '10 seconds';
  with picked as (
    update public.bridge_orders o set status = 'taken'
      where o.id in (select id from public.bridge_orders where user_id = uid and status = 'new' order by id limit 5 for update skip locked)
      returning o.id, o.line
  ) select string_agg(id::text || '|' || line, ';' order by id) into ords from picked;
  select cfg into lk from public.bridge_lock where user_id = uid;
  select * into w from public.bridge_watch where user_id = uid and seen_at > now() - interval '60 seconds';
  if w.user_id is null then out := jsonb_build_object('lock', lk);
  else out := jsonb_build_object('sym', w.sym, 'tf', w.tf, 'req', w.req, 'to', w.req_to, 'n', w.req_n, 'lock', lk); end if;
  return jsonb_strip_nulls(out || jsonb_build_object('ord', ords));
end $function$;
