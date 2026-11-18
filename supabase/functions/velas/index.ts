// Velas públicas (respaldo cuando MT5 está cerrado).
// v5 (18-nov-2026): divisas, oro, plata, petróleo e índices desde Dukascopy (precio de contado, al momento, con mechas reales
// y años de historial en todos los marcos). Yahoo Finance queda de respaldo. Uso en pruebas: sustituir por un proveedor
// con licencia antes de cobrar.
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
function clean(s: string) { return s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(PRO|ECN|RAW|MICRO|CASH|SPOT|M)$/, ""); }
function resolve(sym: string): string | null {
  const c = clean(sym);
  if (MAP[c]) return MAP[c];
  for (const k of Object.keys(MAP)) if (c.startsWith(k)) return MAP[k];
  if (/^[A-Z]{6}$/.test(c)) return c + "=X";
  return null;
}
/* ---------- Dukascopy ---------- */
const DMAP: Record<string, [string, number]> = {
  XAUUSD: ["XAU/USD", 2], XAGUSD: ["XAG/USD", 3], USOIL: ["LIGHT.CMD/USD", 2], WTI: ["LIGHT.CMD/USD", 2], UKOIL: ["BRENT.CMD/USD", 2], BRENT: ["BRENT.CMD/USD", 2],
  NAS100: ["USATECH.IDX/USD", 1], US100: ["USATECH.IDX/USD", 1], USTEC: ["USATECH.IDX/USD", 1], US500: ["USA500.IDX/USD", 1], SPX500: ["USA500.IDX/USD", 1],
  US30: ["USA30.IDX/USD", 1], DJ30: ["USA30.IDX/USD", 1], GER40: ["DEU.IDX/EUR", 1], DE40: ["DEU.IDX/EUR", 1], UK100: ["GBR.IDX/GBP", 1],
  SPA35: ["ESP.IDX/EUR", 1], FRA40: ["FRA.IDX/EUR", 1], JPN225: ["JPN.IDX/JPY", 0],
};
const DTF: Record<string, [string, number]> = { "1m": ["1MIN", 60], "5m": ["5MIN", 300], "15m": ["15MIN", 900], "30m": ["30MIN", 1800], "1h": ["1HOUR", 3600], "4h": ["4HOUR", 14400], "1d": ["1DAY", 86400], "1w": ["1WEEK", 604800] };
function dukaOf(sym: string): [string, number] | null {
  const c = clean(sym);
  if (DMAP[c]) return DMAP[c];
  for (const k of Object.keys(DMAP)) if (c.startsWith(k)) return DMAP[k];
  if (/^[A-Z]{6}$/.test(c) && !/^(BTC|ETH|SOL|XRP|BNB|ADA|DOG|LTC)/.test(c)) return [c.slice(0, 3) + "/" + c.slice(3), /JPY$/.test(c) ? 3 : 5];
  return null;
}
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
async function fromDuka(sym: string, tf: string, toSec: number | null, last: boolean) {
  const d = dukaOf(sym), cfg = DTF[tf]; if (!d || !cfg) return null;
  const nowMs = Date.now(), toMs = toSec ? toSec * 1000 : nowMs;
  const limit = last ? 120 : tf === "1m" ? 1500 : 1000;
  let bars = await duka(d[0], cfg[0], toMs, limit);
  if (!bars.length && toSec) return { bars: [], more: false, digits: d[1] };
  if (!bars.length) throw new Error("dukascopy vacío");
  const more = bars.length >= limit * 0.9;
  /* la vela diaria o semanal que aún se está formando: Dukascopy solo da las cerradas; se hace con las de 1 hora */
  if (!toSec && (tf === "1d" || tf === "1w")) {
    const n = new Date(nowMs), day = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    const start = tf === "1d" ? day : day - ((n.getUTCDay() + 6) % 7) * 864e5;
    const lastB = bars[bars.length - 1];
    if (lastB[0] < start) {
      const H = (await duka(d[0], "1HOUR", nowMs, tf === "1d" ? 30 : 180)).filter(b => b[0] >= start);
      if (H.length) bars.push([start, H[0][1], Math.max(...H.map(b => b[2])), Math.min(...H.map(b => b[3])), H[H.length - 1][4], H.reduce((s, b) => s + b[5], 0)]);
    }
  }
  /* la vela intradía que se está formando: Dukascopy solo da las cerradas; se hace con las de 1 minuto */
  if (!toSec && tf !== "1m" && tf !== "1d" && tf !== "1w") {
    const step = cfg[1] * 1000, next = bars[bars.length - 1][0] + step;
    if (nowMs > next) {
      const Mn = (await duka(d[0], "1MIN", nowMs, Math.min(300, cfg[1] / 60 + 5))).filter(b => b[0] >= next);
      for (const m of Mn) {
        const k = Math.floor(m[0] / step) * step, L = bars[bars.length - 1];
        if (L[0] === k) { L[2] = Math.max(L[2], m[2]); L[3] = Math.min(L[3], m[3]); L[4] = m[4]; L[5] += m[5]; }
        else if (k > L[0]) bars.push([k, m[1], m[2], m[3], m[4], m[5]]);
      }
    }
  }
  if (tf !== "1d" && tf !== "1w") bars = tidy(bars, cfg[1] * 1000, true);
  return { bars, more, digits: d[1] };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "max-age=15" } });
}
/* Yahoo añade al final un punto con la hora exacta de ahora (p. ej. 19:32:45) en vez de la hora de la vela (19:30).
   El gráfico lo tomaba como una vela nueva y cada 15 s aparecía otra vela pequeña. Aquí cada punto se junta con su vela. */
