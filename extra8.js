/* Tickora · Candado en MetaTrader (18-nov-2026). Lo decide cada usuario, en frío, en Ajustes:
   0 apagado · 1 solo avisar · 2 cerrar la operación al momento · 3 no dejar usar MT5 (cierra MetaTrader).
   La app guarda la configuración en bridge_lock (un texto con «|») y el programa de MT5 (2.0) la lee cada
   pocos segundos y la aplica con los datos de la propia cuenta. Lo que hace el programa vuelve a bridge_lockev.
   Reglas de psicología: endurecer vale al momento; aflojar vale desde mañana; quitarlo hoy pide una frase y
   10 minutos de espera. Tickora nunca abre operaciones. */
(function () {
  "use strict";
  const A = window.TKAPP, V = window.TK_VIEWS, X2 = window.TK_X2;
  if (!A || !V) return;
  const { S, sb, esc, toast, lsGet, lsSet, todayKey, dayKey } = A;
  const md = () => (S.user && S.user.user_metadata) || {};
  const RULES = [
    ["horario", "Fuera de tu horario", p => `Antes de las ${p.start || "—"} y después de las ${p.end || "—"}`],
    ["maxops", "Al hacer tus operaciones del día", p => `Tu máximo es ${p.maxTrades || 3}: la siguiente se cierra`],
    ["limite", "Al llegar a tu límite del día", p => `−${p.dayLimitR || 2} R · hasta mañana`],
    ["dos", "Tras dos pérdidas seguidas", (p, c) => `Durante ${c.dosMin} minutos`],
    ["noticia", "Noticia fuerte de tus mercados", (p, c) => `De ${c.newsMin} min antes a ${c.newsMin} min después`],
    ["chequeo", "Sin chequeo hecho", () => "Hasta que contestes tus preguntas del día"],
    ["semaforo", "Semáforo en rojo", () => "Día delicado o has dicho que quieres recuperar"]
  ];
  const MODES = [
    [0, "Apagado", "Tickora no hace nada en tu MetaTrader."],
    [1, "Solo avisarme", "Sale un aviso grande en MT5 y una alerta si abres una operación. Puedes operar igual."],
    [2, "Cerrar la operación", "Si abres una operación con el candado cerrado, se cierra al momento (te cuesta el spread). Las órdenes pendientes nuevas se borran."],
    [3, "No dejar usar MT5", "Además de cerrar la operación, cierra MetaTrader en tu ordenador; si lo vuelves a abrir, se vuelve a cerrar. En el servidor de MetaQuotes nunca se cierra: sigue vigilando."]
  ];
  const DEF = { mode: 0, r: { horario: 1, maxops: 1, limite: 1, dos: 1, noticia: 1, chequeo: 0, semaforo: 0 }, dosMin: 15, newsMin: 15 };
  const PHRASE = "quiero quitar mi candado";
  const plan = () => S.basePlan || S.plan || {};
  const endOfDay = () => { const d = new Date(); d.setHours(23, 59, 59, 0); return d.getTime(); };
  const hm = ms => new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return dayKey(d); };

  function cfg() {
    const c = JSON.parse(JSON.stringify(Object.assign({}, DEF, md().cand || {})));
    c.r = Object.assign({}, DEF.r, c.r || {});
    if (c.next && c.from && todayKey() >= c.from) { Object.assign(c, c.next, { r: Object.assign({}, DEF.r, c.next.r) }); delete c.next; delete c.from; saveCand(c); }
    return c;
  }
  async function saveCand(c) {
    S.user.user_metadata = Object.assign({}, md(), { cand: c });
    const { error } = await sb.auth.updateUser({ data: { cand: c } }); if (error) toast("No se pudo guardar");
    push(true);
  }
  // ¿el cambio endurece (vale ya) o afloja (vale mañana)?
  const stronger = (n, c) => n.mode >= c.mode && Object.keys(DEF.r).every(k => (+n.r[k] || 0) >= (+c.r[k] || 0)) && n.dosMin >= c.dosMin && n.newsMin >= c.newsMin;
  async function change(patch) {
    const c = cfg(), base = c.next ? Object.assign({}, c, c.next) : c, n = Object.assign({}, base, patch, { r: Object.assign({}, base.r, patch.r || {}) });
    delete n.next; delete n.from;
    const now = { mode: n.mode, r: n.r, dosMin: n.dosMin, newsMin: n.newsMin };
    if (stronger(now, c)) { const out = Object.assign(c, now); delete out.next; delete out.from; await saveCand(out); toast("Hecho: vale desde ahora"); }
    else { c.next = now; c.from = tomorrow(); await saveCand(c); toast("Aflojar el candado vale desde mañana"); }
    S.lastView = null; A.render();
  }

  /* ---------- 1 R en la moneda de la cuenta (para el límite del día en dinero) ---------- */
  // 1 R de tu plan en la moneda de la cuenta (lo compara el programa con las pérdidas del día): riesgo del plan × saldo real
  function oneRAcct() { const pr = A.planRiskBal && A.planRiskBal(); return pr ? Math.round(pr.bal * pr.risk) / 100 : 0; }
  /* ---------- mercados tuyos que mueve una noticia ---------- */
  const mySyms = () => { const s = new Set(); (S.trades || []).filter(t => Date.now() - new Date(t.open_time) < 90 * 864e5).forEach(t => s.add(String(t.symbol || "").toUpperCase())); return [...s]; };
  function moves(sym, cur) {
    const s = sym.replace(/[^A-Z0-9]/g, ""); if (!cur) return false; cur = cur.toUpperCase();
    if (s.includes(cur)) return true;
    if (cur === "USD") return /XAU|XAG|OIL|WTI|BRENT|NAS|US100|USTEC|US500|SPX|US30|DJ|BTC|ETH/.test(s);
    if (cur === "EUR") return /GER|DE40|DAX|FRA|SPA|EU50/.test(s);
    if (cur === "GBP") return /UK100|FTSE/.test(s);
    if (cur === "JPY") return /JPN|NIK/.test(s);
    return false;
  }
  /* ---------- la configuración que lee el programa de MT5 ---------- */
  function build() {
    const c = cfg(), p = plan(), now = Date.now(), r = c.r;
    const manual = Math.max(+lsGet("tk-lock", "0") || 0, +md().lockUntil || 0);
    const off = c.offUntil > now ? [c.offFrom || 0, c.offUntil] : [0, 0];
    const oneR = oneRAcct(), maxLoss = r.limite && oneR ? Math.round((p.dayLimitR || 2) * oneR * 100) / 100 : 0;
    const m = X2 && X2.healthOk && X2.healthOk() ? (S.mente || {})[todayKey()] : null, done = m && X2.mDone && X2.mDone(m);
    const red = done && ((X2.mScore && X2.mScore(m) < 45) || m.intent === "recuperar");
    let horizon = 0, ses = [];
    const mi = s => { const x = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return x ? +x[1] * 60 + +x[2] : null; };
    if (r.horario && mi(p.start) != null && mi(p.end) != null) {
      for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0); const b = d.getTime(); ses.push(`${b + mi(p.start) * 6e4}:${b + mi(p.end) * 6e4}`); if (i === 13) horizon = b + 864e5; }
    }
    const syms = mySyms(), nm = (c.newsMin || 15) * 6e4;
    const news = r.noticia ? ((S.news && S.news.events) || []).filter(e => e.impact === "High" && e.ts > now - nm && (!syms.length || syms.some(s => moves(s, e.country)))).map(e => `${e.ts - nm}:${e.ts + nm}`).slice(0, 80) : [];
    return ["1", c.mode, manual > now ? manual : 0, off[0], off[1], r.maxops ? (p.maxTrades || 3) : 0, maxLoss, r.dos ? c.dosMin : 0,
      r.chequeo ? 1 : 0, done ? endOfDay() : 0, r.semaforo ? 1 : 0, red ? endOfDay() : 0, horizon, ses.join(","), news.join(","), -new Date().getTimezoneOffset()];
  }
  let lastSent = "", lastAt = 0, sending = false;
  async function push(force) {
    if (!S.user || sending) return;
    const c = cfg(); if (!c.mode && !lastSent && !force) return; // nunca activado: no hace falta escribir nada
    const f = build(), key = f.join("|");
    if (!force && key === lastSent && Date.now() - lastAt < 30 * 6e4) return;
    sending = true;
    try {
      const { error } = await sb.from("bridge_lock").upsert({ user_id: S.user.id, cfg: key + "|" + Date.now(), updated_at: new Date().toISOString() });
      if (!error) { lastSent = key; lastAt = Date.now(); }
    } catch (e) { /* lo intenta en la siguiente vuelta */ }
    sending = false;
  }
  window.tkCandPush = push;
  window.tkCandPreview = () => preview();
  setInterval(() => { if (S.loaded && S.user) { if (!S.news && window.tkLoadNews && cfg().r.noticia && cfg().mode) window.tkLoadNews().catch(() => 0); push(false); } }, 15000);

  /* ---------- cómo está ahora (lo mismo que mira el programa, con las operaciones que ve Tickora) ---------- */
  function preview() {
    const c = cfg(); if (!c.mode) return null;
    const f = build(), now = Date.now();
    if (f[3] && now >= f[3] && now < f[4]) return ["off", "Quitado hoy hasta las 23:59"];
    if (f[2]) return ["on", `Bloqueo que pediste, hasta las ${hm(f[2])}`];
    if (f[14] && f[14].split(",").some(w => { const [a, b] = w.split(":").map(Number); return now >= a && now < b; })) return ["on", "Noticia fuerte de tus mercados"];
    if (f[12] > now && !f[13].split(",").some(w => { const [a, b] = w.split(":").map(Number); return now >= a && now < b; })) return ["on", "Fuera de tu horario"];
    if (f[8] && now > f[9]) return ["on", "Aún no has hecho tu chequeo"];
    if (f[10] && now < f[11]) return ["on", "Tu semáforo está en rojo"];
    const T = (S.trades || []).filter(t => dayKey(t.open_time) === todayKey()).sort((a, b) => new Date(a.open_time) - new Date(b.open_time));
    if (f[5] && T.length >= f[5]) return ["on", `Ya hiciste tus ${f[5]} operaciones de hoy`];
    const C = T.filter(t => t.status === "closed"), l2 = C.slice(-2);
    if (f[7] && l2.length === 2 && l2.every(t => +t.r < 0) && now < new Date(l2[1].close_time || l2[1].open_time).getTime() + f[7] * 6e4) return ["on", "Dos pérdidas seguidas"];
    const p = plan(); if (c.r.limite && C.reduce((s, t) => s + (+t.r || 0), 0) <= -(p.dayLimitR || 2)) return ["on", "Has llegado a tu límite del día"];
    return ["open", "Abierto: puedes operar"];
  }
  /* ---------- Tickora te lo propone (con tus datos) ---------- */
  function proposals(c) {
    const out = [], ev = A.evaluate, C = (S.trades || []).filter(t => t.status === "closed" && t.open_time).sort((a, b) => new Date(a.open_time) - new Date(b.open_time));
    if (!c.r.dos && C.length >= 8) {
      let n = 0, bad = 0; for (let i = 2; i < C.length; i++) { if (+C[i - 1].r < 0 && +C[i - 2].r < 0 && dayKey(C[i].open_time) === dayKey(C[i - 1].open_time)) { n++; if (!ev(C[i]).good) bad++; } }
      if (n >= 3 && bad / n >= .5) out.push(["dos", `Tras dos pérdidas seguidas rompes el plan ${bad} de cada ${n} veces.`]);
    }
    if (!c.r.horario) { const n = C.filter(t => Date.now() - new Date(t.open_time) < 30 * 864e5 && ev(t).fail.some(f => /horario/i.test(f.bad || ""))).length; if (n >= 2) out.push(["horario", `En 30 días has operado ${n} veces fuera de tu horario.`]); }
    if (!c.r.maxops) { const by = {}; C.forEach(t => { const k = dayKey(t.open_time); by[k] = (by[k] || 0) + 1; }); const n = Object.values(by).filter(v => v > (plan().maxTrades || 3)).length; if (n >= 2) out.push(["maxops", `${n} días te has pasado de tu máximo de operaciones.`]); }
    return out.slice(0, 2);
  }
  let evs = null, evLoading = false;
  async function loadEvents() {
    if (evLoading) return; evLoading = true;
    try { const { data } = await sb.from("bridge_lockev").select("ts,kind,sym,reason,cost").order("ts", { ascending: false }).limit(8); evs = data || []; } catch (e) { evs = []; }
    evLoading = false; if (location.hash === "#ajustes") { S.lastView = null; A.render(); }
  }
  const WHY = { manual: "bloqueo que pediste", horario: "fuera de horario", noticia: "noticia fuerte", maxops: "máximo de operaciones", limite: "límite del día", dos: "dos pérdidas seguidas", chequeo: "sin chequeo", semaforo: "semáforo en rojo" };
  const KIND = { cerrada: "Operación cerrada", aviso: "Aviso", orden: "Orden pendiente borrada", mt5: "MetaTrader cerrado", sinpermiso: "No pudo cerrar (falta «Trading algorítmico»)" };

  function card() {
    const c = cfg(), p = plan(), now = Date.now(), b = S.bridge || (S.bridges || [])[0], ver = parseFloat(((b || {}).last_info || {}).version || "0");
    const pv = preview(), pend = c.next, hOk = X2 && X2.healthOk && X2.healthOk(), one = oneRAcct();
    if (evs === null) loadEvents();
    const mt5Note = !b ? `<div class="cd-warn">Aún no has conectado MetaTrader 5. El candado funciona con el programa de Tickora en tu MT5 (más abajo, «Conectar MetaTrader 5»).</div>`
      : ver < 2 ? `<div class="cd-warn">Tu programa de MT5 es la versión ${esc(String(ver || "antigua"))}. Instala la <b>2.0</b> (más abajo, «Conectar MetaTrader 5») para que el candado funcione.</div>` : "";
    const offNow = c.offFrom && c.offUntil > now;
    return `<div class="card stack cd" style="gap:14px" id="candado">
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap"><div><div class="cd-eye">Tu compromiso, en frío</div><h3 style="margin:2px 0 0">Tu candado en MetaTrader</h3></div>
        ${pv ? `<span class="cd-state ${pv[0]}">${pv[0] === "on" ? "Cerrado" : pv[0] === "off" ? "Quitado hoy" : "Abierto"} · ${esc(pv[1])}</span>` : ""}</div>
      <div class="small muted">Cuando se cumple una de tus normas, el programa de Tickora en tu MT5 actúa como elijas. Tickora nunca abre operaciones.</div>
      ${mt5Note}
      <div class="cd-modes" role="radiogroup" aria-label="Qué hace el candado">${MODES.map(([k, l, d]) => `<button type="button" role="radio" class="cd-mode${c.mode === k ? " on" : ""}" data-cdmode="${k}" aria-checked="${c.mode === k}"><b>${l}</b><small>${d}</small></button>`).join("")}</div>
      ${c.mode ? `<div><div class="cd-sub">Cuándo se cierra el candado</div>
        ${RULES.map(([k, l, d]) => { const dis = (k === "chequeo" || k === "semaforo") && !hOk, lim = k === "limite" && !one; return `<label class="cd-rule${dis ? " dis" : ""}"><span><b>${l}</b><small>${dis ? "Necesita el chequeo diario activado (Ajustes › Permisos)" : lim ? "Tickora aún no sabe tu saldo: añade tu cuenta o conecta MT5" : d(p, c)}</small></span><input type="checkbox" class="cd-sw" data-cdrule="${k}" ${c.r[k] ? "checked" : ""} ${dis ? "disabled" : ""}></label>`; }).join("")}
        <div class="row" style="gap:16px;flex-wrap:wrap;margin-top:10px"><label class="small">Pausa tras dos pérdidas <select data-cdnum="dosMin">${[10, 15, 30, 60].map(v => `<option value="${v}" ${c.dosMin === v ? "selected" : ""}>${v} min</option>`).join("")}</select></label>
          <label class="small">Margen en noticias <select data-cdnum="newsMin">${[5, 10, 15, 30].map(v => `<option value="${v}" ${c.newsMin === v ? "selected" : ""}>${v} min</option>`).join("")}</select></label></div></div>` : ""}
      ${pend ? `<div class="cd-pend">Desde mañana: ${esc(MODES.find(m => m[0] === pend.mode)[1])}${Object.keys(DEF.r).filter(k => !!pend.r[k] !== !!c.r[k]).map(k => ` · ${pend.r[k] ? "con" : "sin"} «${RULES.find(x => x[0] === k)[1].toLowerCase()}»`).join("")}. Aflojar el candado nunca vale el mismo día. <button type="button" data-cdundo>Deshacer</button></div>` : ""}
      ${proposals(c).filter(([k]) => !lsGet("tk-cdskip-" + k, "")).map(([k, t]) => `<div class="cd-prop"><span class="cd-tag">Tickora te lo propone</span><p>${esc(t)}</p><div class="row" style="gap:8px"><button type="button" class="btn sm" data-cdprop="${k}">Añadir esta norma</button><button type="button" class="btn ghost sm" data-cdskip="${k}">Ahora no</button></div></div>`).join("")}
      ${c.mode ? `<div class="cd-off">${offNow ? (now < c.offFrom ? `Se quitará a las <b>${hm(c.offFrom)}</b> y volverá mañana. <button type="button" data-cdoffcancel>Mejor no</button>` : `Quitado hoy. Vuelve mañana. <button type="button" data-cdoffcancel>Volver a ponerlo ya</button>`)
        : `<details><summary>Quitarlo hoy</summary><p class="small muted">Escribe «${PHRASE}». Se quitará dentro de 10 minutos y volverá mañana. Queda anotado.</p><div class="row" style="gap:8px"><input type="text" data-cdphrase placeholder="${PHRASE}" aria-label="Frase para quitar el candado" autocomplete="off"><button type="button" class="btn ghost sm" data-cdoff>Quitar hoy</button></div></details>`}</div>` : ""}
      ${evs && evs.length ? `<div><div class="cd-sub">Lo que ha hecho tu candado</div>${evs.map(e => `<div class="cd-ev"><span>${new Date(e.ts).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><b>${esc(KIND[e.kind] || e.kind)}${e.sym ? " · " + esc(e.sym) : ""}</b><small>${esc(WHY[e.reason] || "")}${e.cost != null && +e.cost ? " · " + (+e.cost).toFixed(2) : ""}</small></div>`).join("")}</div>` : ""}
      <div class="small muted" style="border-top:1px solid var(--linea);padding-top:10px">Funciona mientras MetaTrader esté abierto con el programa de Tickora y «Trading algorítmico» activado (o en el servidor de MetaQuotes, que vigila las 24 horas, también lo que abras desde el móvil). Antes de usarlo en una cuenta de fondeo, mira que su normativa permita programas que cierran operaciones.</div></div>`;
  }
  const V0 = V.ajustes;
  V.ajustes = {
    view(r) {
      const h = V0 && V0.view ? V0.view(r) : "";
      const i = h.indexOf('<div class="card stack" style="gap:12px" id="unidad">');
      return i < 0 ? h + card() : h.slice(0, i) + card() + h.slice(i);
    },
    bind(r) {
      if (V0 && V0.bind) V0.bind(r);
      const q = s => document.querySelectorAll(s);
      q("[data-cdmode]").forEach(b => b.onclick = () => change({ mode: +b.dataset.cdmode }));
      q("[data-cdrule]").forEach(i => i.onchange = () => change({ r: { [i.dataset.cdrule]: i.checked ? 1 : 0 } }));
      q("[data-cdnum]").forEach(s => s.onchange = () => change({ [s.dataset.cdnum]: +s.value }));
      q("[data-cdprop]").forEach(b => b.onclick = () => change({ r: { [b.dataset.cdprop]: 1 } }));
      q("[data-cdskip]").forEach(b => b.onclick = () => { lsSet("tk-cdskip-" + b.dataset.cdskip, "1"); S.lastView = null; A.render(); });
      const u = document.querySelector("[data-cdundo]"); if (u) u.onclick = async () => { const c = cfg(); delete c.next; delete c.from; await saveCand(c); S.lastView = null; A.render(); };
      const o = document.querySelector("[data-cdoff]"); if (o) o.onclick = async () => {
        const v = (document.querySelector("[data-cdphrase]").value || "").trim().toLowerCase();
        if (v !== PHRASE) { toast(`Escribe exactamente «${PHRASE}»`); return; }
        const c = cfg(); c.offFrom = Date.now() + 10 * 6e4; c.offUntil = endOfDay(); c.unlocks = (+c.unlocks || 0) + 1; await saveCand(c); S.lastView = null; A.render();
      };
      const oc = document.querySelector("[data-cdoffcancel]"); if (oc) oc.onclick = async () => { const c = cfg(); c.offFrom = 0; c.offUntil = 0; await saveCand(c); S.lastView = null; A.render(); };
    }
  };
  if (S.loaded && location.hash === "#ajustes") { S.lastView = null; A.render(); }
})();
