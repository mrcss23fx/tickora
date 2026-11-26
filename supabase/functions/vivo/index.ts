// Ticks en vivo del precio público (Dukascopy) para el gráfico.
// La llama pg_cron cada minuto mientras alguien mira un mercado, y vivo_watch() en el momento en que alguien empieza a mirar,
// siempre con la cabecera x-cron (el secreto vive en la tabla privada app_secrets).
// Pide los últimos ticks de los mercados que se están mirando (cada ~0,6 s con uno; más espaciado con más) y los reparte por Realtime
// (canal «vivo:<MERCADO>», evento «t», carga {s, t: [[hora ms, precio, volumen], …]}). Una sola petición por mercado,
// la mire una persona o mil. Solo una copia reparte a la vez (turno en la tabla live_relay); cada copia dura hasta
// el minuto siguiente y la del siguiente minuto toma el relevo.
// v6 (26-nov-2026): Dukascopy respondió 429 con ~2,5 peticiones por segundo (7 mercados). Ahora de una en una y como
// mucho 1,6 por segundo en total (con 1 mercado, v4 hizo ~1,6/s durante minutos sin un solo fallo).
// v5 (26-nov-2026): dos peticiones a la vez como mucho (Dukascopy tarda ~0,6 s en responder desde aquí y, de una en una,
// con 7 mercados cada uno se ponía al día cada ~4 s en vez de ~2,4 s).
// v4 (26-nov-2026): con 7 mercados (unas 7–14 peticiones por segundo) Dukascopy dejó de dar ticks durante más de un minuto. Ahora, de una en una y como mucho ~3 por segundo en total, por turnos; si responde 403/429/5xx, espera 10–60 s.
// v3 (26-nov-2026): cada mercado con su propio ritmo (uno lento no retrasa a los demás) y reparto cada 0,1 s.
// v2 (26-nov-2026): cada medio segundo (cada 0,75 s con más de 8 mercados mirados, cada segundo con más de 16):
// la vela va 1 s más cerca del mercado. El registro final dice cuánto tarda el tick más nuevo en llegar (mediana).
// v1 (26-nov-2026).
import { createClient } from "npm:@supabase/supabase-js@2";
import { dukaOf } from "./mercados.ts";
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
const URL0 = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const HDR = { "User-Agent": "Mozilla/5.0 (compatible; Tickora/1.0)", "Referer": "https://freeserv.dukascopy.com/" };

/* últimos ticks: [hora en ms, precio de compra, volumen en millones (como las velas)], del más viejo al más nuevo,
   y el estado HTTP de la respuesta (0 si no hubo) para frenar si Dukascopy se queja */
async function ticks(inst: string, limit: number): Promise<{ tk: number[][]; code: number }> {
  const url = `https://freeserv.dukascopy.com/2.0/index.php?path=chart%2Fjson3&instrument=${encodeURIComponent(inst)}&offer_side=B&interval=TICK&splits=true&stocks=true&limit=${limit}&time_direction=P&timestamp=${Date.now()}&jsonp=_callbacks____1`;
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 2500);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: HDR });
    if (!r.ok) { await r.body?.cancel(); return { tk: [], code: r.status }; }
    const t = await r.text(), a = JSON.parse(t.slice(t.indexOf("(") + 1, t.lastIndexOf(")")));
    if (!Array.isArray(a)) return { tk: [], code: r.status };
    const tk = a.filter((x: number[]) => Array.isArray(x) && x.length >= 4 && isFinite(x[0]) && isFinite(x[1]) && x[1] > 0)
      .map((x: number[]) => [Math.round(x[0]), +x[1], Math.round((+x[3] || 0)) / 1e6]).sort((x: number[], y: number[]) => x[0] - y[0]);
    return { tk, code: r.status };
  } catch { return { tk: [], code: 0 }; } finally { clearTimeout(tm); }
}

async function broadcast(messages: unknown[]) {
  const r = await fetch(URL0 + "/realtime/v1/api/broadcast", { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + KEY }, body: JSON.stringify({ messages }) });
  if (!r.ok) console.log("vivo: broadcast", r.status, (await r.text()).slice(0, 200));
}

