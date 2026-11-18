/* Tickora · Bienvenida: sube tu historial de MT5 y Tickora te conoce en 30 segundos (18-nov-2026).
   Idea de Marcos («que el valor se vea en los 3 primeros minutos»): primero enseñamos, después pedimos esfuerzo.
   Lee el informe de MT5 (HTML o Excel), crea la cuenta, propone un plan con lo que ya haces y enseña lo primero
   que ve. El programa de MT5 (que lo apunta todo solo y activa el candado) se propone después. */
(function () {
  "use strict";
  const A = window.TKAPP, V = window.TK_VIEWS;
  if (!A || !V) return;
  const { S, sb, esc, toast, lsGet, lsSet, evaluate } = A;
  const I = (d, s) => `<svg viewBox="0 0 20 20" width="${s || 16}" height="${s || 16}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const O = () => S.onb || (S.onb = { step: "drop" });

  /* ---------- leer el informe ---------- */
  const DT = /^(\d{4})[.\-\/](\d{2})[.\-\/](\d{2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/;
  const isDT = s => DT.test(String(s || "").trim());
  const num = s => { if (s == null) return null; let x = String(s).replace(/[\s ]/g, ""); if (!x) return null; if (/,\d{1,3}$/.test(x) && !x.includes(".")) x = x.replace(",", "."); else x = x.replace(/,/g, ""); const n = parseFloat(x); return isFinite(n) ? n : null; };
  const parts = s => { const m = String(s).trim().match(DT); return m ? [+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)] : null; };
  /* hora del bróker → hora universal. La mayoría (FTMO, IC Markets, Pepperstone, FundedNext, The5ers…) usa GMT+2 y GMT+3 en el horario de verano de EE. UU. */
  const nthSun = (y, mo, n) => { const d = new Date(Date.UTC(y, mo, 1)); const f = (7 - d.getUTCDay()) % 7; return Date.UTC(y, mo, 1 + f + 7 * (n - 1)); };
  const lastSun = (y, mo) => { const d = new Date(Date.UTC(y, mo + 1, 0)); return Date.UTC(y, mo, d.getUTCDate() - d.getUTCDay()); };
  const OFFS = {
    ny: ["Hora de bróker estándar (GMT+2 / +3)", p => { const t = Date.UTC(...p); return t >= nthSun(p[0], 2, 2) && t < nthSun(p[0], 10, 1) ? 3 : 2; }],
    eu: ["Hora de Europa central (GMT+1 / +2)", p => { const t = Date.UTC(...p); return t >= lastSun(p[0], 2) && t < lastSun(p[0], 9) ? 2 : 1; }],
    utc: ["Hora universal (GMT+0)", () => 0],
    local: ["Ya está en mi hora", null]
  };
  const toUTC = (s, mode) => { const p = parts(s); if (!p) return null; if (mode === "local") return new Date(p[0], p[1], p[2], p[3], p[4], p[5]); return new Date(Date.UTC(...p) - OFFS[mode][1](p) * 3600e3); };

  async function readRows(file) {
    const name = (file.name || "").toLowerCase();
    if (/\.xlsx?$/.test(name)) {
      if (!window.XLSX) await new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"; s.onload = ok; s.onerror = () => ko(new Error("No se pudo cargar el lector de Excel")); document.head.appendChild(s); });
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = []; let head = "";
      wb.SheetNames.forEach(n => { const r = window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: "" }); r.forEach(x => rows.push(x.map(c => String(c == null ? "" : c).trim()))); });
      rows.slice(0, 12).forEach(r => head += " " + r.join(" "));
      return { rows, head };
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    const enc = buf[0] === 0xff && buf[1] === 0xfe ? "utf-16le" : buf[0] === 0xfe && buf[1] === 0xff ? "utf-16be" : (buf[1] === 0 && buf[3] === 0 ? "utf-16le" : "utf-8");
    const text = new TextDecoder(enc).decode(buf);
    const doc = new DOMParser().parseFromString(text, "text/html");
    const rows = [...doc.querySelectorAll("tr")].map(tr => [...tr.children].map(c => c.textContent.replace(/\s+/g, " ").trim()));
    return { rows, head: rows.slice(0, 12).map(r => r.join(" ")).join(" ") };
  }

  function parseReport(rows, head) {
    const info = { number: "", currency: "", server: "", kind: "", company: "", name: "" };
    const m = head.match(/(\d{3,14})\s*\(\s*([A-Z]{3})\s*,\s*([^,()]+?)\s*,\s*(real|demo|contest|concurso)/i);
    if (m) Object.assign(info, { number: m[1], currency: m[2].toUpperCase(), server: m[3].trim(), kind: m[4].toLowerCase() === "real" ? "real" : "demo" });
    rows.slice(0, 15).forEach(r => { const c = r.filter(x => x); if (c.length >= 2) { if (/^(company|compa[ñn][ií]a|empresa|broker|br[oó]ker)\s*:?$/i.test(c[0])) info.company = c[1]; if (/^(name|nombre)\s*:?$/i.test(c[0])) info.name = c[1]; } });
    const pos = [], deals = [];
    rows.forEach(r0 => {
      const r = r0.slice(); while (r.length && r[r.length - 1] === "") r.pop();
      if (r.length < 12 || !isDT(r[0])) return;
      const ty = (r[3] || "").toLowerCase();
      if (isDT(r[8]) && /^(buy|sell|compra|venta)$/.test(ty) && num(r[5]) != null && num(r[9]) != null && num(r[4]) != null) {
        const n = r.length, profit = num(r[n - 1]), swap = num(r[n - 2]) || 0;
        let com = 0; for (let i = 10; i < n - 2; i++) com += num(r[i]) || 0;
        pos.push({ ot: r[0], id: r[1], sym: r[2], side: /^(buy|compra)$/.test(ty) ? "buy" : "sell", vol: num(r[4]), e: num(r[5]), sl: num(r[6]) || null, tp: num(r[7]) || null, ct: r[8], x: num(r[9]), com, swap, profit: profit || 0 });
      } else if (!isDT(r[8]) && /^\d+$/.test(r[1] || "") && r.length >= 13) {
        deals.push({ t: r[0], sym: r[2], type: ty, profit: num(r[11]), bal: num(r[12]) });
      }
    });
    return { info, pos, deals };
  }

  const med = a => { const b = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); if (!b.length) return null; const k = b.length >> 1; return b.length % 2 ? b[k] : (b[k - 1] + b[k]) / 2; };
  const pct = (a, q) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * (b.length - 1) + .5))] : null; };
  const PROP = /ftmo|funded ?next|the ?5 ?ers|fundingpips|funding pips|alpha ?capital|maven|topstep|apex|fxify|blue ?guardian|goat ?funded|instant ?funding|brightfunded|audacity|city ?traders|ftuk|for ?traders|e8 ?(markets|funding)|funding ?traders|lark ?funding|true ?forex|fintokei|hola ?prime|darwinex ?zero|my ?funded|qt ?funded|aqua ?funded|fundedhero|funded ?trading ?plus|ment ?funding/i;

  /* convierte el informe en operaciones de Tickora */
  function build(P, mode) {
    const acc = P.info.number || "";
    const dl = P.deals.map(d => Object.assign({}, d, { at: toUTC(d.t, mode) })).filter(d => d.at && d.bal != null).sort((a, b) => a.at - b.at);
    const dep = dl.find(d => !d.sym && d.profit > 0);
    const balBefore = t => { let b = null; for (const d of dl) { if (d.at < t) b = d.bal; else break; } return b; };
    const vpu = {}; /* valor de 1 unidad de precio por lote, por mercado (para el riesgo sin saber el tamaño del contrato) */
    P.pos.forEach(p => { const mv = Math.abs(p.x - p.e); if (mv > 0 && p.profit) (vpu[p.sym] = vpu[p.sym] || []).push(Math.abs(p.profit) / (mv * p.vol)); });
    Object.keys(vpu).forEach(k => vpu[k] = med(vpu[k]));
    const out = P.pos.map(p => {
      const ot = toUTC(p.ot, mode), ct = toUTC(p.ct, mode); if (!ot || !ct) return null;
      const okSl = p.sl != null && (p.side === "buy" ? p.sl < p.e : p.sl > p.e);
      const rm = okSl && vpu[p.sym] ? vpu[p.sym] * p.vol * Math.abs(p.e - p.sl) : null;
      const bal = balBefore(ot);
      return { p, ot, ct, okSl, rm, bal, r: okSl ? Math.round((p.side === "buy" ? p.x - p.e : p.e - p.x) / Math.abs(p.e - p.sl) * 100) / 100 : null };
    }).filter(Boolean);
    const rmMed = med(out.filter(o => o.rm).map(o => o.rm));
    const lastBal = dl.length ? dl[dl.length - 1].bal : null;
    const fallback = rmMed || (lastBal ? lastBal * .005 : null);
    out.forEach(o => { if (o.r == null && fallback) { o.r = Math.round(o.p.profit / fallback * 100) / 100; o.est = true; } });
    const trades = out.filter(o => o.r != null).map(o => ({
      id: (acc ? "mt5:" + acc.slice(0, 20) : "imp") + ":" + String(o.p.id).slice(0, 30), source: "manual", account: acc || null, broker: (P.info.company || "").slice(0, 80) || null,
      symbol: String(o.p.sym).toUpperCase().slice(0, 32), side: o.p.side, volume: o.p.vol, open_time: o.ot.toISOString(), close_time: o.ct.toISOString(),
      open_price: o.p.e, close_price: o.p.x, sl: o.p.sl, tp: o.p.tp, sl_moved: false, profit: o.p.profit, commission: o.p.com, swap: o.p.swap,
      currency: P.info.currency || null, balance_at_open: o.bal, risk_money: o.rm ? Math.round(o.rm * 100) / 100 : null,
      risk_pct: o.rm && o.bal ? Math.round(o.rm / o.bal * 1e5) / 1e3 : null, r: o.r, status: "closed",
      review: Object.assign({ imp: "informe" }, o.est ? { rEst: 1 } : {})
    }));
    return { trades, lastBal, deposit: dep ? dep.profit : null, nEst: out.filter(o => o.est).length, nNoR: out.filter(o => o.r == null).length };
  }

  /* plan propuesto con lo que ya haces */
  function proposePlan(T) {
    const rp = med(T.map(t => t.risk_pct)), byDay = {};
    T.forEach(t => { const k = new Date(t.open_time).toDateString(); byDay[k] = (byDay[k] || 0) + 1; });
    const mins = T.map(t => { const d = new Date(t.open_time); return d.getHours() * 60 + d.getMinutes(); });
    let s = pct(mins, .1), e = pct(mins, .9);
    if (s != null) { s = Math.floor(s / 30) * 30; e = Math.ceil((e + 1) / 30) * 30; if (e - s < 60) e = s + 60; e = Math.min(e, 23 * 60 + 30); }
    const hh = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
    return { riskPct: rp ? Math.min(3, Math.max(.25, Math.round(rp * 4) / 4)) : .5, maxTrades: Math.min(6, Math.max(1, Math.ceil(pct(Object.values(byDay), .8) || 3))), dayLimitR: 2, start: s != null ? hh(s) : "15:30", end: s != null ? hh(e) : "17:30" };
  }

  /* lo primero que ve Tickora (solo lo que tiene datos suficientes) */
  function insights(T, cur) {
    const out = [], fm = v => fmtM(v, cur);
    const withSl = T.filter(t => t.sl != null).length;
    out.push({ k: "Pones el stop", v: Math.round(withSl / T.length * 100) + " %", t: `de tus operaciones llevaban stop (${withSl} de ${T.length})` });
    const byH = {}; T.forEach(t => { const h = new Date(t.open_time).getHours(); (byH[h] = byH[h] || []).push(t.r); });
    const hs = Object.entries(byH).filter(([, a]) => a.length >= 3).map(([h, a]) => [+h, a.reduce((x, y) => x + y, 0) / a.length, a.length]);
    if (hs.length >= 2) {
      hs.sort((a, b) => b[1] - a[1]); const b = hs[0], rest = T.filter(t => new Date(t.open_time).getHours() !== b[0]), ra = rest.reduce((x, t) => x + t.r, 0) / Math.max(1, rest.length);
      out.push({ k: "Tu mejor hora", v: `${String(b[0]).padStart(2, "0")}:00–${String(b[0] + 1).padStart(2, "0")}:00`, t: `${b[1] >= 0 ? "+" : ""}${b[1].toFixed(2).replace(".", ",")} R de media (${b[2]} operaciones); el resto, ${ra >= 0 ? "+" : ""}${ra.toFixed(2).replace(".", ",")} R` });
    }
    /* después de dos pérdidas seguidas */
    const srt = T.slice().sort((a, b) => a.open_time < b.open_time ? -1 : 1), after = [];
    for (let i = 2; i < srt.length; i++) if (srt[i - 1].r < 0 && srt[i - 2].r < 0 && new Date(srt[i].open_time) - new Date(srt[i - 1].close_time) < 864e5) after.push(srt[i]);
    if (after.length >= 3) {
      const rpA = med(after.map(t => t.risk_pct)), rpAll = med(T.map(t => t.risk_pct)), winA = after.filter(t => t.r > 0).length / after.length, win = T.filter(t => t.r > 0).length / T.length;
      if (rpA && rpAll && rpA > rpAll * 1.15) out.push({ q: 1, k: "Lo primero que he visto", v: `«Después de dos pérdidas seguidas, tu siguiente operación arriesga de media un ${Math.round((rpA / rpAll - 1) * 100)} % más.»`, t: `Pasó ${after.length} veces · el candado puede frenarte justo ahí` });
      else if (winA < win - .1) out.push({ q: 1, k: "Lo primero que he visto", v: `«Después de dos pérdidas seguidas aciertas ${Math.round(winA * 10)} de cada 10; normalmente, ${Math.round(win * 10)}.»`, t: `Pasó ${after.length} veces · una pausa ahí te ahorraría dinero` });
    }
    const bad = T.filter(t => !evaluate(t).good), cost = bad.reduce((x, t) => x + t.r, 0), costM = bad.reduce((x, t) => x + (t.profit || 0) + (t.commission || 0) + (t.swap || 0), 0);
    if (bad.length >= 3) out.push({ k: "Fuera de tu forma de operar", v: `${cost >= 0 ? "+" : ""}${cost.toFixed(1).replace(".", ",")} R`, t: `${bad.length} operaciones sin stop, fuera de tu horario o de más (${fm(costM)})` });
    const tot = T.reduce((x, t) => x + (t.profit || 0) + (t.commission || 0) + (t.swap || 0), 0), totR = T.reduce((x, t) => x + t.r, 0);
    out.push({ k: "Resultado del periodo", v: fm(tot), t: `${totR >= 0 ? "+" : ""}${totR.toFixed(1).replace(".", ",")} R en ${T.length} operaciones` });
    return out;
  }
  const fmtM = (v, cur) => { try { return new Intl.NumberFormat("es-ES", { style: "currency", currency: cur || "USD", maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 }).format(v); } catch (e) { return Math.round(v) + " " + (cur || ""); } };

  /* ---------- guardar ---------- */
  async function doImport() {
    const o = O(), P = o.P, B = build(P, o.mode), T = B.trades, info = P.info;
    if (!T.length) { toast("No hay operaciones que importar"); return; }
    o.busy = true; paint();
    for (let i = 0; i < T.length; i += 200) {
      const recs = T.slice(i, i + 200).map(t => Object.assign({ user_id: S.user.id }, t));
      const { error } = await sb.from("trades").upsert(recs, { onConflict: "user_id,id", ignoreDuplicates: true });
      if (error) { o.busy = false; paint(); toast("No se pudo importar: " + error.message); return; }
    }
    const have = new Set((S.allTrades || []).map(t => t.id));
    S.allTrades = T.filter(t => !have.has(t.id)).map(t => Object.assign({ user_id: S.user.id }, t)).concat(S.allTrades || []).sort((a, b) => a.open_time < b.open_time ? 1 : -1);
    /* la cuenta */
    let acct = info.number && (S.accts || []).find(a => String(a.number) === info.number), created = false;
    const plan = proposePlan(T), prop = PROP.test(info.company + " " + info.server);
    if (info.number && !acct) {
      const type = prop ? "fondeo" : info.kind === "demo" ? "demo" : "propia";
      const d = Object.assign({ type, status: "activa", broker: info.company || info.server, number: info.number, currency: info.currency || "USD", size: String(Math.round(B.deposit || B.lastBal || 0) || ""), risk: String(plan.riskPct), note: "Creada al subir tu historial de MT5", created: Date.now() },
        type === "fondeo" ? { target: "10", targetU: "%", dailyDD: "5", dailyU: "%", maxDD: "10", maxU: "%", minDays: "4", goals: [] } : { targetU: "R", dailyDD: "2", dailyU: "R", maxU: "%", maxTradesDay: String(plan.maxTrades), goals: [] });
      const id = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const { error } = await sb.from("docs").upsert({ user_id: S.user.id, col: "acct", id, data: d, updated_at: new Date().toISOString() });
      if (!error) { acct = Object.assign({ id }, d); S.accts = (S.accts || []).concat([acct]); created = true; }
    }
    /* el plan: solo si aún no tienes uno (los cambios de un plan que ya existe valen desde mañana y los haces tú) */
    let planSet = false;
    if (!(S.planDoc && S.planDoc.current) && typeof A.savePlan === "function") planSet = await A.savePlan(plan, true);
    try { A.applyAcct(); } catch (e) {}
    lsSet("tk-onb-done", 1); sb.auth.updateUser({ data: { onb: 1 } }).catch(() => {});
    const mine = S.allTrades.filter(t => (info.number ? t.account === info.number : true) && t.status === "closed" && t.r != null && (t.review || {}).imp);
    o.res = { info, n: T.length, created, planSet, plan, acct, B, from: T[T.length - 1] && T.reduce((m, t) => t.open_time < m ? t.open_time : m, T[0].open_time), cards: insights(mine.length ? mine : T, info.currency), prop };
    o.busy = false; o.step = "done"; S.lastView = null; A.render();
  }

  async function onFile(file) {
    const o = O(); if (!file) return;
    if (file.size > 25e6) { o.err = "El archivo es demasiado grande (máximo 25 MB)."; paint(); return; }
    o.err = ""; o.busy = true; paint();
    try {
      const { rows, head } = await readRows(file); const P = parseReport(rows, head);
      if (!P.pos.length) { o.busy = false; o.err = "No encuentro operaciones en este archivo. Tiene que ser el informe del Historial de MT5 (HTML o Excel), con «Todo el historial»."; paint(); return; }
      o.P = P; o.file = file.name; o.mode = "ny"; o.step = "preview";
    } catch (e) { o.err = "No he podido leer el archivo: " + (e.message || e); }
    o.busy = false; paint();
  }

  /* ---------- pantallas ---------- */
  const howTo = `<ol class="ob-how"><li><b>Abre la pestaña Historial</b><span>Abajo, en la «Caja de herramientas» (Ctrl + T si no la ves).</span></li><li><b>Clic derecho › «Todo el historial»</b><span>Así entran todas tus operaciones, no solo las de hoy.</span></li><li><b>Clic derecho › Informe › HTML</b><span>O «Open XML» (Excel). Guárdalo y arrástralo aquí.</span></li></ol>`;
  function vDrop() {
    const o = O();
    return `<div class="ob-wz"><div><div class="ob-eye">Empecemos · 30 segundos</div><h1 class="ob-h">Enséñame <em>cómo operas.</em></h1>
      <p class="ob-lead">Sube el historial de tu MetaTrader 5 y en unos segundos verás tus números de verdad: cuánto arriesgas, tu mejor hora y lo que te cuestan tus errores.</p>
      <label class="ob-drop${o.busy ? " busy" : ""}" data-obdrop><input type="file" accept=".html,.htm,.xlsx,.xls" data-obfile hidden>
        <span class="ob-di">${I('<path d="M10 13V3M6 7l4-4 4 4"/><path d="M3 13v2.5A1.5 1.5 0 004.5 17h11a1.5 1.5 0 001.5-1.5V13"/>', 26)}</span>
        <b>${o.busy ? "Leyendo tu historial…" : "Arrastra aquí tu historial de MT5"}</b><small>${o.busy ? "Un momento" : "o toca para elegir el archivo · HTML o Excel"}</small></label>
      ${o.err ? `<div class="ob-err" role="alert">${esc(o.err)}</div>` : ""}
      <div class="ob-priv">${I('<rect x="4" y="9" width="12" height="8" rx="2"/><path d="M7 9V6a3 3 0 016 0v3"/>', 15)}<span>Tickora solo guarda tus operaciones. No necesita ninguna contraseña y no puede tocar tu cuenta.</span></div>
      <div class="ob-alt"><small>¿Otra forma?</small><a class="chip" href="#ajustes" data-obskip>Conectar MT5 para que se apunten solas</a><button type="button" class="chip" data-obman>Apuntar a mano</button><button type="button" class="chip" data-obskip>Entrar sin datos</button></div></div>
      <aside class="ob-pv"><div class="ob-pvh"><b>Cómo sacarlo de MT5</b><span class="ob-tag">2 clics</span></div>${howTo}
        <div class="ob-mini" aria-hidden="true"><div class="ob-mtb"><span>Operaciones</span><span>Exposición</span><span class="on">Historial</span><span>Noticias</span></div><div class="ob-mtr"></div><div class="ob-mtr"></div><div class="ob-mtr"></div><div class="ob-menu"><span>Todo el historial</span><span class="sep"></span><span class="on">Informe ›</span><em>HTML · Open XML</em></div></div>
        <div class="ob-note">Desde el móvil, MT5 no saca este informe: hazlo una vez desde el ordenador.</div></aside></div>`;
  }
  function vPreview() {
    const o = O(), P = o.P, info = P.info, B = build(P, o.mode), T = B.trades;
    const first = T.reduce((m, t) => !m || t.open_time < m ? t.open_time : m, null), last = T.reduce((m, t) => !m || t.open_time > m ? t.open_time : m, null);
    const fd = s => new Date(s).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
    const ex = T.slice().sort((a, b) => a.open_time < b.open_time ? 1 : -1)[0];
    const prop = PROP.test(info.company + " " + info.server);
    return `<div class="ob-wz"><div><div class="ob-eye">Lo he leído · ${esc(o.file || "")}</div><h1 class="ob-h">He encontrado <em>${T.length} operaciones.</em></h1>
      <div class="ob-found">
        ${info.number ? `<div><i>✓</i>Cuenta ${esc(info.number)} · ${esc(info.company || info.server)}${info.currency ? " · " + esc(info.currency) : ""}${prop ? " · reto de fondeo" : info.kind === "demo" ? " · demo" : ""}</div>` : ""}
        ${first ? `<div><i>✓</i>Del ${fd(first)} al ${fd(last)}</div>` : ""}
        ${B.lastBal ? `<div><i>✓</i>Saldo ${fmtM(B.lastBal, info.currency)}</div>` : ""}
        ${B.nEst ? `<div class="w"><i>!</i>${B.nEst} sin stop o con el stop movido a ganancias: su R es aproximada</div>` : ""}
      </div>
      <div class="ob-q">¿En qué hora está tu MT5?</div>
      <div class="ob-chips">${Object.entries(OFFS).map(([k, v]) => `<button type="button" class="chip${o.mode === k ? " on" : ""}" data-obmode="${k}">${v[0]}</button>`).join("")}</div>
      ${ex ? `<div class="ob-hint">Tu última operación (${esc(ex.symbol)}) quedaría a las <b>${new Date(ex.open_time).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</b> de tu hora. Si no te cuadra, cambia la opción.</div>` : ""}
      <div class="ob-foot"><button type="button" class="btn ob-btn" data-obgo ${o.busy ? "disabled" : ""}>${o.busy ? "Importando…" : "Importar y ver mis números"}</button><button type="button" class="btn2" data-obback>Elegir otro archivo</button></div></div>
      <aside class="ob-pv"><div class="ob-pvh"><b>Qué hará Tickora</b></div>
        <div class="ob-row"><span>Guardar tus operaciones</span><b>${T.length}</b></div>
        <div class="ob-row"><span>Crear tu cuenta</span><b>${info.number && !(S.accts || []).some(a => String(a.number) === info.number) ? "Sí" : "Ya la tienes"}</b></div>
        <div class="ob-row"><span>Proponerte un plan</span><b>${S.planDoc && S.planDoc.current ? "Ya tienes uno" : "Con lo que ya haces"}</b></div>
        <div class="ob-note">Si más adelante conectas el programa de MT5, no se duplicará nada: reconoce estas operaciones.</div></aside></div>`;
  }
  function vDone() {
    const o = O(), R = o.res, cur = R.info.currency;
    const rp = R.plan.riskPct, bal = R.B.lastBal, oneR = bal ? bal * rp / 100 : null;
    const syms = {}; (S.allTrades || []).filter(t => (t.review || {}).imp).forEach(t => syms[t.symbol] = (syms[t.symbol] || 0) + 1);
    const top = Object.entries(syms).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]);
    const q = R.cards.find(c => c.q), rest = R.cards.filter(c => !c.q);
    return `<div class="ob-wz"><div><div class="ob-eye">Listo</div><h1 class="ob-h">Ya te conozco <em>un poco.</em></h1>
      <div class="ob-found">
        ${R.info.number ? `<div><i>✓</i>${R.prop ? "Reto de fondeo" : R.acct && R.acct.type === "demo" ? "Cuenta demo" : "Cuenta"} ${esc(R.info.company || "")} ${esc(R.info.number)}${R.created ? " · creada" : ""}</div>` : ""}
        <div><i>✓</i>${R.n} operaciones guardadas</div>
        ${oneR ? `<div><i>✓</i>Sueles arriesgar ${String(rp).replace(".", ",")} % → tu 1 R = ${fmtM(oneR, cur)}</div>` : ""}
        ${top.length ? `<div><i>✓</i>Operas sobre todo ${top.map(esc).join(" y ")}, de ${R.plan.start} a ${R.plan.end}</div>` : ""}
      </div>
      <p class="ob-lead">${R.planSet ? "Te he dejado un plan con lo que ya haces: máximo " + R.plan.maxTrades + " operaciones al día, límite de 2 R y tu horario. Cámbialo cuando quieras." : "Tu plan sigue como lo tenías."}</p>
      <div class="ob-foot"><a class="btn ob-btn" href="#inicio" data-obend>Ver mi Tickora →</a><a class="btn2" href="#plan" data-obend>Revisar mi plan</a></div>
      <div class="ob-next">${I('<path d="M4 10h12M12 6l4 4-4 4"/>', 15)}<span><b>Siguiente paso, cuando quieras:</b> conecta el programa de MT5 para que tus operaciones se apunten solas y para activar tu candado. <a href="#ajustes" data-obend>Ver cómo (2 min)</a></span></div></div>
      <aside class="ob-ins">${rest.slice(0, 2).map(c => `<div class="ob-in"><div class="k">${esc(c.k)}</div><div class="v">${esc(c.v)}</div><div class="t">${esc(c.t)}</div></div>`).join("")}
        ${q ? `<div class="ob-in q wide"><div class="k">${esc(q.k)}</div><div class="v">${esc(q.v)}</div><div class="t">${esc(q.t)}</div></div>` : ""}
        ${rest.slice(2, 4).map(c => `<div class="ob-in"><div class="k">${esc(c.k)}</div><div class="v">${esc(c.v)}</div><div class="t">${esc(c.t)}</div></div>`).join("")}</aside></div>`;
  }
  const view = () => `<div class="ob" id="obRoot">${O().step === "done" && O().res ? vDone() : O().step === "preview" && O().P ? vPreview() : vDrop()}</div>`;
  function paint() { const r = document.getElementById("obRoot"); if (r) { r.outerHTML = view(); bind(); } }
  function finish() { lsSet("tk-onb-done", 1); if (!(S.user.user_metadata || {}).onb) { S.user.user_metadata = Object.assign({}, S.user.user_metadata, { onb: 1 }); sb.auth.updateUser({ data: { onb: 1 } }).catch(() => {}); } }
  function bind() {
    const r = document.getElementById("obRoot"); if (!r) return;
    const inp = r.querySelector("[data-obfile]"), dz = r.querySelector("[data-obdrop]");
    if (inp) inp.onchange = () => onFile(inp.files[0]);
    if (dz) { ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("over"); })); ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("over"); })); dz.addEventListener("drop", e => onFile(e.dataTransfer.files[0])); }
    r.querySelectorAll("[data-obmode]").forEach(b => b.onclick = () => { O().mode = b.dataset.obmode; paint(); });
    const go = r.querySelector("[data-obgo]"); if (go) go.onclick = doImport;
    const bk = r.querySelector("[data-obback]"); if (bk) bk.onclick = () => { S.onb = { step: "drop" }; paint(); };
    r.querySelectorAll("[data-obskip]").forEach(b => b.addEventListener("click", e => { finish(); if (b.tagName === "BUTTON") { location.hash = "#inicio"; } }));
    r.querySelectorAll("[data-obend]").forEach(b => b.addEventListener("click", () => { finish(); S.onb = null; }));
    const man = r.querySelector("[data-obman]"); if (man) man.onclick = () => { finish(); location.hash = "#inicio"; setTimeout(() => window.tkAddTrade && window.tkAddTrade(), 300); };
  }
  V.bienvenida = { view, bind };
  window.tkImportReport = f => { S.onb = { step: "drop" }; location.hash = "#bienvenida"; setTimeout(() => onFile(f), 200); };
  window.TK_X10 = { parseReport, build, readRows, proposePlan, insights };

  /* la primera vez (sin operaciones ni cuentas) Inicio lleva aquí */
  const fresh = () => S.loaded && S.user && !(S.allTrades || []).length && !(S.accts || []).length && !lsGet("tk-onb-done", 0) && !((S.user || {}).user_metadata || {}).onb;
  const check = () => { if (fresh() && (location.hash === "" || location.hash === "#inicio")) location.replace("#bienvenida"); };
  const V0 = V.inicio;
  if (V0) V.inicio = Object.assign({}, V0, { view(r) { if (fresh()) setTimeout(check, 0); return V0.view(r); } });
  setTimeout(check, 0);
})();
