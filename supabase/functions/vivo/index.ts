// Ticks en vivo del precio público (Dukascopy) para el gráfico.
// La llama pg_cron cada minuto mientras alguien mira un mercado, y vivo_watch() en el momento en que alguien empieza a mirar,
// siempre con la cabecera x-cron (el secreto vive en la tabla privada app_secrets).
// Cada medio segundo pide los últimos ticks de los mercados que se están mirando y los reparte por Realtime
// (canal «vivo:<MERCADO>», evento «t», carga {s, t: [[hora ms, precio, volumen], …]}). Una sola petición por mercado,
// la mire una persona o mil. Solo una copia reparte a la vez (turno en la tabla live_relay); cada copia dura hasta
// el minuto siguiente y la del siguiente minuto toma el relevo.
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

/* últimos ticks: [hora en ms, precio de compra, volumen en millones (como las velas)], del más viejo al más nuevo */
async function ticks(inst: string, limit: number): Promise<number[][]> {
  const url = `https://freeserv.dukascopy.com/2.0/index.php?path=chart%2Fjson3&instrument=${encodeURIComponent(inst)}&offer_side=B&interval=TICK&splits=true&stocks=true&limit=${limit}&time_direction=P&timestamp=${Date.now()}&jsonp=_callbacks____1`;
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 2500);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: HDR });
    if (!r.ok) return [];
    const t = await r.text(), a = JSON.parse(t.slice(t.indexOf("(") + 1, t.lastIndexOf(")")));
    if (!Array.isArray(a)) return [];
    return a.filter((x: number[]) => Array.isArray(x) && x.length >= 4 && isFinite(x[0]) && isFinite(x[1]) && x[1] > 0)
      .map((x: number[]) => [Math.round(x[0]), +x[1], Math.round((+x[3] || 0)) / 1e6]).sort((x: number[], y: number[]) => x[0] - y[0]);
  } catch { return []; } finally { clearTimeout(tm); }
}

async function broadcast(messages: unknown[]) {
  const r = await fetch(URL0 + "/realtime/v1/api/broadcast", { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + KEY }, body: JSON.stringify({ messages }) });
  if (!r.ok) console.log("vivo: broadcast", r.status, (await r.text()).slice(0, 200));
}

// deno-lint-ignore no-explicit-any
async function run(sb: any, owner: string) {
  const end = (Math.floor(Date.now() / 60000) + 1) * 60000 + 1500; // hasta 1,5 s después del minuto siguiente
  const last = new Map<string, number>(), code = new Map<string, string>(), loops = new Map<string, { stop: boolean }>();
  const out: unknown[] = [], ages: number[] = []; // mensajes listos para repartir · ms entre el tick más nuevo y repartirlo
  let syms: string[] = [], idle = 0, sent = 0, done = false;
  const every = () => syms.length <= 8 ? 500 : syms.length <= 16 ? 750 : 1000;
  const stopAll = () => { loops.forEach(c => { c.stop = true; }); loops.clear(); };
  // cada mercado va a su ritmo: uno lento no retrasa a los demás
  const loop = async (s: string, ctl: { stop: boolean }) => {
    const d = dukaOf(s); if (!d) return;
    while (!ctl.stop && Date.now() < end) {
      const t0 = Date.now();
      let c = code.get(s) || d.code, tk = await ticks(c, 60);
      if (!tk.length && !code.has(s)) for (const a of d.alt) { const t2 = await ticks(a, 60); if (t2.length) { c = a; tk = t2; break; } }
      if (tk.length && !ctl.stop) {
        code.set(s, c);
        const lt = last.get(s) ?? (Date.now() - 4000); // la primera vez, solo los últimos segundos
        const fresh = tk.filter(x => x[0] > lt);
        if (fresh.length) {
          last.set(s, fresh[fresh.length - 1][0]);
          if (ages.length < 4000) ages.push(Date.now() - fresh[fresh.length - 1][0]);
          out.push({ topic: "vivo:" + s, event: "t", payload: { s, t: fresh }, private: false });
        }
      }
      const wait = every() - (Date.now() - t0); if (wait > 0) await sleep(wait);
    }
  };
  // lo que esté listo se reparte junto, cada 0,1 s
  const flusher = (async () => {
    while (!done) {
      if (out.length) { const m = out.splice(0); await broadcast(m).catch(e => console.log("vivo: broadcast", String(e))); sent += m.length; }
      await sleep(100);
    }
  })();
  let have = false;
  while (Date.now() < end) {
    const { data, error } = await sb.rpc("vivo_lease", { p_owner: owner }); // renovar el turno y leer qué mercados se miran
    if (error || data == null) { if (have) stopAll(); have = false; await sleep(300); continue; } // otra copia aún reparte: esperamos el relevo
    have = true; syms = (data as string[]).slice(0, 30);
    for (const s of syms) if (!loops.has(s)) { const ctl = { stop: false }; loops.set(s, ctl); loop(s, ctl).catch(() => {}); }
    for (const [s, ctl] of Array.from(loops)) if (!syms.includes(s)) { ctl.stop = true; loops.delete(s); }
    if (!syms.length) { if (++idle >= 3) break; } else idle = 0; // nadie mira nada: se acaba
    await sleep(Math.min(2000, Math.max(0, end - Date.now())));
  }
  stopAll(); await sleep(150); done = true; await flusher;
  if (out.length) { await broadcast(out.splice(0)).catch(() => {}); }
  if (have) await sb.rpc("vivo_release", { p_owner: owner });
  ages.sort((a, b) => a - b);
  console.log("vivo: fin", owner, "mensajes", sent, "mercados", syms.length, "retraso_ms", ages.length ? ages[Math.floor(ages.length / 2)] : "-");
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
