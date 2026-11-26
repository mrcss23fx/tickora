-- Ticks en vivo del precio público (función «vivo»). Aplicada en Supabase como «vivo_ticks_en_vivo» (26-nov-2026).
-- live_watch: qué mercados está mirando alguien ahora (cada gráfico lo renueva cada 20 s; caduca a los 45 s).
-- live_relay: el turno de la copia de «vivo» que reparte (solo una a la vez) y cuándo se arrancó la última.
create table if not exists public.live_watch (sym text primary key, until timestamptz not null default now());
alter table public.live_watch enable row level security;
create table if not exists public.live_relay (id int primary key default 1 check (id = 1), owner text, until timestamptz not null default now(), kicked timestamptz);
alter table public.live_relay enable row level security;
insert into public.live_relay (id) values (1) on conflict do nothing;

-- El gráfico avisa de que mira estos mercados (hasta 8). Si nadie está repartiendo ticks, arranca «vivo» ya
-- (como mucho una vez cada 10 s), sin esperar al minuto siguiente.
create or replace function public.vivo_watch(p_syms text[]) returns void
language plpgsql security definer set search_path = public as $$
declare s text; n int := 0; kick boolean; sec text;
begin
  if p_syms is null then return; end if;
  foreach s in array p_syms loop
    exit when n >= 8;
    if s ~ '^[A-Za-z0-9._-]{1,24}$' then
      insert into live_watch (sym, until) values (upper(s), now() + interval '45 seconds')
      on conflict (sym) do update set until = excluded.until;
      n := n + 1;
    end if;
  end loop;
  if n = 0 then return; end if;
  update live_relay set kicked = now()
   where id = 1 and until < now() and (kicked is null or kicked < now() - interval '10 seconds')
  returning true into kick;
  if coalesce(kick, false) then
    select v into sec from app_secrets where k = 'cron';
    if sec is not null then
      perform net.http_post(url := 'https://xsvezicjksfrklwjskfv.supabase.co/functions/v1/vivo',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron', sec), body := '{}'::jsonb, timeout_milliseconds := 3000);
    end if;
  end if;
  delete from live_watch where until < now() - interval '1 day';
end $$;

-- Solo para «vivo»: coge o renueva el turno (5 s) y devuelve los mercados que se miran; null si otra copia tiene el turno.
create or replace function public.vivo_lease(p_owner text) returns text[]
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  update live_relay set owner = p_owner, until = now() + interval '5 seconds'
   where id = 1 and (owner = p_owner or until < now()) returning true into ok;
  if not coalesce(ok, false) then return null; end if;
  return coalesce((select array_agg(sym) from (select sym from live_watch where until > now() order by until desc limit 30) w), '{}'::text[]);
end $$;

create or replace function public.vivo_release(p_owner text) returns void
language sql security definer set search_path = public as $$
  update live_relay set until = now() where id = 1 and owner = p_owner;
$$;

revoke all on function public.vivo_watch(text[]) from public, anon;
grant execute on function public.vivo_watch(text[]) to authenticated;
revoke all on function public.vivo_lease(text) from public, anon, authenticated;
revoke all on function public.vivo_release(text) from public, anon, authenticated;
grant execute on function public.vivo_lease(text) to service_role;
grant execute on function public.vivo_release(text) to service_role;

-- Cada minuto, solo si alguien mira un mercado
select cron.schedule('tickora-vivo', '* * * * *', $cron$select net.http_post(url:='https://xsvezicjksfrklwjskfv.supabase.co/functions/v1/vivo', headers:=jsonb_build_object('Content-Type','application/json','x-cron',(select v from public.app_secrets where k='cron')), body:='{}'::jsonb, timeout_milliseconds:=3000) where exists (select 1 from public.live_watch where until > now())$cron$);
