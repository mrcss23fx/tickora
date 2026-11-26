/* Tickora · Gráfico, segunda parte (18-nov-2026): la pantalla de trabajo como una plataforma profesional.
   Leyenda con precios e indicadores, cuenta atrás de la vela, noticias en el eje, cuenta de práctica con órdenes,
   panel inferior, informe del backtesting, más tipos de gráfico y escalas, indicadores con ajustes completos.
   Se engancha a grafico.js con window.TkChartExt (cada gráfico montado recibe sus piezas internas). */
(function () {
  "use strict";
  const KC = window.klinecharts, TK = window.TkChart;
  if (!KC || !TK || !TK.U) return;
  window.TkChartLegend = true;
  const U = TK.U, TF_MS = U.TF_MS;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = (v, d) => (v == null || !isFinite(v)) ? "—" : Number(v).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtR = r => (r > 0 ? "+" : r < 0 ? "−" : "") + nf(Math.abs(r), 2) + " R";
  const money = (v, cur) => { try { return new Intl.NumberFormat("es-ES", { style: "currency", currency: cur || "USD", maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 }).format(v); } catch (e) { return nf(v, 2) + " " + (cur || ""); } };
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* lleno */ } } };
  const APP = () => window.TKAPP || null;
  const I = (d, s) => `<svg width="${s || 16}" height="${s || 16}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    eye: '<path d="M2.5 10s3-5.5 7.5-5.5S17.5 10 17.5 10s-3 5.5-7.5 5.5S2.5 10 2.5 10z"/><circle cx="10" cy="10" r="2.2"/>',
    eyeOff: '<path d="M3 3l14 14"/><path d="M8.2 5a8 8 0 0 1 1.8-.2c4.5 0 7.5 5.2 7.5 5.2a13 13 0 0 1-2.2 2.8M5.5 6.4A13 13 0 0 0 2.5 10s3 5.5 7.5 5.5a7.6 7.6 0 0 0 3.2-.7"/>',
    gear: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1L4.7 4.7"/>',
    x: '<path d="M5 5l10 10M15 5L5 15"/>', up: '<path d="M5 12l5-5 5 5"/>', down: '<path d="M5 8l5 5 5-5"/>',
    ticket: '<rect x="3" y="4.5" width="14" height="11" rx="2"/><path d="M7 8h6M7 11.5h4"/>', bell: '<path d="M6 8a4 4 0 0 1 8 0c0 4 1.5 5.5 1.5 5.5h-11S6 12 6 8z"/><path d="M8.5 16a1.6 1.6 0 0 0 3 0"/>'
  };

  /* ---------- mercados y divisas (para las noticias del gráfico) ---------- */
  const IDX_CUR = { US30: "USD", US100: "USD", NAS100: "USD", US500: "USD", SPX500: "USD", USTEC: "USD", GER40: "EUR", DE40: "EUR", EU50: "EUR", FRA40: "EUR", ESP35: "EUR", UK100: "GBP", JP225: "JPY", AUS200: "AUD", HK50: "HKD" };
  function curOf(sym) {
    const s = String(sym || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    for (const k in IDX_CUR) if (s.startsWith(k)) return [IDX_CUR[k]];
    if (/^(XAU|XAG|XPT|XPD|WTI|BRENT|USOIL|UKOIL|XTI|XBR)/.test(s)) return ["USD"];
    if (/^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|LTC)/.test(s)) return ["USD"];
    const m = s.match(/^([A-Z]{3})([A-Z]{3})/); return m ? [m[1], m[2]] : ["USD"];
  }
  function newsFor(sym) {
    const A = APP(); const cur = curOf(sym), out = [], seen = new Set();
    const push = e => { if (!e || !e.ts || !cur.includes(e.country) || !/High|alta|3/i.test(e.impact || "")) return; const k = e.ts + "|" + e.country; if (seen.has(k)) return; seen.add(k); out.push(e); };
    try { ((A && A.S.news && A.S.news.events) || []).forEach(push); } catch (e) { /* sin noticias */ }
    try { (ls.get("tk-nhist", []) || []).forEach(x => push(Array.isArray(x) ? { ts: x[0], country: x[1], title: x[2], impact: "High" } : x)); } catch (e) { /* sin historial */ }
    return out.sort((a, b) => a.ts - b.ts);
  }
  KC.registerOverlay({
    name: "tkNewsMark", totalStep: 1, lock: true, needDefaultPointFigure: false, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates: c, bounding: b, overlay: o }) => {
      if (!c.length) return []; const x = c[0].x, y = b.height - 26, dark = U.CDARK, col = dark ? "#c49dff" : "#7b4fd6";
      return [
        { type: "line", ignoreEvent: true, attrs: { coordinates: [{ x, y: 0 }, { x, y }] }, styles: { color: dark ? "rgba(196,157,255,.22)" : "rgba(123,79,214,.18)", size: 1, style: "dashed", dashedValue: [2, 4] } },
        { type: "rect", ignoreEvent: true, attrs: { x: x - 14, y, width: 28, height: 18 }, styles: { style: "stroke_fill", color: dark ? "rgba(196,157,255,.18)" : "rgba(123,79,214,.12)", borderColor: col, borderSize: 1, borderRadius: 4 } },
        { type: "text", ignoreEvent: true, attrs: { x, y: y + 9, text: (o.extendData && o.extendData.c) || "N", align: "center", baseline: "middle" }, styles: { color: col, size: 9, weight: 700, family: "Inter, sans-serif", backgroundColor: "transparent", borderSize: 0, paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 } }
      ];
    }
  });

  /* ---------- cuenta de práctica ---------- */
  const PAPER_DEF = { start: 10000, bal: 10000, cur: "USD", riskPct: 0.5, com: 0, slip: 0.2, n: 0 };
  const paper = () => Object.assign({}, PAPER_DEF, ls.get("tk-paper", {}));
  const savePaper = p => { ls.set("tk-paper", p); const A = APP(); if (A && A.S.user) A.sb.from("docs").upsert({ user_id: A.S.user.id, col: "paper", id: "acct", data: p, updated_at: new Date().toISOString() }).then(() => {}, () => {}); };
  const pipOf = (digits, sym) => /^(BTC|ETH)/.test(sym) ? 1 : digits >= 3 ? Math.pow(10, -(digits - 1)) : Math.pow(10, -digits) * (digits === 0 ? 1 : 1);

  /* ---------- indicadores nuevos ---------- */
  const sma = (v, n) => v.map((x, i) => { if (i < n - 1) return null; let s = 0; for (let j = 0; j < n; j++) { if (v[i - j] == null) return null; s += v[i - j]; } return s / n; });
  const wma = (v, n) => v.map((x, i) => { if (i < n - 1) return null; let s = 0, w = 0; for (let j = 0; j < n; j++) { if (v[i - j] == null) return null; s += v[i - j] * (n - j); w += n - j; } return s / w; });
  const emaA = (v, n) => { const k = 2 / (n + 1); let e = null; return v.map(x => x == null ? e : (e = e == null ? x : x * k + e * (1 - k))); };
  const dayK = ts => new Date(ts).toDateString();
  KC.registerIndicator({ name: "HMA", shortName: "HMA", calcParams: [21], figures: [{ key: "h", title: "HMA: ", type: "line" }], calc: (l, ind) => { const n = ind.calcParams[0] || 21, c = l.map(k => k.close), a = wma(c, Math.max(1, Math.round(n / 2))), b = wma(c, n), d = a.map((x, i) => x == null || b[i] == null ? null : 2 * x - b[i]), h = wma(d, Math.max(1, Math.round(Math.sqrt(n)))); return h.map(x => x == null ? {} : { h: x }); } });
  KC.registerIndicator({ name: "VWMA", shortName: "VWMA", calcParams: [20], figures: [{ key: "v", title: "VWMA: ", type: "line" }], calc: (l, ind) => { const n = ind.calcParams[0] || 20; return l.map((k, i) => { if (i < n - 1) return {}; let s = 0, w = 0; for (let j = 0; j < n; j++) { const q = l[i - j], vol = q.volume > 0 ? q.volume : 1; s += q.close * vol; w += vol; } return { v: s / w }; }); } });
  KC.registerIndicator({ name: "MFI", shortName: "MFI", calcParams: [14], precision: 2, figures: [{ key: "m", title: "MFI: ", type: "line" }], minValue: 0, maxValue: 100,
    calc: (l, ind) => { const n = ind.calcParams[0] || 14, tp = l.map(k => (k.high + k.low + k.close) / 3); return l.map((k, i) => { if (i < n) return {}; let up = 0, dn = 0; for (let j = i - n + 1; j <= i; j++) { const mf = tp[j] * (l[j].volume > 0 ? l[j].volume : 1); if (tp[j] > tp[j - 1]) up += mf; else if (tp[j] < tp[j - 1]) dn += mf; } return { m: dn ? 100 - 100 / (1 + up / dn) : 100 }; }); } });
  KC.registerIndicator({ name: "PIVOT", shortName: "Pivotes", series: "price", calcParams: [], figures: [{ key: "r2", title: "R2: ", type: "line" }, { key: "r1", title: "R1: ", type: "line" }, { key: "p", title: "P: ", type: "line" }, { key: "s1", title: "S1: ", type: "line" }, { key: "s2", title: "S2: ", type: "line" }],
    calc: l => { const days = {}; l.forEach(k => { const d = dayK(k.timestamp), x = days[d] || (days[d] = { h: -Infinity, lo: Infinity, c: 0 }); x.h = Math.max(x.h, k.high); x.lo = Math.min(x.lo, k.low); x.c = k.close; }); const keys = Object.keys(days), prev = {}; keys.forEach((d, i) => { if (i) prev[d] = days[keys[i - 1]]; });
      return l.map(k => { const y = prev[dayK(k.timestamp)]; if (!y) return {}; const p = (y.h + y.lo + y.c) / 3; return { p, r1: 2 * p - y.lo, s1: 2 * p - y.h, r2: p + (y.h - y.lo), s2: p - (y.h - y.lo) }; }); } });
  KC.registerIndicator({ name: "SESSHL", shortName: "Máx/mín del día", series: "price", calcParams: [], figures: [{ key: "pdh", title: "Máx. ayer: ", type: "line" }, { key: "pdl", title: "Mín. ayer: ", type: "line" }, { key: "hod", title: "Máx. hoy: ", type: "line" }, { key: "lod", title: "Mín. hoy: ", type: "line" }],
    calc: l => { let d = "", hh = -Infinity, lo = Infinity, ph = null, pl = null; return l.map(k => { const dk = dayK(k.timestamp); if (dk !== d) { if (d) { ph = hh; pl = lo; } d = dk; hh = -Infinity; lo = Infinity; } hh = Math.max(hh, k.high); lo = Math.min(lo, k.low); const o = { hod: hh, lod: lo }; if (ph != null) { o.pdh = ph; o.pdl = pl; } return o; }); } });
  const pivots = (l, n) => { const H = [], L = []; for (let i = n; i < l.length - n; i++) { let isH = true, isL = true; for (let j = 1; j <= n; j++) { if (l[i - j].high > l[i].high || l[i + j].high > l[i].high) isH = false; if (l[i - j].low < l[i].low || l[i + j].low < l[i].low) isL = false; } if (isH) H.push(i); if (isL) L.push(i); } return { H, L }; };
  KC.registerIndicator({ name: "ZIGZAG", shortName: "ZigZag", series: "price", calcParams: [5], figures: [], calc: l => l.map(() => ({})),
    draw: ({ ctx, chart, indicator, xAxis, yAxis }) => { const l = chart.getDataList(), n = indicator.calcParams[0] || 5; if (l.length < n * 2 + 2) return true; const { H, L } = pivots(l, n); const pts = H.map(i => [i, l[i].high, 1]).concat(L.map(i => [i, l[i].low, -1])).sort((a, b) => a[0] - b[0]);
      const z = []; pts.forEach(p => { const last = z[z.length - 1]; if (!last || last[2] !== p[2]) z.push(p); else if ((p[2] === 1 && p[1] > last[1]) || (p[2] === -1 && p[1] < last[1])) z[z.length - 1] = p; });
      ctx.save(); ctx.setLineDash([]); ctx.strokeStyle = (indicator.styles && indicator.styles.lines && indicator.styles.lines[0] && indicator.styles.lines[0].color) || (U.CDARK ? "#c49dff" : "#7b4fd6"); ctx.lineWidth = 1.5; ctx.beginPath(); z.forEach((p, i) => { const x = xAxis.convertToPixel(p[0]), y = yAxis.convertToPixel(p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.restore(); return true; } });
  const rsiArr = (l, n) => { let g = 0, s = 0; return l.map((k, i) => { if (!i) return null; const d = k.close - l[i - 1].close; if (i <= n) { g += Math.max(d, 0); s += Math.max(-d, 0); if (i < n) return null; g /= n; s /= n; } else { g = (g * (n - 1) + Math.max(d, 0)) / n; s = (s * (n - 1) + Math.max(-d, 0)) / n; } return s ? 100 - 100 / (1 + g / s) : 100; }); };
  KC.registerIndicator({ name: "DIVER", shortName: "Divergencias RSI", series: "price", calcParams: [14, 5], figures: [], calc: l => l.map(() => ({})),
    draw: ({ ctx, chart, indicator, xAxis, yAxis }) => { const l = chart.getDataList(), [n, w] = indicator.calcParams; if (l.length < 60) return true; const r = rsiArr(l, n || 14), { H, L } = pivots(l, w || 5), dark = U.CDARK;
      const lines = []; for (let k = 1; k < H.length; k++) { const a = H[k - 1], b = H[k]; if (b - a < 4 || b - a > 80 || r[a] == null) continue; if (l[b].high > l[a].high && r[b] < r[a] - 2) lines.push([a, l[a].high, b, l[b].high, "Divergencia bajista", dark ? "#ff8c8c" : "#d6363c"]); }
      for (let k = 1; k < L.length; k++) { const a = L[k - 1], b = L[k]; if (b - a < 4 || b - a > 80 || r[a] == null) continue; if (l[b].low < l[a].low && r[b] > r[a] + 2) lines.push([a, l[a].low, b, l[b].low, "Divergencia alcista", dark ? "#86a9ff" : "#2443c7"]); }
      ctx.save(); ctx.lineWidth = 1.5; ctx.font = "600 10px Inter, sans-serif"; lines.forEach(([a, va, b, vb, t, c]) => { const x1 = xAxis.convertToPixel(a), y1 = yAxis.convertToPixel(va), x2 = xAxis.convertToPixel(b), y2 = yAxis.convertToPixel(vb); ctx.strokeStyle = c; ctx.fillStyle = c; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]); ctx.fillText(t, x2 + 4, y2 + (t.includes("bajista") ? -6 : 14)); }); ctx.restore(); return true; } });
  KC.registerIndicator({ name: "VPVR", shortName: "Perfil de volumen", series: "price", calcParams: [24], figures: [], calc: l => l.map(() => ({})),
    draw: ({ ctx, chart, indicator, yAxis, bounding }) => { const l = chart.getDataList(), vr = chart.getVisibleRange(), bins = indicator.calcParams[0] || 24; const v = l.slice(Math.max(0, vr.from), Math.min(l.length, vr.to)); if (v.length < 5) return true;
      const hi = Math.max(...v.map(k => k.high)), lo = Math.min(...v.map(k => k.low)), st = (hi - lo) / bins || 1, up = Array(bins).fill(0), dn = Array(bins).fill(0);
      v.forEach(k => { const i = Math.min(bins - 1, Math.floor(((k.high + k.low) / 2 - lo) / st)), vol = k.volume > 0 ? k.volume : 1; (k.close >= k.open ? up : dn)[i] += vol; });
      const mx = Math.max(...up.map((x, i) => x + dn[i])), W = bounding.width * 0.22, poc = up.map((x, i) => x + dn[i]).indexOf(mx), dark = U.CDARK;
      ctx.save(); for (let i = 0; i < bins; i++) { const y1 = yAxis.convertToPixel(lo + (i + 1) * st), y2 = yAxis.convertToPixel(lo + i * st), h = Math.max(1, Math.abs(y2 - y1) - 1), wu = up[i] / mx * W, wd = dn[i] / mx * W, x0 = bounding.width - wu - wd;
        ctx.fillStyle = i === poc ? (dark ? "rgba(196,157,255,.55)" : "rgba(123,79,214,.45)") : (dark ? "rgba(134,169,255,.28)" : "rgba(36,67,199,.18)"); ctx.fillRect(x0, Math.min(y1, y2), wu, h); ctx.fillStyle = i === poc ? (dark ? "rgba(196,157,255,.35)" : "rgba(123,79,214,.3)") : (dark ? "rgba(200,200,215,.18)" : "rgba(20,33,58,.12)"); ctx.fillRect(x0 + wu, Math.min(y1, y2), wd, h); }
      ctx.restore(); return true; } });
  /* media sobre otro indicador y media de otro marco: leen datos del gráfico que los pinta */
  const CHARTS = {};
  KC.registerIndicator({ name: "TKMAON", shortName: "Media", calcParams: [9], figures: [{ key: "m", title: "Media: ", type: "line" }],
    calc: (l, ind) => { const e = ind.extendData || {}, c = CHARTS[e.key]; if (!c) return l.map(() => ({})); const src = c.ch.getIndicators({ name: e.src })[0];
      const ready = src && src.result && src.result.length === l.length && src.result.some(x => x && Object.keys(x).length);
      if (!ready || (src.result[l.length - 1] && !Object.keys(src.result[l.length - 1]).length && (e.try || 0) < 12)) { const t = (e.try || 0) + 1; if (t <= 12) setTimeout(() => { try { e.try = t; c.ch.overrideIndicator({ name: "TKMAON", calcParams: [ind.calcParams[0] || 9, t] }); } catch (er) { /* ya no está */ } }, 120); if (!ready) return l.map(() => ({})); }
      const fk = (src.figures && src.figures[0] && src.figures[0].key) || Object.keys(src.result.find(x => x && Object.keys(x).length) || {})[0], vals = src.result.map(x => x && x[fk] != null ? x[fk] : null), n = ind.calcParams[0] || 9;
      const m = e.kind === "ema" ? emaA(vals, n) : sma(vals, n); return m.map(x => x == null ? {} : { m: x }); } });
  KC.registerIndicator({ name: "MTF", shortName: "Media de otro marco", series: "price", calcParams: [20], figures: [{ key: "m", title: "Media: ", type: "line" }],
    calc: async (l, ind) => { const e = ind.extendData || {}, c = CHARTS[e.key]; if (!c || !l.length || !e.tf || !c.st.prov) return l.map(() => ({})); const n = ind.calcParams[0] || 20;
      let hb = c.mtfCache && c.mtfCache.k === c.st.sym + e.tf ? c.mtfCache.bars : null;
      if (!hb || Date.now() - c.mtfCache.t > 60000) { try { const r = await c.st.prov.bars(c.st.sym, e.tf, null); hb = r.bars || []; c.mtfCache = { k: c.st.sym + e.tf, bars: hb, t: Date.now() }; } catch (er) { hb = hb || []; } }
      if (!hb.length) return l.map(() => ({})); const ms = TF_MS[e.tf] || 864e5, m = (e.kind === "sma" ? sma : emaA)(hb.map(b => b.close), n);
      let j = 0; return l.map(k => { while (j + 1 < hb.length && hb[j + 1].timestamp + ms <= k.timestamp + 1) j++; const ok = hb[j] && hb[j].timestamp + ms <= k.timestamp + (TF_MS[c.st.tf] || 0) + 1; return ok && m[j] != null ? { m: m[j] } : {}; }); } });
  U.CATS.push("Niveles");
  [["HMA", "HMA", "Media de Hull", "Tendencia", true, [21], "Media rápida y suave que reacciona antes a los giros."],
   ["VWMA", "VWMA", "Media ponderada por volumen", "Tendencia", true, [20], "Pesa más las velas con más volumen."],
   ["MTF", "MTF", "Media de otro marco", "Tendencia", true, [20], "Una media de otro marco (por ejemplo, la diaria) pintada en tu gráfico. Elige el marco en Ajustes."],
   ["MFI", "MFI", "Índice de flujo de dinero (MFI)", "Volumen", false, [14], "Un RSI que tiene en cuenta el volumen."],
   ["PIVOT", "PIV", "Puntos pivote (diarios)", "Niveles", true, [], "Pivote, resistencias y soportes calculados con el día anterior."],
   ["SESSHL", "HL", "Máximos y mínimos del día", "Niveles", true, [], "Máximo y mínimo de ayer y de hoy: niveles que mira todo el mundo."],
   ["ZIGZAG", "ZZ", "ZigZag", "Niveles", true, [5], "Une los giros importantes y quita el ruido. El valor es cuántas velas a cada lado."],
   ["DIVER", "DIV", "Divergencias automáticas (RSI)", "Niveles", true, [14, 5], "Marca cuándo el precio hace un máximo o mínimo nuevo y el RSI no lo confirma."],
   ["VPVR", "VP", "Perfil de volumen visible", "Volumen", true, [24], "Dónde se ha negociado más en lo que ves; la barra violeta es el precio con más volumen."]
  ].forEach(m => { if (!U.IND_BY[m[0]]) { U.IND.push(m); U.IND_BY[m[0]] = m; } });
  window.TkChartExt2 = (window.TkChartExt2 || []).concat([(me, X, HK) => {
    CHARTS[me.key] = { ch: X.ch, st: X.st };
    const OSC = ["RSI", "CCI", "MTM", "ROC", "WR", "MFI", "AO", "TRIX", "BIAS", "PSY", "OBV", "ATR", "DMI", "KDJ", "STOCHRSI", "MACD"];
    HK.indCreate = (v, x) => {
      const meta = U.IND_BY[x.n] || []; if (meta[4] && v.precision == null) v.precision = X.digits();
      if (x.n === "MTF") { v.extendData = { key: me.key, tf: x.mtf || "1d", kind: x.mk || "ema" }; v.shortName = "Media " + (U.TF_SHORT[x.mtf || "1d"] || "1D"); }
    };
    HK.afterInd = () => { X.activeInd().forEach(x => { if (!x.sm || !OSC.includes(x.n)) return; const src = X.ch.getIndicators({ name: x.n })[0]; if (!src) return;
      setTimeout(() => { try { X.ch.createIndicator({ name: "TKMAON", paneId: src.paneId, calcParams: [x.sm], extendData: { key: me.key, src: x.n, kind: x.smk || "sma" }, visible: src.visible !== false, styles: { lines: [{ color: U.CDARK ? "#e0a33a" : "#b7791f", size: 1.2, style: "solid", smooth: false, dashedValue: [2, 2] }] } }, true); } catch (e) { /* sin panel */ } }, 60); }); };
    HK.indSourceUI = (x, meta) => x.n === "MTF" ? `<label class="gx-irow">Marco de la media<select class="gx-in" data-isrc="mtf">${["15m", "1h", "4h", "1d", "1w"].map(k => `<option value="${k}" ${(x.mtf || "1d") === k ? "selected" : ""}>${U.TF_SHORT[k]}</option>`).join("")}</select></label><label class="gx-irow">Tipo<select class="gx-in" data-isrc="mk"><option value="ema" ${(x.mk || "ema") === "ema" ? "selected" : ""}>Exponencial</option><option value="sma" ${x.mk === "sma" ? "selected" : ""}>Simple</option></select></label>`
      : OSC.includes(x.n) ? `<label class="gx-irow">Media sobre el indicador<input class="gx-in" type="number" min="0" max="200" data-isrc="sm" value="${x.sm || 0}"></label><label class="gx-irow">Tipo de media<select class="gx-in" data-isrc="smk"><option value="sma" ${(x.smk || "sma") === "sma" ? "selected" : ""}>Simple</option><option value="ema" ${x.smk === "ema" ? "selected" : ""}>Exponencial</option></select></label><p class="gx-muted" style="margin:0">Pon 0 para no dibujar media. Por ejemplo, una media de 9 sobre el RSI.</p>` : "";
    HK.indSourceSet = (x, z) => { const k = z.dataset.isrc; if (k === "sm") x.sm = Math.max(0, Math.min(200, Math.round(+z.value || 0))); else x[k] = z.value; };
  }]);

  /* ---------- varios gráficos: cursor y fechas sincronizados ---------- */
  let SYNCING = false;
  window.TkChartExt2 = (window.TkChartExt2 || []).concat([(me, X) => {
    const sync = () => (window.TkSync ? window.TkSync() : {});
    X.ch.subscribeAction("onCrosshairChange", d => {
      if (SYNCING || !sync().cross || TK.all.length < 2) return; const ts = d && d.kLineData ? d.kLineData.timestamp : null;
      SYNCING = true; try { TK.all.forEach(o => { if (o === me) return; if (ts == null) { o.ch.executeAction("onCrosshairChange", { x: -1, y: -1, paneId: "candle_pane" }); return; }
        const l = o.ch.getDataList(); let idx = -1; for (let i = l.length - 1; i >= 0; i--) if (l[i].timestamp <= ts) { idx = i; break; } if (idx < 0) return;
        const c = o.ch.convertToPixel({ dataIndex: idx, value: l[idx].close }, { paneId: "candle_pane" }); if (c && c.x != null) o.ch.executeAction("onCrosshairChange", { x: c.x, y: c.y, paneId: "candle_pane" }); }); } catch (e) { /* sin cursor */ } finally { SYNCING = false; }
    });
    const range = () => {
      if (SYNCING || !sync().range || TK.all.length < 2) return; const l = X.ch.getDataList(), vr = X.ch.getVisibleRange(); if (!l.length) return; const last = l[Math.min(l.length - 1, Math.max(0, vr.to - 1))]; if (!last) return;
      SYNCING = true; try { const bs = X.ch.getBarSpace(); TK.all.forEach(o => { if (o === me || o.tf !== me.tf) return; try { o.ch.setBarSpace(bs.bar); o.ch.scrollToTimestamp(last.timestamp, 0); } catch (e) { /* fuera de rango */ } }); } finally { setTimeout(() => { SYNCING = false; }, 30); }
    };
    let rt = null; const rq = () => { clearTimeout(rt); rt = setTimeout(range, 60); };
    X.ch.subscribeAction("onScroll", rq); X.ch.subscribeAction("onZoom", rq);
  }]);

  /* ---------- gráfico más grande: en el móvil las herramientas van tras un lápiz ---------- */
  try { if (!localStorage.getItem("tk-bigA")) { localStorage.setItem("tk-bpopen", "false"); localStorage.setItem("tk-bigA", "1"); } } catch (e) { /* sin almacenamiento */ }
  window.TkChartExt2 = (window.TkChartExt2 || []).concat([(me, X) => {
    const top = X.$(".gx-top"), gx = X.$(".gx") || me.el.querySelector(".gx") || me.el; if (!top || me.key !== "main") return;
    const b = document.createElement("button"); b.type = "button"; b.className = "gx-pen"; b.title = "Herramientas de dibujo"; b.setAttribute("aria-label", "Herramientas de dibujo");
    b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4.5-1L19 8.5 15.5 5 5 15.5z"/><path d="M13.5 7l3.5 3.5"/></svg>';
    const host = gx.classList && gx.classList.contains("gx") ? gx : gx.closest(".gx") || gx;
    const set = on => { host.classList.toggle("tools-on", on); b.setAttribute("aria-pressed", String(on)); try { localStorage.setItem("tk-penon", on ? "1" : ""); } catch (e) { /* nada */ } setTimeout(() => { try { X.ch.resize(); } catch (e) { /* nada */ } }, 60); };
    b.addEventListener("click", e => { e.stopPropagation(); set(!host.classList.contains("tools-on")); });
    top.appendChild(b); let on = false; try { on = !!localStorage.getItem("tk-penon"); } catch (e) { /* nada */ } if (on) set(true);
  }]);

  /* ---------- alertas (se comprueban en el servidor cada minuto) ---------- */
  KC.registerOverlay({
    name: "tkAlertLine", totalStep: 1, lock: true, needDefaultPointFigure: false, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates: c, bounding: b, overlay: o }) => { if (!c.length) return []; const y = c[0].y, dark = U.CDARK, off = o.extendData && o.extendData.off, col = off ? (dark ? "#6b7280" : "#9aa1ad") : ((U.CFG || {}).alertCol || (dark ? "#5fd4c0" : "#0e8f7e")), t = (o.extendData && o.extendData.t) || "Alerta";
      return [{ type: "line", ignoreEvent: true, attrs: { coordinates: [{ x: 0, y }, { x: b.width, y }] }, styles: { color: col, size: 1, style: "dashed", dashedValue: [2, 4] } },
        { type: "text", ignoreEvent: true, attrs: { x: b.width - 8, y, text: t, align: "right", baseline: "middle" }, styles: { color: col, size: 10.5, family: "Inter, sans-serif", backgroundColor: dark ? "#16161d" : "#ffffff", borderColor: col, borderSize: 1, borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3 } }]; }
  });
  const ALR = { list: null, ev: [], loading: false, subs: new Set() };
  async function loadAlerts(force) {
    const A = APP(); if (!A || !A.S.user || (ALR.loading && !force)) return; ALR.loading = true;
    try { const [a, e] = await Promise.all([A.sb.from("alerts").select("*").order("created_at", { ascending: false }).limit(200), A.sb.from("alert_events").select("*").order("created_at", { ascending: false }).limit(30)]);
      if (!a.error) ALR.list = a.data || []; if (!e.error) ALR.ev = e.data || []; } catch (er) { /* sin conexión */ }
    ALR.loading = false; ALR.subs.forEach(f => { try { f(); } catch (er) { /* gráfico cerrado */ } });
  }
  window.tkAlertsChanged = () => loadAlerts(true);
  const COND = [["cross", "Cruza"], ["up", "Sube por encima de"], ["down", "Baja por debajo de"], ["above", "Está por encima de"], ["below", "Está por debajo de"]];
  const LINES = ["segment", "rayLine", "straightLine", "horizontalStraightLine", "horizontalRayLine", "priceLine", "tkInfoLine", "tkArrow"];
  window.TkChartExt2 = (window.TkChartExt2 || []).concat([(me, X, HK) => {
    const { st, ch, $ } = X, A = APP(); if (!A) return;
    const top = $(".gx-top"), sp = top && top.querySelector(".gx-sp");
    if (sp) { const b = document.createElement("button"); b.type = "button"; b.className = "gx-tb"; b.dataset.alr = "1"; b.title = "Crear una alerta (Alt + A)"; b.innerHTML = I(IC.bell, 17) + "<span>Alerta</span>"; top.insertBefore(b, sp); b.addEventListener("click", e => { e.stopPropagation(); dialog(); }); }
    const F = $(".gx-float"); if (F) { const b = document.createElement("button"); b.type = "button"; b.className = "gx-tb gx-ic"; b.title = "Alerta en este dibujo"; b.setAttribute("aria-label", "Alerta en este dibujo"); b.innerHTML = I(IC.bell, 17); const del = F.querySelector('[data-fa="del"]'); F.insertBefore(b, del); b.addEventListener("click", e => { e.stopPropagation(); dialog({ fromSel: true }); }); }
    const fmtP = v => v == null || !isFinite(v) ? "—" : nf(v, X.digits());
    function paintLines() {
      try { ch.removeOverlay({ groupId: "alerts" }); } catch (e) { /* nada */ }
      if ((U.CFG || {}).showAlerts === false) return;
      const allA = (U.CFG || {}).alertActive === false;
      (ALR.list || []).filter(a => (a.active || allA) && a.sym === st.sym && a.kind !== "ind").forEach(a => {
        let v = a.value != null ? +a.value : null; if (a.kind === "line" && a.p1 && a.p1.t1 && a.p1.t2 && a.p1.t1 !== a.p1.t2) v = +a.p1.v1 + (+a.p1.v2 - +a.p1.v1) * (Date.now() - a.p1.t1) / (a.p1.t2 - a.p1.t1);
        if (v == null || !isFinite(v)) return; const l = ch.getDataList(); if (!l.length) return;
        try { ch.createOverlay({ name: "tkAlertLine", groupId: "alerts", lock: true, points: [{ timestamp: l[l.length - 1].timestamp, value: v }], extendData: { t: (a.active ? "Alerta " : "Saltó ") + fmtP(v) + (a.kind === "line" ? " · línea" : ""), off: !a.active } }); } catch (e) { /* fuera */ }
      });
    }
    const paintAll = () => { paintLines(); HK.repaint && HK.repaint(); };
    { const pr = HK.onRestyle; HK.onRestyle = () => { pr && pr(); paintLines(); }; }
    ALR.subs.add(paintAll);
    const prevDestroy = HK.destroy; HK.destroy = () => { ALR.subs.delete(paintAll); prevDestroy && prevDestroy(); };
    const prevData = HK.onData; HK.onData = () => { prevData && prevData(); setTimeout(paintLines, 200); };
    if (ALR.list === null) loadAlerts(); else setTimeout(paintLines, 500);
    const selLine = () => { if (!st.sel) return null; const o = ch.getOverlays({ id: st.sel })[0]; if (!o || !LINES.includes(o.name) || !o.points.length) return null; return o; };
    function dialog(o) {
      o = o || {}; const px = st.price || (st.lastBar && st.lastBar.close) || 0, ln = o.fromSel ? selLine() : null;
      const f = { kind: ln ? (ln.points.length > 1 && ln.points[0].value !== ln.points[1].value && !/^horizontal|priceLine/.test(ln.name) ? "line" : "price") : (o.kind || "price"), cond: "cross", value: ln ? ln.points[ln.points.length > 1 && /^horizontal|priceLine/.test(ln.name) ? 0 : 0].value : (o.value || px), len: 14, level: 70, tf: ["1m", "5m", "15m", "30m", "1h", "4h", "1d"].includes(st.tf) ? st.tf : "15m", freq: "once", note: "" };
      if (o.fromSel && !ln) { X.hint("Elige antes una línea (tendencia, horizontal o rayo) para ponerle una alerta."); setTimeout(() => X.hint(""), 3000); return; }
      const paint = () => X.openModal(`<div class="gx-dh"><h3>Nueva alerta · ${esc(st.sym)}</h3><button type="button" class="gx-tb gx-ic" data-x aria-label="Cerrar">${I(IC.x, 18)}</button></div>
        <div class="gx-ot"><div class="gx-seg">${[["price", "Precio"], ["line", "Línea dibujada"], ["ind", "RSI"]].map(([k, l]) => `<button type="button" data-ak="${k}" aria-pressed="${f.kind === k}" ${k === "line" && !ln ? "disabled title=\"Elige antes una línea en el gráfico y pulsa la campana de su barra\"" : ""}>${l}</button>`).join("")}</div>
          <div class="gx-og"><label>Cuando<select class="gx-in" data-af="cond">${COND.map(([k, l]) => `<option value="${k}" ${f.cond === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          ${f.kind === "price" ? `<label>Precio<input class="gx-in" data-af="value" inputmode="decimal" value="${fmtP(f.value)}"></label>` : f.kind === "line" ? `<label>Tu línea<input class="gx-in" disabled value="${ln ? "Sigue la línea en el tiempo" : "—"}"></label>` : `<label>Nivel del RSI<input class="gx-in" data-af="level" inputmode="decimal" value="${f.level}"></label><label>Longitud<input class="gx-in" data-af="len" inputmode="numeric" value="${f.len}"></label><label>Marco<select class="gx-in" data-af="tf">${["1m", "5m", "15m", "30m", "1h", "4h", "1d"].map(k => `<option value="${k}" ${f.tf === k ? "selected" : ""}>${U.TF_SHORT[k]}</option>`).join("")}</select></label>`}
          <label>Avisar<select class="gx-in" data-af="freq"><option value="once" ${f.freq === "once" ? "selected" : ""}>Solo una vez</option><option value="bar" ${f.freq === "bar" ? "selected" : ""}>Cada vez (como mucho una por vela)</option></select></label></div>
          <label style="display:grid;gap:4px;font-size:12px;color:var(--suave)">Nota (opcional)<input class="gx-in" data-af="note" maxlength="120" placeholder="Ej.: mira si rompe con fuerza antes de entrar" value="${esc(f.note)}"></label>
          <p class="gx-muted" style="margin:0">Se comprueba cada minuto en el servidor, aunque cierres Tickora. Te avisamos aquí y, si lo activas, con una notificación en este dispositivo.${/publico/.test((st.prov || {}).id || "") ? " Usa el precio público de contado (el mismo que ves en el gráfico)." : ""}</p>
          <div class="gx-dact"><button type="button" class="gx-btn" data-x>Cancelar</button><button type="button" class="gx-btn gx-pri" data-ago>Crear alerta</button></div></div>`, () => { const D = $(".gx-dlg"); D.onclick = onClick; D.onchange = onChange; });
      const onChange = e => { const k = e.target.dataset.af; if (!k) return; let v = e.target.value; if (["value", "level", "len"].includes(k)) { v = parseFloat(String(v).replace(",", ".")); if (!isFinite(v)) return; } f[k] = v; };
      const onClick = async e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.x != null) { X.closeModal(); return; } if (b.dataset.ak && !b.disabled) { f.kind = b.dataset.ak; paint(); return; }
        if (b.dataset.ago != null) { b.disabled = true;
          const row = { sym: st.sym, kind: f.kind, cond: f.cond, freq: f.freq, note: f.note || null, tf: f.kind === "ind" ? f.tf : null, p1: {}, value: null, last_price: f.kind === "ind" ? null : px || null };
          if (f.kind === "price") row.value = +f.value; if (f.kind === "ind") { row.value = +f.level; row.p1 = { len: Math.max(2, Math.min(100, Math.round(f.len))) }; }
          if (f.kind === "line" && ln) { const a = ln.points[0], c = ln.points[1] || ln.points[0]; row.p1 = { t1: a.timestamp, v1: a.value, t2: c.timestamp, v2: c.value }; row.value = a.value; }
          if (row.value == null || !isFinite(row.value)) { X.hint("Falta el valor de la alerta."); b.disabled = false; return; }
          const { error } = await A.sb.from("alerts").insert(row); if (error) { X.hint("No se pudo crear la alerta: " + error.message); b.disabled = false; return; }
          X.closeModal(); X.hint("Alerta creada. Se comprueba cada minuto."); setTimeout(() => X.hint(""), 3000); loadAlerts(true); window.tkPushOffer && window.tkPushOffer(); } };
      paint();
    }
    HK.alertDialog = dialog;
    document.addEventListener("keydown", e => { if (!document.body.contains(me.el) || TK.current !== me) return; if (e.altKey && (e.key === "a" || e.key === "A" || e.code === "KeyA") && !e.target.matches("input,textarea,select")) { e.preventDefault(); dialog(); } });
    if (me.key === "main") {
      HK.alertTab = () => { const n = (ALR.list || []).filter(a => a.active).length; return "Alertas" + (n ? " (" + n + ")" : ""); };
      HK.alertBody = () => { const L = ALR.list || [], ev = ALR.ev || [];
        const push = window.tkPushState ? window.tkPushState() : "";
        return `<div class="gx-alr"><div class="gx-alrh"><button type="button" class="gx-btn gx-pri" data-pa="newalert">${I(IC.bell, 14)} Nueva alerta</button>${push}</div>
          ${L.length ? `<table><tr><th>Mercado</th><th>Condición</th><th>Avisar</th><th>Estado</th><th></th></tr>${L.map(a => `<tr><td><b>${esc(a.sym)}</b></td><td>${a.kind === "ind" ? `RSI ${esc((a.p1 || {}).len || 14)} (${esc(a.tf || "")}) ` : a.kind === "line" ? "Tu línea: " : ""}${esc((COND.find(c => c[0] === a.cond) || [0, ""])[1].toLowerCase())} ${a.kind === "line" ? "" : esc(a.kind === "ind" ? String(a.value) : nf(+a.value, X.digits()))}${a.note ? `<small class="gx-muted"> · ${esc(a.note)}</small>` : ""}</td><td>${a.freq === "bar" ? "Cada vez" : "Una vez"}</td><td>${a.active ? "Activa" : a.fired ? "Saltó " + new Date(a.last_fired).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Pausada"}</td><td class="gx-pa"><button type="button" data-alt="${a.id}">${a.active ? "Pausar" : "Activar"}</button><button type="button" data-ald="${a.id}">Borrar</button></td></tr>`).join("")}</table>` : `<p class="gx-bpe">Aún no tienes alertas. Pulsa «Nueva alerta», la campana de arriba, Alt + A, o la campana de la barra de una línea dibujada.</p>`}
          ${ev.length ? `<div class="gx-mh" style="padding:10px 12px 4px">Últimos avisos</div>${ev.slice(0, 8).map(x => `<div class="gx-alre"><span>${new Date(x.created_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>${esc(x.msg)}</div>`).join("")}` : ""}</div>`; };
      HK.afterPanel = (bp) => { bp.querySelectorAll("[data-alt]").forEach(b => b.onclick = async e => { e.stopPropagation(); const a = (ALR.list || []).find(x => x.id === b.dataset.alt); if (!a) return; await A.sb.from("alerts").update({ active: !a.active, last_price: st.price || a.last_price }).eq("id", a.id); loadAlerts(true); });
        bp.querySelectorAll("[data-ald]").forEach(b => b.onclick = async e => { e.stopPropagation(); await A.sb.from("alerts").delete().eq("id", b.dataset.ald); loadAlerts(true); });
        const n = bp.querySelector('[data-pa="newalert"]'); if (n) n.onclick = e => { e.stopPropagation(); dialog(); };
        bp.querySelectorAll("[data-push]").forEach(b => b.onclick = e => { e.stopPropagation(); window.tkPushOn && window.tkPushOn().then(() => HK.repaint && HK.repaint()); }); };
    }
  }]);

  /* ---------- la extensión de cada gráfico ---------- */
  function ext(me, X, HK) {
    const { st, R, ch, $, $$ } = X, opts = X.opts, main = me.key === "main";
    const canvas = $(".gx-canvas"), gx = $(".gx");
    let cross = null;
    /* KLineChart 10 solo da x, y y panel: la vela bajo el cursor se calcula aquí (antes la leyenda se quedaba siempre en la última) */
    ch.subscribeAction("onCrosshairChange", d => {
      let i = d ? d.dataIndex : null;
      if (d && i == null && d.x != null && isFinite(d.x)) { try { let r = ch.convertFromPixel([{ x: d.x, y: d.y }], { paneId: d.paneId || "candle_pane" }); r = Array.isArray(r) ? r[0] : r; i = r ? r.dataIndex : null; } catch (e) { i = null; } }
      const ni = i != null && isFinite(i) ? { dataIndex: i } : null;
      if ((ni && ni.dataIndex) === (cross && cross.dataIndex) && !!ni === !!cross) return;
      cross = ni; paintLegend();
    });

    /* ===== leyenda ===== */
    const lg = document.createElement("div"); lg.className = "gx-lg"; canvas.appendChild(lg);
    const fmtP = v => v == null || !isFinite(v) ? "—" : nf(v, (X.pp || X.digits)());
    function provLabel() {
      const p = st.prov || {}; if (R.on) return "Práctica · " + ((p.label || "").split(" · ")[0] || "");
      if (/binance/i.test(p.id || p.label || "")) return "Binance · en vivo";
      if (/mt5/i.test(p.id || "") || /MT5/.test(p.label || "")) return "Tu MT5 · en vivo";
      return p.delayed ? "Precio público · 10–15 min de retraso" : p.live ? "Precio público · en vivo" : "Precio público · al momento";
    }
    function indLabel(x) { const meta = U.IND_BY[x.n]; return (meta ? meta[1] : x.n) + ((U.CFG || {}).lgIp !== false && x.p && x.p.length ? " " + x.p.join(", ") : ""); }
    /* línea de estado como en TradingView: logo, nombre, si el mercado está abierto, volumen y cambio del día */
    const mtk = { t: 0, p: null };
    function mktOpen() {
      const L = ch.getDataList(); if (!L.length || R.on) return null;
      if (st.price != null && st.price !== mtk.p) { if (mtk.p != null) mtk.t = Date.now(); mtk.p = st.price; }
      if (window.TkMarkets && TkMarkets.binSym(st.sym)) return true; // cripto: siempre abierto
      const ms = TF_MS[st.tf] || 3e5, now = Date.now(), tol = (st.prov && st.prov.delayed ? 22 : 4) * 6e4;
      if (mtk.t && now - mtk.t < 5 * 6e4) return true;
      if (ms < 864e5) return L[L.length - 1].timestamp + ms >= now - tol;
      const q = opts.cachedQuote && opts.cachedQuote(st.sym); return q && q.t ? now - q.t < tol + 6e5 : null;
    }
    let dayF = null, dayTz = "";
    function dayKey(ts) { const tz = (U.CFG || {}).tz && U.CFG.tz !== "auto" ? U.CFG.tz : Intl.DateTimeFormat().resolvedOptions().timeZone; if (!dayF || dayTz !== tz) { dayTz = tz; try { dayF = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }); } catch (e) { dayF = new Intl.DateTimeFormat("en-CA"); } } return dayF.format(new Date(ts)); }
    function prevDayClose(list, i) { const k = dayKey(list[i].timestamp); for (let j = i - 1; j >= 0 && i - j < 3000; j--) if (dayKey(list[j].timestamp) !== k) return list[j].close; return null; }
    HK.prevDayClose = () => { const L = ch.getDataList(); return L.length && (TF_MS[st.tf] || 0) < 864e5 ? prevDayClose(L, L.length - 1) : (L.length > 1 ? L[L.length - 2].close : null); };
    const bigN = v => v == null || !isFinite(v) ? "—" : Math.abs(v) >= 1e5 ? Number(v).toLocaleString("es-ES", { notation: "compact", maximumFractionDigits: 2 }) : Number(v).toLocaleString("es-ES", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
    function logoOf() { const m = window.TkMarkets ? TkMarkets.info(st.sym) : null, c = (m && m.c) || "otro"; const t = c === "fut" ? st.sym.replace(/1!$/, "") : (c === "idx" || c === "bnd") && m.cc ? m.cc : ({ USOIL: "WTI", UKOIL: "BRN", NATGAS: "GAS", COPPER: "CU" })[st.sym] || (c === "cry" ? st.sym.replace(/(USDT|USDC|FDUSD|USD)$/, "") : c === "stk" || c === "etf" ? st.sym.replace(/\.[A-Z]{2}$/, "") : st.sym.replace(/[^A-Z0-9]/gi, "")); return `<i class="gx-lglogo c-${esc(c)}" aria-hidden="true">${esc(t.slice(0, 3).toUpperCase())}</i>`; }
    function paintLegend() {
      if (!lg.isConnected) return;
      const list = ch.getDataList(); if (!list.length) { lg.innerHTML = ""; return; }
      const i = cross && cross.dataIndex != null ? Math.max(0, Math.min(list.length - 1, cross.dataIndex)) : list.length - 1, b = list[i], pb = list[i - 1];
      const chg = pb ? b.close - pb.close : b.close - b.open, pct = pb && pb.close ? chg / pb.close * 100 : 0, cls = chg >= 0 ? "up" : "dn";
      const inds = X.activeInd(), objs = ch.getIndicators();
      const rows = inds.map((x, k) => {
        const o = objs.find(y => y.name === x.n); let vals = "";
        if (o && o.result && o.result[i]) vals = (o.figures || []).filter(f => o.result[i][f.key] != null).slice(0, 4).map((f, j) => `<i style="color:${(x.c && j === 0) ? x.c : (U.CDARK ? ["#86a9ff", "#e0a33a", "#c6cee0", "#4fbf8f", "#d6336c", "#0e9aa7"] : ["#2443c7", "#b7791f", "#556079", "#2f8f67", "#c2412f", "#0e9aa7"])[j % 6]}">${nf(o.result[i][f.key], o.precision != null ? Math.min(o.precision, 6) : 2)}</i>`).join("");
        const hid = x.h || (x.tfs && x.tfs.length && !x.tfs.includes(st.tf));
        return `<div class="gx-lgr${hid ? " off" : ""}"><span class="n">${esc(indLabel(x))}</span>${hid ? "" : vals}<span class="a"><button type="button" data-lgi="eye" data-k="${k}" title="${x.h ? "Mostrar" : "Ocultar"}" aria-label="${x.h ? "Mostrar" : "Ocultar"} ${esc(indLabel(x))}">${I(x.h ? IC.eyeOff : IC.eye, 14)}</button><button type="button" data-lgi="set" data-k="${k}" title="Ajustes" aria-label="Ajustes de ${esc(indLabel(x))}">${I(IC.gear, 14)}</button><button type="button" data-lgi="del" data-k="${k}" title="Quitar" aria-label="Quitar ${esc(indLabel(x))}">${I(IC.x, 14)}</button></span></div>`;
      }).join("");
      const nw = (HK.news || []).find(e => Math.abs(e.ts - b.timestamp) <= Math.max(15 * 6e4, (TF_MS[st.tf] || 3e5)));
      const fold = ls.get("tk-lgfold", false);
      const G = (U.CFG || {}), on = k => G[k] !== false;
      const mi = window.TkMarkets ? TkMarkets.info(st.sym) : null, desc = mi && mi.n && mi.n !== st.sym ? mi.n : "", tm = G.lgTitle || "ticker";
      const ttl = tm === "desc" && desc ? desc : tm === "both" && desc ? st.sym + " · " + desc : st.sym, mo = on("lgMkt") ? mktOpen() : null;
      const pdc = on("lgDay") && (TF_MS[st.tf] || 0) < 864e5 ? prevDayClose(list, i) : null, dch = pdc ? (b.close - pdc) / pdc * 100 : null;
      lg.classList.toggle("bg", on("lgBg")); lg.style.setProperty("--lgbg", Math.max(10, Math.min(100, +G.lgBgOp || 70)) + "%");
      lg.innerHTML = `<div class="gx-lg0">${on("lgLogo") ? logoOf() : ""}${on("lgSym") ? `<b>${esc(ttl)} · ${esc(U.TF_SHORT[st.tf] || st.tf)}</b>` : ""}${mo != null ? `<span class="gx-mko${mo ? " on" : ""}" title="${mo ? "El mercado está abierto" : "El mercado está cerrado ahora"}"><i></i>${mo ? "Abierto" : "Cerrado"}</span>` : ""}${on("lgSrc") ? `<span class="src">${esc(provLabel())}</span>` : ""}
        ${on("lgOhlc") ? `<span class="k">A</span><span>${fmtP(b.open)}</span><span class="k">M</span><span>${fmtP(b.high)}</span><span class="k">m</span><span>${fmtP(b.low)}</span><span class="k">C</span><span class="${cls}">${fmtP(b.close)}</span>` : ""}${on("lgChg") ? `<span class="${cls}">${chg >= 0 ? "+" : "−"}${fmtP(Math.abs(chg))} (${chg >= 0 ? "+" : "−"}${nf(Math.abs(pct), 2)} %)</span>` : ""}${on("lgVol") && b.volume ? `<span class="k">Vol</span><span>${bigN(b.volume)}</span>` : ""}${dch != null && isFinite(dch) ? `<span class="k">Día</span><span class="${dch >= 0 ? "up" : "dn"}">${dch >= 0 ? "+" : "−"}${nf(Math.abs(dch), 2)} %</span>` : ""}
        ${inds.length && on("lgInd") ? `<button type="button" class="gx-lgf" data-lgi="fold" title="${fold ? "Ver indicadores" : "Plegar indicadores"}" aria-label="${fold ? "Ver indicadores" : "Plegar indicadores"}">${I(fold ? IC.down : IC.up, 13)}</button>` : ""}</div>
        ${nw && on("lgNews") ? `<div class="gx-lgn">Noticia ${new Date(nw.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} · ${esc(nw.country)} · ${esc(nw.title || "")}</div>` : ""}
        ${HK.lgExtra ? HK.lgExtra(i, b) : ""}
        ${fold || !on("lgInd") ? "" : on("lgIv") ? rows : rows.replace(/<i style="[^"]*">[^<]*<\/i>/g, "")}`;
      if (qo) qo.style.top = (lg.offsetTop + lg.offsetHeight + 6) + "px";
    }
    lg.addEventListener("click", e => {
      const b = e.target.closest("[data-lgi]"); if (!b) return; e.stopPropagation();
      const a = X.activeInd(), k = +b.dataset.k, t = b.dataset.lgi;
      if (t === "fold") { ls.set("tk-lgfold", !ls.get("tk-lgfold", false)); paintLegend(); return; }
      if (!a[k]) return;
      if (t === "eye") { a[k].h = a[k].h ? 0 : 1; X.saveInd(a); }
      if (t === "del") { a.splice(k, 1); X.saveInd(a); }
      if (t === "set") { indDialog(k); return; }
      paintLegend();
    });

    /* ===== cuenta atrás de la vela ===== */
    const cd = document.createElement("div"); cd.className = "gx-cd"; cd.hidden = true; canvas.appendChild(cd);
    function paintCd() {
      const lb = st.lastBar, ms = TF_MS[st.tf]; if ((U.CFG || {}).cd === false || R.on || !lb || !ms || !cd.isConnected) { cd.hidden = true; return; }
      let left = lb.timestamp + ms - Date.now(); if (st.tf === "1M") left = new Date(new Date(lb.timestamp).getFullYear(), new Date(lb.timestamp).getMonth() + 1, 1) - Date.now();
      if (left <= 0 || left > ms * 1.05) { cd.hidden = true; return; }
      const s = Math.floor(left / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60, p2 = n => String(n).padStart(2, "0");
      let y = null; try { const c = ch.convertToPixel({ timestamp: lb.timestamp, value: st.price || lb.close }, { paneId: "candle_pane", absolute: true }); y = c && c.y; } catch (e) { /* fuera */ }
      const box = ch.getSize("candle_pane", "yAxis"); if (y == null || !box || y < 8 || y > box.height - 4) { cd.hidden = true; return; }
      cd.textContent = d ? `${d} d ${h} h` : h ? `${h}:${p2(m)}:${p2(ss)}` : `${p2(m)}:${p2(ss)}`;
      const cb = me.el.querySelector(".gx-chart"), off = cb ? cb.getBoundingClientRect().top - canvas.getBoundingClientRect().top : 0;
      cd.style.top = (y + off + 10) + "px"; cd.style.width = box.width + "px"; cd.classList.toggle("l", (U.CFG || {}).pos === "left"); cd.hidden = false;
    }

    /* ===== noticias en el eje ===== */
    HK.news = [];
    function paintNews() {
      try { ch.removeOverlay({ groupId: "news" }); } catch (e) { /* nada */ }
      const list = ch.getDataList(); if (!list.length || (TF_MS[st.tf] || 0) > 864e5 || (U.CFG || {}).showNews === false) { HK.news = []; return; }
      const a = list[0].timestamp, z = list[list.length - 1].timestamp + (TF_MS[st.tf] || 0);
      HK.news = newsFor(st.sym).filter(e => e.ts >= a && e.ts <= z);
      const seen = new Set();
      HK.news.forEach(e => { const ms = TF_MS[st.tf] || 3e5, k = Math.floor(e.ts / ms) * ms; if (seen.has(k)) return; seen.add(k); try { ch.createOverlay({ name: "tkNewsMark", groupId: "news", lock: true, points: [{ timestamp: k }], extendData: { c: e.country || "N" } }); } catch (er) { /* fuera del rango */ } });
    }

    /* ===== práctica: posiciones y órdenes ===== */
    const P = { list: main ? (ls.get("tk-paper-pos", []) || []).filter(p => p.mode === "live") : [], hist: [], ov: {} };
    const acct = () => {
      const A = APP(), run = A && A.S.btRun;
      if (R.on && run && run.size) return { bal: run.size + P.hist.filter(h => h.mode === "replay").reduce((s, h) => s + h.money, 0), start: run.size, cur: "USD", riskPct: run.risk || 0.5, com: paper().com, slip: paper().slip, session: run };
      if (R.on) { const pp = paper(); return Object.assign(pp, { bal: pp.start + P.hist.filter(h => h.mode === "replay").reduce((s, h) => s + h.money, 0) }); }
      return paper();
    };
    const nowPrice = () => R.on ? (X.bar() ? X.bar().close : null) : (st.price || (st.lastBar && st.lastBar.close));
    const nowTs = () => R.on ? (X.bar() ? X.bar().timestamp : Date.now()) : Date.now();
    const slipPx = () => (acct().slip || 0) * pipOf(X.digits(), st.sym);
    const rd = v => +(+v).toFixed(X.digits());
    function atrNow() { const l = ch.getDataList(), n = 14; if (l.length < 3) return null; let a = null; for (let k = Math.max(1, l.length - 120); k < l.length; k++) { const c = l[k], pc = l[k - 1].close, tr = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)); a = a == null ? tr : (a * (n - 1) + tr) / n; } return a; }
    const lotsFor = (e, s, money) => opts.lotsFor ? opts.lotsFor(st.sym, e, s, money) : null;
    function persist() { if (!main) return; const keep = (ls.get("tk-paper-pos", []) || []).filter(p => p.mode === "live" && p.sym !== st.sym); ls.set("tk-paper-pos", keep.concat(P.list.filter(p => p.mode === "live"))); }
    function drawPos(p) {
      if (p.sym !== st.sym) return;
      const ms = TF_MS[st.tf] || 3e5, t0 = p.openTime || p.created, tw = Math.max(ms * 20, (nowTs() - t0) + ms * 8);
      const ex = { side: p.side, sim: true, pend: p.status === "pending" ? p.kind : null, lots: p.lots, frac: p.frac, live: p.status === "open" ? liveR(p) : null };
      const pts = [{ timestamp: t0, value: p.entry }, { timestamp: t0 + tw, value: p.stop }, { timestamp: t0 + tw, value: p.tp != null ? p.tp : p.entry }];
      if (P.ov[p.id]) { try { ch.overrideOverlay({ id: P.ov[p.id], extendData: ex, points: pts }); return; } catch (e) { /* se volvió a crear */ } }
      P.ov[p.id] = ch.createOverlay({ name: "tkPos", groupId: "sim", extendData: ex, points: pts,
        onPressedMoveEnd: ev => { const q = P.list.find(z => z.id === p.id); if (!q) return; const pt = ev.overlay.points, px = nowPrice();
          if (q.status === "pending") { const ne = rd(pt[0].value); if (ne > 0) q.entry = ne; }
          const ns = rd(pt[1].value), nt = pt[2] ? rd(pt[2].value) : null, buy = q.side === "buy";
          if (q.status !== "open" || (buy ? ns < px : ns > px)) q.stop = ns; if (nt != null && (buy ? nt > q.entry : nt < q.entry)) q.tp = nt;
          if (q.status === "pending") q.risk = Math.abs(q.entry - q.stop);
          drawPos(q); persist(); paintPanel(); } });
    }
    function undraw(p) { if (P.ov[p.id]) { try { ch.removeOverlay({ id: P.ov[p.id] }); } catch (e) { /* ya no está */ } delete P.ov[p.id]; } }
    function redrawAll() { Object.keys(P.ov).forEach(id => { try { ch.removeOverlay({ id: P.ov[id] }); } catch (e) { /* nada */ } }); P.ov = {}; if ((U.CFG || {}).showPos === false) return; P.list.filter(p => (p.mode === "replay") === !!R.on).forEach(drawPos); }
    function liveR(p) { const px = nowPrice(); if (px == null || !p.risk) return 0; return Math.round((px - p.entry) / p.risk * (p.side === "buy" ? 1 : -1) * 100) / 100; }
    function place(o) {
      const a = acct(), px = nowPrice(); if (px == null) return null;
      const buy = o.side === "buy", kind = o.kind || "mkt", e0 = kind === "mkt" ? rd(px + (buy ? 1 : -1) * slipPx()) : rd(o.price);
      const d = (atrNow() || px * 0.002) * 1.5, stop = rd(o.stop != null ? o.stop : (buy ? e0 - d : e0 + d)), tp = o.tp === null ? null : rd(o.tp != null ? o.tp : (buy ? e0 + 2 * Math.abs(e0 - stop) : e0 - 2 * Math.abs(e0 - stop)));
      if (buy ? stop >= e0 : stop <= e0) { X.hint("El stop tiene que ir " + (buy ? "por debajo" : "por encima") + " de la entrada."); setTimeout(() => X.hint(""), 2500); return null; }
      const riskPct = o.riskPct || a.riskPct, riskMoney = a.bal * riskPct / 100;
      const p = { id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), sym: st.sym, tf: st.tf, side: o.side, kind, status: kind === "mkt" ? "open" : "pending", entry: e0, stop, tp, risk: Math.abs(e0 - stop), riskMoney, riskPct, frac: 1, parts: [], mfe: 0, mae: 0, created: nowTs(), openTime: kind === "mkt" ? nowTs() : null, entryIdx: R.on ? R.idx : null, mode: R.on ? "replay" : "live", lots: lotsFor(e0, stop, riskMoney) };
      if (kind !== "mkt") { const okLim = buy ? e0 < px : e0 > px, okStp = buy ? e0 > px : e0 < px; if ((kind === "lim" && !okLim) || (kind === "stp" && !okStp)) { X.hint(kind === "lim" ? "Una orden límite de " + (buy ? "compra va por debajo" : "venta va por encima") + " del precio actual." : "Una orden stop de " + (buy ? "compra va por encima" : "venta va por debajo") + " del precio actual."); setTimeout(() => X.hint(""), 3000); return null; } }
      P.list.push(p); drawPos(p); persist(); paintPanel(); X.stats(); return p;
    }
    async function magnify(p, b) { // las dos cosas en la misma vela: miramos las velas de 1 minuto para saber qué llegó antes
      try {
        const ms = TF_MS[st.tf] || 3e5; if (ms <= 6e4 || !st.prov) return null;
        const r = await st.prov.bars(st.sym, "1m", b.timestamp + ms); const sub = (r.bars || []).filter(x => x.timestamp >= b.timestamp && x.timestamp < b.timestamp + ms);
        for (const k of sub) { const hs = p.side === "buy" ? k.low <= p.stop : k.high >= p.stop, ht = p.side === "buy" ? k.high >= p.tp : k.low <= p.tp; if (hs && ht) return "stop"; if (hs) return "stop"; if (ht) return "tp"; }
      } catch (e) { /* sin velas de 1 min: lo prudente */ }
      return null;
    }
    function settle(p, price, b, why) {
      const r = Math.round(((price - p.entry) / p.risk * (p.side === "buy" ? 1 : -1)) * 100) / 100;
      const a = acct(), parts = p.parts.concat([{ f: p.frac, r, price }]), rTot = Math.round(parts.reduce((s, x) => s + x.f * x.r, 0) * 100) / 100;
      const com = +a.com || 0, moneyV = Math.round((rTot * p.riskMoney - com) * 100) / 100;
      undraw(p); P.list = P.list.filter(z => z.id !== p.id);
      const rec = { id: "sim:" + (p.openTime || p.created) + ":" + p.id, symbol: p.sym, tf: p.tf, side: p.side, entry_time: new Date(p.openTime || p.created).toISOString(), entry: p.entry, stop: p.stop0 || p.stop, tp: p.tp, exit_time: new Date(b ? b.timestamp : nowTs()).toISOString(), exit: price, r: rTot,
        x: { mode: p.mode, kind: p.kind, why, money: moneyV, com, slip: a.slip || 0, risk_money: Math.round(p.riskMoney * 100) / 100, risk_pct: p.riskPct, lots: p.lots, mfe: p.mfe, mae: p.mae, parts: p.parts.length ? parts : undefined, bal_before: Math.round(a.bal * 100) / 100 } };
      P.hist.unshift(Object.assign({ money: moneyV, mode: p.mode }, rec));
      if (p.mode === "live") { const pp = paper(); pp.bal = Math.round((pp.bal + moneyV) * 100) / 100; pp.n = (pp.n || 0) + 1; savePaper(pp); }
      if (R.on) R.trades.push(rec);
      opts.saveSim && opts.saveSim(rec);
      X.hint(`Práctica cerrada (${why === "stop" ? "stop" : why === "tp" ? "objetivo" : "a mano"}): ${fmtR(rTot)} · ${money(moneyV, a.cur)}`); setTimeout(() => X.hint(""), 3000);
      persist(); paintPanel(); X.stats();
    }
    function onBar(b, mode) {
      if (!main) return;
      for (const p of P.list.slice()) {
        if (p.sym !== st.sym || (mode === "replay") !== (p.mode === "replay")) continue;
        if (p.status === "pending") {
          const buy = p.side === "buy", hit = p.kind === "lim" ? (buy ? b.low <= p.entry : b.high >= p.entry) : (buy ? b.high >= p.entry : b.low <= p.entry);
          if (hit) { if (p.kind === "stp") p.entry = rd(p.entry + (buy ? 1 : -1) * slipPx()); p.status = "open"; p.openTime = b.timestamp; p.entryIdx = R.on ? R.idx : null; p.risk = Math.abs(p.entry - p.stop); p.lots = lotsFor(p.entry, p.stop, p.riskMoney); X.hint("Orden ejecutada: " + (buy ? "compra" : "venta") + " a " + fmtP(p.entry)); setTimeout(() => X.hint(""), 2500); }
          drawPos(p); continue;
        }
        if (p.resolving) continue;
        const buy = p.side === "buy", fav = buy ? b.high - p.entry : p.entry - b.low, adv = buy ? p.entry - b.low : b.high - p.entry;
        p.mfe = Math.max(p.mfe, Math.round(fav / p.risk * 100) / 100); p.mae = Math.max(p.mae, Math.round(adv / p.risk * 100) / 100);
        const hs = buy ? b.low <= p.stop : b.high >= p.stop, ht = p.tp != null && (buy ? b.high >= p.tp : b.low <= p.tp);
        const exitStop = () => settle(p, rd(p.stop + (buy ? -1 : 1) * (p.stop === p.entry ? 0 : slipPx())), b, "stop");
        if (hs && ht && mode === "replay") { p.resolving = true; magnify(p, b).then(w => { p.resolving = false; if (!P.list.includes(p)) return; if (w === "tp") settle(p, p.tp, b, "tp"); else exitStop(); }); continue; }
        if (hs) exitStop(); else if (ht) settle(p, p.tp, b, "tp"); else drawPos(p);
      }
      paintPanel(true);
    }
    function closePos(p, frac) {
      const px = nowPrice(); if (px == null) return; const ex = rd(px + (p.side === "buy" ? -1 : 1) * slipPx());
      if (frac && frac < p.frac) { const r = Math.round(((ex - p.entry) / p.risk * (p.side === "buy" ? 1 : -1)) * 100) / 100; p.parts.push({ f: frac, r, price: ex }); p.frac = Math.round((p.frac - frac) * 100) / 100; drawPos(p); persist(); paintPanel(); X.hint("Cerrada una parte: " + fmtR(r * frac)); setTimeout(() => X.hint(""), 2500); return; }
      settle(p, ex, R.on ? X.bar() : null, "manual");
    }
    function toBE(p) { const px = nowPrice(), buy = p.side === "buy"; if (px == null || (buy ? px <= p.entry : px >= p.entry)) { X.hint("Para mover el stop a la entrada, el precio tiene que ir a tu favor."); setTimeout(() => X.hint(""), 2500); return; } p.stop0 = p.stop0 || p.stop; p.stop = p.entry; drawPos(p); persist(); paintPanel(); }
    HK.openSim = side => { if (!main) return; place({ side }); };
    HK.closeAll = () => P.list.filter(p => p.status === "open" && p.sym === st.sym && (p.mode === "replay") === !!R.on).forEach(p => closePos(p));
    HK.onBar = onBar;
    HK.onBack = idx => { P.list.filter(p => p.mode === "replay" && ((p.entryIdx != null && p.entryIdx > idx) || (p.status === "pending" && p.created > (R.all[idx] || {}).timestamp))).forEach(p => { undraw(p); P.list = P.list.filter(z => z !== p); }); paintPanel(); };
    HK.onReset = why => { if (why === "tf") { setTimeout(redrawAll, 300); return; } P.list.filter(p => p.mode === "replay").forEach(undraw); P.list = P.list.filter(p => p.mode !== "replay"); if (why === "exit") { P.hist = P.hist.filter(h => h.mode !== "replay"); setTimeout(() => { redrawAll(); paintNews(); }, 300); } paintPanel(); };
    HK.onBegin = () => { setTimeout(() => { redrawAll(); paintNews(); paintLegend(); }, 150); };
    HK.onData = () => { setTimeout(() => { paintNews(); redrawAll(); paintLegend(); paintCd(); X.applyLook && X.applyLook(); try { paintPanel(); } catch (e) { /* aún sin panel */ } }, 120); };
    { const pr = HK.onRestyle; HK.onRestyle = () => { pr && pr(); paintNews(); redrawAll(); paintLegend(); paintCd(); }; }
    HK.stats = () => paintPanel(true);
    HK.place = place; HK.P = P; HK.acct = acct;

    /* ===== botones de comprar y vender sobre el gráfico ===== */
    let qo = null;
    if (main) {
      qo = document.createElement("div"); qo.className = "gx-qo"; canvas.appendChild(qo);
      qo.addEventListener("click", e => { const b = e.target.closest("[data-qo]"); if (!b) return; e.stopPropagation(); const t = b.dataset.qo; if (t === "buy" || t === "sell") place({ side: t }); if (t === "ticket") ticket(b); });
    }
    function paintQo() {
      if (!qo) return; qo.hidden = (U.CFG || {}).qoShow === false; const px = nowPrice(), a = acct(); if (px == null) { qo.innerHTML = ""; return; }
      const d = (atrNow() || px * 0.002) * 1.5, rm = a.bal * a.riskPct / 100, lots = lotsFor(px, px - d, rm), sp = slipPx();
      qo.innerHTML = `<span class="gx-qtag" title="Las operaciones de aquí son de práctica: no tocan tu cuenta real">Práctica</span><button type="button" class="gx-qs" data-qo="sell"><small>VENDER</small>${fmtP(px - sp)}</button><span class="gx-qm">${lots ? nf(lots, 2) : "1 R"}</span><button type="button" class="gx-qb" data-qo="buy"><small>COMPRAR</small>${fmtP(px + sp)}</button>
        <button type="button" class="gx-qt" data-qo="ticket" title="Orden con precio, stop y objetivo" aria-label="Nueva orden">${I(IC.ticket, 15)}</button><span class="gx-qi">1 R = ${money(rm, a.cur)}${lots ? "" : " · stop a 1,5 ATR"}</span>`;
    }
    function ticket(btn) {
      const px = nowPrice(), a = acct(); if (px == null) return; const d = (atrNow() || px * 0.002) * 1.5;
      const o = { side: "buy", kind: "lim", price: rd(px - d / 2), stop: null, tp: null, riskPct: a.riskPct };
      const calc = () => { const buy = o.side === "buy", e = o.kind === "mkt" ? px : o.price, s = o.stop != null ? o.stop : rd(buy ? e - d : e + d), t = o.tp != null ? o.tp : rd(buy ? e + 2 * Math.abs(e - s) : e - 2 * Math.abs(e - s)); return { e, s, t, rm: a.bal * o.riskPct / 100, rr: Math.abs(t - e) / Math.abs(e - s) }; };
      const sum = () => { const c = calc(), lots = lotsFor(c.e, c.s, c.rm); return `<span>Arriesgas <b>${money(c.rm, a.cur)}</b> (1 R)</span><span>Objetivo <b>+${nf(c.rr, 1)} R</b></span>${lots ? `<span><b>${nf(lots, 2)}</b> lotes</span>` : ""}`; };
      const paint = () => { const c = calc();
        X.openModal(`<div class="gx-dh"><h3>Nueva orden de práctica</h3><button type="button" class="gx-tb gx-ic" data-x aria-label="Cerrar">${I(IC.x, 18)}</button></div>
          <div class="gx-ot"><div class="gx-seg">${[["buy", "Comprar"], ["sell", "Vender"]].map(([k, l]) => `<button type="button" data-os="${k}" aria-pressed="${o.side === k}">${l}</button>`).join("")}</div>
          <div class="gx-seg">${[["mkt", "A mercado"], ["lim", "Límite"], ["stp", "Stop"]].map(([k, l]) => `<button type="button" data-ok="${k}" aria-pressed="${o.kind === k}">${l}</button>`).join("")}</div>
          <p class="gx-muted" style="margin:0">${o.kind === "mkt" ? "Entra ya, al precio de ahora." : o.kind === "lim" ? "Entra si el precio viene a buscarte (" + (o.side === "buy" ? "por debajo" : "por encima") + " del precio actual)." : "Entra si el precio rompe (" + (o.side === "buy" ? "por encima" : "por debajo") + " del precio actual)."}</p>
          <div class="gx-og">${o.kind !== "mkt" ? `<label>Precio<input class="gx-in" data-of="price" inputmode="decimal" value="${fmtP(c.e)}"></label>` : ""}<label>Stop<input class="gx-in" data-of="stop" inputmode="decimal" value="${fmtP(c.s)}"></label><label>Objetivo<input class="gx-in" data-of="tp" inputmode="decimal" value="${fmtP(c.t)}"></label><label>Riesgo %<input class="gx-in" data-of="riskPct" inputmode="decimal" value="${String(o.riskPct).replace(".", ",")}"></label></div>
          <div class="gx-osum">${sum()}</div>
          <div class="gx-dact"><button type="button" class="gx-btn" data-x>Cancelar</button><button type="button" class="gx-btn gx-pri" data-ogo>Colocar orden</button></div></div>`, bind);
      };
      const D = $(".gx-dlg");
      function bind() { D.onclick = onClick; D.onchange = onChange; }
      paint();
      function onClick(e) { const t = e.target.closest("button"); if (!t) return; if (t.dataset.x != null) { X.closeModal(); return; } if (t.dataset.os) { o.side = t.dataset.os; o.stop = o.tp = null; if (o.kind !== "mkt") o.price = rd(o.side === "buy" ? (o.kind === "lim" ? px - d / 2 : px + d / 2) : (o.kind === "lim" ? px + d / 2 : px - d / 2)); paint(); } if (t.dataset.ok) { o.kind = t.dataset.ok; o.stop = o.tp = null; o.price = rd(o.side === "buy" ? (o.kind === "lim" ? px - d / 2 : px + d / 2) : (o.kind === "lim" ? px + d / 2 : px - d / 2)); paint(); } if (t.dataset.ogo != null) { const c = calc(); if (place({ side: o.side, kind: o.kind, price: c.e, stop: c.s, tp: c.t, riskPct: o.riskPct })) X.closeModal(); } }
      function onChange(e) { const f = e.target.dataset.of; if (!f) return; const v = parseFloat(String(e.target.value).replace(",", ".")); if (!isFinite(v) || v <= 0) return; o[f] = f === "riskPct" ? Math.min(5, v) : v; const sm = D.querySelector(".gx-osum"); if (sm) sm.innerHTML = sum(); }
    }

    /* ===== panel inferior ===== */
    let bp = null, tab = ls.get("tk-bptab", "pos");
    if (main) {
      bp = document.createElement("div"); bp.className = "gx-bp"; if (ls.get("tk-bpopen", false)) bp.classList.add("open"); gx.appendChild(bp);
      /* plegado no ocupa nada (ni la barra de pestañas): se abre desde el botón «Posiciones y órdenes» de la barra de la derecha */
      X.bpToggle = on => { const o = on == null ? !bp.classList.contains("open") : !!on; bp.classList.toggle("open", o); ls.set("tk-bpopen", o); paintPanel(); setTimeout(() => ch.resize(), 50); };
      bp.addEventListener("click", e => {
        const t = e.target.closest("button,[data-bpt]"); if (!t) return;
        if (t.dataset.bpt) { tab = t.dataset.bpt; ls.set("tk-bptab", tab); bp.classList.add("open"); ls.set("tk-bpopen", true); paintPanel(); setTimeout(() => ch.resize(), 50); return; }
        if (t.dataset.bptog != null) { bp.classList.toggle("open"); ls.set("tk-bpopen", bp.classList.contains("open")); paintPanel(); setTimeout(() => ch.resize(), 50); return; }
        const p = P.list.find(z => z.id === t.dataset.id);
        if (t.dataset.pa === "close" && p) { if (p.status === "pending") { undraw(p); P.list = P.list.filter(z => z !== p); persist(); paintPanel(); } else closePos(p); }
        if (t.dataset.pa === "half" && p) closePos(p, Math.round(p.frac / 2 * 100) / 100);
        if (t.dataset.pa === "be" && p) toBE(p);
        if (t.dataset.pa === "reset") { if (!confirm("¿Reiniciar la cuenta de práctica? El saldo vuelve al inicial.")) return; const pp = paper(); pp.bal = pp.start; pp.n = 0; savePaper(pp); P.list.filter(z => z.mode === "live").forEach(undraw); P.list = P.list.filter(z => z.mode !== "live"); persist(); paintPanel(); }
        if (t.dataset.pa === "report") { HK.report ? HK.report() : null; }
      });
      bp.addEventListener("change", e => { const f = e.target.dataset.acf; if (!f) return; const v = parseFloat(String(e.target.value).replace(",", ".")); if (!isFinite(v) || v < 0) return; const pp = paper(); if (f === "start") { pp.start = v; if (!pp.n) pp.bal = v; } else pp[f] = v; if (f === "cur") pp.cur = e.target.value; savePaper(pp); paintPanel(); paintQo(); });
    }
    let lastPaint = 0;
    function paintPanel(soft) {
      paintQo();
      if (!bp) return; if (soft && Date.now() - lastPaint < 400) return; lastPaint = Date.now();
      const a = acct(), mine = P.list.filter(p => (p.mode === "replay") === !!R.on), open = mine.filter(p => p.status === "open"), pend = mine.filter(p => p.status === "pending");
      const flo = open.reduce((s, p) => s + liveR(p) * p.frac * p.riskMoney, 0), hist = P.hist.filter(h => R.on ? h.mode === "replay" : h.mode === "live");
      const day = hist.filter(h => new Date(h.exit_time).toDateString() === new Date(nowTs()).toDateString()), dayR = day.reduce((s, h) => s + h.r, 0);
      const isOpen = bp.classList.contains("open");
      const tabs = [["pos", `Posiciones${open.length ? " (" + open.length + ")" : ""}`], ["ord", `Órdenes${pend.length ? " (" + pend.length + ")" : ""}`], ["hist", "Historial"], ["acct", "Cuenta"], ["rep", R.on ? "Informe" : "Resumen"]].concat(HK.alertTab ? [["alr", HK.alertTab()]] : []);
      const head = `<div class="gx-bph"><button type="button" class="gx-bpt" data-bptog aria-expanded="${isOpen}" title="${isOpen ? "Plegar" : "Desplegar"}">${I(isOpen ? IC.down : IC.up, 14)}</button>${tabs.map(([k, l]) => `<button type="button" class="gx-bptab" data-bpt="${k}" aria-pressed="${isOpen && tab === k}">${l}</button>`).join("")}
        <span class="gx-bps">${R.on ? (a.session ? "Sesión «" + esc(a.session.name || "") + "»" : "Backtesting") : "Cuenta de práctica"} · Saldo <b>${money(a.bal, a.cur)}</b>${open.length ? ` · Abiertas <b class="${flo >= 0 ? "up" : "dn"}">${money(flo, a.cur)}</b>` : ""}${day.length ? ` · Hoy <b>${fmtR(dayR)}</b>` : ""}</span></div>`;
      let body = "";
      if (isOpen) {
        const th = cols => `<tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>`;
        if (tab === "pos") body = open.length ? `<table>${th(["Mercado", "Lado", "Tamaño", "Entrada", "Stop", "Objetivo", "Ahora", "Resultado", ""])}${open.map(p => { const r = liveR(p); return `<tr><td><b>${esc(p.sym)}</b></td><td class="${p.side === "buy" ? "up" : ""}">${p.side === "buy" ? "Compra" : "Venta"}</td><td>${p.lots ? nf(p.lots * p.frac, 2) + " lotes" : Math.round(p.frac * 100) + " %"}</td><td>${fmtP(p.entry)}</td><td>${fmtP(p.stop)}</td><td>${p.tp != null ? fmtP(p.tp) : "—"}</td><td>${p.sym === st.sym ? fmtP(nowPrice()) : "—"}</td><td class="${r >= 0 ? "up" : "dn"}">${fmtR(r)} · ${money(r * p.frac * p.riskMoney, a.cur)}</td><td class="gx-pa"><button type="button" data-pa="be" data-id="${p.id}" title="Mover el stop a la entrada">A la entrada</button><button type="button" data-pa="half" data-id="${p.id}" title="Cerrar la mitad">Cerrar 50 %</button><button type="button" data-pa="close" data-id="${p.id}" title="Cerrar">Cerrar</button></td></tr>`; }).join("")}</table>`
          : `<p class="gx-bpe">Sin posiciones abiertas. Pulsa Comprar o Vender en el gráfico, o ${I(IC.ticket, 13)} para una orden con precio.</p>`;
        if (tab === "ord") body = pend.length ? `<table>${th(["Mercado", "Tipo", "Precio", "Stop", "Objetivo", "Riesgo", ""])}${pend.map(p => `<tr><td><b>${esc(p.sym)}</b></td><td>${p.kind === "lim" ? "Límite" : "Stop"} ${p.side === "buy" ? "de compra" : "de venta"}</td><td>${fmtP(p.entry)}</td><td>${fmtP(p.stop)}</td><td>${p.tp != null ? fmtP(p.tp) : "—"}</td><td>${money(p.riskMoney, a.cur)}</td><td class="gx-pa"><button type="button" data-pa="close" data-id="${p.id}">Cancelar</button></td></tr>`).join("")}</table>` : `<p class="gx-bpe">No tienes órdenes pendientes. Con ${I(IC.ticket, 13)} pones una orden límite o stop: entra sola cuando el precio llegue.</p>`;
        if (tab === "hist") body = hist.length ? `<table>${th(["Cierre", "Mercado", "Lado", "Entrada", "Salida", "Motivo", "R", "Resultado"])}${hist.slice(0, 50).map(h => `<tr><td>${new Date(h.exit_time).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td><b>${esc(h.symbol)}</b></td><td>${h.side === "buy" ? "Compra" : "Venta"}</td><td>${fmtP(h.entry)}</td><td>${fmtP(h.exit)}</td><td>${h.x.why === "stop" ? "Stop" : h.x.why === "tp" ? "Objetivo" : "A mano"}</td><td class="${h.r >= 0 ? "up" : "dn"}">${fmtR(h.r)}</td><td class="${h.money >= 0 ? "up" : "dn"}">${money(h.money, a.cur)}</td></tr>`).join("")}</table>` : `<p class="gx-bpe">Aquí verás las operaciones de práctica que cierres${R.on ? " en este backtesting" : ""}.</p>`;
        if (tab === "acct") { const pp = paper(); body = `<div class="gx-acct"><div><span>Saldo</span><b>${money(a.bal, a.cur)}</b></div><div><span>Patrimonio</span><b>${money(a.bal + flo, a.cur)}</b></div><div><span>Resultado</span><b class="${a.bal - a.start >= 0 ? "up" : "dn"}">${money(a.bal - a.start, a.cur)}</b></div><div><span>Riesgo por operación</span><b>${nf(a.riskPct, 2)} %</b></div>
            ${R.on && a.session ? `<p class="gx-muted" style="grid-column:1/-1">En esta sesión se usa su tamaño (${money(a.start, a.cur)}) y su riesgo. Comisión y deslizamiento, los de tu cuenta de práctica.</p>` : ""}
            <label>Saldo inicial<input class="gx-in" data-acf="start" inputmode="decimal" value="${pp.start}"></label><label>Riesgo %<input class="gx-in" data-acf="riskPct" inputmode="decimal" value="${String(pp.riskPct).replace(".", ",")}"></label><label>Comisión por operación ($)<input class="gx-in" data-acf="com" inputmode="decimal" value="${String(pp.com).replace(".", ",")}"></label><label>Deslizamiento (pips)<input class="gx-in" data-acf="slip" inputmode="decimal" value="${String(pp.slip).replace(".", ",")}"></label>
            <p class="gx-muted" style="grid-column:1/-1;margin:0">Con comisión y deslizamiento el resultado se parece más al real: las órdenes a mercado y los stops entran un poco peor. ${!R.on ? `<button type="button" class="gx-link" data-pa="reset">Reiniciar la cuenta</button>` : ""}</p></div>`; }
        if (tab === "rep") { const n = hist.length, w = hist.filter(h => h.r > 0).length, tot = hist.reduce((s, h) => s + h.r, 0), gp = hist.filter(h => h.r > 0).reduce((s, h) => s + h.r, 0), gl = -hist.filter(h => h.r < 0).reduce((s, h) => s + h.r, 0);
          body = n ? `<div class="gx-acct"><div><span>Operaciones</span><b>${n}</b></div><div><span>Resultado</span><b class="${tot >= 0 ? "up" : "dn"}">${fmtR(tot)}</b></div><div><span>Aciertos</span><b>${Math.round(w / n * 100)} %</b></div><div><span>Factor de beneficio</span><b>${gl ? nf(gp / gl, 2) : n >= 5 ? "Sin pérdidas" : "—"}</b></div>
            ${HK.report ? `<p style="grid-column:1/-1;margin:0"><button type="button" class="gx-btn gx-pri" data-pa="report">Ver el informe completo</button></p>` : ""}</div>` : `<p class="gx-bpe">Cuando cierres operaciones de práctica verás aquí su resumen${HK.report ? " y el informe completo" : ""}.</p>`; }
        if (tab === "alr" && HK.alertBody) body = HK.alertBody();
      }
      bp.innerHTML = head + (isOpen ? `<div class="gx-bpb">${body}</div>` : "");
      try { window.dispatchEvent(new CustomEvent("tk-bp", { detail: { open: isOpen, n: open.length + pend.length } })); } catch (e) { /* navegador antiguo */ }
      HK.afterPanel && HK.afterPanel(bp, tab);
    }

    /* ===== ajustes completos de un indicador (Entradas, Estilo, Visibilidad) ===== */
    function indDialog(k) {
      const a = X.activeInd(), x = a[k]; if (!x) return; const meta = U.IND_BY[x.n] || [x.n, x.n, x.n, "", false, []];
      let t = "in"; const TFS = U.TFS.map(z => z[0]);
      const paint = () => {
        const params = (x.p && x.p.length ? x.p : meta[5]);
        X.openModal(`<div class="gx-dh"><h3>${esc(meta[2])}</h3><button type="button" class="gx-tb gx-ic" data-x aria-label="Cerrar">${I(IC.x, 18)}</button></div>
          <div class="gx-seg gx-tabs3">${[["in", "Entradas"], ["st", "Estilo"], ["vis", "Visibilidad"]].map(([q, l]) => `<button type="button" data-it="${q}" aria-pressed="${t === q}">${l}</button>`).join("")}</div>
          <div class="gx-itb">${t === "in" ? (params.length ? params.map((v, i) => `<label class="gx-irow">Valor ${i + 1}<input class="gx-in" type="number" step="any" data-ip="${i}" value="${v}"></label>`).join("") : `<p class="gx-muted">Este indicador no tiene valores que cambiar.</p>`) + `<p class="gx-muted">${esc(meta[6] || "")}</p>`
            + (HK.indSourceUI ? HK.indSourceUI(x, meta) : "")
          : t === "st" ? `<label class="gx-irow">Color<input type="color" data-is="c" value="${x.c || (U.CDARK ? "#86a9ff" : "#2443c7")}"></label>
              <label class="gx-irow">Grosor<select class="gx-in" data-is="w">${[1, 1.5, 2, 3, 4].map(w => `<option value="${w}" ${(x.w || 1.5) == w ? "selected" : ""}>${String(w).replace(".", ",")} px</option>`).join("")}</select></label>
              <label class="gx-irow">Línea<select class="gx-in" data-is="ls">${[["solid", "Continua"], ["dashed", "Discontinua"], ["dotted", "Punteada"]].map(([v, l]) => `<option value="${v}" ${(x.ls || "solid") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
              ${!meta[4] ? `<label class="gx-irow gx-chk"><input type="checkbox" data-is="ov" ${x.ov ? "checked" : ""}> Encima del precio (en vez de en su propio panel)</label>` : ""}`
          : `<p class="gx-muted" style="margin-top:0">Elige en qué marcos de tiempo se ve. Si no marcas ninguno, se ve en todos.</p><div class="gx-tfc">${TFS.map(z => `<label class="gx-chk"><input type="checkbox" data-iv="${z}" ${x.tfs && x.tfs.includes(z) ? "checked" : ""}> ${esc(U.TF_SHORT[z] || z)}</label>`).join("")}</div>`}</div>
          <div class="gx-dact"><button type="button" class="gx-btn" data-ireset>Valores por defecto</button><span style="flex:1"></span><button type="button" class="gx-btn" data-x>Cancelar</button><button type="button" class="gx-btn gx-pri" data-iok>Aceptar</button></div>`, () => { D.onclick = onClick; D.onchange = onChange; });
      };
      const before = JSON.stringify(x), D = $(".gx-dlg"); paint();
      function onClick(e) { const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.it) { t = b.dataset.it; paint(); return; }
        if (b.dataset.x != null) { const y = JSON.parse(before); a[k] = y; X.saveInd(a); X.closeModal(); paintLegend(); return; }
        if (b.dataset.ireset != null) { x.p = meta[5].slice(); delete x.c; delete x.w; delete x.ls; delete x.tfs; delete x.ov; X.saveInd(a); paint(); return; }
        if (b.dataset.iok != null) { X.saveInd(a); X.closeModal(); paintLegend(); } }
      function onChange(e) { const z = e.target;
        if (z.dataset.ip != null) { const v = parseFloat(z.value); if (isFinite(v)) { x.p = (x.p && x.p.length ? x.p : meta[5]).slice(); x.p[+z.dataset.ip] = v; } }
        if (z.dataset.is === "c") x.c = z.value; if (z.dataset.is === "w") x.w = +z.value; if (z.dataset.is === "ls") x.ls = z.value; if (z.dataset.is === "ov") x.ov = z.checked ? 1 : 0;
        if (z.dataset.iv) { const s = new Set(x.tfs || []); z.checked ? s.add(z.dataset.iv) : s.delete(z.dataset.iv); x.tfs = Array.from(s); }
        if (z.dataset.isrc) HK.indSourceSet && HK.indSourceSet(x, z);
        X.saveInd(a); paintLegend(); }
    }
    HK.indDialog = indDialog;

    /* ===== reloj ===== */
    const tick = setInterval(() => { if (!document.body.contains(me.el)) return; paintCd(); if (!cross) paintLegend(); }, 1000);
    const slow = setInterval(() => { if (!document.body.contains(me.el)) return; paintNews(); }, 60000);
    HK.destroy = () => { clearInterval(tick); clearInterval(slow); };
    HK.repaint = () => { paintLegend(); paintPanel(); paintCd(); };
    setTimeout(() => { redrawAll(); paintNews(); paintLegend(); paintPanel(); }, 400);
    (window.TkChartExt2 || []).forEach(f => { try { f(me, X, HK); } catch (e) { console.error("TkChartExt2", e); } });
    try { X.applyInd(); } catch (e) { /* sin indicadores */ }
  }
  window.TkChartExt = (window.TkChartExt || []).concat([ext]);
  window.TkG2 = { esc, nf, fmtR, money, ls, I, IC, curOf, newsFor, paper };
})();
