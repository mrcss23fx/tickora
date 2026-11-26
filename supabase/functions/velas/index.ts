// Velas públicas (respaldo cuando MT5 está cerrado).
// v9 (26-nov-2026): la vela que se está formando llega hasta hace 2-3 s: Dukascopy publica la vela cerrada de 1 minuto unos
// 20 s tarde, así que lo último se completa con velas de 10 s y con los ticks. La respuesta dice hasta qué tick llega («asof»)
// para que el gráfico siga con los ticks en vivo de la función «vivo» sin contar dos veces. El precio de la lista sale del último tick.
// v8 (25-nov-2026): futuros continuos (ES1!, NQ1!, GC1!, CL1!…) con precio de Yahoo y 10 min de retraso.
// v7 (25-nov-2026): todos los mercados de Dukascopy (acciones, ETF, índices, materias primas y bonos además de divisas),
// catálogo para el buscador ({catalog:1}) y precios de muchos mercados en una sola llamada ({quotes:[…]}).
// v5 (18-nov-2026): divisas, oro, plata, petróleo e índices desde Dukascopy (precio de contado, al momento, con mechas reales
// y años de historial en todos los marcos). Yahoo Finance queda de respaldo. Uso en pruebas: sustituir por un proveedor
// con licencia antes de cobrar.
import { dukaOf, digitsFor, buildCatalog, clean, futOf } from "./mercados.ts";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const MAP: Record<string, string> = {
  EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDJPY: "JPY=X", AUDUSD: "AUDUSD=X", USDCAD: "CAD=X", USDCHF: "CHF=X",
  NZDUSD: "NZDUSD=X", EURJPY: "EURJPY=X", GBPJPY: "GBPJPY=X", EURGBP: "EURGBP=X", EURCHF: "EURCHF=X", AUDJPY: "AUDJPY=X",
  XAUUSD: "GC=F", XAGUSD: "SI=F", USOIL: "CL=F", UKOIL: "BZ=F",
  NAS100: "NQ=F", US100: "NQ=F", USTEC: "NQ=F", US500: "ES=F", SPX500: "ES=F", US30: "YM=F", DJ30: "YM=F",
  GER40: "^GDAXI", DE40: "^GDAXI", UK100: "^FTSE", SPA35: "^IBEX", FRA40: "^FCHI", JPN225: "^N225",
};
const DELAYED = new Set(["NQ=F", "ES=F", "YM=F", "GC=F", "SI=F", "CL=F", "BZ=F", "^GDAXI", "^FTSE", "^IBEX", "^FCHI", "^N225"]);
// marco → [intervalo de Yahoo, segundos por petición, máximo hacia atrás en segundos, segundos de cada vela]
const TF: Record<string, [string, number, number, number]> = {
  "1m": ["1m", 6 * 86400, 29 * 86400, 60],
  "5m": ["5m", 20 * 86400, 59 * 86400, 300],
  "15m": ["15m", 50 * 86400, 59 * 86400, 900],
  "30m": ["30m", 59 * 86400, 59 * 86400, 1800],
  "1h": ["60m", 200 * 86400, 729 * 86400, 3600],
  "4h": ["60m", 600 * 86400, 729 * 86400, 14400],
  "1d": ["1d", 3650 * 86400, 30 * 365 * 86400, 86400],
  "1w": ["1wk", 15 * 365 * 86400, 30 * 365 * 86400, 604800],
};
function resolve(sym: string): string | null {
  const f = futOf(sym); if (f) return f; // futuros: ES1! → ES=F
  if (/\./.test(sym)) return null; // acciones y ETF: solo Dukascopy
  const c = clean(sym);
  if (MAP[c]) return MAP[c];
  for (const k of Object.keys(MAP)) if (c.startsWith(k)) return MAP[k];
  if (/^[A-Z]{6}$/.test(c)) return c + "=X";
  return null;
}
/* ---------- Dukascopy ---------- */
const DTF: Record<string, [string, number]> = { "1m": ["1MIN", 60], "5m": ["5MIN", 300], "15m": ["15MIN", 900], "30m": ["30MIN", 1800], "1h": ["1HOUR", 3600], "4h": ["4HOUR", 14400], "1d": ["1DAY", 86400], "1w": ["1WEEK", 604800] };
async function duka(inst: string, iv: string, toMs: number, limit: number): Promise<number[][]> {
  const url = `https://freeserv.dukascopy.com/2.0/index.php?path=chart%2Fjson3&instrument=${encodeURIComponent(inst)}&offer_side=B&interval=${iv}&splits=true&stocks=true&limit=${limit}&time_direction=P&timestamp=${toMs}&jsonp=_callbacks____1`;
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; Tickora/1.0)", "Referer": "https://freeserv.dukascopy.com/" } });
    if (!r.ok) throw new Error("dukascopy " + r.status);
    const t = await r.text(), i = t.indexOf("("), j = t.lastIndexOf(")");
    const a = JSON.parse(t.slice(i + 1, j));
    if (!Array.isArray(a)) throw new Error("dukascopy sin datos");
    return a.filter((b: number[]) => Array.isArray(b) && b.length >= 5 && b.slice(1, 5).every(v => typeof v === "number" && isFinite(v))).map((b: number[]) => [b[0], b[1], b[2], b[3], b[4], b[5] || 0]).sort((x: number[], y: number[]) => x[0] - y[0]);
  } finally { clearTimeout(tm); }
}
/* últimos ticks (precio de compra, como las velas): [hora en ms, precio, volumen en millones como las velas], del más viejo al más nuevo */
async function dukaTicks(inst: string, toMs: number, limit: number): Promise<number[][]> {
  const url = `https://freeserv.dukascopy.com/2.0/index.php?path=chart%2Fjson3&instrument=${encodeURIComponent(inst)}&offer_side=B&interval=TICK&splits=true&stocks=true&limit=${limit}&time_direction=P&timestamp=${toMs}&jsonp=_callbacks____1`;
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; Tickora/1.0)", "Referer": "https://freeserv.dukascopy.com/" } });
    if (!r.ok) throw new Error("dukascopy " + r.status);
    const t = await r.text(), a = JSON.parse(t.slice(t.indexOf("(") + 1, t.lastIndexOf(")")));
    if (!Array.isArray(a)) return [];
    return a.filter((x: number[]) => Array.isArray(x) && x.length >= 4 && isFinite(x[0]) && isFinite(x[1]) && x[1] > 0)
      .map((x: number[]) => [x[0], x[1], (+x[3] || 0) / 1e6]).sort((x: number[], y: number[]) => x[0] - y[0]);
  } finally { clearTimeout(tm); }
}
const weekOf = (t: number) => { const d = Math.floor(t / 864e5) * 864e5; return d - ((new Date(d).getUTCDay() + 6) % 7) * 864e5; };
async function fromDuka(sym: string, tf: string, toSec: number | null, last: boolean) {
  const d = dukaOf(sym), cfg = DTF[tf]; if (!d || !cfg) return null;
  const nowMs = Date.now(), toMs = toSec ? toSec * 1000 : nowMs;
  const limit = last ? 120 : tf === "1m" ? 1500 : 1000;
  let code = d.code, bars = await duka(code, cfg[0], toMs, limit);
  for (const a of d.alt) { if (bars.length) break; const b2 = await duka(a, cfg[0], toMs, limit); if (b2.length) { code = a; bars = b2; } }
  const dg = () => d.digits ?? (bars.length ? digitsFor(bars[bars.length - 1][4], /^[A-Z]{3}\/[A-Z]{3}$/.test(code)) : 5);
  if (!bars.length && toSec) return { bars: [], more: false, digits: dg() };
  if (!bars.length) throw new Error("dukascopy vacío");
  const more = bars.length >= limit * 0.9;
  /* la vela que se está formando: Dukascopy solo da velas cerradas, y la de 1 minuto llega unos 20 s tarde.
     Se completa por partes: horas (diaria y semanal), minutos, velas de 10 s y, al final, los ticks. */
  let asof = 0;
  if (!toSec) {
    const step = cfg[1] * 1000;
    const bucket = (t: number) => tf === "1w" ? weekOf(t) : tf === "1d" ? Math.floor(t / 864e5) * 864e5 : Math.floor(t / step) * step;
    const add = (m: number[]) => {
      const k = bucket(m[0]), L = bars[bars.length - 1];
      if (!L || k > L[0]) bars.push([k, m[1], m[2], m[3], m[4], m[5]]);
      else if (k === L[0]) { L[2] = Math.max(L[2], m[2]); L[3] = Math.min(L[3], m[3]); L[4] = m[4]; L[5] += m[5]; }
    };
    const lb = bars[bars.length - 1];
    let cover = lb[0] + (tf === "1w" ? 7 * 864e5 : tf === "1d" ? 864e5 : step); // hasta dónde llegan las velas cerradas
    if (tf !== "1m" && nowMs > cover) {
      if (tf === "1d" || tf === "1w") {
        const H = (await duka(code, "1HOUR", nowMs, tf === "1d" ? 30 : 180).catch(() => [] as number[][])).filter(b => b[0] >= cover);
        H.forEach(add); if (H.length) cover = H[H.length - 1][0] + 3600e3;
      }
      const Mn = (await duka(code, "1MIN", nowMs, Math.min(300, Math.ceil((nowMs - cover) / 6e4) + 5)).catch(() => [] as number[][])).filter(b => b[0] >= cover);
      Mn.forEach(add); if (Mn.length) cover = Mn[Mn.length - 1][0] + 6e4;
    }
    if (nowMs > cover && nowMs - cover < 15 * 6e4) { // mercado abierto: los últimos segundos
      const [S10, T] = await Promise.all([duka(code, "10SEC", nowMs, 12).catch(() => [] as number[][]), dukaTicks(code, nowMs, 400).catch(() => [] as number[][])]);
      const s10 = S10.filter(b => b[0] >= cover); s10.forEach(add); if (s10.length) cover = s10[s10.length - 1][0] + 1e4;
      const tk = T.filter(t => t[0] >= cover); tk.forEach(t => add([t[0], t[1], t[1], t[1], t[1], t[2]]));
      asof = tk.length ? tk[tk.length - 1][0] : s10.length ? cover - 1 : 0;
    }
  }
  if (tf !== "1d" && tf !== "1w") bars = tidy(bars, cfg[1] * 1000, true, false); // Dukascopy: cada vela abre en su primer tick
  return { bars, more, digits: dg(), asof };
}
function json(body: unknown, status = 200, maxAge = 15) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "max-age=" + maxAge } });
}
/* ---------- catálogo del buscador (se guarda en memoria 12 h) ---------- */
let CAT: { t: number; list: (string | number)[][] } | null = null;
async function catalog() {
  if (CAT && Date.now() - CAT.t < 12 * 3600e3) return CAT.list;
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch("https://freeserv.dukascopy.com/2.0/index.php?path=common%2Finstruments&jsonp=_callbacks____1", { signal: ac.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; Tickora/1.0)", "Referer": "https://freeserv.dukascopy.com/" } });
    if (!r.ok) throw new Error("dukascopy " + r.status);
    const t = await r.text();
    const list = buildCatalog(JSON.parse(t.slice(t.indexOf("(") + 1, t.lastIndexOf(")"))));
    if (list.length < 10) throw new Error("lista incompleta");
    CAT = { t: Date.now(), list };
    return list;
  } finally { clearTimeout(tm); }
}
/* ---------- precio y cambio del día de muchos mercados en una llamada (se guarda 20 s) ---------- */
type Quote = { last: number; chg: number | null; t: number; digits: number };
const QC = new Map<string, { t: number; v: Quote | null }>();
async function yahooQuote(sym: string, y: string): Promise<Quote | null> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?interval=5m&range=1d`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Tickora/1.0)", "Accept": "application/json" } });
  if (!r.ok) return null;
  const m = (await r.json())?.chart?.result?.[0]?.meta; if (!m || m.regularMarketPrice == null) return null;
  const last = +m.regularMarketPrice, prev = m.chartPreviousClose != null ? +m.chartPreviousClose : (m.previousClose != null ? +m.previousClose : null);
  return { last, chg: prev ? (last - prev) / prev * 100 : null, t: (m.regularMarketTime || 0) * 1000 || Date.now(), digits: m.priceHint ?? digitsFor(last, false) };
}
async function quoteOf(sym: string): Promise<Quote | null> {
  const hit = QC.get(sym); if (hit && Date.now() - hit.t < 20000) return hit.v;
  const fy = futOf(sym);
  if (fy) { const v = await yahooQuote(sym, fy).catch(() => null); QC.set(sym, { t: Date.now(), v }); return v; }
  const d = dukaOf(sym); if (!d) return null;
  const now = Date.now();
  let code = d.code, D = await duka(code, "1DAY", now, 3);
  for (const a of d.alt) { if (D.length) break; const d2 = await duka(a, "1DAY", now, 3); if (d2.length) { code = a; D = d2; } }
  if (!D.length) { QC.set(sym, { t: now, v: null }); return null; }
  const T = await dukaTicks(code, now, 1).catch(() => [] as number[][]);
  const M = T.length ? T.map(t => [t[0], t[1], t[1], t[1], t[1], 0]) : await duka(code, "1MIN", now, 1).catch(() => [] as number[][]);
  const L = D[D.length - 1], P = D[D.length - 2], m = M[M.length - 1];
  let last: number, prev: number | null;
  if (m && m[0] >= L[0] + 864e5) { last = m[4]; prev = L[4]; } // el día de hoy se está moviendo
  else { last = L[4]; prev = P ? P[4] : L[1]; } // mercado cerrado: el cambio de su último día
  const v: Quote = { last, chg: prev ? (last - prev) / prev * 100 : null, t: m ? m[0] : L[0], digits: d.digits ?? digitsFor(last, /^[A-Z]{3}\/[A-Z]{3}$/.test(code)) };
  if (QC.size > 3000) QC.clear();
  QC.set(sym, { t: now, v });
  return v;
}
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
/* Yahoo añade al final un punto con la hora exacta de ahora (p. ej. 19:32:45) en vez de la hora de la vela (19:30).
   El gráfico lo tomaba como una vela nueva y cada 15 s aparecía otra vela pequeña. Aquí cada punto se junta con su vela. */
function tidy(bars: number[][], step: number, intraday: boolean, fixFlat = true) {
  bars.sort((a, b) => a[0] - b[0]);
  const out: number[][] = [];
  for (const b0 of bars) {
    const b = b0.slice();
    if (intraday) b[0] = Math.floor(b[0] / step) * step;
    const last = out[out.length - 1];
    if (last && (b[0] === last[0] || (!intraday && b[0] - last[0] < step * 0.9))) {
      last[2] = Math.max(last[2], b[2]); last[3] = Math.min(last[3], b[3]); last[4] = b[4]; last[5] = Math.max(last[5], b[5]);
    } else out.push(b);
  }
  // Velas imposibles o sin forma: el máximo y el mínimo siempre abarcan apertura y cierre, y si Yahoo
  // solo da un precio por vela (divisas en 1 minuto) la vela abre donde cerró la anterior.
  for (let i = 0; i < out.length; i++) {
    const b = out[i], p = out[i - 1];
    if (fixFlat && p && b[2] === b[3] && b[1] === b[4] && (!intraday || b[0] - p[0] <= step * 3)) b[1] = p[4];
    b[2] = Math.max(b[2], b[1], b[4]); b[3] = Math.min(b[3], b[1], b[4]);
  }
  return out;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let q: Record<string, unknown> = {};
  try { q = req.method === "POST" ? await req.json() : Object.fromEntries(new URL(req.url).searchParams); } catch { /* vacío */ }
  if (q.catalog) {
    try { return json({ v: 1, t: Date.now(), list: await catalog() }, 200, 3600); }
    catch (_e) { return json({ error: "No se pudo cargar la lista de mercados" }, 502); }
  }
  if (Array.isArray(q.quotes)) {
    const list = Array.from(new Set((q.quotes as unknown[]).map(String).filter(s => /^[A-Za-z0-9._!-]{1,24}$/.test(s)))).slice(0, 40);
    const out: Record<string, Quote> = {};
    await pool(list, 8, async s => { try { const v = await quoteOf(s); if (v) out[s] = v; } catch (_e) { /* sin precio */ } });
    return json({ q: out });
  }
  const sym = String(q.sym || "").slice(0, 32), tf = String(q.tf || "5m");
  if (q.src !== "yahoo") {
    try {
      const D = await fromDuka(sym, tf, Number(q.to) > 0 ? Math.min(Number(q.to), Math.floor(Date.now() / 1000)) : null, !!q.last);
      if (D) return json({ sym, src: "dukascopy", tf, bars: D.bars, more: D.more, delayed: false, deep: true, digits: D.digits, asof: D.asof || undefined });
    } catch (_e) { /* si Dukascopy falla, se usa Yahoo */ }
  }
  const y = resolve(sym), cfg = TF[tf];
  if (!y || !cfg) return json({ error: "Mercado o marco no disponible", sym, tf }, 400);
  const now = Math.floor(Date.now() / 1000);
  const to = Number(q.to) > 0 ? Math.min(Number(q.to), now) : now;
  const oldest = now - cfg[2];
  if (to <= oldest) return json({ sym, yahoo: y, tf, bars: [], more: false, delayed: DELAYED.has(y) || /=F$/.test(y) });
  // «last»: solo las últimas velas (para actualizar el gráfico cada 15 s sin descargar días enteros)
  const span = q.last ? Math.min(cfg[1], Math.max(cfg[3] * 120, 6 * 3600)) : cfg[1];
  const from = Math.max(oldest, to - span);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?interval=${cfg[0]}&period1=${from}&period2=${to}&includePrePost=true`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Tickora/1.0)", "Accept": "application/json" } });
  if (!r.ok) return json({ error: "La fuente pública no respondió (" + r.status + ")" }, 502);
  const d = await r.json();
  const res = d?.chart?.result?.[0];
  if (!res || !res.timestamp) return json({ sym, yahoo: y, tf, bars: [], more: from > oldest, delayed: DELAYED.has(y) || /=F$/.test(y) });
  const qq = res.indicators?.quote?.[0] || {};
  let bars: number[][] = [];
  for (let i = 0; i < res.timestamp.length; i++) {
    const o = qq.open?.[i], h = qq.high?.[i], l = qq.low?.[i], c = qq.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    bars.push([res.timestamp[i] * 1000, o, h, l, c, qq.volume?.[i] || 0]);
  }
  const intraday = cfg[3] < 86400;
  bars = tidy(bars, (tf === "4h" ? 3600 : cfg[3]) * 1000, intraday);
  if (tf === "4h") {
    const out: number[][] = []; const H4 = 4 * 3600 * 1000;
    for (const b of bars) {
      const k = Math.floor(b[0] / H4) * H4, last = out[out.length - 1];
      if (last && last[0] === k) { last[2] = Math.max(last[2], b[2]); last[3] = Math.min(last[3], b[3]); last[4] = b[4]; last[5] += b[5]; }
      else out.push([k, b[1], b[2], b[3], b[4], b[5]]);
    }
    bars = out;
  }
  return json({ sym, src: "yahoo", yahoo: y, tf, bars, more: from > oldest, delayed: DELAYED.has(y) || /=F$/.test(y), digits: futOf(sym) ? null : (res.meta?.priceHint ?? null) }); // futuros: decimales del buscador
});
