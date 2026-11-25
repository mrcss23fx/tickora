// Alertas de Tickora (18-nov-2026): se comprueban en el servidor cada minuto, aunque tengas la web cerrada.
// Precio, línea dibujada (horizontal o de tendencia) e indicador (RSI). Avisa en la app y con notificación al móvil u ordenador.
// v3 (25-nov-2026): todos los mercados del buscador (acciones, ETF, índices, materias primas, bonos y cualquier cripto de Binance).
// La llama pg_cron cada minuto con la cabecera x-cron (el secreto vive en la tabla privada app_secrets). Fuente de precios: Dukascopy (la misma que el gráfico), Yahoo de respaldo y Binance (cripto).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";
import { dukaOf, binOf, clean, futOf } from "./mercados.ts";

const MAP: Record<string, string> = {
  EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDJPY: "JPY=X", AUDUSD: "AUDUSD=X", USDCAD: "CAD=X", USDCHF: "CHF=X",
  NZDUSD: "NZDUSD=X", EURJPY: "EURJPY=X", GBPJPY: "GBPJPY=X", EURGBP: "EURGBP=X", EURCHF: "EURCHF=X", AUDJPY: "AUDJPY=X",
  XAUUSD: "GC=F", XAGUSD: "SI=F", USOIL: "CL=F", UKOIL: "BZ=F",
  NAS100: "NQ=F", US100: "NQ=F", USTEC: "NQ=F", US500: "ES=F", SPX500: "ES=F", US30: "YM=F", DJ30: "YM=F",
  GER40: "^GDAXI", DE40: "^GDAXI", UK100: "^FTSE", SPA35: "^IBEX", FRA40: "^FCHI", JPN225: "^N225",
};
const TFY: Record<string, [string, string, number]> = { "1m": ["1m", "1d", 60], "5m": ["5m", "5d", 300], "15m": ["15m", "5d", 900], "30m": ["30m", "1mo", 1800], "1h": ["60m", "1mo", 3600], "4h": ["60m", "3mo", 14400], "1d": ["1d", "1y", 86400] };
function yahoo(sym: string): string | null { const f = futOf(sym); if (f) return f; if (/\./.test(sym)) return null; const c = clean(sym); if (MAP[c]) return MAP[c]; for (const k of Object.keys(MAP)) if (c.startsWith(k)) return MAP[k]; if (/^[A-Z]{6}$/.test(c)) return c + "=X"; return null; }
type Bar = [number, number, number, number, number]; // t (ms), o, h, l, c

