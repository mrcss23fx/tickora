// Ticks en vivo del precio público (Dukascopy) para el gráfico.
// La llama pg_cron cada minuto mientras alguien mira un mercado, y vivo_watch() en el momento en que alguien empieza a mirar,
// siempre con la cabecera x-cron (el secreto vive en la tabla privada app_secrets).
// Cada segundo pide los últimos ticks de los mercados que se están mirando y los reparte por Realtime
// (canal «vivo:<MERCADO>», evento «t», carga {s, t: [[hora ms, precio, volumen], …]}). Una sola petición por mercado,
// la mire una persona o mil. Solo una copia reparte a la vez (turno en la tabla live_relay); cada copia dura hasta
// el minuto siguiente y la del siguiente minuto toma el relevo.
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
  const last = new Map<string, number>(), code = new Map<string, string>();
  let syms: string[] = [], leaseAt = 0, have = false, idle = 0, sent = 0;
  while (Date.now() < end) {
    const t0 = Date.now();
    if (!have || t0 - leaseAt >= 2000) { // renovar el turno y leer qué mercados se miran
      const { data, error } = await sb.rpc("vivo_lease", { p_owner: owner });
      if (error || data == null) { have = false; await sleep(300); continue; } // otra copia aún reparte: esperamos el relevo
      have = true; leaseAt = t0; syms = (data as string[]).slice(0, 30);
      if (!syms.length) { if (++idle >= 3) break; } else idle = 0; // nadie mira nada: se acaba
    }
    const msgs: unknown[] = [];
    await Promise.all(syms.map(async s => {
      const d = dukaOf(s); if (!d) return;
      let c = code.get(s) || d.code, tk = await ticks(c, 60);
      if (!tk.length && !code.has(s)) for (const a of d.alt) { const t2 = await ticks(a, 60); if (t2.length) { c = a; tk = t2; break; } }
      if (!tk.length) return;
      code.set(s, c);
      const lt = last.get(s) ?? (Date.now() - 4000); // la primera vez, solo los últimos segundos
      const fresh = tk.filter(x => x[0] > lt);
      if (!fresh.length) return;
      last.set(s, fresh[fresh.length - 1][0]);
      msgs.push({ topic: "vivo:" + s, event: "t", payload: { s, t: fresh }, private: false });
    }));
    if (msgs.length) { await broadcast(msgs).catch(e => console.log("vivo: broadcast", String(e))); sent += msgs.length; }
    const wait = 1000 - (Date.now() - t0); if (wait > 0) await sleep(wait);
  }
  if (have) await sb.rpc("vivo_release", { p_owner: owner });
  console.log("vivo: fin", owner, "mensajes", sent, "mercados", syms.length);
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