function tidy(bars: number[][], step: number, intraday: boolean) {
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
    if (p && b[2] === b[3] && b[1] === b[4] && (!intraday || b[0] - p[0] <= step * 3)) b[1] = p[4];
    b[2] = Math.max(b[2], b[1], b[4]); b[3] = Math.min(b[3], b[1], b[4]);
  }
  return out;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let q: Record<string, unknown> = {};
  try { q = req.method === "POST" ? await req.json() : Object.fromEntries(new URL(req.url).searchParams); } catch { /* vacío */ }
  const sym = String(q.sym || ""), tf = String(q.tf || "5m");
  if (q.src !== "yahoo") {
    try {
      const D = await fromDuka(sym, tf, Number(q.to) > 0 ? Math.min(Number(q.to), Math.floor(Date.now() / 1000)) : null, !!q.last);
      if (D) return json({ sym, src: "dukascopy", tf, bars: D.bars, more: D.more, delayed: false, deep: true, digits: D.digits });
    } catch (_e) { /* si Dukascopy falla, se usa Yahoo */ }
  }
  const y = resolve(sym), cfg = TF[tf];
  if (!y || !cfg) return json({ error: "Mercado o marco no disponible", sym, tf }, 400);
  const now = Math.floor(Date.now() / 1000);
  const to = Number(q.to) > 0 ? Math.min(Number(q.to), now) : now;
  const oldest = now - cfg[2];
  if (to <= oldest) return json({ sym, yahoo: y, tf, bars: [], more: false, delayed: DELAYED.has(y) });
  // «last»: solo las últimas velas (para actualizar el gráfico cada 15 s sin descargar días enteros)
  const span = q.last ? Math.min(cfg[1], Math.max(cfg[3] * 120, 6 * 3600)) : cfg[1];
  const from = Math.max(oldest, to - span);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?interval=${cfg[0]}&period1=${from}&period2=${to}&includePrePost=true`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Tickora/1.0)", "Accept": "application/json" } });
  if (!r.ok) return json({ error: "La fuente pública no respondió (" + r.status + ")" }, 502);
  const d = await r.json();
  const res = d?.chart?.result?.[0];
  if (!res || !res.timestamp) return json({ sym, yahoo: y, tf, bars: [], more: from > oldest, delayed: DELAYED.has(y) });
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
  return json({ sym, src: "yahoo", yahoo: y, tf, bars, more: from > oldest, delayed: DELAYED.has(y), digits: res.meta?.priceHint ?? null });
});