async function bars(sym: string, tf: string): Promise<Bar[]> {
  const bs = binOf(sym);
  if (bs) {
    const iv = tf === "4h" ? "4h" : tf === "1d" ? "1d" : tf === "1h" ? "1h" : tf;
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${bs}&interval=${iv}&limit=200`);
    if (!r.ok) return []; const j = await r.json(); return j.map((k: any[]) => [k[0], +k[1], +k[2], +k[3], +k[4]]);
  }
  const di = dukaOf(sym), dv: Record<string, string> = { "1m": "1MIN", "5m": "5MIN", "15m": "15MIN", "30m": "30MIN", "1h": "1HOUR", "4h": "4HOUR", "1d": "1DAY" };
  if (di && dv[tf]) {
    for (const code of [di.code, ...di.alt]) {
      try {
        const r = await fetch(`https://freeserv.dukascopy.com/2.0/index.php?path=chart%2Fjson3&instrument=${encodeURIComponent(code)}&offer_side=B&interval=${dv[tf]}&splits=true&stocks=true&limit=200&time_direction=P&timestamp=${Date.now()}&jsonp=_cb`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Tickora/1.0)", "Referer": "https://freeserv.dukascopy.com/" } });
        if (r.ok) { const t = await r.text(); const a = JSON.parse(t.slice(t.indexOf("(") + 1, t.lastIndexOf(")"))); if (Array.isArray(a) && a.length) return a.map((k: number[]) => [k[0], k[1], k[2], k[3], k[4]] as Bar).sort((x: Bar, y: Bar) => x[0] - y[0]); }
      } catch (_e) { /* siguiente código o Yahoo de respaldo */ }
    }
  }
  const y = yahoo(sym); if (!y) return [];
  const [iv, range, step] = TFY[tf] || TFY["1m"];
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?interval=${iv}&range=${range}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) return []; const j = await r.json(); const res = j?.chart?.result?.[0]; if (!res) return [];
  const t = res.timestamp || [], q = res.indicators?.quote?.[0] || {}; const out: Bar[] = [];
  for (let i = 0; i < t.length; i++) { const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], cl = q.close?.[i]; if ([o, h, l, cl].some(v => v == null || !isFinite(v))) continue; out.push([Math.floor(t[i] / step) * step * 1000, o, Math.max(h, o, cl), Math.min(l, o, cl), cl]); }
  if (tf === "4h") { const g: Bar[] = []; for (const b of out) { const k = Math.floor(b[0] / 144e5) * 144e5, last = g[g.length - 1]; if (last && last[0] === k) { last[2] = Math.max(last[2], b[2]); last[3] = Math.min(last[3], b[3]); last[4] = b[4]; } else g.push([k, b[1], b[2], b[3], b[4]]); } return g; }
  return out;
}
function rsi(closes: number[], n: number): number | null {
  if (closes.length <= n + 1) return null; let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; g += Math.max(d, 0); l += Math.max(-d, 0); } g /= n; l /= n;
  for (let i = n + 1; i < closes.length; i++) { const d = closes[i] - closes[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; }
  return l ? 100 - 100 / (1 + g / l) : 100;
}
const fmt = (v: number) => Math.abs(v) >= 100 ? v.toFixed(2) : Math.abs(v) >= 1 ? v.toFixed(4) : v.toFixed(5);
const COND: Record<string, string> = { cross: "ha cruzado", up: "ha subido por encima de", down: "ha bajado por debajo de", above: "está por encima de", below: "está por debajo de" };

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: sec } = await sb.from("app_secrets").select("k,v"); const S = Object.fromEntries((sec || []).map((x: any) => [x.k, x.v]));
  if (!S.cron || req.headers.get("x-cron") !== S.cron) return new Response("no", { status: 401 });
  const pub = S.vapid_public, priv = S.vapid_private;
  if (pub && priv) webpush.setVapidDetails("mailto:avisos@tickora.app", pub, priv);
  const { data: alerts, error } = await sb.from("alerts").select("*").eq("active", true).limit(3000);
  if (error) return new Response(error.message, { status: 500 });
  const now = Date.now(), cache = new Map<string, Bar[]>();
  const get = async (sym: string, tf: string) => { const k = sym + "|" + tf; if (!cache.has(k)) { try { cache.set(k, await bars(sym, tf)); } catch { cache.set(k, []); } } return cache.get(k)!; };
  let fired = 0, checked = 0;
  for (const a of alerts || []) {
    try {
      const since = a.last_check ? new Date(a.last_check).getTime() : now - 120e3;
      let cur: number | null = null, prev: number | null = a.last_price != null ? +a.last_price : null, hi = -Infinity, lo = Infinity, target = a.value != null ? +a.value : null, what = "";
      if (a.kind === "ind") {
        const tf = a.tf || "15m", b = await get(a.sym, tf), step = (TFY[tf] || TFY["15m"])[2] * 1000, closed = b.filter(x => x[0] + step <= now);
        const n = +(a.p1?.len || 14); cur = rsi(closed.map(x => x[4]), n); what = `El RSI ${n} (${tf}) de ${a.sym}`;
        if (cur != null) { hi = Math.max(cur, prev ?? cur); lo = Math.min(cur, prev ?? cur); }
      } else {
        const b = await get(a.sym, "1m"); const recent = b.filter(x => x[0] + 60e3 > since); if (!b.length) continue;
        cur = b[b.length - 1][4]; recent.forEach(x => { hi = Math.max(hi, x[2]); lo = Math.min(lo, x[3]); }); if (!recent.length) { hi = cur; lo = cur; }
        if (a.kind === "line" && a.p1 && a.p1.t1 && a.p1.t2 && a.p1.t1 !== a.p1.t2) { target = +a.p1.v1 + (+a.p1.v2 - +a.p1.v1) * (now - +a.p1.t1) / (+a.p1.t2 - +a.p1.t1); what = `${a.sym} ${COND[a.cond] || "ha cruzado"} tu línea (${fmt(target)})`; }
        else what = `${a.sym} ${COND[a.cond] || "ha cruzado"} ${target != null ? fmt(target) : ""}`;
      }
      checked++;
      if (cur == null || target == null) { await sb.from("alerts").update({ last_check: new Date(now).toISOString(), last_price: cur }).eq("id", a.id); continue; }
      const hit = a.cond === "above" ? cur > target : a.cond === "below" ? cur < target
        : a.cond === "up" ? (prev == null ? false : prev < target && hi >= target)
        : a.cond === "down" ? (prev == null ? false : prev > target && lo <= target)
        : (prev == null ? false : (prev - target) * (cur - target) <= 0 || (lo <= target && hi >= target));
      const minGap = a.freq === "bar" ? Math.max(60e3, ((TFY[a.tf || "15m"] || TFY["15m"])[2]) * 1000) : 0;
      const can = !a.last_fired || now - new Date(a.last_fired).getTime() >= minGap;
      const upd: Record<string, unknown> = { last_check: new Date(now).toISOString(), last_price: cur };
      if (hit && can) {
        fired++; const msg = a.kind === "ind" ? `${what} ${COND[a.cond] || "ha cruzado"} ${target} (ahora ${cur.toFixed(1)})` : `${what} · ahora ${fmt(cur)}`;
        upd.last_fired = new Date(now).toISOString(); upd.fired = (a.fired || 0) + 1; if (a.freq !== "bar") upd.active = false;
        await sb.from("alert_events").insert({ user_id: a.user_id, alert_id: a.id, sym: a.sym, msg: msg + (a.note ? " · " + a.note : ""), price: cur });
        if (pub && priv) {
          const { data: subs } = await sb.from("push_subs").select("endpoint,sub").eq("user_id", a.user_id);
          for (const s of subs || []) {
            try { await webpush.sendNotification(s.sub, JSON.stringify({ title: "Alerta · " + a.sym, body: msg + (a.note ? "\n" + a.note : ""), url: "./#analizar" }), { TTL: 600 }); }
            catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint); }
          }
        }
      }
      await sb.from("alerts").update(upd).eq("id", a.id);
    } catch (_e) { /* una alerta rota no para las demás */ }
  }
  return new Response(JSON.stringify({ checked, fired }), { headers: { "Content-Type": "application/json" } });
});