// deno-lint-ignore no-explicit-any
async function run(sb: any, owner: string) {
  const end = (Math.floor(Date.now() / 60000) + 1) * 60000 + 1500; // hasta 1,5 s después del minuto siguiente
  const last = new Map<string, number>(), code = new Map<string, string>(), next = new Map<string, number>();
  const out: unknown[] = [], ages: number[] = []; // mensajes listos para repartir · ms entre el tick más nuevo y repartirlo
  const fails: Record<string, number> = {};
  let syms: string[] = [], idle = 0, sent = 0, done = false, have = false, pause = 0, backoff = 10000, rr = 0;
  // turno y mercados que se miran, cada 2 s
  const lease = (async () => {
    while (Date.now() < end) {
      const { data, error } = await sb.rpc("vivo_lease", { p_owner: owner });
      if (error || data == null) { have = false; await sleep(300); continue; } // otra copia aún reparte: esperamos el relevo
      have = true; syms = (data as string[]).slice(0, 30);
      if (!syms.length) { if (++idle >= 3) break; } else idle = 0; // nadie mira nada: se acaba
      await sleep(Math.min(2000, Math.max(0, end - Date.now())));
    }
    done = true;
  })();
  // lo que esté listo se reparte junto, cada 0,1 s
  const flusher = (async () => {
    while (!done || out.length) {
      if (out.length) { const m = out.splice(0); await broadcast(m).catch(e => console.log("vivo: broadcast", String(e))); sent += m.length; }
      await sleep(100);
    }
  })();
  /* Dukascopy responde 429 (demasiadas peticiones) a partir de unas 2–3 por segundo. Aquí: de una en una, como mucho una
     cada 625 ms (1,6 por segundo), por turnos entre los mercados. Con 1 mercado se pone al día cada ~0,6 s; con 2, cada
     ~1,3 s; con 7, cada ~4,4 s. Los ticks llegan todos y se ven con su ritmo; solo cambia cuánto tardan. */
  let inflight = 0; const busy = new Set<string>();
  const fetchOne = async (s: string) => {
    const d = dukaOf(s); if (!d) return;
    const lim = syms.length <= 2 ? 60 : 200; // con varios mercados cada uno se pide más espaciado: más ticks por vez
    let c = code.get(s) || d.code, r0 = await ticks(c, lim), tk = r0.tk, sc = r0.code;
    if (!tk.length && sc === 200 && !code.has(s)) for (const a2 of d.alt) { const r2 = await ticks(a2, lim); if (r2.tk.length) { c = a2; tk = r2.tk; break; } }
    if (sc !== 200) {
      fails[String(sc)] = (fails[String(sc)] || 0) + 1;
      if ((sc === 403 || sc === 429 || sc >= 500) && Date.now() >= pause) { pause = Date.now() + backoff; console.log("vivo: Dukascopy respondió", sc, "· espero", backoff / 1000, "s"); backoff = Math.min(60000, backoff * 2); }
    } else backoff = 10000;
    if (tk.length && have) {
      code.set(s, c);
      const lt = last.get(s) ?? (Date.now() - 4000); // la primera vez, solo los últimos segundos
      const fresh = tk.filter(x => x[0] > lt);
      if (fresh.length) {
        last.set(s, fresh[fresh.length - 1][0]);
        if (ages.length < 4000) ages.push(Date.now() - fresh[fresh.length - 1][0]);
        out.push({ topic: "vivo:" + s, event: "t", payload: { s, t: fresh }, private: false });
      }
    }
  };
  while (!done && Date.now() < end) {
    const t0 = Date.now();
    if (!have || !syms.length || t0 < pause || inflight >= 1) { await sleep(inflight >= 1 ? 25 : 300); continue; }
    let s = "";
    for (let k = 0; k < syms.length; k++) { const c = syms[(rr + k) % syms.length]; if ((next.get(c) || 0) <= t0 && !busy.has(c)) { s = c; rr = (rr + k + 1) % syms.length; break; } }
    if (!s) { await sleep(30); continue; }
    next.set(s, t0 + 500); busy.add(s); inflight++;
    fetchOne(s).catch(() => {}).finally(() => { inflight--; busy.delete(s); });
    const wait = 625 - (Date.now() - t0); if (wait > 0) await sleep(wait);
  }
  while (inflight > 0) await sleep(30);
  done = true; await lease; await flusher;
  if (have) await sb.rpc("vivo_release", { p_owner: owner });
  ages.sort((a, b) => a - b);
  console.log("vivo: fin", owner, "mensajes", sent, "mercados", syms.length, "retraso_ms", ages.length ? ages[Math.floor(ages.length / 2)] : "-", "fallos", JSON.stringify(fails));
}

Deno.serve(async (req) => {
  const sb = createClient(URL0, KEY, { auth: { persistSession: false } });
  const { data: sec } = await sb.from("app_secrets").select("k,v").eq("k", "cron");
  const cron = sec && sec[0] && sec[0].v;
  if (!cron || req.headers.get("x-cron") !== cron) return new Response("no", { status: 401 });
  const owner = crypto.randomUUID().slice(0, 8);
  EdgeRuntime.waitUntil(run(sb, owner).catch(e => console.log("vivo: error", String(e))));
  return new Response(JSON.stringify({ ok: true, owner }), { headers: { "Content-Type": "application/json" } });
});
