/* Tickora · gráfico, parte 3 (como en las plataformas profesionales):
   - barra de abajo: rangos 1D … Todo, ir a una fecha (Alt + G), hora con su zona horaria, escala %, log y auto
   - menú del botón derecho: en el gráfico, en la escala de precios y en cada dibujo
   - comparar con otros mercados (hasta 5, en % desde la primera vela que se ve)
   - ventana de datos: los valores de la vela bajo el cursor
   Se engancha a cada gráfico con window.TkChartExt2 (lo llama grafico2.js). */
(function () {
  "use strict";
  const KC = window.klinecharts;
  if (!KC || !window.TkChart) return;
  const TK = window.TkChart, U = TK.U;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = (v, d) => (v == null || !isFinite(v)) ? "—" : Number(v).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
  const big = v => (v == null || !isFinite(v)) ? "—" : Math.abs(v) >= 1e5 ? Number(v).toLocaleString("es-ES", { notation: "compact", maximumFractionDigits: 2 }) : Number(v).toLocaleString("es-ES", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* lleno */ } }
  };
  const mac = /Mac|iPhone|iPad/.test(navigator.platform), ALT = mac ? "⌥" : "Alt", CMD = mac ? "⌘" : "Ctrl";
  const SV = (d, s) => `<svg width="${s || 16}" height="${s || 16}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  /* iconos propios de Tickora (trazo fino, esquinas redondeadas) */
  const IC3 = {
    cal: '<rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4M7 12.5h2.5"/>',
    table: '<rect x="3" y="3.5" width="14" height="13" rx="2"/><path d="M3 8h14M3 12.3h14M8.5 8v8.5"/>',
    cmp: '<path d="M2.5 15l4.2-4.6 3 2.6 4.6-6.2 3.2 3.2"/><path d="M2.5 9.5l4.2 2.2 3-3.4 4.6 1.6 3.2-2.4" stroke-dasharray="1.6 2.2"/>',
    plusc: '<circle cx="10" cy="10" r="7.3"/><path d="M10 6.6v6.8M6.6 10h6.8"/>',
    copy: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2"/>',
    paste: '<rect x="4" y="4" width="12" height="13.5" rx="2"/><path d="M7.5 4V2.5h5V4M7.5 9h5M7.5 12.5h5"/>',
    bell: '<path d="M5 13.5V9a5 5 0 0110 0v4.5l1.5 2h-13z"/><path d="M8.5 17.5a1.8 1.8 0 003 0"/>',
    hline: '<path d="M2.5 10h15"/><circle cx="10" cy="10" r="1.7"/>',
    vline: '<path d="M10 2.5v15"/><circle cx="10" cy="10" r="1.7"/>',
    reset: '<path d="M4.2 10.5a5.8 5.8 0 1 0 1.7-4.6"/><path d="M4 3.4v3.4h3.4"/>',
    front: '<rect x="3" y="3" width="9" height="9" rx="1.6" stroke-dasharray="2 2"/><rect x="8" y="8" width="9" height="9" rx="1.6" style="fill:var(--card)"/><rect x="8" y="8" width="9" height="9" rx="1.6" fill="currentColor" fill-opacity=".28"/>',
    back: '<rect x="8" y="8" width="9" height="9" rx="1.6" fill="currentColor" fill-opacity=".28"/><rect x="3" y="3" width="9" height="9" rx="1.6" stroke-dasharray="2 2" style="fill:var(--card)"/>',
    scale: '<path d="M14.5 3v14M14.5 5H17M14.5 10H17M14.5 15H17"/><path d="M3 14.5l3.4-4.6 2.8 2.3 2.8-4.2"/>',
    brush: '<path d="M12.5 3.5l4 4-7 7-4-4z"/><path d="M5.5 10.5l-2 6 6-2"/>',
    x: '<path d="M5 5l10 10M15 5L5 15"/>',
    dot: '<circle cx="10" cy="10" r="3.2" fill="currentColor" stroke="none"/>'
  };
  const ic = (n, s) => IC3[n] ? SV(IC3[n], s || 16) : U.icon(n, s || 16);
  const CMP_COL = () => U.DARK ? ["#b394ff", "#4fd1db", "#f07cc0", "#e9c948", "#aab4c8"] : ["#7b4fd6", "#0b8a96", "#b0287a", "#8c6f00", "#5a6478"];
  const RANGES = [["1D", "1m", 1, "Último día, en velas de 1 minuto"], ["5D", "5m", 5, "Últimos 5 días, en velas de 5 minutos"], ["1M", "30m", 30, "Último mes, en velas de 30 minutos"],
    ["3M", "1h", 91, "Últimos 3 meses, en velas de 1 hora"], ["6M", "2h", 182, "Últimos 6 meses, en velas de 2 horas"], ["YTD", "1d", "ytd", "Desde el 1 de enero, en velas diarias"],
    ["1A", "1d", 365, "Último año, en velas diarias"], ["5A", "1w", 1826, "Últimos 5 años, en velas semanales"], ["Todo", "1M", "all", "Todo el historial, en velas mensuales"]];

  /* ---------- horas y zonas horarias ---------- */
  const devTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } };
  const tzOf = () => { const z = (U.CFG || {}).tz; return !z || z === "auto" ? devTz() : z; };
  const FMT = {};
  function fmt(tz, o) { const k = tz + JSON.stringify(o); try { return FMT[k] || (FMT[k] = new Intl.DateTimeFormat("es-ES", Object.assign({ timeZone: tz }, o))); } catch (e) { return FMT[k] = new Intl.DateTimeFormat("es-ES", o); } }
  function parts(ms, tz) {
    const p = {}; try { new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; }); } catch (e) { const d = new Date(ms); return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() }; }
    return { y: +p.year, mo: +p.month, d: +p.day, h: (+p.hour) % 24, mi: +p.minute, s: +p.second };
  }
  const tzOff = (ms, tz) => { const p = parts(ms, tz); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };
  function localMs(y, mo, d, h, mi, tz) { const g = Date.UTC(y, mo - 1, d, h || 0, mi || 0); let t = g - tzOff(g, tz); t = g - tzOff(t, tz); return t; }
  const p2 = n => String(n).padStart(2, "0");
  const dateStr = (ms, tz) => { const p = parts(ms, tz); return `${p.y}-${p2(p.mo)}-${p2(p.d)}`; };
  const timeStr = (ms, tz) => { const p = parts(ms, tz); return `${p2(p.h)}:${p2(p.mi)}`; };
  function offLabel(tz) {
    try { const x = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date()).find(z => z.type === "timeZoneName"); if (x) return x.value.replace("GMT", "UTC"); } catch (e) { /* navegador antiguo */ }
    const m = Math.round(tzOff(Date.now(), tz) / 6e4); if (!m) return "UTC"; const a = Math.abs(m); return "UTC" + (m > 0 ? "+" : "−") + Math.floor(a / 60) + (a % 60 ? ":" + p2(a % 60) : "");
  }
  const tzName = tz => { const f = (U.TZS || []).find(x => x[0] === tz); return f ? f[1] : tz.split("/").pop().replace(/_/g, " "); };
  const lowerBound = (L, ts) => { let lo = 0, hi = L.length; while (lo < hi) { const m = (lo + hi) >> 1; if (L[m].timestamp < ts) lo = m + 1; else hi = m; } return lo; };
  const upperBound = (L, ts) => { let lo = 0, hi = L.length; while (lo < hi) { const m = (lo + hi) >> 1; if (L[m].timestamp <= ts) lo = m + 1; else hi = m; } return lo; };

  /* ---------- un solo menú flotante para todos los gráficos ---------- */
  const MENU = (() => {
    let el = null, items = [], prev = null;
    function ensure() {
      if (el && document.body.contains(el)) return el;
      el = document.createElement("div"); el.className = "gx-pop g3-cm"; el.hidden = true; el.tabIndex = -1;
      el.setAttribute("role", "menu");
      el.addEventListener("click", e => {
        const b = e.target.closest("[data-mi]"); if (!b || b.disabled) return;
        const it = items[+b.dataset.mi]; close(true);
        if (it && it.f) { try { it.f(); } catch (x) { console.error("menú", x); } }
      });
      el.addEventListener("contextmenu", e => e.preventDefault());
      document.body.appendChild(el); return el;
    }
    const btns = () => Array.from(el.querySelectorAll("[data-mi]:not(:disabled)"));
    function key(e) {
      if (!el || el.hidden) return;
      const k = e.key, list = btns(), i = list.indexOf(document.activeElement);
      if (k === "Escape" || k === "Tab") { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Home" || k === "End") {
        e.preventDefault(); e.stopPropagation(); if (!list.length) return;
        const n = k === "Home" ? 0 : k === "End" ? list.length - 1 : k === "ArrowDown" ? (i + 1) % list.length : (i <= 0 ? list.length - 1 : i - 1);
        list[n].focus(); return;
      }
      if ((k === "Enter" || k === " ") && i >= 0) { e.preventDefault(); e.stopPropagation(); list[i].click(); return; }
      if (k.length === 1 && !e.ctrlKey && !e.metaKey) { e.stopPropagation(); close(); }
    }
    function outside(e) { if (el && !el.contains(e.target)) close(true); }
    function wheel(e) { if (el && !el.contains(e.target)) close(true); }
    function render(list) {
      items = []; let html = "", lastSep = true;
      list.filter(Boolean).forEach((it, n, arr) => {
        if (it === "-") { if (!lastSep && arr.slice(n + 1).some(z => z && z !== "-" && !z.head)) { html += '<div class="g3-sep" role="separator"></div>'; lastSep = true; } return; }
        if (it.head) { html += `<div class="gx-mh">${esc(it.head)}</div>`; lastSep = true; return; }
        const k = items.push(it) - 1, chk = it.on != null || it.radio != null, on = !!(it.on || it.radio);
        const role = it.radio != null ? "menuitemradio" : it.on != null ? "menuitemcheckbox" : "menuitem";
        const lead = chk ? (on ? (it.radio != null ? ic("dot", 16) : U.icon("check", 16)) : (it.ic ? ic(it.ic, 16) : "")) : (it.ic ? ic(it.ic, 16) : "");
        html += `<button type="button" class="gx-mi g3-mi" role="${role}" data-mi="${k}"${chk ? ` aria-checked="${on}"` : ""}${it.dis ? " disabled" : ""}${it.title ? ` title="${esc(it.title)}"` : ""}><span class="g3-mic">${lead}</span><span class="g3-l">${esc(it.t)}</span>${it.k ? `<small>${esc(it.k)}</small>` : ""}</button>`;
        lastSep = false;
      });
      return html.replace(/(<div class="g3-sep" role="separator"><\/div>)+$/, "");
    }
    function open(list, cx, cy, o) {
      o = o || {}; ensure(); close();
      el.innerHTML = render(list); if (!items.length) return;
      el.setAttribute("aria-label", o.label || "Menú");
      el.style.left = "0px"; el.style.top = "0px"; el.style.minWidth = o.minW ? o.minW + "px" : ""; el.hidden = false;
      const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      let x = o.alignRight ? cx - w : cx, y = o.above ? cy - h - 6 : cy;
      if (x + w > vw - 8) x = o.alignRight ? vw - w - 8 : cx - w;
      x = Math.max(8, Math.min(x, vw - w - 8));
      if (y + h > vh - 8) y = Math.max(8, cy - h);
      if (y < 8) y = 8;
      el.style.left = Math.round(x) + "px"; el.style.top = Math.round(y) + "px";
      prev = document.activeElement;
      try { el.focus({ preventScroll: true }); } catch (e) { /* nada */ }
      if (o.focusFirst) { const b = btns()[0]; b && b.focus(); }
      document.addEventListener("pointerdown", outside, true);
      document.addEventListener("keydown", key, true);
      document.addEventListener("wheel", wheel, { capture: true, passive: true });
      window.addEventListener("blur", onBlur); window.addEventListener("resize", onBlur);
    }
    const onBlur = () => close(true);
    function close(keepFocus) {
      if (!el || el.hidden) return;
      el.hidden = true; el.innerHTML = ""; items = [];
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("wheel", wheel, { capture: true });
      window.removeEventListener("blur", onBlur); window.removeEventListener("resize", onBlur);
      if (!keepFocus && prev && prev.focus && document.body.contains(prev)) { try { prev.focus({ preventScroll: true }); } catch (e) { /* nada */ } }
      prev = null;
    }
    return { open, close, get isOpen() { return !!el && !el.hidden; } };
  })();

  /* ---------- la línea de cada mercado comparado (un indicador sobre las velas) ---------- */
  const CALC = {};
  KC.registerIndicator({
    name: "TKCMP", shortName: "Comparar", series: "price", precision: 10, calcParams: [0, 0], figures: [],
    calc: (list, ind) => { const f = CALC[(ind.extendData || {}).key]; return f ? f(list, +ind.calcParams[0] || 0) : list.map(() => ({})); }
  });

  const PAINT = new Set(); // barras de abajo abiertas (para repintar todas a la vez)
  const repaintAll = () => PAINT.forEach(f => { try { f(); } catch (e) { /* gráfico cerrado */ } });

  function ext(me, X, HK) {
    const { st, ch, $ } = X, opts = X.opts || {};
    const gx = $(".gx"), body = $(".gx-body"), canvas = $(".gx-canvas"), box = $(".gx-chart");
    if (!gx || !body || !canvas || !box) return;
    let alive = true;
    const say = (t, ms) => { X.hint(t); clearTimeout(say.t); say.t = setTimeout(() => { if (alive) X.hint(""); }, ms || 3200); };
    const CFG = U.CFG;
    const digitsOf = s => TK.digits(s);

    /* ===== esperar a que lleguen las velas nuevas ===== */
    let pend = null, pendT = 0;
    function afterLoad(fn) { pend = fn; clearTimeout(pendT); if (fn) pendT = setTimeout(() => { pend = null; }, 30000); }
    { const prevOD = HK.onData; HK.onData = () => { prevOD && prevOD(); if (pend) { const f = pend; pend = null; setTimeout(() => { if (alive) try { f(); } catch (e) { console.error(e); } }, 60); } }; }

    /* ===== escala: normal, log, %, auto ===== */
    const C = { list: [], ver: 0, from: 0, raw: [], base: [], pct: false };
    HK.scaleName = () => C.pct && C.list.length && !X.R.on ? "percentage" : null;
    const effScale = () => (HK.scaleName && HK.scaleName()) || CFG.scale || "normal";
    function yAx() { try { const p = ch.getDrawPaneById("candle_pane"); return p.getYAxisComponentById ? p.getYAxisComponentById(p.getDefaultYAxisId()) : p.getYAxisComponents()[0]; } catch (e) { return null; } }
    function autoOn() { const a = yAx(); return !a || !a.getAutoCalcTickFlag || !!a.getAutoCalcTickFlag(); }
    const scaleAll = () => { TK.all.forEach(x => { try { x.X && x.X.applyScale(); } catch (e) { /* nada */ } }); repaintAll(); };
    function setScale(name) { C.pct = false; CFG.scale = name; X.cfgSave(); scaleAll(); }
    function toggleScale(name) { setScale(effScale() === name ? "normal" : name); say(effScale() === "logarithm" ? "Escala logarítmica" : effScale() === "percentage" ? "Escala en porcentaje desde la primera vela que se ve" : "Escala normal", 1800); }
    function setAuto(on) { if (on) X.applyScale(); else { const a = yAx(); if (a && a.setAutoCalcTickFlag) a.setAutoCalcTickFlag(false); } paintBot(); }
    function invert() { CFG.inv = !CFG.inv; X.cfgSave(); scaleAll(); say(CFG.inv ? "Escala invertida" : "Escala normal (sin invertir)", 1600); }
    /* se puede alejar más (como en las plataformas profesionales): así «1D» cabe entero en velas de 1 minuto */
    try { ch.setLayoutOptions({ barSpaceLimit: { min: 0.5, max: 50 } }); } catch (e) { /* versión sin la opción */ }
    let defBS = 8; try { const b = ch.getBarSpace(); defBS = (b && (b.bar || b)) || 8; } catch (e) { /* nada */ }
    function resetView(scroll) {
      try { ch.setBarSpace(defBS); } catch (e) { /* nada */ }
      X.applyScale(); X.applyRight && X.applyRight();
      if (scroll) { try { ch.scrollToRealTime(200); } catch (e) { /* nada */ } }
      paintBot();
    }

    /* ===== encajar un rango de fechas en la pantalla ===== */
    function fitRange(start, end) {
      const L = ch.getDataList(); if (!L.length) return;
      let i0 = 0, i1 = L.length - 1;
      if (start != null) i0 = Math.min(i1, lowerBound(L, start));
      if (end != null) i1 = Math.max(i0, upperBound(L, end) - 1);
      const n = i1 - i0 + 1, mb = ch.getSize("candle_pane", "main"), w = (mb && mb.width) || box.clientWidth || 600;
      const extra = end != null ? 0.5 : Math.max(0, +CFG.mRight || 0) + 0.5;
      const bs = Math.max(0.5, Math.min(50, w / (n + extra)));
      try { ch.setBarSpace(bs); } catch (e) { /* nada */ }
      X.applyRight && X.applyRight();
      try { if (end != null) ch.scrollToDataIndex(i1); else ch.scrollToRealTime(); } catch (e) { /* nada */ }
      X.applyScale(); paintBot();
    }
    const ytdStart = end => { const p = parts(end, tzOf()); return localMs(p.y, 1, 1, 0, 0, tzOf()); };
    function doRange(r) {
      if (X.R.on) { say("Los rangos son para el gráfico en vivo: sal de la práctica para usarlos."); return; }
      const tf = r[1], span = r[2];
      if (!U.TF_MS[tf]) U.addTf(tf);
      const startFor = end => span === "all" ? null : span === "ytd" ? ytdStart(end) : end - span * 864e5;
      const fitNow = () => { const L = ch.getDataList(); if (!L.length) return; fitRange(startFor(L[L.length - 1].timestamp), null); };
      const L = ch.getDataList();
      if (st.tf !== tf) {
        afterLoad(fitNow);
        try { ch.scrollToRealTime(); } catch (e) { /* nada */ }
        X.setTf(tf);
        if (st.tf !== tf) { afterLoad(null); return; }
        const s0 = startFor(Date.now()); if (s0 != null) st.anchor = s0 - 4 * 864e5; // margen por fines de semana y festivos
        return;
      }
      const s0 = L.length ? startFor(L[L.length - 1].timestamp) : null;
      if (s0 != null && L.length && L[0].timestamp > s0) { afterLoad(fitNow); try { ch.scrollToRealTime(); } catch (e) { /* nada */ } st.anchor = s0 - 864e5; ch.resetData(); }
      else fitNow();
    }

    /* ===== ir a una fecha ===== */
    function tfFor(age, bars, from) {
      const pub = st.prov && st.prov.id === "publico" && !st.prov.deep;
      const ok = k => (!pub || !X.PUB_DAYS[k] || age < (X.PUB_DAYS[k] - 1) * 864e5) && bars(k) <= 8000;
      if (ok(from)) return from;
      return U.TFS.map(t => t[0]).filter(k => U.TF_MS[k] > U.TF_MS[from]).sort((a, b) => U.TF_MS[a] - U.TF_MS[b]).find(ok) || "1w";
    }
    function flashAt(ts) {
      const L = ch.getDataList(); if (!L.length) return;
      const i = Math.max(0, upperBound(L, ts) - 1);
      let px = null; try { px = ch.convertToPixel({ dataIndex: i, timestamp: L[i].timestamp }, { paneId: "candle_pane", absolute: true }); } catch (e) { /* fuera */ }
      if (!px || px.x == null || !isFinite(px.x)) return;
      const mb = ch.getSize("candle_pane", "main"), m = document.createElement("div"); m.className = "g3-flash";
      m.style.left = Math.round(px.x + (mb && mb.left > 2 && px.x < mb.left ? mb.left : 0)) + "px"; canvas.appendChild(m);
      setTimeout(() => m.remove(), 2700);
    }
    function goDate(ts) {
      if (X.R.on) { say("En práctica, elige la fecha con «Otra fecha»."); return; }
      const age = Math.max(0, Date.now() - ts), tf = tfFor(age, k => age / U.TF_MS[k], st.tf), L = ch.getDataList();
      const done = () => { X.goAnchor({ ts }); setTimeout(() => flashAt(ts), 90); };
      if (tf === st.tf && L.length && L[0].timestamp <= ts) { done(); return; }
      if (tf !== st.tf) say(`En ${X.tfName(st.tf)} no hay velas de esa fecha: te la enseño en ${X.tfName(tf)}.`, 4200);
      afterLoad(done);
      try { ch.scrollToRealTime(); } catch (e) { /* nada */ }
      const changed = tf !== st.tf;
      if (changed) { X.setTf(tf); if (st.tf !== tf) { afterLoad(null); return; } }
      st.anchor = ts;
      if (!changed) ch.resetData();
    }
    function goRange(a, b) {
      if (X.R.on) { say("En práctica, elige la fecha con «Otra fecha»."); return; }
      if (b < a) { const t = a; a = b; b = t; }
      const age = Math.max(0, Date.now() - a), tf = tfFor(age, k => Math.max((b - a) / U.TF_MS[k] * 2.6, age / U.TF_MS[k]), st.tf), L = ch.getDataList();
      const done = () => { fitRange(a, b); setTimeout(() => flashAt(a), 90); };
      if (tf === st.tf && L.length && L[0].timestamp <= a) { done(); return; }
      if (tf !== st.tf) say(`Para ese rango uso velas de ${X.tfName(tf)}.`, 3600);
      afterLoad(done);
      try { ch.scrollToRealTime(); } catch (e) { /* nada */ }
      const changed = tf !== st.tf;
      if (changed) { X.setTf(tf); if (st.tf !== tf) { afterLoad(null); return; } }
      st.anchor = a;
      if (!changed) ch.resetData();
    }
    function gotoDialog(tab) {
      if (X.R.on) { say("En práctica, elige la fecha con «Otra fecha»."); return; }
      MENU.close(true);
      const tz = tzOf(), L = ch.getDataList(), last = L.length ? L[L.length - 1].timestamp : Date.now();
      let v0 = last - 30 * 864e5, v1 = last; try { const v = ch.getVisibleRange(); if (v && L.length) { v0 = L[Math.max(0, v.from)].timestamp; v1 = L[Math.min(L.length - 1, Math.max(0, v.to - 1))].timestamp; } } catch (e) { /* nada */ }
      const intra = (U.TF_MS[st.tf] || 0) < 864e5;
      const f = (k, lab, type, val, dis) => `<label>${lab}<input type="${type}" class="gx-in" data-gi="${k}" value="${val}"${dis ? " disabled" : ""}></label>`;
      X.openModal(`<div class="gx-dh"><h3>Ir a</h3><button type="button" class="gx-tb gx-ic" data-close aria-label="Cerrar">${U.icon("x", 18)}</button></div>
        <div class="g3-go">
          <div class="gx-seg" role="tablist" aria-label="Qué quieres ver"><button type="button" role="tab" data-gt="d" aria-pressed="${tab !== "r"}">Fecha</button><button type="button" role="tab" data-gt="r" aria-pressed="${tab === "r"}">Rango de fechas</button></div>
          <div class="g3-gp" data-gp="d"${tab === "r" ? " hidden" : ""}>${f("d", "Fecha", "date", dateStr(last, tz))}${f("t", "Hora", "time", intra ? timeStr(last, tz) : "12:00", !intra)}</div>
          <div class="g3-gp" data-gp="r"${tab === "r" ? "" : " hidden"}>${f("d0", "Desde", "date", dateStr(v0, tz))}${f("t0", "Hora", "time", "00:00", !intra)}${f("d1", "Hasta", "date", dateStr(v1, tz))}${f("t1", "Hora", "time", "23:59", !intra)}</div>
          <p class="g3-note">Horas de ${esc(tzName(tz))} (${esc(offLabel(tz))}). Si en ${esc(X.tfName(st.tf))} no hay velas tan antiguas, el gráfico cambia solo a un marco mayor.</p>
          <div class="g3-act"><button type="button" class="gx-btn" data-close>Cancelar</button><button type="button" class="gx-btn g3-pri" data-go>Ir</button></div>
        </div>`, () => {
        const D = $(".gx-dlg"), q = k => D.querySelector(`[data-gi="${k}"]`);
        const msOf = (dk, tk, dflt) => { const d = (q(dk).value || "").split("-").map(Number); if (d.length !== 3 || !d[0]) return null; const t = ((intra && q(tk).value) || dflt).split(":").map(Number); return localMs(d[0], d[1], d[2], t[0] || 0, t[1] || 0, tz); };
        const go = () => {
          const rng = D.querySelector('[data-gt="r"]').getAttribute("aria-pressed") === "true";
          if (rng) { const a = msOf("d0", "t0", "00:00"), b = msOf("d1", "t1", "23:59"); if (a == null || b == null) return; X.closeModal(); goRange(a, b); }
          else { const a = msOf("d", "t", "12:00"); if (a == null) return; X.closeModal(); goDate(a); }
        };
        D.onclick = e => {
          const b = e.target.closest("button"); if (!b) return;
          if (b.hasAttribute("data-close")) { X.closeModal(); return; }
          if (b.dataset.gt) { D.querySelectorAll("[data-gt]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); D.querySelectorAll("[data-gp]").forEach(p => { p.hidden = p.dataset.gp !== b.dataset.gt; }); const i = D.querySelector(`[data-gp="${b.dataset.gt}"] input`); i && i.focus(); return; }
          if (b.hasAttribute("data-go")) go();
        };
        D.onkeydown = e => { if (e.key === "Enter" && e.target.matches("input")) { e.preventDefault(); go(); } };
        const first = D.querySelector(`[data-gp="${tab === "r" ? "r" : "d"}"] input`); if (first) setTimeout(() => first.focus(), 30);
      });
    }

    /* ===== barra de abajo ===== */
    const bot = document.createElement("div"); bot.className = "g3-bot"; bot.setAttribute("role", "toolbar"); bot.setAttribute("aria-label", "Rango de fechas, hora y escala");
    bot.innerHTML = `<div class="g3-rng" role="group" aria-label="Rango de fechas">${RANGES.map((r, i) => `<button type="button" class="g3-b" data-g3r="${i}" title="${esc(r[3])}">${r[0]}</button>`).join("")}</div>
      <span class="gx-vs"></span>
      <button type="button" class="g3-b g3-ic" data-g3="goto" title="Ir a una fecha (${ALT} + G)" aria-label="Ir a una fecha">${ic("cal", 16)}</button>
      <span class="gx-sp"></span>
      <button type="button" class="g3-b g3-clock" data-g3="tz" aria-haspopup="menu" title="Zona horaria del gráfico"><span class="g3-t"></span><span class="g3-z"></span></button>
      <span class="gx-vs"></span>
      <button type="button" class="g3-b g3-ic" data-g3="dw" aria-pressed="false" title="Ventana de datos: los valores de la vela bajo el cursor" aria-label="Ventana de datos">${ic("table", 16)}</button>
      <button type="button" class="g3-b" data-g3="pct" aria-pressed="false" title="Escala en porcentaje desde la primera vela que se ve (${ALT} + P)">%</button>
      <button type="button" class="g3-b" data-g3="log" aria-pressed="false" title="Escala logarítmica (${ALT} + L)">log</button>
      <button type="button" class="g3-b" data-g3="auto" aria-pressed="true" title="Ajustar el precio a la pantalla automáticamente">auto</button>`;
    body.after(bot);
    const clockT = bot.querySelector(".g3-t"), clockZ = bot.querySelector(".g3-z");
    let lastAuto = null;
    function paintBot() {
      if (!alive) return;
      const sc = effScale(), a = autoOn(); lastAuto = a;
      bot.querySelector('[data-g3="pct"]').setAttribute("aria-pressed", String(sc === "percentage"));
      bot.querySelector('[data-g3="log"]').setAttribute("aria-pressed", String(sc === "logarithm"));
      bot.querySelector('[data-g3="auto"]').setAttribute("aria-pressed", String(a));
      bot.querySelector('[data-g3="dw"]').setAttribute("aria-pressed", String(dwOn));
      bot.querySelectorAll("[data-g3r]").forEach(b => { b.disabled = !!X.R.on; });
    }
    function paintClock() { const tz = tzOf(); clockT.textContent = fmt(tz, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()); clockZ.textContent = " (" + offLabel(tz) + ")"; clockZ.parentElement.title = "Zona horaria del gráfico: " + tzName(tz) + ". Toca para cambiarla."; }
    PAINT.add(paintBot);
    function tzMenu(btn) {
      const cur = CFG.tz || "auto", r = btn.getBoundingClientRect();
      MENU.open([{ head: "Zona horaria del gráfico" }].concat((U.TZS || [["auto", "La de tu dispositivo"], ["UTC", "UTC"]]).map(([v, l]) => ({
        t: `${l} · ${offLabel(v === "auto" ? devTz() : v)}`, radio: v === cur,
        f: () => { CFG.tz = v; X.cfgSave(); X.restyleAll(); repaintAll(); paintClock(); }
      }))), r.right, r.top, { above: true, alignRight: true, minW: 250, label: "Zona horaria" });
    }
    bot.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b || b.disabled) return;
      if (b.dataset.g3r) { doRange(RANGES[+b.dataset.g3r]); return; }
      const a = b.dataset.g3;
      if (a === "goto") gotoDialog();
      else if (a === "tz") tzMenu(b);
      else if (a === "dw") dwToggle();
      else if (a === "pct") toggleScale("percentage");
      else if (a === "log") toggleScale("logarithm");
      else if (a === "auto") setAuto(!autoOn());
    });
    canvas.addEventListener("pointerup", () => setTimeout(() => { if (alive && autoOn() !== lastAuto) paintBot(); }, 30));
    canvas.addEventListener("wheel", () => setTimeout(() => { if (alive && autoOn() !== lastAuto) paintBot(); }, 60), { passive: true });

    /* ===== ventana de datos ===== */
    const DW = document.createElement("div"); DW.className = "g3-dw"; DW.hidden = true; DW.setAttribute("role", "region"); DW.setAttribute("aria-label", "Ventana de datos"); canvas.appendChild(DW);
    let dwOn = !!ls.get("tk-dw-" + me.key, false), dwIdx = null;
    ch.subscribeAction("onCrosshairChange", d => {
      let ni = d ? d.dataIndex : null;
      if (d && ni == null && d.x != null && isFinite(d.x)) { try { let r = ch.convertFromPixel([{ x: d.x, y: d.y }], { paneId: d.paneId || "candle_pane" }); r = Array.isArray(r) ? r[0] : r; ni = r ? r.dataIndex : null; } catch (e) { ni = null; } }
      if (ni != null && !isFinite(ni)) ni = null;
      if (ni !== dwIdx) { dwIdx = ni; if (dwOn) dwPaint(); }
    });
    function dwToggle(on) { dwOn = on == null ? !dwOn : !!on; ls.set("tk-dw-" + me.key, dwOn); dwPaint(); paintBot(); }
    function dwPaint() {
      if (!alive) return;
      if (!dwOn) { DW.hidden = true; return; }
      const L = ch.getDataList(); if (!L.length) { DW.hidden = true; return; }
      const i = dwIdx != null ? Math.max(0, Math.min(L.length - 1, dwIdx)) : L.length - 1, b = L[i], pb = L[i - 1], d = X.digits(), tz = tzOf();
      const chg = pb ? b.close - pb.close : b.close - b.open, pct = pb && pb.close ? chg / pb.close * 100 : (b.open ? chg / b.open * 100 : 0);
      const intra = (U.TF_MS[st.tf] || 0) < 864e5;
      const row = (k, v, cls, sty) => `<dt>${esc(k)}</dt><dd${cls ? ` class="${cls}"` : ""}${sty ? ` style="${sty}"` : ""}>${v}</dd>`;
      let h = row("Fecha", esc(fmt(tz, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(b.timestamp))));
      if (intra) h += row("Hora", esc(fmt(tz, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(b.timestamp))));
      h += row("Apertura", nf(b.open, d)) + row("Máximo", nf(b.high, d)) + row("Mínimo", nf(b.low, d)) + row("Cierre", nf(b.close, d), chg >= 0 ? "up" : "dn");
      h += row("Cambio", `${chg >= 0 ? "+" : "−"}${nf(Math.abs(chg), d)} (${chg >= 0 ? "+" : "−"}${nf(Math.abs(pct), 2)} %)`, chg >= 0 ? "up" : "dn");
      if (b.volume) h += row("Volumen", big(b.volume));
      if (C.list.length && !X.R.on) {
        h += `<div class="g3-dws">Comparados</div>`; const cols = CMP_COL();
        C.list.forEach((x, k) => { const v = C.raw[k] ? C.raw[k][i] : null, j = C.base[k], bv = j >= 0 && C.raw[k] ? C.raw[k][j] : null, pc = v != null && bv ? (v / bv - 1) * 100 : null; h += row(x.s, v == null ? "—" : `${nf(v, digitsOf(x.s))}${pc != null ? ` <small>${pc >= 0 ? "+" : "−"}${nf(Math.abs(pc), 2)} %</small>` : ""}`, "", `color:${cols[x.ci % 5]}`); });
      }
      const inds = X.activeInd(), objs = ch.getIndicators();
      const rows = inds.map(x => {
        const o = objs.find(y => y.name === x.n); if (!o || !o.result || !o.result[i]) return "";
        const meta = U.IND_BY[x.n], lab = (meta ? meta[1] : x.n) + (x.p && x.p.length ? " " + x.p.join(", ") : "");
        const figs = (o.figures || []).filter(f => o.result[i][f.key] != null); if (!figs.length) return "";
        const pr = o.precision != null && o.precision < 9 ? o.precision : d;
        return figs.length === 1 ? row(lab, Math.abs(o.result[i][figs[0].key]) >= 1e5 ? big(o.result[i][figs[0].key]) : nf(o.result[i][figs[0].key], pr))
          : `<div class="g3-dwi">${esc(lab)}</div>` + figs.slice(0, 6).map(f => row(String(f.title || f.key).replace(/[:：]\s*$/, ""), Math.abs(o.result[i][f.key]) >= 1e5 ? big(o.result[i][f.key]) : nf(o.result[i][f.key], pr))).join("");
      }).join("");
      if (rows) h += `<div class="g3-dws">Indicadores</div>` + rows;
      DW.innerHTML = `<div class="g3-dwh"><b>${esc(st.sym)} · ${esc(U.TF_SHORT[st.tf] || st.tf)}</b><button type="button" data-g3dw="x" title="Cerrar la ventana de datos" aria-label="Cerrar la ventana de datos">${ic("x", 14)}</button></div><dl class="g3-dl">${h}</dl>`;
      let right = 8; try { const ya = ch.getSize("candle_pane", "yAxis"); if (ya && CFG.pos !== "left") right = Math.round(ya.width) + 8; } catch (e) { /* nada */ }
      DW.style.right = right + "px"; DW.hidden = false;
    }
    DW.addEventListener("click", e => { if (e.target.closest('[data-g3dw="x"]')) dwToggle(false); });

    /* ===== comparar con otros mercados ===== */
    function provFor(sym) {
      const wd = U.withDerived;
      if (opts.mt5 && opts.mt5.has && opts.mt5.has(sym)) return wd(opts.mt5.provider(sym));
      if (U.binSym(sym)) return wd(TK.sources.binance());
      return wd(TK.sources.publico(opts.invoke, digitsOf(sym)));
    }
    const cmpSave = () => ls.set("tk-cmp-" + me.key, C.list.map(x => ({ s: x.s, ci: x.ci, h: x.h ? 1 : 0 })));
    function cmpApply() {
      try { ch.removeIndicator({ name: "TKCMP" }); } catch (e) { /* no estaba */ }
      if (!C.list.length) return;
      const cols = CMP_COL();
      try {
        ch.createIndicator({
          name: "TKCMP", paneId: "candle_pane", calcParams: [C.from, C.ver], precision: 10, extendData: { key: me.key },
          figures: C.list.map((x, k) => ({ key: "c" + k, title: x.s + ": ", type: "line" })),
          styles: { lines: C.list.map(x => ({ color: cols[x.ci % 5], size: 1.6, style: "solid", smooth: false, dashedValue: [2, 2] })) }
        }, true);
      } catch (e) { console.error("comparar", e); }
    }
    function bump() {
      if (!alive) return; C.ver++;
      try { ch.overrideIndicator({ name: "TKCMP", calcParams: [C.from, C.ver] }); } catch (e) { /* aún no está */ }
      HK.repaint && HK.repaint(); dwPaint();
    }
    async function cmpLoad(x, older) {
      if (x.loading || !alive) return;
      if (older && (!x.more || !x.bars.length)) return;
      const tf = st.tf;
      if (x.tf !== tf) { x.tf = tf; x.bars = []; x.more = true; x.err = ""; x.prov = null; x.t = 0; }
      x.loading = true;
      try {
        const prov = x.prov || (x.prov = provFor(x.s)), to = older ? x.bars[0].timestamp : null;
        const r = await prov.bars(x.s, tf, to);
        if (!alive || !C.list.includes(x) || x.tf !== tf) return;
        let nb = (r && r.bars) || [];
        if (to) { nb = nb.filter(b => b.timestamp < to); x.bars = nb.concat(x.bars); x.more = !!(r && r.more) && nb.length > 0; }
        else { x.bars = nb; x.more = !!(r && r.more); x.t = Date.now(); }
        x.err = x.bars.length ? "" : "sin datos";
      } catch (e) { x.err = "sin datos"; x.t = Date.now(); }
      finally { x.loading = false; }
      bump();
    }
    CALC[me.key] = (list, from) => {
      const n = list.length, out = new Array(n); for (let i = 0; i < n; i++) out[i] = {};
      C.raw = []; C.base = [];
      if (!n || !C.list.length || X.R.on) return out;
      const need = [];
      C.raw = C.list.map(x => {
        const a = new Array(n).fill(null);
        if (x.tf !== st.tf) { if (!x.loading) need.push([x, false]); return a; }
        const B = x.bars; if (!B.length) return a;
        let j = 0;
        for (let i = 0; i < n; i++) {
          const t = list[i].timestamp; if (t < B[0].timestamp) continue;
          while (j + 1 < B.length && B[j + 1].timestamp <= t) j++;
          a[i] = B[j].close;
        }
        if (x.more && !x.loading && !x.err && B[0].timestamp > list[0].timestamp) need.push([x, true]);
        return a;
      });
      const b0 = Math.max(0, Math.min(n - 1, from));
      C.base = C.raw.map(a => { let j = b0; while (j < n && a[j] == null) j++; return j < n ? j : -1; });
      C.list.forEach((x, k) => {
        const a = C.raw[k], j = C.base[k]; if (x.h || j < 0 || !a[j]) return;
        const m = list[j].close / a[j], key = "c" + k;
        for (let i = 0; i < n; i++) if (a[i] != null) out[i][key] = a[i] * m;
      });
      if (need.length) setTimeout(() => need.forEach(([x, older]) => cmpLoad(x, older)), 0);
      return out;
    };
    /* al desplazarte, la base (0 %) es la primera vela que se ve, como en la escala en % */
    let rafV = 0;
    ch.subscribeAction("onVisibleRangeChange", v => {
      if (!C.list.length || !v) return;
      const f = Math.max(0, v.from || 0); if (f === C.from) return;
      C.from = f; cancelAnimationFrame(rafV);
      rafV = requestAnimationFrame(() => { if (!alive) return; try { ch.overrideIndicator({ name: "TKCMP", calcParams: [C.from, C.ver] }); } catch (e) { /* nada */ } });
    });
    function cmpAdd(sym) {
      if (C.list.some(x => x.s === sym)) return true;
      if (sym === st.sym) { (window.toast || say)("Ese es el mercado del gráfico: elige otro para comparar."); return false; }
      if (C.list.length >= 5) { (window.toast || say)("Puedes comparar hasta 5 mercados a la vez. Quita uno desde la leyenda."); return false; }
      const used = new Set(C.list.map(x => x.ci)); let ci = 0; while (used.has(ci)) ci++;
      const x = { s: sym, ci, h: false, bars: [], more: true, tf: null, err: "", loading: false };
      if (!C.list.length && (CFG.scale || "normal") === "normal") C.pct = true;
      C.list.push(x); cmpSave();
      try { const v = ch.getVisibleRange(); C.from = Math.max(0, (v && v.from) || 0); } catch (e) { /* nada */ }
      cmpApply(); X.applyScale(); paintBot(); cmpLoad(x);
      return true;
    }
    function cmpDel(k) {
      C.list.splice(k, 1); cmpSave();
      if (!C.list.length) C.pct = false;
      cmpApply(); X.applyScale(); paintBot(); HK.repaint && HK.repaint(); dwPaint();
    }
    function cmpOpen() {
      MENU.close(true);
      if (X.R.on) { say("En práctica no se comparan mercados: verías velas del futuro. Vuelve a «Analizar» para comparar."); return; }
      if (!window.TkMarkets) { say("El buscador de mercados aún se está cargando. Prueba en un momento."); return; }
      TkMarkets.open({
        mode: "add", title: "Comparar con otro mercado", addVerb: "comparar", current: st.sym, invoke: opts.invoke,
        mt5: opts.mt5Syms, traded: opts.traded, cached: opts.cachedQuote, added: C.list.map(x => x.s), onAdd: cmpAdd
      });
    }
    HK.lgExtra = i => {
      if (!C.list.length || X.R.on) return "";
      const cols = CMP_COL();
      return C.list.map((x, k) => {
        const col = cols[x.ci % 5], a = C.raw[k], v = a ? a[i] : null, j = C.base[k], bv = a && j >= 0 ? a[j] : null, pc = v != null && bv ? (v / bv - 1) * 100 : null;
        const val = x.h ? "" : x.err && !x.bars.length ? `<i class="g3-mut">sin precios</i>` : v == null ? `<i class="g3-mut">${x.loading ? "cargando…" : "—"}</i>`
          : `<i style="color:${col}">${nf(v, digitsOf(x.s))}</i>${pc != null ? `<i class="${pc >= 0 ? "up" : "dn"}" title="Cambio desde la primera vela que se ve">${pc >= 0 ? "+" : "−"}${nf(Math.abs(pc), 2)} %</i>` : ""}`;
        return `<div class="gx-lgr g3-lgc${x.h ? " off" : ""}"><span class="n"><i class="g3-dot" style="background:${col}"></i>${esc(x.s)}</span>${val}<span class="a"><button type="button" data-g3c="eye" data-k="${k}" title="${x.h ? "Mostrar" : "Ocultar"}" aria-label="${x.h ? "Mostrar" : "Ocultar"} ${esc(x.s)}">${U.icon(x.h ? "eyeOff" : "eye", 14)}</button><button type="button" data-g3c="del" data-k="${k}" title="Dejar de comparar" aria-label="Dejar de comparar ${esc(x.s)}">${ic("x", 14)}</button></span></div>`;
      }).join("");
    };
    const lg = $(".gx-lg");
    if (lg) lg.addEventListener("click", e => {
      const b = e.target.closest("[data-g3c]"); if (!b) return; e.stopPropagation();
      const k = +b.dataset.k, x = C.list[k]; if (!x) return;
      if (b.dataset.g3c === "eye") { x.h = !x.h; cmpSave(); bump(); }
      if (b.dataset.g3c === "del") cmpDel(k);
    });
    /* precio al día de los comparados: lo que ya trae la lista de seguimiento, y cada pocos minutos las últimas velas */
    async function cmpRefresh() {
      if (!alive || !C.list.length || X.R.on || document.hidden || !document.body.contains(me.el)) return;
      let changed = false; const now = Date.now(), ms = U.TF_MS[st.tf] || 6e4;
      for (const x of C.list) {
        if (x.loading || x.tf !== st.tf || !x.bars.length) continue;
        const q = opts.cachedQuote && opts.cachedQuote(x.s), lb = x.bars[x.bars.length - 1];
        if (q && q.last != null && isFinite(q.last) && now - lb.timestamp < ms && lb.close !== q.last) { lb.close = q.last; lb.high = Math.max(lb.high, q.last); lb.low = Math.min(lb.low, q.last); changed = true; }
        const every = U.binSym(x.s) ? 20000 : Math.max(120000, Math.min(ms, 600000));
        if (now - (x.t || 0) < every) continue;
        x.loading = true;
        try {
          const r = await (x.prov || (x.prov = provFor(x.s))).bars(x.s, st.tf, null), nb = (r && r.bars) || [];
          if (nb.length && alive && C.list.includes(x) && x.tf === st.tf) { const t0 = nb[0].timestamp; x.bars = x.bars.filter(b => b.timestamp < t0).concat(nb); changed = true; }
        } catch (e) { /* sigue con lo que hay */ }
        finally { x.t = Date.now(); x.loading = false; }
      }
      if (changed) bump();
    }
    C.list = (ls.get("tk-cmp-" + me.key, []) || []).filter(x => x && x.s).slice(0, 5).map((x, k) => ({ s: x.s, ci: x.ci != null ? x.ci : k, h: !!x.h, bars: [], more: true, tf: null, err: "", loading: false }));
    if (C.list.length && (CFG.scale || "normal") === "normal") C.pct = true;
    { const prevAI = HK.afterInd; HK.afterInd = () => { prevAI && prevAI(); cmpApply(); }; }
    if (C.list.length) setTimeout(() => { if (alive) { X.applyScale(); paintBot(); } }, 0);
    const sym = $(".gx-sym");
    if (sym) {
      const cb = document.createElement("button"); cb.type = "button"; cb.className = "gx-tb gx-ic g3-cmpb";
      cb.title = "Comparar con otro mercado"; cb.setAttribute("aria-label", "Comparar con otro mercado"); cb.innerHTML = ic("plusc", 18);
      sym.after(cb); cb.addEventListener("click", cmpOpen);
    }

    /* ===== menús del botón derecho ===== */
    const DRAW_NAME = { segment: "Línea de tendencia", rayLine: "Rayo", straightLine: "Línea extendida", horizontalStraightLine: "Línea horizontal", horizontalRayLine: "Rayo horizontal", horizontalSegment: "Segmento horizontal", verticalStraightLine: "Línea vertical", priceLine: "Línea de precio", parallelStraightLine: "Canal paralelo", fibonacciLine: "Retroceso de Fibonacci", tkRect: "Rectángulo", tkText: "Texto", tkArrow: "Flecha", tkPriceRange: "Rango de precio", tkLong: "Posición larga", tkShort: "Posición corta" };
    const drawName = o => o.name === "tkPos" ? ((o.extendData || {}).side === "sell" ? "Posición corta" : "Posición larga") : DRAW_NAME[o.name] || "Dibujo";
    function areaAt(cx, cy) {
      try {
        const r = box.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
        const pane = ch.getSize("candle_pane", "root"), ya = ch.getSize("candle_pane", "yAxis");
        if (!pane || y < pane.top || y > pane.top + pane.height) return "other";
        if (ya && x >= ya.left && x <= ya.left + ya.width) return "y";
        return "main";
      } catch (e) { return "main"; }
    }
    function ptAt(cx, cy) {
      try {
        const r = box.getBoundingClientRect(), mb = ch.getSize("candle_pane", "main"), pane = ch.getSize("candle_pane", "root");
        const x = cx - r.left - ((mb && mb.left) || 0), y = cy - r.top;
        let p = ch.convertFromPixel([{ x, y }], { paneId: "candle_pane", absolute: true }); p = Array.isArray(p) ? p[0] : p;
        if (!p || p.value == null || !isFinite(p.value) || (pane && (y < pane.top || y > pane.top + pane.height))) return null;
        const L = ch.getDataList(), di = p.dataIndex;
        const ts = di != null && di >= 0 && di < L.length ? L[di].timestamp : p.timestamp != null ? p.timestamp : (L.length ? L[L.length - 1].timestamp : Date.now());
        return { timestamp: ts, value: +(+p.value).toFixed(X.digits()) };
      } catch (e) { return null; }
    }
    function copyText(t, okMsg) {
      const done = () => say(okMsg || "Copiado: " + t, 1800);
      try { navigator.clipboard.writeText(t).then(done, () => say("No se pudo copiar. Precio: " + t, 3000)); } catch (e) { say("Precio: " + t, 3000); }
    }
    const clickTool = a => { const b = X.$(`.gx-tools [data-act="${a}"]`); if (b) b.click(); };
    function chartMenu(cx, cy) {
      const p = areaAt(cx, cy) === "main" ? ptAt(cx, cy) : null, d = X.digits(), pt = p ? nf(p.value, d) : "";
      const draws = ch.getOverlays({ groupId: "draw" }).length, inds = X.activeInd().length;
      MENU.open([
        { t: "Restablecer la vista del gráfico", k: ALT + " R", ic: "reset", f: () => resetView(true) },
        "-",
        p && { t: "Copiar el precio " + pt, ic: "copy", f: () => copyText(String(p.value), "Precio copiado: " + pt) },
        st.clip && { t: "Pegar el dibujo", k: CMD + " V", ic: "paste", f: () => X.pasteClip() },
        "-",
        p && HK.alertDialog && { t: "Crear una alerta en " + pt, k: ALT + " A", ic: "bell", f: () => HK.alertDialog({ value: p.value }) },
        p && { t: "Línea horizontal en " + pt, k: ALT + " H", ic: "hline", f: () => X.quickLine("horizontalStraightLine", p) },
        p && { t: "Línea vertical aquí", k: ALT + " V", ic: "vline", f: () => X.quickLine("verticalStraightLine", p) },
        "-",
        { t: "Añadir indicador…", k: "/", ic: "fx", f: () => X.modalInd() },
        !X.R.on && { t: "Comparar con otro mercado…", ic: "cmp", f: cmpOpen },
        !X.R.on && { t: "Ir a una fecha…", k: ALT + " G", ic: "cal", f: () => gotoDialog() },
        { t: "Ventana de datos", on: dwOn, ic: "table", f: () => dwToggle() },
        "-",
        draws && { t: "Lista de dibujos…", ic: "tree", f: () => X.modalTree() },
        draws && { t: st.hidden ? "Mostrar los dibujos" : "Ocultar los dibujos", ic: st.hidden ? "eye" : "eyeOff", f: () => clickTool("hide") },
        draws && { t: st.locked ? "Desbloquear los dibujos" : "Bloquear los dibujos", ic: "lock", f: () => clickTool("lockall") },
        draws && { t: `Borrar los dibujos (${draws})`, ic: "trash", f: () => clickTool("clear") },
        inds && { t: `Quitar los indicadores (${inds})`, ic: "trash", f: () => { if (window.confirm(`¿Quitar ${inds === 1 ? "el indicador" : "los " + inds + " indicadores"} de este gráfico?`)) X.saveInd([]); } },
        "-",
        { t: "Ajustes del gráfico…", ic: "gear", f: () => X.modalSettings() }
      ], cx, cy, { label: "Menú del gráfico" });
    }
    function scaleMenu(cx, cy) {
      const sc = effScale(), a = autoOn();
      MENU.open([
        { head: "Escala de precios" },
        { t: "Ajuste automático", on: a, ic: "scale", f: () => setAuto(!a) },
        { t: "Restablecer la escala", k: ALT + " R", ic: "reset", f: () => resetView(false) },
        "-",
        { t: "Normal", radio: sc === "normal", f: () => setScale("normal") },
        { t: "Logarítmica", k: ALT + " L", radio: sc === "logarithm", f: () => setScale("logarithm") },
        { t: "En porcentaje", k: ALT + " P", radio: sc === "percentage", f: () => setScale("percentage") },
        "-",
        { t: "Invertir la escala", k: ALT + " I", on: !!CFG.inv, f: invert },
        { t: CFG.pos === "left" ? "Llevar la escala a la derecha" : "Llevar la escala a la izquierda", ic: "scale", f: () => { CFG.pos = CFG.pos === "left" ? "right" : "left"; X.cfgSave(); X.restyleAll(); repaintAll(); dwPaint(); } },
        "-",
        { t: "Ajustes de la escala…", ic: "gear", f: () => X.modalSettings() }
      ], cx, cy, { label: "Menú de la escala de precios" });
    }
    function zOrder(id, how) {
      const all = ch.getOverlays({ groupId: "draw" }).slice().sort((p, q) => (p.zLevel || 0) - (q.zLevel || 0)), me2 = all.find(o => o.id === id); if (!me2) return;
      const rest = all.filter(o => o.id !== id), seq = how === "front" ? rest.concat([me2]) : [me2].concat(rest);
      seq.forEach((o, i) => { if ((o.zLevel || 0) !== i) ch.overrideOverlay({ id: o.id, zLevel: i }); });
      X.save();
    }
    function copyDrawing(o) {
      st.clip = { name: o.name, points: o.points.map(p => ({ timestamp: p.timestamp, value: p.value })), extendData: JSON.parse(JSON.stringify(o.extendData || {})), styles: o.styles, sym: st.sym, n: 0 };
      say(`Dibujo copiado. ${CMD} + V para pegarlo (también en otro mercado).`, 2200);
    }
    let ovPend = false; // el botón derecho de este clic ya abrió el menú del dibujo
    HK.ovMenu = (o, ev) => {
      ovPend = true;
      const id = o.id, cx = ev && ev.pageX != null ? ev.pageX - window.scrollX : null, cy = ev && ev.pageY != null ? ev.pageY - window.scrollY : null;
      if (cx == null || cy == null) return;
      X.showFloat(id, false);
      const ov = X.getOv(id) || o, lineLike = /^(segment|rayLine|straightLine|horizontalStraightLine|horizontalRayLine|horizontalSegment|priceLine)$/.test(ov.name);
      const F = X.F, fBtn = k => F && F.querySelector(`[data-fa="${k}"]`);
      MENU.open([
        { head: drawName(ov) },
        { t: "Duplicar", k: CMD + " D", ic: "dup", f: () => { X.showFloat(id, false); X.dupSel(); } },
        { t: "Copiar", k: CMD + " C", ic: "copy", f: () => copyDrawing(ov) },
        st.clip && { t: "Pegar", k: CMD + " V", ic: "paste", f: () => X.pasteClip() },
        "-",
        { t: "Traer al frente", ic: "front", f: () => zOrder(id, "front") },
        { t: "Enviar al fondo", ic: "back", f: () => zOrder(id, "back") },
        "-",
        fBtn("tfs") && { t: "Marcos en los que se ve…", ic: "clock", f: () => { X.showFloat(id, false); const b = fBtn("tfs"); b && b.click(); } },
        fBtn("tpl") && !fBtn("tpl").hidden && { t: "Plantillas de estilo…", ic: "brush", f: () => { X.showFloat(id, false); const b = fBtn("tpl"); b && b.click(); } },
        { t: "Ocultar", ic: "eyeOff", f: () => { ch.overrideOverlay({ id, visible: false }); X.hideFloat(); say("Dibujo oculto. Lo vuelves a ver en la lista de dibujos.", 2600); } },
        { t: ov.lock ? "Desbloquear" : "Bloquear", on: !!ov.lock, ic: "lock", f: () => { ch.overrideOverlay({ id, lock: !ov.lock }); const b = fBtn("lock"); if (b) b.setAttribute("aria-pressed", String(!ov.lock)); X.save(); } },
        lineLike && HK.alertDialog && { t: "Crear una alerta en este dibujo", ic: "bell", f: () => { X.showFloat(id, false); HK.alertDialog({ fromSel: true }); } },
        "-",
        { t: "Borrar", k: "Supr", ic: "trash", f: () => X.removeSel(id) }
      ], cx, cy, { label: "Menú del dibujo" });
    };
    let lastPT = "mouse";
    canvas.addEventListener("pointerdown", e => { lastPT = e.pointerType || "mouse"; ovPend = false; }, true);
    canvas.addEventListener("contextmenu", e => {
      if (e.target.closest(".g3-dw, .gx-float, .gx-pop, .gx-qo, input, textarea, select")) return;
      e.preventDefault();
      if (lastPT === "touch" || lastPT === "pen") return; // mantener pulsado en el móvil sigue siendo la cruz
      if (ovPend) { ovPend = false; return; } // ya está abierto el menú del dibujo
      if (!document.body.contains(me.el)) return;
      try { me.activate && me.activate(); } catch (x) { /* nada */ }
      if (areaAt(e.clientX, e.clientY) === "y") scaleMenu(e.clientX, e.clientY); else chartMenu(e.clientX, e.clientY);
    }, true);

    /* ===== atajos de teclado ===== */
    const onKey3 = e => {
      if (!alive || !document.body.contains(me.el) || TK.current !== me || MENU.isOpen) return;
      if (window.TkMarkets && TkMarkets.isOpen) return;
      const t = e.target, typing = (t && t.matches && t.matches("input,textarea,select")) || (t && t.isContentEditable);
      if (typing || (X.MOD && !X.MOD.hidden)) return;
      const alt = e.altKey && !e.ctrlKey && !e.metaKey;
      if (alt && e.code === "KeyG") { e.preventDefault(); gotoDialog(); return; }
      if (alt && e.code === "KeyR") { setTimeout(() => { if (!alive) return; resetView(false); try { ch.scrollToRealTime(); } catch (x) { /* nada */ } }, 260); return; } // grafico.js ya empieza a volver a las últimas velas
      if (alt && e.code === "KeyL") { e.preventDefault(); toggleScale("logarithm"); return; }
      if (alt && e.code === "KeyP") { e.preventDefault(); toggleScale("percentage"); return; }
      if (alt && e.code === "KeyI") { e.preventDefault(); invert(); return; }
      if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key === "/") { e.preventDefault(); X.modalInd(); }
    };
    document.addEventListener("keydown", onKey3);

    /* ===== reloj y ciclo ===== */
    paintClock(); paintBot(); dwPaint();
    const tick = setInterval(() => { if (!alive || !document.body.contains(me.el)) return; paintClock(); if (autoOn() !== lastAuto) paintBot(); }, 1000);
    const slow = setInterval(() => { cmpRefresh(); }, 15000);
    { const pr = HK.onRestyle; HK.onRestyle = () => { pr && pr(); cmpApply(); paintBot(); dwPaint(); }; }
    /* en práctica no hay rangos ni comparados (se verían velas del futuro); al volver, todo vuelve */
    { const pm = HK.onMode; HK.onMode = m => { pm && pm(m); MENU.close(true); setTimeout(() => { if (!alive) return; X.applyScale(); paintBot(); HK.repaint && HK.repaint(); dwPaint(); }, 60); }; }
    { const prevOD2 = HK.onData; HK.onData = () => { prevOD2 && prevOD2(); setTimeout(() => { if (alive) { paintBot(); dwPaint(); } }, 80); }; }
    { const pd = HK.destroy; HK.destroy = () => { alive = false; clearInterval(tick); clearInterval(slow); document.removeEventListener("keydown", onKey3); PAINT.delete(paintBot); delete CALC[me.key]; MENU.close(true); pd && pd(); }; }
    setTimeout(() => { try { ch.resize(); } catch (e) { /* nada */ } }, 30);
  }
  window.TkChartExt2 = (window.TkChartExt2 || []).concat([ext]);
  window.TkG3 = { MENU };
})();
