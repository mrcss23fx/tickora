// Mercados de Tickora (25-nov-2026): de qué fuente sale cada mercado y el catálogo del buscador.
// Lo usan las funciones «velas» y «alertas» (cada una lleva su copia de este archivo).
// Fuentes: Dukascopy (divisas, metales, materias primas, índices, acciones, ETF y bonos en CFD) y Binance (cripto).

/* nombre de Tickora → [código de Dukascopy, decimales] */
export const NAMEDUKA: Record<string, [string, number]> = {
  // metales y materias primas
  XAUUSD: ["XAU/USD", 2], XAGUSD: ["XAG/USD", 3], XPTUSD: ["XPT.CMD/USD", 2], XPDUSD: ["XPD.CMD/USD", 2],
  USOIL: ["LIGHT.CMD/USD", 2], WTI: ["LIGHT.CMD/USD", 2], UKOIL: ["BRENT.CMD/USD", 2], BRENT: ["BRENT.CMD/USD", 2],
  NATGAS: ["GAS.CMD/USD", 3], DIESEL: ["DIESEL.CMD/USD", 2], COPPER: ["COPPER.CMD/USD", 3],
  COCOA: ["COCOA.CMD/USD", 2], COFFEE: ["COFFEE.CMD/USX", 2], COTTON: ["COTTON.CMD/USX", 2], OJUICE: ["OJUICE.CMD/USX", 2],
  SOYBEAN: ["SOYBEAN.CMD/USX", 2], SUGAR: ["SUGAR.CMD/USD", 2],
  // índices
  US30: ["USA30.IDX/USD", 1], DJ30: ["USA30.IDX/USD", 1], US500: ["USA500.IDX/USD", 1], SPX500: ["USA500.IDX/USD", 1],
  NAS100: ["USATECH.IDX/USD", 1], US100: ["USATECH.IDX/USD", 1], USTEC: ["USATECH.IDX/USD", 1], US2000: ["USSC2000.IDX/USD", 2],
  DXY: ["DOLLAR.IDX/USD", 3], USDX: ["DOLLAR.IDX/USD", 3], VIX: ["VOL.IDX/USD", 2],
  GER40: ["DEU.IDX/EUR", 1], DE40: ["DEU.IDX/EUR", 1], UK100: ["GBR.IDX/GBP", 1], FRA40: ["FRA.IDX/EUR", 1],
  SPA35: ["ESP.IDX/EUR", 1], ES35: ["ESP.IDX/EUR", 1], EU50: ["EUS.IDX/EUR", 1], STOXX50: ["EUS.IDX/EUR", 1],
  SWI20: ["CHE.IDX/CHF", 1], ITA40: ["ITA.IDX/EUR", 1], NLD25: ["NLD.IDX/EUR", 2], POL20: ["PLN.IDX/PLN", 1],
  JPN225: ["JPN.IDX/JPY", 0], JP225: ["JPN.IDX/JPY", 0], HK50: ["HKG.IDX/HKD", 1], AUS200: ["AUS.IDX/AUD", 1],
  CHINA50: ["CHI.IDX/USD", 1], SG30: ["SGD.IDX/SGD", 2], SA40: ["SOA.IDX/ZAR", 1],
  // bonos
  BUND: ["BUND.TR/EUR", 2], UKGILT: ["UKGILT.TR/GBP", 2], USTBOND: ["USTBOND.TR/USD", 2],
};
/* país de cada índice y bono (para el buscador) */
const IDXCC: Record<string, string> = {
  US30: "US", US500: "US", NAS100: "US", US2000: "US", DXY: "US", VIX: "US", GER40: "DE", UK100: "GB", FRA40: "FR", SPA35: "ES",
  EU50: "EU", SWI20: "CH", ITA40: "IT", NLD25: "NL", POL20: "PL", JPN225: "JP", HK50: "HK", AUS200: "AU", CHINA50: "CN", SG30: "SG",
  SA40: "ZA", BUND: "DE", UKGILT: "GB", USTBOND: "US",
};
/* moneda en la que cotizan las acciones y ETF de cada país en Dukascopy (Reino Unido: peniques, salvo unos pocos ETF) */
const CUR: Record<string, string> = {
  US: "USD", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", AT: "EUR", BE: "EUR", FI: "EUR", IE: "EUR", PT: "EUR",
  CH: "CHF", DK: "DKK", SE: "SEK", NO: "NOK", HK: "HKD", JP: "JPY", MX: "MXN", GB: "GBX",
};
export const CRYPTO = /^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|LTC|AVAX|DOT|LINK|TRX|TON|MATIC|SHIB)/;
export const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(PRO|ECN|RAW|MICRO|CASH|SPOT|M)$/, "");

/* futuros continuos (contrato más cercano), como en TradingView: ES1!, NQ1!, GC1!, CL1!…
   Precio público de Yahoo (CME, CBOT, NYMEX, COMEX e ICE de EE. UU.; 10 min de retraso). */
export const FUTROOT = new Set(["ES", "MES", "NQ", "MNQ", "YM", "MYM", "RTY", "M2K", "NKD", "CL", "MCL", "BZ", "NG", "RB", "HO",
  "GC", "MGC", "SI", "SIL", "HG", "PL", "PA", "ZB", "ZN", "ZF", "ZT", "ZC", "ZS", "ZW", "KE", "ZL", "ZM", "ZO", "ZR",
  "KC", "CC", "SB", "CT", "OJ", "LE", "GF", "HE", "6E", "6B", "6J", "6A", "6C", "6S", "6N", "6M", "BTC", "MBT", "ETH", "MET"]);
