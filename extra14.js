/* Tickora · el guardián en la app y la memoria común (19-nov-2026).
   - Mismas normas que el servidor (reglas.js, con tests). Aquí se miran cada 15 s y cada vez que llega algo de MT5.
   - Un solo aviso a la vez, el más importante, sin repetirse; todo queda en agent_events (la memoria de los agentes).
   - Ajustes › «Tu guardián»: encender/apagar cada norma y sus umbrales, avisos al móvil, tu regla para días malos.
   Sin IA: los textos los escribe Tickora con tus normas y tus datos. */
(function () {
  "use strict";
  const A = window.TKAPP, R = window.TkRules, V = window.TK_VIEWS; if (!A || !R) return;
  const { S, sb, esc, toast, lsGet, lsSet } = A;
  const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid"; } catch (e) { return "Europe/Madrid"; } })();
  const G = window.TkGuardian = { cfg: null, events: [], cur: null, loaded: false };
  const cfg = () => Object.assign({}, R.DEF, (G.cfg && G.cfg.cfg) || {});

  /* ---------- datos: configuración y memoria ---------- */
  async function loadCfg() {
    try {
      const { data } = await sb.from("docs").select("data").eq("col", "guardian").eq("id", "cfg").maybeSingle();
      G.cfg = (data && data.data) || {};
      if (G.cfg.tz !== TZ) { G.cfg.tz = TZ; await saveCfg(); }
    } catch (e) { G.cfg = G.cfg || {}; }
  }
  async function saveCfg() {
    try { await sb.from("docs").upsert({ user_id: S.user.id, col: "guardian", id: "cfg", data: G.cfg, updated_at: new Date().toISOString() }); } catch (e) { /* queda en memoria */ }
  }
  async function loadEvents() {
    try {
      const { data } = await sb.from("agent_events").select("*").gte("ts", new Date(Date.now() - 8 * 864e5).toISOString()).order("ts", { ascending: false }).limit(300);
      G.events = data || [];
    } catch (e) { G.events = G.events || []; }
  }
  const evByKey = k => G.events.find(e => e.key === k);
  async function logEvent(row) {
    const r = Object.assign({ user_id: S.user.id, source: "app", level: "info", data: {} }, row);
    if (evByKey(r.key)) return evByKey(r.key);
    G.events.unshift(Object.assign({ ts: new Date().toISOString() }, r));
    try { await sb.from("agent_events").upsert(r, { onConflict: "user_id,key", ignoreDuplicates: true }); } catch (e) { /* sin conexión: se queda en memoria */ }
    return r;
  }
  window.tkLogEvent = logEvent;
  async function ack(key) {
    const e = evByKey(key); const ts = new Date().toISOString();
    if (e) e.ack_at = ts;
    try { await sb.from("agent_events").update({ ack_at: ts }).eq("key", key); } catch (er) { /* nada */ }
  }

  /* ---------- evaluar: los mismos datos que el servidor ---------- */
  function ctxs() {
    const now = Date.now(), all = S.allTrades || S.trades || [], day = R.parts(now, TZ).day;
    const today = all.filter(t => t.open_time && R.parts(Date.parse(t.open_time), TZ).day === day);
    const groups = new Map(); today.forEach(t => { const k = String(t.account || ""); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
    if (!groups.size) groups.set("", []);
    const syms = [...new Set(all.filter(t => now - Date.parse(t.open_time) < 30 * 864e5).map(t => t.symbol))];
    const news = ((S.news && S.news.events) || []).map(e => ({ ts: e.ts, cur: e.country, impact: e.impact, title: e.title })).filter(e => isFinite(e.ts));
    let oneR = null, cur = "€"; try { if (A.moneyOn()) { oneR = A.oneR(); const c = A.dispCur(); cur = A.CURS[c] || c; } } catch (e) { /* solo R */ }
    const out = [];
    for (const [k, list] of groups) {
      const a = k ? (S.accts || []).find(x => String(x.number || "") === k) : null, plan = A.planFor ? A.planFor(k || null) : (S.plan || {});
      const totalR = a ? all.filter(t => String(t.account || "") === k && t.status === "closed" && (!a.start || String(t.open_time) >= String(a.start))).reduce((s, t) => s + (+t.r || 0), 0) : null;
      out.push({ plan, tz: TZ, now, trades: list, syms, news, cfg: cfg(), acct: a ? Object.assign({ name: A.acctName(a) }, a) : null, totalR, oneR, cur, acctName: groups.size > 1 && a ? A.acctName(a) : "" });
    }
    return out;
  }
  function evaluate() {
    if (!S.user || !S.loaded || !G.loaded) return;
    let alerts = []; ctxs().forEach(c => { alerts = alerts.concat(R.guardian(c)); });
    // lo que mandó el servidor y aún no has cerrado también cuenta (por si la app se abrió tarde)
    const day = R.parts(Date.now(), TZ).day;
    G.events.filter(e => e.agent === "guardian" && !e.ack_at && R.parts(Date.parse(e.ts), TZ).day === day && !alerts.some(a => a.key === e.key))
      .forEach(e => { const until = e.data && e.data.until; if (until && Date.now() > until) return; if (/^(streak|news):/.test(e.key) && !until && Date.now() - Date.parse(e.ts) > 20 * 60e3) return; alerts.push({ rule: e.kind, key: e.key, prio: (e.data && e.data.prio) || 50, level: e.level, title: e.title, msg: e.msg, action: (e.data && e.data.action) || "none", until, tradeId: e.trade_id }); });
    alerts.sort((a, b) => b.prio - a.prio);
    const seen = {}, fam = {};
    G.events.forEach(e => { seen[e.key] = { at: Date.parse(e.ts), ack: e.ack_at ? Date.parse(e.ack_at) : 0 }; if (e.agent === "guardian") fam[e.kind] = Math.max(fam[e.kind] || 0, Date.parse(e.ts)); });
    if (G.cur && !alerts.some(a => a.key === G.cur.key) && !(seen[G.cur.key] && seen[G.cur.key].ack)) alerts.unshift(G.cur); // sigue hasta que lo cierres
    const p = R.pick(alerts, seen, fam, Date.now(), cfg());
    if (p && (!G.cur || G.cur.key !== p.key)) {
      G.cur = p;
      logEvent({ agent: "guardian", kind: p.rule, key: p.key, level: p.level, title: p.title, msg: p.msg, trade_id: p.tradeId || null, data: { prio: p.prio, action: p.action, until: p.until || null, pauseMin: p.pauseMin || null } });
    } else if (!p) G.cur = null;
    paint();
  }

  /* ---------- la tarjeta: un solo aviso ---------- */
  let box = null, tick = null;
  const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  function paint() {
    window.tkGuardianBusy = !!G.cur;
    if (!G.cur || /^#(bienvenida)/.test(location.hash)) { if (box) { box.remove(); box = null; } clearInterval(tick); return; }
    const a = G.cur;
    if (!box) { box = document.createElement("div"); box.className = "gd"; box.setAttribute("role", "alertdialog"); box.setAttribute("aria-live", "assertive"); document.body.appendChild(box); requestAnimationFrame(() => box && box.classList.add("in")); }
    if (box.dataset.key === a.key) return;
    box.dataset.key = a.key; box.className = "gd in " + (a.level === "stop" ? "stop" : "warn");
    const pauseBtn = a.action === "pause" ? `<button type="button" class="gd-b pri" data-gdp>${a.until ? "Hacer mi pausa" : "Parar " + (a.pauseMin || 10) + " min"}</button>` : "";
    const endBtn = a.action === "end" ? `<button type="button" class="gd-b pri" data-gde>Cerrar mi día</button>` : "";
    box.innerHTML = `<div class="gd-h"><span class="gd-dot"></span><span>Tu guardián</span><button type="button" class="gd-x" data-gdok aria-label="Cerrar aviso">×</button></div>
      <b class="gd-t">${esc(a.title)}</b><p class="gd-m">${esc(a.msg)}</p>
      ${a.until ? `<div class="gd-cd"><span>Tu pausa</span><b data-gdcd>${mmss(a.until - Date.now())}</b></div>` : ""}
      <div class="gd-a">${pauseBtn}${endBtn}<button type="button" class="gd-b" data-gdok>Entendido</button></div>`;
    clearInterval(tick); if (a.until) tick = setInterval(() => { const el = box && box.querySelector("[data-gdcd]"); if (!el) return clearInterval(tick); const left = a.until - Date.now(); el.textContent = mmss(left); if (left <= 0) { clearInterval(tick); el.textContent = "Ya puedes volver"; } }, 1000);
    box.querySelectorAll("[data-gdok]").forEach(b => b.onclick = () => close(a));
    const pb = box.querySelector("[data-gdp]"); if (pb) pb.onclick = () => { close(a); if (window.tkPause) window.tkPause(); else toast("Pausa: levántate y vuelve cuando acabe"); };
    const eb = box.querySelector("[data-gde]"); if (eb) eb.onclick = () => { close(a); logEvent({ agent: "coach", kind: "fin", key: "fin:" + R.parts(Date.now(), TZ).day, title: "Día cerrado", msg: "Cerraste el día desde el aviso del guardián." }); location.hash = "#diario"; };
  }
  function close(a) {
    ack(a.key); G.cur = null;
    if (box) { box.classList.remove("in"); const b = box; box = null; setTimeout(() => b.remove(), 200); }
    window.tkGuardianBusy = false; setTimeout(evaluate, 400);
  }

  /* ---------- en tiempo real ---------- */
  let ch = null;
  function listen() {
    if (ch || !S.user) return;
    ch = sb.channel("agentes-" + S.user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_events", filter: "user_id=eq." + S.user.id }, p => { const e = p.new; if (!e || evByKey(e.key)) return; G.events.unshift(e); if (e.agent === "guardian") evaluate(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "trades", filter: "user_id=eq." + S.user.id }, () => setTimeout(evaluate, 1500))
      .subscribe();
  }
  async function start() {
    await Promise.all([loadCfg(), loadEvents()]); G.loaded = true; listen(); evaluate();
    if (/^#ajustes/.test(location.hash)) { S.lastView = null; A.render(); }
    setInterval(() => { if (!document.hidden) evaluate(); }, 15000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) evaluate(); });
    window.addEventListener("hashchange", () => setTimeout(paint, 50));
  }
  const t0 = setInterval(() => { if (S.user && S.loaded) { clearInterval(t0); start(); } }, 800);
  window.tkGuardianEval = () => evaluate();

  /* ---------- Ajustes › Tu guardián ---------- */
  const RULES = [
    ["maxops", "Operaciones del día", "Te avisa en la penúltima y te dice que pares al llegar a tu máximo."],
    ["loss", "Límite de pérdida del día", "Avisos al ir gastando tu límite y fin de sesión al llegar."],
    ["horario", "Fuera de horario", "Si abres una operación fuera de tu horario."],
    ["stop", "Stop", "Si entras sin stop o lo alejas después de entrar."],
    ["revenge", "Revancha", "Si vuelves a entrar muy poco después de una pérdida."],
    ["lotUp", "Más lotaje tras perder", "Si subes el tamaño justo después de perder."],
    ["streak", "Pérdidas seguidas", "Aplica tu regla («si pierdo dos seguidas, me levanto 15 minutos») con cuenta atrás."],
    ["news", "Noticias fuertes", "Una noticia fuerte de tus mercados está a punto de salir."],
    ["fondeo", "Cuentas de fondeo", "Cuánto te queda para los límites de la empresa."]
  ];
  const NUMS = [["revengeMin", "Revancha: entrar antes de", 1, 60, "min"], ["newsMin", "Noticias: avisar", 1, 60, "min antes"], ["streakMin", "Pausa si tu regla no dice minutos", 1, 120, "min"], ["fondeoWarn", "Fondeo: avisar cuando quede", 5, 90, "%"], ["spamMin", "No repetir el mismo tipo de aviso en", 1, 120, "min"]];
  function card() {
    const c = cfg(), sr = R.streakRule(S.plan || {}), last = G.events.filter(e => e.agent !== "asistente").slice(0, 12);
    const AG = { guardian: "Guardián", analista: "Analista", coach: "Coach", revisor: "Revisor" };
    return `<div class="card stack gdc" style="gap:12px" id="guardian">
      <div class="row" style="justify-content:space-between;align-items:center;gap:10px"><div><h3 style="margin:0">Tu guardián</h3><div class="small muted">Vigila tu sesión con tus normas y te avisa una sola vez, lo más importante primero. No decide por ti ni opina del mercado.</div></div>
        <label class="gdc-sw"><input type="checkbox" data-gdcfg="on" ${c.on ? "checked" : ""}><span>${c.on ? "Encendido" : "Apagado"}</span></label></div>
      ${c.on ? `<div class="gdc-rules">${RULES.map(([k, t, d]) => `<label class="gdc-r"><input type="checkbox" data-gdcfg="${k}" ${c[k] ? "checked" : ""}><span><b>${t}</b><small>${k === "streak" && sr ? "Tu regla: «Si " + esc(sr.txt) + "»" : d}</small></span></label>`).join("")}</div>
      <div class="gdc-n"><label><span>Avisar del límite al</span><span class="gdc-in"><input type="text" inputmode="numeric" data-gdsteps value="${esc((c.lossSteps || []).join(", "))}"><i>% (y fin al 100 %)</i></span></label>
        ${NUMS.map(([k, t, mn, mx, u]) => `<label><span>${t}</span><span class="gdc-in"><input type="number" min="${mn}" max="${mx}" data-gdnum="${k}" value="${esc(c[k])}"><i>${u}</i></span></label>`).join("")}</div>
      <label class="gdc-r"><input type="checkbox" data-gdcfg="push" ${c.push ? "checked" : ""}><span><b>Avisarme también en el móvil</b><small>Con Tickora cerrada, si has activado los avisos en este dispositivo (Gráfico › Alertas › «Avisarme en este dispositivo»).</small></span></label>` : ""}
      <label class="gdc-bad"><span><b>Tu regla para los días malos</b><small>Si duermes mal o llegas mal, «Tu mañana» te la recuerda.</small></span><input type="text" maxlength="160" data-gdbad value="${esc((G.cfg && G.cfg.badRule) || c.badRule)}"></label>
      ${last.length ? `<details class="gdc-h"><summary>Lo que han hecho tus agentes (${last.length})</summary>${last.map(e => `<div class="gdc-e"><span>${new Date(e.ts).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><em>${AG[e.agent] || e.agent}</em><b>${esc(e.title || "")}</b>${e.ack_at ? "<i>visto</i>" : ""}</div>`).join("")}</details>` : ""}
    </div>`;
  }
  async function setCfg(patch) { G.cfg = G.cfg || {}; G.cfg.cfg = Object.assign({}, G.cfg.cfg || {}, patch); await saveCfg(); S.lastView = null; A.render(); evaluate(); }
  const V0 = V && V.ajustes;
  if (V) V.ajustes = {
    view(r) { const h = V0 && V0.view ? V0.view(r) : ""; const i = h.indexOf('<div class="card stack" style="gap:12px" id="unidad">'); return i < 0 ? h + card() : h.slice(0, i) + card() + h.slice(i); },
    bind(r) {
      if (V0 && V0.bind) V0.bind(r);
      document.querySelectorAll("[data-gdcfg]").forEach(i => i.onchange = () => setCfg({ [i.dataset.gdcfg]: i.checked }));
      document.querySelectorAll("[data-gdnum]").forEach(i => i.onchange = () => { const v = +i.value; if (!isFinite(v)) return; setCfg({ [i.dataset.gdnum]: Math.max(+i.min, Math.min(+i.max, v)) }); });
      const st = document.querySelector("[data-gdsteps]"); if (st) st.onchange = () => { const v = st.value.split(/[ ,;]+/).map(Number).filter(x => x > 0 && x < 100).sort((a, b) => a - b).slice(0, 4); setCfg({ lossSteps: v }); };
      const bd = document.querySelector("[data-gdbad]"); if (bd) bd.onchange = async () => { G.cfg = G.cfg || {}; G.cfg.badRule = bd.value.trim().slice(0, 160); await saveCfg(); toast("Guardada tu regla para los días malos"); };
    }
  };
  window.tkBadRule = () => (G.cfg && G.cfg.badRule) || R.DEF.badRule;
})();

/* ---------- coach de mañana, revisor semanal y foco de la semana ---------- */
(function () {
  "use strict";
  const A = window.TKAPP, R = window.TkRules; if (!A || !R) return;
  const { S, sb, esc, toast, todayKey, dayKey, evaluate } = A;
  const X2 = () => window.TK_X2 || {};
  const LBL = { stop: "Entrar siempre con stop", stopmov: "No mover el stop en contra", riesgo: "Respetar tu riesgo", horario: "Operar solo en tu horario", maxops: "Respetar tu máximo de operaciones", limite: "Parar en tu límite del día" };
  const KEYOF = f => /sin stop/i.test(f.bad) ? "stop" : /moviste el stop/i.test(f.bad) ? "stopmov" : /arriesgaste/i.test(f.bad) ? "riesgo" : /horario/i.test(f.bad) ? "horario" : /operación número/i.test(f.bad) ? "maxops" : /límite/i.test(f.bad) ? "limite" : null;
  const monday = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return dayKey(x); };
  const addDays = (k, n) => { const x = new Date(k + "T12:00:00"); x.setDate(x.getDate() + n); return dayKey(x); };

  /* foco aceptado (docs col «foco», id w<lunes>) */
  S.foco = S.foco || null;
  async function loadFoco() { try { const { data } = await sb.from("docs").select("id,data").eq("col", "foco"); S.foco = {}; (data || []).forEach(d => { S.foco[d.id] = d.data; }); } catch (e) { S.foco = S.foco || {}; } }
  window.tkFocoOf = (mon) => (S.foco || {})["w" + mon] || null;
  async function setFoco(mon, k, why) {
    S.foco = S.foco || {}; S.foco["w" + mon] = { k, label: LBL[k] || k, why: why || "", ts: Date.now() };
    await sb.from("docs").upsert({ user_id: S.user.id, col: "foco", id: "w" + mon, data: S.foco["w" + mon], updated_at: new Date().toISOString() });
    window.tkLogEvent && window.tkLogEvent({ agent: "revisor", kind: "foco", key: "foco:" + mon, title: "Foco elegido", msg: `Tu foco para la semana del ${mon}: «${LBL[k] || k}».`, data: { k, week: mon } });
  }

  /* propuesta: la norma más rota o la que más te costó en la semana (cálculo con código, el texto lo escribe Tickora) */
  function proposal(mon) {
    const end = addDays(mon, 6), C = (S.trades || []).filter(t => t.status === "closed" && t.open_time && dayKey(t.open_time) >= mon && dayKey(t.open_time) <= end);
    const cnt = {}, cost = {}; let good = 0, evR = 0;
    C.forEach(t => { const e = evaluate(t); if (e.good) good++; else if (+t.r < 0) evR -= +t.r; e.fail.forEach(f => { const k = KEYOF(f); if (!k) return; cnt[k] = (cnt[k] || 0) + 1; if (+t.r < 0) cost[k] = (cost[k] || 0) - +t.r; }); });
    const most = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0], dear = Object.entries(cost).sort((a, b) => b[1] - a[1])[0];
    const pick = dear && (!most || dear[0] !== most[0]) && dear[1] > 0 ? dear : most;
    return { n: C.length, good, evR, cnt, cost, k: pick ? pick[0] : null, why: pick ? (pick === most ? `la que más rompiste (${most[1]} ${most[1] === 1 ? "vez" : "veces"})` : `la que más te costó (${R.nf(dear[1], 1)} R)`) : null };
  }

  /* bloque para «Lo que te ahorras»: el revisor semanal */
  window.tkFocoBlock = () => {
    if (S.foco === null) { loadFoco().then(() => { if (/^#ahorro/.test(location.hash)) { S.lastView = null; A.render(); } }); return ""; }
    const now = new Date(), mon = monday(now), wd = (now.getDay() + 6) % 7, late = wd >= 4; // desde el viernes se propone la siguiente
    const base = late ? mon : monday(addDays(mon, -7)), target = late ? addDays(mon, 7) : mon, P = proposal(base), have = window.tkFocoOf(target), cur = window.tkFocoOf(mon);
    const opts = Object.keys(LBL).map(k => `<option value="${k}" ${(have ? have.k : P.k) === k ? "selected" : ""}>${LBL[k]}</option>`).join("");
    return `<div class="card sv-c sv-foco"><div class="sv-k">Tu foco de la semana${late ? " que viene" : ""}</div>
      ${cur && !late ? `<p class="sv-fnow">Esta semana trabajas: <b>${esc(cur.label)}</b>.</p>` : ""}
      ${have ? `<p>Has elegido <b>«${esc(have.label)}»</b>${have.why ? `: ${esc(have.why)}` : ""}. Saldrá en tu misión de Disciplina y en «Tu mañana».</p>`
        : P.k ? `<p>Te propongo <b>«${LBL[P.k]}»</b>: es ${P.why} ${late ? "esta semana" : "la semana pasada"}. ${P.n} operaciones, ${Math.round(P.good / P.n * 100)} % dentro del plan; lo evitable te costó ${R.nf(P.evR, 1)} R.</p>`
        : P.n ? `<p>${late ? "Esta semana" : "La semana pasada"} no rompiste ninguna norma en ${P.n} operaciones. Elige una para seguir afinando, si quieres.</p>` : `<p>Cuando operes, aquí te propondré la norma en la que centrarte cada semana.</p>`}
      <div class="sv-frow"><select class="input" data-fsel aria-label="Elegir foco">${opts}</select><button type="button" class="btn" data-fok data-mon="${target}" data-k="${esc(P.k || "")}" data-why="${esc(P.why || "")}">${have ? "Cambiar" : P.k ? "Acepto" : "Elegir"}</button></div></div>`;
  };
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-fok]"); if (b) { const sel = document.querySelector("[data-fsel]"); const k = sel ? sel.value : null; if (!k) return; b.disabled = true; await setFoco(b.dataset.mon, k, k === b.dataset.k ? b.dataset.why : "elegida por ti"); toast("Foco guardado"); S.lastView = null; A.render(); return; }
    if (e.target.closest("[data-hc-commit],[data-pcommit]")) { const d = todayKey(); window.tkLogEvent && window.tkLogEvent({ agent: "coach", kind: "compromiso", key: "compromiso:" + d, title: "Te comprometiste con tu plan", msg: "Compromiso de la mañana registrado." }); }
  });

  /* coach: «Tu mañana» con lo de ayer, tu foco y, si llegas mal, tu regla para días malos */
  window.tkCoachLines = () => {
    try {
      const T = (S.trades || []).filter(t => t.status === "closed" && t.open_time), today = todayKey();
      const lastDay = T.map(t => dayKey(t.open_time)).filter(k => k < today).sort().pop(), L = lastDay ? T.filter(t => dayKey(t.open_time) === lastDay) : [];
      const out = [];
      if (L.length) { const g = L.filter(t => evaluate(t).good).length, r = L.reduce((s, t) => s + (+t.r || 0), 0), wd = new Date(lastDay + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long" }); out.push(`${lastDay === addDays(today, -1) ? "Ayer" : "El " + wd} hiciste ${L.length} ${L.length === 1 ? "operación" : "operaciones"}, ${g === L.length ? "todas dentro del plan" : g + " dentro del plan"} (${r >= 0 ? "+" : "−"}${R.nf(Math.abs(r), 1)} R).`); }
      const f = window.tkFocoOf && window.tkFocoOf(monday(new Date())); if (f) out.push(`Tu foco de esta semana: <b>${esc(f.label)}</b>.`);
      const m = (S.mente || {})[today], X = X2();
      if (m && X.mDone && X.mDone(m) && (X.mScore(m) < 45 || m.r <= 2)) out.push(`Hoy llegas ${m.r <= 2 ? "habiendo dormido poco" : "con cuidado"}. Tu regla para los días malos: <b>«${esc(window.tkBadRule ? window.tkBadRule() : R.DEF.badRule)}»</b>`);
      return out.length ? `<p class="f9-p">${out.slice(0, 3).join(" ")}</p>` : "";
    } catch (e) { return ""; }
  };
  const t0 = setInterval(() => { if (S.user && S.loaded) { clearInterval(t0); loadFoco(); } }, 900);
})();
