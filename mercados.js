/* Tickora · buscador de mercados (25-nov-2026). Pieza 1 del gráfico al nivel de TradingView, opción A («Lista con filtros»).
   Miles de mercados: Dukascopy (divisas, índices, materias primas, acciones, ETF y bonos en CFD, a través de la función «velas»)
   y Binance (cripto, directo desde el navegador). Se busca como se dice en español («oro», «ibex», «santander», «bitcoin»),
   con categorías, recientes, favoritos, tus mercados de MT5, los que operas y el precio del momento. Diseño propio de Tickora. */
(function () {
  "use strict";
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin sitio en el navegador */ } }
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const flat = s => norm(s).replace(/[^a-z0-9]/g, "");
  const svg = (d, s, w) => `<svg width="${s || 18}" height="${s || 18}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="${w || 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    search: '<circle cx="9" cy="9" r="5.5"/><path d="M13 13l4.5 4.5"/>', x: '<path d="M5 5l10 10M15 5L5 15"/>', back: '<path d="M12.5 4.5L7 10l5.5 5.5"/>',
    star: '<path d="M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z"/>', plus: '<path d="M10 4v12M4 10h12"/>', ok: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>'
  };

  /* ---------- nombres en español ---------- */
  const CC = { US: "EE. UU.", ES: "España", DE: "Alemania", FR: "Francia", GB: "Reino Unido", IT: "Italia", NL: "Países Bajos", CH: "Suiza", SE: "Suecia", NO: "Noruega", DK: "Dinamarca", AT: "Austria", BE: "Bélgica", FI: "Finlandia", IE: "Irlanda", PT: "Portugal", HK: "Hong Kong", JP: "Japón", MX: "México", EU: "Zona euro", AU: "Australia", CN: "China", SG: "Singapur", ZA: "Sudáfrica", PL: "Polonia" };
  const CUR = { USD: "Dólar estadounidense", EUR: "Euro", GBP: "Libra esterlina", JPY: "Yen japonés", CHF: "Franco suizo", AUD: "Dólar australiano", NZD: "Dólar neozelandés", CAD: "Dólar canadiense", MXN: "Peso mexicano", TRY: "Lira turca", ZAR: "Rand sudafricano", CNH: "Yuan chino", HKD: "Dólar de Hong Kong", SGD: "Dólar de Singapur", SEK: "Corona sueca", NOK: "Corona noruega", DKK: "Corona danesa", PLN: "Esloti polaco", HUF: "Florín húngaro", CZK: "Corona checa", RUB: "Rublo ruso", ILS: "Séquel israelí", AED: "Dírham de EAU", SAR: "Riyal saudí", THB: "Baht tailandés", RON: "Leu rumano", BRL: "Real brasileño", INR: "Rupia india", KRW: "Won surcoreano", BGN: "Lev búlgaro", ISK: "Corona islandesa", XAU: "Oro", XAG: "Plata", XPT: "Platino", XPD: "Paladio" };
  const MAJ = new Set(["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD"]);
  /* mercados con nombre propio: [nombre, otras formas de buscarlo] */
  const NAMES = {
    XAUUSD: ["Oro / Dólar estadounidense", "oro gold"], XAGUSD: ["Plata / Dólar estadounidense", "plata silver"], XPTUSD: ["Platino", "platino platinum"], XPDUSD: ["Paladio", "paladio palladium"],
    USOIL: ["Petróleo WTI", "petroleo crudo oil wti texas"], UKOIL: ["Petróleo Brent", "petroleo crudo oil brent"], NATGAS: ["Gas natural", "gas natural ngas"], DIESEL: ["Gasóleo", "gasoleo diesel gasoil"],
    COPPER: ["Cobre", "cobre copper"], COCOA: ["Cacao", "cacao cocoa"], COFFEE: ["Café arábica", "cafe coffee"], COTTON: ["Algodón", "algodon cotton"], OJUICE: ["Zumo de naranja", "zumo jugo naranja orange juice"],
    SOYBEAN: ["Soja", "soja soya soybean"], SUGAR: ["Azúcar (Londres n.º 5)", "azucar sugar"],
    US30: ["Dow Jones 30", "dow jones dj30 wall street usa30"], US500: ["S&P 500", "sp500 spx sandp usa500"], NAS100: ["Nasdaq 100", "nasdaq us100 ustec tecnologicas"], US2000: ["Russell 2000", "russell small caps"],
    DXY: ["Índice del dólar", "dolar dxy usdx indice"], VIX: ["Índice de volatilidad (VIX)", "vix volatilidad miedo"],
    GER40: ["DAX 40", "dax de40 alemania"], UK100: ["FTSE 100", "ftse londres"], FRA40: ["CAC 40", "cac francia"], SPA35: ["IBEX 35", "ibex es35 espana"], EU50: ["Euro Stoxx 50", "stoxx eurostoxx europa"],
    SWI20: ["SMI 20", "smi suiza"], ITA40: ["FTSE MIB 40", "mib italia"], NLD25: ["AEX 25", "aex holanda paises bajos"], POL20: ["WIG 20", "wig polonia"],
    JPN225: ["Nikkei 225", "nikkei japon jp225"], HK50: ["Hong Kong 40 (Hang Seng)", "hang seng hong kong hk40"], AUS200: ["ASX 200", "asx australia"], CHINA50: ["China A50", "china a50"],
    SG30: ["Singapur (blue chips)", "singapur"], SA40: ["Sudáfrica 40", "sudafrica"],
    BUND: ["Bono alemán (Bund)", "bund bono aleman"], UKGILT: ["Bono británico (Gilt)", "gilt bono reino unido"], USTBOND: ["Bono del Tesoro de EE. UU.", "bono tesoro tbond treasury"]
  };
  /* acciones y ETF conocidos: [nombre, otras formas de buscarlo] */
  const STK = {
    "SAN.ES": ["Banco Santander", "santander"], "BBVA.ES": ["BBVA", "bbva"], "ITX.ES": ["Inditex", "inditex zara"], "IBE.ES": ["Iberdrola", "iberdrola"], "TEF.ES": ["Telefónica", "telefonica movistar"],
    "REP.ES": ["Repsol", "repsol"], "CABK.ES": ["CaixaBank", "caixabank caixa"], "FER.ES": ["Ferrovial", "ferrovial"], "AMS.ES": ["Amadeus", "amadeus"], "AENA.ES": ["Aena", "aena aeropuertos"],
    "ACS.ES": ["ACS", "acs"], "GRF.ES": ["Grifols", "grifols"], "MAP.ES": ["Mapfre", "mapfre"], "SAB.ES": ["Banco Sabadell", "sabadell"], "BKT.ES": ["Bankinter", "bankinter"], "ELE.ES": ["Endesa", "endesa"],
    "NTGY.ES": ["Naturgy", "naturgy"], "CLNX.ES": ["Cellnex", "cellnex"], "ANA.ES": ["Acciona", "acciona"], "IDR.ES": ["Indra", "indra"], "IAG.ES": ["IAG (Iberia)", "iag iberia vueling"],
    "AAPL.US": ["Apple", "apple iphone"], "MSFT.US": ["Microsoft", "microsoft"], "NVDA.US": ["NVIDIA", "nvidia"], "TSLA.US": ["Tesla", "tesla"], "AMZN.US": ["Amazon", "amazon"],
    "GOOGL.US": ["Alphabet (Google)", "google alphabet"], "GOOG.US": ["Alphabet (Google)", "google alphabet"], "META.US": ["Meta (Facebook)", "meta facebook instagram"], "NFLX.US": ["Netflix", "netflix"],
    "AMD.US": ["AMD", "amd"], "INTC.US": ["Intel", "intel"], "KO.US": ["Coca-Cola", "coca cola cocacola"], "MCD.US": ["McDonald's", "mcdonalds"], "DIS.US": ["Disney", "disney"], "NKE.US": ["Nike", "nike"],
    "JPM.US": ["JPMorgan", "jpmorgan"], "V.US": ["Visa", "visa"], "MA.US": ["Mastercard", "mastercard"], "BA.US": ["Boeing", "boeing"], "PYPL.US": ["PayPal", "paypal"], "UBER.US": ["Uber", "uber"],
    "PLTR.US": ["Palantir", "palantir"], "COIN.US": ["Coinbase", "coinbase"], "BABA.US": ["Alibaba", "alibaba"], "ORCL.US": ["Oracle", "oracle"], "PEP.US": ["PepsiCo", "pepsi pepsico"], "WMT.US": ["Walmart", "walmart"],
    "SAP.DE": ["SAP", "sap"], "SIE.DE": ["Siemens", "siemens"], "VOW3.DE": ["Volkswagen", "volkswagen vw"], "BMW.DE": ["BMW", "bmw"], "MBG.DE": ["Mercedes-Benz", "mercedes"], "ALV.DE": ["Allianz", "allianz"], "ADS.DE": ["Adidas", "adidas"],
    "MC.FR": ["LVMH", "lvmh louis vuitton"], "OR.FR": ["L'Oréal", "loreal"], "AIR.FR": ["Airbus", "airbus"], "TTE.FR": ["TotalEnergies", "total totalenergies"], "ASML.NL": ["ASML", "asml"], "NESN.CH": ["Nestlé", "nestle"],
    "NOVOB.DK": ["Novo Nordisk", "novo nordisk ozempic"],
    "SPY.US": ["SPDR S&P 500 ETF", "sp500 spx"], "QQQ.US": ["Invesco QQQ (Nasdaq 100)", "nasdaq"], "GLD.US": ["SPDR Gold Shares", "oro gold"], "SLV.US": ["iShares Silver Trust", "plata silver"],
    "DIA.US": ["SPDR Dow Jones ETF", "dow jones"], "IWM.US": ["iShares Russell 2000", "russell"], "USO.US": ["United States Oil Fund", "petroleo oil"], "TLT.US": ["iShares bonos del Tesoro 20+ años", "bonos tesoro"]
  };
  const CRYN = { BTC: "Bitcoin", ETH: "Ethereum", BNB: "BNB", SOL: "Solana", XRP: "XRP", DOGE: "Dogecoin", ADA: "Cardano", TRX: "TRON", TON: "Toncoin", AVAX: "Avalanche", LINK: "Chainlink", DOT: "Polkadot", SHIB: "Shiba Inu", LTC: "Litecoin", BCH: "Bitcoin Cash", NEAR: "NEAR Protocol", UNI: "Uniswap", APT: "Aptos", SUI: "Sui", PEPE: "Pepe", ICP: "Internet Computer", ETC: "Ethereum Classic", XLM: "Stellar", ATOM: "Cosmos", FIL: "Filecoin", ARB: "Arbitrum", OP: "Optimism", HBAR: "Hedera", INJ: "Injective", AAVE: "Aave", RENDER: "Render", FET: "Fetch.ai", WLD: "Worldcoin", SEI: "Sei", TIA: "Celestia", POL: "Polygon", MATIC: "Polygon", ENA: "Ethena", JUP: "Jupiter", WIF: "dogwifhat", BONK: "Bonk", FLOKI: "Floki", TAO: "Bittensor", ONDO: "Ondo", ALGO: "Algorand", VET: "VeChain", SAND: "The Sandbox", MANA: "Decentraland", GRT: "The Graph", CRV: "Curve", LDO: "Lido DAO", RUNE: "THORChain", STX: "Stacks", IMX: "Immutable", QNT: "Quant", XTZ: "Tezos", EOS: "EOS", ZEC: "Zcash", DASH: "Dash" };
  /* futuros continuos (contrato más cercano), como en TradingView: ES1!, NQ1!, GC1!… Precio público de Yahoo, 10 min de retraso.
     [raíz, nombre, otras formas de buscarlo, bolsa, grupo, decimales] */
  const FUT = [
    ["ES", "E-mini S&P 500", "sp500 s&p spx sandp emini e-mini", "CME", "fi", 2], ["MES", "Micro E-mini S&P 500", "sp500 s&p spx micro", "CME", "fi", 2],
    ["NQ", "E-mini Nasdaq 100", "nasdaq us100 nas100 ustec tecnologicas emini", "CME", "fi", 2], ["MNQ", "Micro E-mini Nasdaq 100", "nasdaq us100 micro", "CME", "fi", 2],
    ["YM", "E-mini Dow Jones", "dow jones dj30 us30 wall street", "CBOT", "fi", 0], ["MYM", "Micro E-mini Dow Jones", "dow jones us30 micro", "CBOT", "fi", 0],
    ["RTY", "E-mini Russell 2000", "russell us2000 small caps", "CME", "fi", 1], ["M2K", "Micro E-mini Russell 2000", "russell us2000 micro", "CME", "fi", 1],
    ["NKD", "Nikkei 225 (en dólares)", "nikkei japon jp225 jpn225", "CME", "fi", 0],
    ["CL", "Petróleo WTI", "petroleo crudo oil wti texas usoil", "NYMEX", "fe", 2], ["MCL", "Micro petróleo WTI", "petroleo crudo wti micro", "NYMEX", "fe", 2],
    ["BZ", "Petróleo Brent", "petroleo crudo oil brent ukoil", "NYMEX", "fe", 2], ["NG", "Gas natural", "gas natural natgas", "NYMEX", "fe", 3],
    ["RB", "Gasolina RBOB", "gasolina rbob gasoline", "NYMEX", "fe", 4], ["HO", "Gasóleo de calefacción", "gasoleo diesel heating oil calefaccion", "NYMEX", "fe", 4],
    ["GC", "Oro", "oro gold xauusd", "COMEX", "fm", 1], ["MGC", "Micro oro", "oro gold micro", "COMEX", "fm", 1],
    ["SI", "Plata", "plata silver xagusd", "COMEX", "fm", 3], ["SIL", "Micro plata", "plata silver micro", "COMEX", "fm", 3],
    ["HG", "Cobre", "cobre copper", "COMEX", "fm", 4], ["PL", "Platino", "platino platinum", "NYMEX", "fm", 1], ["PA", "Paladio", "paladio palladium", "NYMEX", "fm", 1],
    ["ZB", "Bono de EE. UU. a 30 años", "bono tesoro treasury t-bond 30", "CBOT", "ft", 5], ["ZN", "Nota de EE. UU. a 10 años", "bono tesoro treasury t-note 10", "CBOT", "ft", 5],
    ["ZF", "Nota de EE. UU. a 5 años", "bono tesoro treasury 5", "CBOT", "ft", 6], ["ZT", "Nota de EE. UU. a 2 años", "bono tesoro treasury 2", "CBOT", "ft", 6],
    ["ZC", "Maíz", "maiz corn", "CBOT", "fa", 2], ["ZS", "Soja", "soja soya soybean", "CBOT", "fa", 2], ["ZW", "Trigo", "trigo wheat chicago", "CBOT", "fa", 2],
    ["KE", "Trigo de Kansas", "trigo wheat kansas hrw", "CBOT", "fa", 2], ["ZL", "Aceite de soja", "aceite soja soybean oil", "CBOT", "fa", 2],
    ["ZM", "Harina de soja", "harina soja soybean meal", "CBOT", "fa", 1], ["ZO", "Avena", "avena oats", "CBOT", "fa", 2], ["ZR", "Arroz", "arroz rice", "CBOT", "fa", 3],
    ["KC", "Café", "cafe coffee arabica", "ICE", "fa", 2], ["CC", "Cacao", "cacao cocoa", "ICE", "fa", 0], ["SB", "Azúcar n.º 11", "azucar sugar", "ICE", "fa", 2],
    ["CT", "Algodón", "algodon cotton", "ICE", "fa", 2], ["OJ", "Zumo de naranja", "zumo jugo naranja orange juice", "ICE", "fa", 2],
    ["LE", "Ganado vivo", "ganado vacuno live cattle", "CME", "fg", 3], ["GF", "Ganado de engorde", "ganado engorde feeder cattle", "CME", "fg", 3], ["HE", "Cerdo magro", "cerdo porcino lean hogs", "CME", "fg", 3],
    ["6E", "Euro", "euro eur eurusd", "CME", "fd", 5], ["6B", "Libra esterlina", "libra gbp gbpusd", "CME", "fd", 4], ["6J", "Yen japonés", "yen jpy usdjpy", "CME", "fd", 7],
    ["6A", "Dólar australiano", "dolar australiano aud audusd", "CME", "fd", 5], ["6C", "Dólar canadiense", "dolar canadiense cad usdcad", "CME", "fd", 5],
    ["6S", "Franco suizo", "franco suizo chf usdchf", "CME", "fd", 5], ["6N", "Dólar neozelandés", "dolar neozelandes nzd nzdusd", "CME", "fd", 5],
    ["6M", "Peso mexicano", "peso mexicano mxn usdmxn", "CME", "fd", 5],
    ["BTC", "Bitcoin (CME)", "bitcoin btc cme", "CME", "fc", 0], ["MBT", "Micro Bitcoin (CME)", "bitcoin btc micro", "CME", "fc", 0],
    ["ETH", "Ether (CME)", "ether ethereum eth cme", "CME", "fc", 1], ["MET", "Micro Ether (CME)", "ether ethereum micro", "CME", "fc", 1]
  ];
  const FUTM = new Map(FUT.map(f => [f[0] + "1!", f]));
  const CATN = { fx: "Divisa", idx: "Índice", fut: "Futuro", com: "Materia prima", stk: "Acción", etf: "ETF", cry: "Cripto", bnd: "Bono", mt5: "Tu MT5", otro: "Mercado" };
  const SUBN = { may: "Principales", cru: "Cruces", met: "Metales", ene: "Energía", agr: "Agrícolas", am: "América", eu: "Europa", as: "Asia y Pacífico", af: "África", fi: "Índices", fe: "Energía", fm: "Metales", ft: "Tipos de interés", fa: "Agrícolas", fg: "Ganado", fd: "Divisas", fc: "Cripto" };
  const CATS = [["all", "Todo"], ["fav", "Favoritos"], ["mt5", "Tu MT5"], ["fx", "Divisas"], ["idx", "Índices"], ["fut", "Futuros"], ["com", "Materias primas"], ["stk", "Acciones"], ["etf", "ETF"], ["cry", "Cripto"], ["bnd", "Bonos"]];
  const POP = ["EURUSD", "XAUUSD", "NAS100", "US30", "BTCUSDT", "GER40", "GBPUSD", "US500", "SPA35", "USOIL", "USDJPY", "AAPL.US", "NVDA.US", "TSLA.US", "ETHUSDT", "XAGUSD"];
  const STABLE = /^(USDC|FDUSD|TUSD|BUSD|DAI|USDP|USD1|AEUR|EUR|EURI|GBP|TRY|BRL|PAXG|XUSD|USDE|BFUSD|RLUSD|PYUSD)$/;

  /* ---------- quién da el precio de cada mercado ---------- */
  const CRYPTO = /^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|LTC|AVAX|DOT|LINK|TRX|TON|MATIC|SHIB)/;
  function binSym(s) {
    const raw = String(s || "").toUpperCase().trim();
    if (/\.[A-Z]{2}$/.test(raw) || /!$/.test(raw)) return null; // acciones y futuros (ES1!, BTC1!…) no son de Binance
    const c = raw.replace(/[^A-Z0-9]/g, "");
    if (/^[A-Z0-9]{2,15}(USDT|USDC|FDUSD)$/.test(c)) return c;
    const m = c.replace(/[0-9]/g, "").match(CRYPTO);
    return m ? m[1] + "USDT" : null;
  }
  const cryDigits = p => { p = Math.abs(+p) || 0; if (!p) return 2; return Math.max(2, Math.min(8, Math.ceil(-Math.log10(p)) + 4)); };
  const titleCase = s => /[a-z]/.test(s) ? s : s.split(" ").map(w => /^(ETF|SPDR|S&P|PLC|ADR|NV|AG|SA|SE|AB|ASA|SPA|USA|UK|MSCI|FTSE|DAX|AI|II|III|ETN|REIT|UCITS|ESG|DJ|BHD|GMBH)$/.test(w) || w.length <= 2 ? w : w.charAt(0) + w.slice(1).toLowerCase()).join(" ");

  /* ---------- el catálogo ---------- */
  const M = new Map(), DG = new Map(), listeners = new Set();
  let ready = false, loading = null, invokeFn = null, catOk = false;
  function nameOf(m) {
    if (m.c === "fut" && FUTM.has(m.s)) return FUTM.get(m.s)[1];
    if (NAMES[m.s]) return NAMES[m.s][0];
    if (STK[m.s]) return STK[m.s][0];
    if (m.c === "fx" || (m.c === "com" && /^X(AU|AG|PT|PD)[A-Z]{3}$/.test(m.s))) { const b = CUR[m.s.slice(0, 3)], q = CUR[m.s.slice(3, 6)]; if (b && q) return b + " / " + q; }
    if (m.c === "cry") { const base = m.s.replace(/(USDT|USDC|FDUSD|USD)$/, ""); return (CRYN[base] || base) + " / Tether"; }
    return titleCase(m.raw || "") || m.s;
  }
  function aliasOf(m) {
    const a = [];
    if (m.c === "fut" && FUTM.has(m.s)) { const f = FUTM.get(m.s); a.push(f[0], f[2], f[3], "futuro futuros future futures continuo"); }
    if (NAMES[m.s]) a.push(NAMES[m.s][1]);
    if (STK[m.s]) a.push(STK[m.s][1]);
    if (m.c === "fx" || (m.c === "com" && /^X(AU|AG|PT|PD)[A-Z]{3}$/.test(m.s))) { const b = m.s.slice(0, 3), q = m.s.slice(3, 6); a.push(b, q, CUR[b] || "", CUR[q] || ""); if (b === "XAU") a.push("oro gold"); if (b === "XAG") a.push("plata silver"); }
    if (m.c === "cry") { const base = m.s.replace(/(USDT|USDC|FDUSD|USD)$/, ""); a.push(base, CRYN[base] || "", "cripto crypto"); }
    return a.join(" ");
  }
  function rankOf(m) {
    let r = 0; const i = POP.indexOf(m.s);
    if (i >= 0) r += 200 - i * 5;
    if (m.c === "fx") { const b = m.s.slice(0, 3), q = m.s.slice(3, 6); r += m.g === "may" ? 60 : MAJ.has(b) && MAJ.has(q) ? 35 : 5; }
    else if (m.c === "com") r += /^X(AU|AG)USD$/.test(m.s) ? 60 : NAMES[m.s] ? (m.g === "agr" ? 12 : 30) : /^X(AU|AG|PT|PD)[A-Z]{3}$/.test(m.s) && MAJ.has(m.s.slice(3)) ? 15 : 0;
    else if (m.c === "idx") r += 40;
    else if (m.c === "stk") r += STK[m.s] ? 28 : m.cc === "US" ? 6 : m.cc === "ES" ? 5 : 0;
    else if (m.c === "etf") r += STK[m.s] ? 18 : 0;
    else if (m.c === "cry") r += Math.max(0, 45 - (m.vr || 0) * 0.12);
    else if (m.c === "bnd") r += 10;
    else if (m.c === "fut") r += /^(ES|NQ|YM|RTY|GC|CL)1!$/.test(m.s) ? 34 : /^M/.test(m.s) ? 14 : 20;
    return r;
  }
  function finish(m) {
    m.t = m.c === "stk" || m.c === "etf" ? m.s.replace(/\.[A-Z]{2}$/, "") : m.s;
    if (m.c === "fut" && FUTM.has(m.s)) m.ex = FUTM.get(m.s)[3];
    m.n = nameOf(m);
    m.al = " " + norm(aliasOf(m)) + " ";
    m.kk = " " + norm((CC[m.cc] || "") + " " + (CATN[m.c] || "")) + " ";
    m.fs = flat(m.s); m.ft = flat(m.c === "cry" ? m.s.replace(/(USDT|USDC|FDUSD|USD)$/, "") : m.t); m.nn = norm(m.n); m.r = rankOf(m);
    return m;
  }
  function add(s, c, g, cc, raw, d, extra) {
    if (!s) return null;
    const m = Object.assign(M.get(s) || { s }, { c, g: g || "", cc: cc || "", raw: raw || "", d: d != null ? +d : null }, extra || {});
    M.set(s, finish(m));
    return m;
  }
  /* los de siempre, para que el buscador funcione desde el primer momento */
  [["EURUSD", "fx", "may", "", 5], ["GBPUSD", "fx", "may", "", 5], ["USDJPY", "fx", "may", "", 3], ["AUDUSD", "fx", "may", "", 5], ["USDCAD", "fx", "may", "", 5], ["USDCHF", "fx", "may", "", 5], ["NZDUSD", "fx", "may", "", 5],
    ["EURJPY", "fx", "cru", "", 3], ["GBPJPY", "fx", "cru", "", 3], ["EURGBP", "fx", "cru", "", 5], ["EURCHF", "fx", "cru", "", 5], ["AUDJPY", "fx", "cru", "", 3], ["USDMXN", "fx", "cru", "", 5],
    ["XAUUSD", "com", "met", "", 2], ["XAGUSD", "com", "met", "", 3], ["USOIL", "com", "ene", "", 2], ["UKOIL", "com", "ene", "", 2], ["NATGAS", "com", "ene", "", 3],
    ["NAS100", "idx", "am", "US", 1], ["US500", "idx", "am", "US", 1], ["US30", "idx", "am", "US", 1], ["GER40", "idx", "eu", "DE", 1], ["UK100", "idx", "eu", "GB", 1], ["SPA35", "idx", "eu", "ES", 1], ["FRA40", "idx", "eu", "FR", 1], ["EU50", "idx", "eu", "EU", 1], ["JPN225", "idx", "as", "JP", 0],
    ["AAPL.US", "stk", "US", "US", 2], ["NVDA.US", "stk", "US", "US", 2], ["TSLA.US", "stk", "US", "US", 2], ["MSFT.US", "stk", "US", "US", 2], ["SAN.ES", "stk", "ES", "ES", 2], ["BBVA.ES", "stk", "ES", "ES", 2], ["ITX.ES", "stk", "ES", "ES", 2],
    ["BTCUSDT", "cry", "", "", 2], ["ETHUSDT", "cry", "", "", 2], ["SOLUSDT", "cry", "", "", 2], ["XRPUSDT", "cry", "", "", 4], ["DOGEUSDT", "cry", "", "", 5],
    ["BUND", "bnd", "DE", "DE", 2]
  ].forEach(x => add(x[0], x[1], x[2], x[3], "", x[4], { vr: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"].indexOf(x[0]) }));
  FUT.forEach(f => add(f[0] + "1!", "fut", f[4], "US", f[1], f[5]));

  function emit() { listeners.forEach(f => { try { f(); } catch (e) { /* nada */ } }); }
  async function fetchCatalog() {
    if (!invokeFn) return;
    const { data, error } = await invokeFn("velas", { catalog: 1 });
    if (error || !data || !Array.isArray(data.list) || data.list.length < 50) throw new Error("catálogo no disponible");
    ls.set("tk-mcat", { v: 1, t: Date.now(), list: data.list });
    data.list.forEach(x => add(x[0], x[1], x[2], x[3], x[4], x[5]));
    catOk = true;
  }
  async function fetchBinance() {
    const r = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr?type=MINI");
    if (!r.ok) throw new Error("Binance " + r.status);
    const a = await r.json(), t = Date.now();
    const list = (Array.isArray(a) ? a : []).filter(x => /USDT$/.test(x.symbol) && +x.quoteVolume > 0 && +x.lastPrice > 0)
      .map(x => ({ s: x.symbol, b: x.symbol.slice(0, -4), v: +x.quoteVolume, last: +x.lastPrice, open: +x.openPrice }))
      .filter(x => x.b && !STABLE.test(x.b) && !/(UP|DOWN|BULL|BEAR)$/.test(x.b))
      .sort((x, y) => y.v - x.v).slice(0, 400);
    list.forEach(x => Q.set(x.s, { last: x.last, chg: x.open ? (x.last - x.open) / x.open * 100 : null, t }));
    const keep = list.map(x => [x.s, cryDigits(x.last)]);
    ls.set("tk-mbin", { t, list: keep });
    addBin(keep);
  }
  function addBin(list) { list.forEach((x, i) => add(x[0], "cry", "", "", "", x[1], { vr: i })); }
  function load(invoke) {
    const fresh = invoke && !invokeFn;
    if (invoke) invokeFn = invoke;
    if (loading && (catOk || !fresh)) return loading;
    loading = (async () => {
      const c = ls.get("tk-mcat", null), b = ls.get("tk-mbin", null);
      if (c && c.v === 1 && Array.isArray(c.list)) { c.list.forEach(x => add(x[0], x[1], x[2], x[3], x[4], x[5])); if (Date.now() - (c.t || 0) <= 7 * 864e5) catOk = true; }
      if (b && Array.isArray(b.list)) addBin(b.list);
      if (c || b) emit();
      const jobs = [];
      if (!c || Date.now() - (c.t || 0) > 7 * 864e5) jobs.push(fetchCatalog());
      if (!b || Date.now() - (b.t || 0) > 864e5) jobs.push(fetchBinance());
      await Promise.all(jobs.map(p => p.catch(() => null)));
      ready = true; emit();
    })();
    loading.catch(() => { loading = null; });
    return loading;
  }
  function info(s) {
    if (!s) return null;
    const m = M.get(s); if (m) return m;
    const b = binSym(s); if (b && M.get(b)) return Object.assign({}, M.get(b), { s, t: s, fs: flat(s), ft: flat(s) });
    const f = flat(s).replace(/(pro|ecn|raw|micro|cash|spot|m)$/, "");
    for (const x of M.values()) if (x.fs === f) return Object.assign({}, x, { s, t: s, fs: flat(s), ft: flat(s) });
    return { s, t: s, c: b ? "cry" : "otro", g: "", cc: "", n: "", d: null, fs: flat(s), ft: flat(s), r: 0 };
  }
  function digits(s) {
    const m = M.get(s); if (m && m.d != null && isFinite(m.d)) return m.d;
    if (DG.has(s)) return DG.get(s);
    const b = binSym(s); if (b && M.get(b) && M.get(b).d != null) return M.get(b).d;
    return null;
  }
  function learn(s, d) { if (s && d != null && isFinite(d)) DG.set(s, +d); }

  /* ---------- buscar ---------- */
  function score(m, words) {
    let total = 0;
    for (const w of words) {
      const wf = flat(w); if (!wf) continue;
      let v = 0;
      if (m.fs === wf) v = 1000;
      else if (m.ft === wf) v = 950;
      else if (m.al.includes(" " + w + " ")) v = 800;
      else if (m.fs.startsWith(wf)) v = 600 - Math.min(120, (m.fs.length - wf.length) * 12);
      else if (m.ft.startsWith(wf)) v = 560;
      else if (m.al.includes(" " + w)) v = 500;
      else if (m.nn.startsWith(w)) v = 450;
      else if (m.nn.includes(" " + w) || m.nn.includes("(" + w)) v = 350;
      else if (m.kk.includes(" " + w)) v = 130;
      else if (w.length >= 4 && m.nn.includes(w)) v = 120;
      if (!v) return 0;
      total += v;
    }
    return total + m.r;
  }
  function search(q, cat, limit) {
    const words = norm(q).split(/[\s/,]+/).filter(Boolean);
    if (!words.length) return [];
    const out = [];
    for (const m of M.values()) {
      if (cat && cat !== "all" && m.c !== cat) continue;
      const v = score(m, words); if (v > 0) out.push([v, m]);
    }
    return out.sort((a, b) => b[0] - a[0] || a[1].s.localeCompare(b[1].s)).slice(0, limit || 80).map(x => x[1]);
  }

  /* ---------- precios ---------- */
  const Q = new Map();
  async function srvQuotes(list, invoke) {
    const { data, error } = await invoke("velas", { quotes: list });
    if (error || !data || !data.q) return {};
    const out = {}, t = Date.now();
    Object.entries(data.q).forEach(([s, v]) => { const q = { last: v.last, chg: v.chg, t }; Q.set(s, q); out[s] = q; learn(s, v.digits); });
    return out;
  }
  async function binQuotes(pairs) {
    const known = pairs.filter(p => M.has(p[1]) || CRYPTO.test(p[1]));
    const syms = Array.from(new Set(known.map(p => p[1]))); if (!syms.length) return {};
    const r = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr?type=MINI&symbols=" + encodeURIComponent(JSON.stringify(syms)));
    if (!r.ok) return {};
    const a = await r.json(), by = {}, out = {}, t = Date.now();
    (Array.isArray(a) ? a : []).forEach(x => { by[x.symbol] = x; });
    known.forEach(([s, b]) => { const x = by[b]; if (!x) return; const last = +x.lastPrice, open = +x.openPrice; const q = { last, chg: open ? (last - open) / open * 100 : null, t }; Q.set(s, q); out[s] = q; });
    return out;
  }
  /* precio y cambio del día de una lista de mercados: una sola llamada al servidor (y otra a Binance para la cripto) */
  async function quotes(list, o) {
    o = o || {};
    const now = Date.now(), out = {}, need = [], bin = [], invoke = o.invoke || invokeFn;
    Array.from(new Set(list || [])).forEach(s => {
      const c = o.cached && o.cached(s); if (c && c.last != null && (!c.t || now - c.t < (o.maxAge || 60000))) { out[s] = c; return; }
      const q = Q.get(s); if (q && now - q.t < (o.maxAge || 60000)) { out[s] = q; return; }
      const b = binSym(s); if (b) bin.push([s, b]); else need.push(s);
    });
    const jobs = [];
    if (bin.length) jobs.push(binQuotes(bin).then(r => Object.assign(out, r)).catch(() => null));
    if (need.length && invoke) for (let i = 0; i < need.length; i += 40) jobs.push(srvQuotes(need.slice(i, i + 40), invoke).then(r => Object.assign(out, r)).catch(() => null));
    await Promise.all(jobs);
    return out;
  }
  function fmtP(v, d) { if (v == null || !isFinite(v)) return "—"; d = d == null ? 2 : d; return Number(v).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function fmtC(c) { if (c == null || !isFinite(c)) return ""; return (c >= 0 ? "+" : "−") + Math.abs(c).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %"; }

  /* ---------- favoritos y recientes (en el navegador y en tu cuenta) ---------- */
  const P = { fav: ls.get("tk-mfav", []), rec: ls.get("tk-mrec", []), t: ls.get("tk-mprefT", 0) };
  let cloud = null, pulled = false, pushT = null;
  function savePrefs(remote) {
    ls.set("tk-mfav", P.fav); ls.set("tk-mrec", P.rec); ls.set("tk-mprefT", P.t);
    if (remote !== false && cloud) { clearTimeout(pushT); pushT = setTimeout(() => { try { cloud.save({ fav: P.fav, rec: P.rec, t: P.t }); } catch (e) { /* queda en este navegador */ } }, 800); }
  }
  async function pull() {
    if (!cloud || pulled) return; pulled = true;
    try {
      const d = await cloud.load();
      if (d && (d.t || 0) > P.t) { P.fav = Array.isArray(d.fav) ? d.fav : []; P.rec = Array.isArray(d.rec) ? d.rec : []; P.t = d.t; savePrefs(false); emit(); }
      else if (P.t && (!d || (d.t || 0) < P.t)) savePrefs(true);
    } catch (e) { pulled = false; }
  }
  function setCloud(c) { cloud = c; pulled = false; pull(); }
  function isFav(s) { return P.fav.includes(s); }
  function toggleFav(s) { const i = P.fav.indexOf(s); if (i >= 0) P.fav.splice(i, 1); else P.fav.unshift(s); P.t = Date.now(); savePrefs(); emit(); return i < 0; }
  function addRecent(s) { P.rec = [s].concat(P.rec.filter(x => x !== s)).slice(0, 12); P.t = Date.now(); savePrefs(); }

  /* ---------- la ventana del buscador ---------- */
  let D = null;
  function badge(m) {
    let t = m.c === "fut" ? m.s.replace(/1!$/, "") : m.c === "idx" || m.c === "bnd" ? (m.cc || m.s.slice(0, 2)) : m.c === "cry" ? m.s.replace(/(USDT|USDC|FDUSD|USD)$/, "").slice(0, 4)
      : m.c === "stk" || m.c === "etf" ? m.t.slice(0, 4) : ({ USOIL: "WTI", UKOIL: "BRN", NATGAS: "GAS", DIESEL: "GO", COPPER: "CU" })[m.s] || m.s.replace(/[^A-Z0-9]/gi, "").slice(0, 3);
    t = String(t).toUpperCase();
    return `<span class="mk-b c-${esc(m.c)}${t.length > 3 ? " l4" : ""}" aria-hidden="true">${esc(t)}</span>`;
  }
  function tagOf(m, extra) {
    if (extra) return extra;
    if (m.c === "cry") return "Cripto · Binance";
    if (m.c === "fut") return "Futuro" + (m.ex ? " · " + m.ex : "") + " · 10 min de retraso";
    if (m.c === "otro") return "Tu bróker";
    return (CATN[m.c] || "Mercado") + (m.cc && CC[m.cc] ? " · " + CC[m.cc] : "");
  }
  function rowHtml(m, extra, i) {
    const o = D.o, fav = isFav(m.s), q = Q.get(m.s) || (o.cached && o.cached(m.s)), d = digits(m.s);
    const added = D.added.has(m.s), cur = m.s === o.current;
    return `<div class="mk-row" data-s="${esc(m.s)}"${cur ? ' aria-current="true"' : ""}>
      <button type="button" class="mk-open" id="mk-o${i}" data-mk-open="${esc(m.s)}" aria-label="${esc((o.mode === "add" ? (o.addVerb ? o.addVerb.charAt(0).toUpperCase() + o.addVerb.slice(1) + " " : "Añadir ") : "Abrir ") + m.s + (m.n ? ", " + m.n : ""))}">${badge(m)}
        <span class="mk-n"><b>${esc(m.t)}${cur ? '<i class="mk-now">en el gráfico</i>' : ""}</b><span>${esc(m.n || tagOf(m, extra))}</span><span class="mk-t2">${esc(tagOf(m, extra))}</span></span>
        <span class="mk-tag">${esc(tagOf(m, extra))}</span>
        <span class="mk-pc"><span class="mk-p" data-qp="${esc(m.s)}">${q ? esc(fmtP(q.last, d)) : ""}</span><span class="mk-c${q && q.chg > 0 ? " up" : ""}" data-qc="${esc(m.s)}">${q ? esc(fmtC(q.chg)) : ""}</span></span>
      </button>
      <button type="button" class="mk-ib mk-star" data-mk-fav="${esc(m.s)}" aria-pressed="${fav}" aria-label="${fav ? "Quitar " + esc(m.s) + " de favoritos" : "Añadir " + esc(m.s) + " a favoritos"}">${svg(IC.star, 17, 1.6)}</button>
      ${o.onAdd && o.mode !== "add" ? `<button type="button" class="mk-ib mk-add" data-mk-add="${esc(m.s)}" aria-label="Añadir ${esc(m.s)} a tu lista">${svg(added ? IC.ok : IC.plus, 17)}</button>` : ""}
      ${o.mode === "add" ? `<span class="mk-ib mk-added${added ? " ok" : ""}" aria-hidden="true">${svg(added ? IC.ok : IC.plus, 17)}</span>` : ""}
    </div>`;
  }
  function sections() {
    const o = D.o, q = D.q.trim(), cat = D.cat, seen = new Set(), sec = [];
    const rows = (list, extra) => list.map(x => { const s = typeof x === "string" ? x : x[0]; return [info(s), typeof x === "string" ? extra : (extra ? extra(x) : null)]; }).filter(([m]) => m && !seen.has(m.s) && (seen.add(m.s), true));
    const mt5 = (o.mt5 && o.mt5()) || [];
    if (q) {
      const res = search(q, cat === "fav" || cat === "mt5" ? "all" : cat, 80).filter(m => (cat !== "fav" || isFav(m.s)) && (cat !== "mt5" || mt5.includes(m.s)));
      const lab = (CATS.find(c => c[0] === cat) || CATS[0])[1];
      if (res.length) sec.push({ title: "Resultados para «" + q + "»" + (cat !== "all" ? " en " + lab : ""), rows: rows(res.map(m => m.s)) });
      const top = res[0];
      if (cat === "all" && top && top.c === "idx" && top.cc && top.cc !== "EU" && CC[top.cc]) { // «ibex» → también sus acciones
        const rel = Array.from(M.values()).filter(m => m.c === "stk" && m.cc === top.cc && !res.includes(m)).sort((a, b) => b.r - a.r || a.s.localeCompare(b.s)).slice(0, 6);
        if (rel.length) sec.push({ title: "Acciones de " + CC[top.cc], rows: rows(rel.map(m => m.s)) });
      }
      const raw = q.toUpperCase().replace(/\s+/g, "");
      if (/^[A-Z0-9][A-Z0-9._-]{1,23}$/.test(raw) && (!res.length || /[0-9._-]/.test(raw)) && !M.has(raw) && !res.some(m => m.s === raw)) sec.push({ title: "Tal cual lo escribes", rows: [[info(raw), "Tu bróker o MT5"]] });
      return sec;
    }
    if (cat === "all") {
      if (P.rec.length) sec.push({ title: "Recientes", rows: rows(P.rec.slice(0, 5)) });
      if (mt5.length) sec.push({ title: "En tu MT5", rows: rows(mt5.slice(0, 6), "Tu MT5 · precio de tu bróker") });
      const tr = (o.traded && o.traded()) || [];
      if (tr.length) sec.push({ title: "Los que operas · de tu diario", rows: rows(tr.slice(0, 5), x => x[1] === 1 ? "1 operación tuya" : x[1] + " operaciones tuyas") });
      sec.push({ title: "Más buscados", rows: rows(POP).slice(0, 10) });
      return sec.filter(s => s.rows.length);
    }
    if (cat === "fav") return P.fav.length ? [{ title: "Tus favoritos", rows: rows(P.fav) }] : [];
    if (cat === "mt5") return mt5.length ? [{ title: "Mercados de tu MT5", rows: rows(mt5, "Tu MT5 · precio de tu bróker") }] : [];
    const list = Array.from(M.values()).filter(m => m.c === cat);
    const groups = new Map();
    list.sort((a, b) => b.r - a.r || a.s.localeCompare(b.s)).forEach(m => { const k = m.g || ""; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); });
    const order = { may: 0, cru: 1, met: 0, ene: 1, agr: 2, am: 0, eu: 1, as: 2, af: 3, US: 0, ES: 1, DE: 2, FR: 3, GB: 4, IT: 5, NL: 6, CH: 7, fi: 0, fe: 1, fm: 2, ft: 3, fa: 4, fg: 5, fd: 6, fc: 7 };
    return Array.from(groups.entries()).sort((a, b) => (order[a[0]] ?? 50) - (order[b[0]] ?? 50) || b[1].length - a[1].length).map(([k, l]) => {
      const title = SUBN[k] || CC[k] || (cat === "cry" ? "Más negociadas en Binance" : (CATS.find(c => c[0] === cat) || ["", ""])[1]);
      const max = cat === "fx" && k === "cru" ? 40 : 60;
      return { title, rows: rows(l.slice(0, max).map(m => m.s)), more: l.length > max ? `Y ${l.length - max} más: escribe su nombre para encontrarlos.` : "" };
    });
  }
  function render() {
    if (!D) return;
    const o = D.o, mt5 = (o.mt5 && o.mt5()) || [];
    D.chips.innerHTML = CATS.filter(c => c[0] !== "mt5" || mt5.length).map(([id, l]) => `<button type="button" class="mk-chip" role="tab" data-mk-cat="${id}" aria-selected="${D.cat === id}">${esc(l)}</button>`).join("");
    const sec = sections(); let i = 0;
    D.list.innerHTML = sec.map(s => `<div class="mk-sec">${esc(s.title)}</div>` + s.rows.map(([m, extra]) => rowHtml(m, extra, i++)).join("") + (s.more ? `<div class="mk-more">${esc(s.more)}</div>` : "")).join("")
      || `<div class="mk-empty">${D.cat === "fav" && !D.q ? "Aún no tienes favoritos. Toca la estrella de un mercado para tenerlo aquí." : "No hay mercados con ese nombre.<br>Prueba como lo dices tú: «oro», «ibex», «santander», «bitcoin»…"}</div>`;
    if (!ready) D.list.insertAdjacentHTML("beforeend", `<div class="mk-load">Cargando todos los mercados…</div>`);
    D.act = 0; mark();
    wantQuotes();
  }
  function rowsEls() { return D ? Array.from(D.list.querySelectorAll(".mk-row")) : []; }
  function mark() { rowsEls().forEach((r, i) => r.classList.toggle("act", i === D.act)); }
  let qT = null;
  function paintQuotes(r) {
    if (!D) return;
    Object.entries(r).forEach(([s, q]) => {
      const d = digits(s);
      D.list.querySelectorAll(`[data-qp="${CSS.escape(s)}"]`).forEach(e => { e.textContent = fmtP(q.last, d); });
      D.list.querySelectorAll(`[data-qc="${CSS.escape(s)}"]`).forEach(e => { e.textContent = fmtC(q.chg); e.classList.toggle("up", q.chg > 0); });
    });
  }
  function wantQuotes() {
    clearTimeout(qT);
    qT = setTimeout(async () => {
      if (!D) return;
      const box = D.list.getBoundingClientRect();
      const syms = Array.from(new Set(rowsEls().filter(r => { const b = r.getBoundingClientRect(); return b.bottom > box.top - 40 && b.top < box.bottom + 160; }).map(r => r.dataset.s))).slice(0, 30);
      if (!syms.length) return;
      const r = await quotes(syms, { cached: D.o.cached, invoke: D.o.invoke });
      paintQuotes(r);
    }, 280);
  }
  function pick(s, other) {
    if (!D) return;
    const o = D.o;
    if (o.mode === "add") {
      if (D.added.has(s)) return;
      if (o.onAdd && o.onAdd(s) === false) return; // quien llama puede negarse (p. ej. ya hay 5 comparados)
      D.added.add(s);
      const row = D.list.querySelector(`.mk-row[data-s="${CSS.escape(s)}"] .mk-added`); if (row) { row.classList.add("ok"); row.innerHTML = svg(IC.ok, 17); }
      return;
    }
    addRecent(s);
    close();
    if (other && o.onOther) o.onOther(s); else if (o.onPick) o.onPick(s);
  }
  function close() {
    if (!D) return;
    const d = D; D = null;
    listeners.delete(d.onData);
    d.root.remove();
    document.body.style.overflow = d.ovf;
    if (d.o.onClose) try { d.o.onClose(); } catch (e) { /* nada */ }
    if (d.prev && d.prev.focus && document.body.contains(d.prev)) try { d.prev.focus({ preventScroll: true }); } catch (e) { /* nada */ }
  }
  function open(o) {
    close();
    o = o || {};
    load(o.invoke);
    const dark = window.TkChart && TkChart.U ? TkChart.U.DARK : true;
    const root = document.createElement("div");
    root.className = "mk-root";
    root.style.setProperty("--mk-up", dark ? "#8fa2ff" : "#2443c7");
    root.style.setProperty("--mk-com", dark ? "#f3dc7a" : "#6e5500");
    root.style.setProperty("--mk-cry", dark ? "#c4b5fd" : "#5b3fc4");
    root.style.setProperty("--mk-star", dark ? "#fbe27a" : "#141416");
    const multi = !!o.onOther;
    root.innerHTML = `<div class="mk-back" data-mk-close></div>
      <section class="mk-dlg" role="dialog" aria-modal="true" aria-labelledby="mkT">
        <div class="mk-h">
          <button type="button" class="mk-ib mk-backbtn" data-mk-close aria-label="Volver al gráfico">${svg(IC.back, 22, 1.9)}</button>
          <h2 id="mkT">${esc(o.title || (o.mode === "add" ? "Añadir a tu lista" : "Buscar mercado"))}</h2>
          <button type="button" class="mk-ib mk-x" data-mk-close aria-label="Cerrar">${svg(IC.x, 18)}</button>
        </div>
        <label class="mk-s">${svg(IC.search, 18)}<input type="search" aria-label="Buscar mercado" placeholder="Nombre o símbolo: oro, ibex, apple, bitcoin…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"><span class="mk-esc">Esc</span></label>
        <div class="mk-chips" role="tablist" aria-label="Categorías"></div>
        <div class="mk-list" role="list" aria-label="Mercados"></div>
        <div class="mk-f"><span class="mk-keys"><span class="mk-k">↑ ↓</span>moverte <span class="mk-k">Enter</span>${o.mode === "add" ? esc(o.addVerb || "añadir") : "abrir"}${multi && o.mode !== "add" ? ' <span class="mk-k">Mayús + Enter</span>en otro panel' : ""}</span><span>Precios: Dukascopy (CFD) y Binance (cripto)</span></div>
      </section>`;
    document.body.appendChild(root);
    const input = root.querySelector("input");
    D = { o, root, input, chips: root.querySelector(".mk-chips"), list: root.querySelector(".mk-list"), q: o.q || "", cat: "all", act: 0, added: new Set(o.added || []), prev: document.activeElement, ovf: document.body.style.overflow };
    D.onData = () => { if (D) { const sc = D.list.scrollTop; render(); D.list.scrollTop = sc; } };
    listeners.add(D.onData);
    document.body.style.overflow = "hidden";
    input.value = D.q;
    let rT = null;
    input.addEventListener("input", () => { D.q = input.value; clearTimeout(rT); rT = setTimeout(() => { if (D) { render(); D.list.scrollTop = 0; } }, 60); });
    D.list.addEventListener("scroll", () => wantQuotes(), { passive: true });
    root.addEventListener("click", e => {
      const t = e.target.closest("[data-mk-close],[data-mk-open],[data-mk-fav],[data-mk-add],[data-mk-cat]"); if (!t || !D) return;
      if (t.hasAttribute("data-mk-close")) { close(); return; }
      if (t.dataset.mkOpen) { pick(t.dataset.mkOpen, e.shiftKey); return; }
      if (t.dataset.mkFav) {
        const on = toggleFav(t.dataset.mkFav);
        if (D && D.cat !== "fav") { root.querySelectorAll(`[data-mk-fav="${CSS.escape(t.dataset.mkFav)}"]`).forEach(b => { b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", (on ? "Quitar " : "Añadir ") + t.dataset.mkFav + (on ? " de favoritos" : " a favoritos")); }); }
        return;
      }
      if (t.dataset.mkAdd) { const s = t.dataset.mkAdd; if (!D.added.has(s)) { D.added.add(s); if (D.o.onAdd) D.o.onAdd(s); t.innerHTML = svg(IC.ok, 17); t.classList.add("ok"); t.setAttribute("aria-label", s + " está en tu lista"); } return; }
      if (t.dataset.mkCat) { D.cat = t.dataset.mkCat; render(); D.list.scrollTop = 0; if (!matchMedia("(pointer:coarse)").matches) input.focus(); }
    });
    root.addEventListener("keydown", e => {
      if (!D) return;
      e.stopPropagation(); // el gráfico no debe recibir lo que escribes aquí (marcos, atajos)
      const rows = rowsEls();
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!rows.length) return; e.preventDefault();
        const inList = e.target.closest && e.target.closest(".mk-row"), up = e.key === "ArrowUp";
        if (inList) {
          const i = rows.indexOf(inList);
          if (up && i === 0) { input.focus(); return; }
          D.act = Math.max(0, Math.min(rows.length - 1, i + (up ? -1 : 1)));
        } else if (up) return;
        mark(); const b = rows[D.act].querySelector(".mk-open"); b.focus(); b.scrollIntoView({ block: "nearest" });
        return;
      }
      if (e.key === "Enter" && e.target === input) { e.preventDefault(); const r = rows[D.act] || rows[0]; if (r) pick(r.dataset.s, e.shiftKey); return; }
      if (e.key === "Enter" && e.target.classList && e.target.classList.contains("mk-open")) { e.preventDefault(); pick(e.target.dataset.mkOpen, e.shiftKey); return; }
      if (e.key === "Tab") {
        const f = Array.from(root.querySelectorAll("button,input")).filter(x => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        return;
      }
      if (e.target !== input && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { input.focus(); } // seguir escribiendo
    });
    render();
    input.focus(); try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) { /* nada */ }
    pull();
    return { close };
  }

  window.TkMarkets = { load, open, close, search, info, digits, learn, quotes, binSym, setCloud, isFav, toggleFav, addRecent, on: f => listeners.add(f), get ready() { return ready; }, get isOpen() { return !!D; }, fmtP, fmtC, CC, CATN, POP };
})();