export function futOf(sym: string): string | null {
  const m = String(sym || "").toUpperCase().trim().match(/^([A-Z0-9]{1,4})1!$/);
  return m && FUTROOT.has(m[1]) ? m[1] + "=F" : null;
}

/* par de Binance de un mercado de cripto (BTCUSD de siempre → BTCUSDT; PEPEUSDT tal cual) */
export function binOf(sym: string): string | null {
  const raw = String(sym || "").toUpperCase().trim();
  if (/\.[A-Z]{2}$/.test(raw) || /!$/.test(raw)) return null; // acciones y futuros no son de Binance
  const c = raw.replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z0-9]{2,15}(USDT|USDC|FDUSD)$/.test(c)) return c;
  const m = c.match(CRYPTO);
  return m ? m[1] + "USDT" : null;
}

export type Duka = { code: string; digits: number | null; alt: string[] };
/* código de Dukascopy de un mercado de Tickora */
export function dukaOf(sym: string): Duka | null {
  const raw = String(sym || "").toUpperCase().trim();
  const m = raw.match(/^([A-Z0-9]{1,12})\.([A-Z]{2})$/); // acciones y ETF: AAPL.US, SAN.ES, BARC.GB…
  if (m) {
    const cur = CUR[m[2]]; if (!cur) return null;
    return { code: `${m[1]}.${m[2]}/${cur}`, digits: m[2] === "JP" ? 0 : 2, alt: m[2] === "GB" ? [`${m[1]}.GB/USD`, `${m[1]}.GB/GBP`] : [] };
  }
  if (binOf(raw) || /!$/.test(raw)) return null; // los futuros vienen de Yahoo
  const c = clean(raw);
  if (NAMEDUKA[c]) return { code: NAMEDUKA[c][0], digits: NAMEDUKA[c][1], alt: [] };
  for (const k of Object.keys(NAMEDUKA)) if (k.length >= 4 && c.startsWith(k)) return { code: NAMEDUKA[k][0], digits: NAMEDUKA[k][1], alt: [] };
  if (/^[A-Z]{6}$/.test(c)) return { code: c.slice(0, 3) + "/" + c.slice(3), digits: /^XAU/.test(c) ? 2 : /^XAG/.test(c) ? 3 : null, alt: [] };
  return null;
}
/* decimales a partir del precio cuando no se saben (divisas exóticas, etc.) */
export function digitsFor(price: number, fx: boolean): number {
  const p = Math.abs(price);
  if (fx) return p >= 1000 ? 2 : p >= 100 ? 3 : p >= 10 ? 4 : 5;
  return p >= 1 ? 2 : p >= 0.1 ? 3 : 4;
}

/* catálogo del buscador: [símbolo, categoría, subgrupo, país, nombre, decimales] */
const GROUP: Record<string, [string, string]> = {
  FX_MAJORS: ["fx", "may"], FX_CROSSES: ["fx", "cru"], FX_METALS: ["com", "met"], CMD_ENERGY: ["com", "ene"], CMD_METALS: ["com", "met"],
  CMD_AGRICULTURAL: ["com", "agr"], IDX_AMERICA: ["idx", "am"], IDX_EUROPE: ["idx", "eu"], IDX_ASIA: ["idx", "as"], IDX_AFRICA: ["idx", "af"],
  BND_CFD: ["bnd", ""],
};
// deno-lint-ignore no-explicit-any
export function buildCatalog(js: any): (string | number)[][] {
  const groups = js && js.groups || {}, ins = js && js.instruments || {};
  const rev: Record<string, string> = {};
  for (const [k, v] of Object.entries(NAMEDUKA)) if (!rev[v[0]]) rev[v[0]] = k;
  const out: (string | number)[][] = [], seen = new Set<string>();
  // deno-lint-ignore no-explicit-any
  for (const [gk, g] of Object.entries<any>(groups)) {
    let cat = GROUP[gk];
    if (!cat) {
      if (g && g.parent === "STCK_CFD") cat = ["stk", ""];
      else if (gk === "ETF_CFD" || (g && g.parent === "ETF_CFD")) cat = ["etf", ""];
      else continue;
    }
    for (const ik of (g && g.instruments) || []) {
      const it = ins[ik]; if (!it || !it.name) continue;
      const code = String(it.name), pip = Number(it.pipValue) || 0.01, dec = Math.max(0, Math.round(-Math.log10(pip)));
      let sym = rev[code] || "", cc = "";
      const st = code.match(/^([A-Z0-9]+)\.([A-Z]{2})\/([A-Z]{3})$/);
      if (!sym && st && (cat[0] === "stk" || cat[0] === "etf")) { sym = st[1] + "." + st[2]; cc = st[2]; }
      if (!sym && /^[A-Z]{3}\/[A-Z]{3}$/.test(code)) sym = code.replace("/", "");
      if (!sym || seen.has(sym)) continue;
      seen.add(sym);
      let digits = dec;
      if (cat[0] === "fx") digits = dec + 1;
      else if (NAMEDUKA[sym]) digits = NAMEDUKA[sym][1];
      else if (/^XAU/.test(sym)) digits = 2;
      else if (/^XAG/.test(sym)) digits = 3;
      if (!cc) cc = IDXCC[sym] || "";
      out.push([sym, cat[0], cat[1] || cc, cc, String(it.description || "").replace(/\s+/g, " ").trim(), digits]);
    }
  }
  return out;
}
