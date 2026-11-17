/* Tickora · Inicio por momentos (18-nov-2026). Las 7 ideas de la revisión de Inicio:
   1 la portada cambia con la hora (antes, durante y después de tu sesión) · 2 tu nombre · 3 cuadros sencillos
   (un dato y una acción) · 4 sin repetir lo de Mi día · 5 solo lo que ya tiene algo que decir y el resto «se
   desbloquea con…» · 6 primeros pasos · 7 de dónde sale el dinero del límite.
   La vista de siempre (carrusel) y la de cuadros siguen disponibles con el selector de arriba a la derecha. */
(function () {
  "use strict";
  const A = window.TKAPP, V = window.TK_VIEWS, X2 = window.TK_X2, X3 = window.TK_X3;
  if (!A || !V || !X2 || !X2.heroQ) return;
  const { S, sb, esc, toast, lsGet, lsSet, dayKey, todayKey, evaluate, fmtV, fmtVabs, fmtLim } = A;
  const MODE = () => lsGet("tk-home3", "fase");
  const V0 = V.inicio;
  const I = (d, s) => `<svg viewBox="0 0 20 20" width="${s || 16}" height="${s || 16}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const hm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const dur = min => min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? " " + (min % 60) + " min" : ""}` : `${Math.max(1, min)} min`;
  const realName = () => !!(S.user && S.user.user_metadata && S.user.user_metadata.name);
  const first = () => esc((S.name || "").split(" ")[0] || "trader");

  /* ---------- selector de vista (3 opciones) ---------- */
  const sw = m => `<div class="hx-sw" role="group" aria-label="Vista de la portada">
    <button type="button" data-home3="fase" aria-pressed="${m === "fase"}" title="Según el momento del día">${I('<circle cx="10" cy="10" r="6.5"/><path d="M10 6.5V10l2.5 1.5"/>', 15)}</button>
    <button type="button" data-home3="car" aria-pressed="${m === "car"}" title="Vista conversación">${I('<rect x="6" y="5" width="8" height="10" rx="2"/><path d="M3 7v6M17 7v6"/>', 15)}</button>
    <button type="button" data-home3="grid" aria-pressed="${m === "grid"}" title="Vista de cuadros">${I('<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/>', 15)}</button></div>`;

  /* ---------- 6 · primeros pasos ---------- */
  function steps() {
    const P = S.menteP || {}, acc = (S.accts || []).length > 0, mt5 = (S.bridges || []).length > 0, planOk = !!S.planDoc;
    const L = [["Hacer el Conócete", "#conocete", P.v === 2, "2 minutos para que Tickora te conozca"], ["Poner tu plan", "#plan", planOk, "Tus normas: operaciones, límite y horario"],
      ["Añadir tu cuenta", "#cartera", acc, "Para que el límite del día sea exacto"], ["Conectar tu MT5", "#ajustes", mt5, "Tus operaciones llegan solas"]];
    const done = L.filter(x => x[2]).length; if (done === L.length || lsGet("tk-steps-off", "")) return "";
    return `<section class="f9-steps" aria-label="Primeros pasos"><div class="f9-row"><span class="f9-tag t">Primeros pasos · ${done} de ${L.length}</span><span class="f9-m">Así Tickora funciona de verdad contigo</span><button type="button" class="f9-x" data-f9="stepsoff" aria-label="Ocultar primeros pasos">${I('<path d="M5 5l10 10M15 5L5 15"/>', 14)}</button></div>
      <div class="f9-sg">${L.map(([t, h, ok, d], i) => `<a class="f9-st${ok ? " ok" : ""}" href="${h}"><i>${ok ? I('<path d="M5 10.5l3 3 7-7"/>', 13) : i + 1}</i><span>${t}<small>${ok ? "Hecho" : d}</small></span></a>`).join("")}</div></section>`;
  }
  /* ---------- 3 · cuadros sencillos ---------- */
  function tiles(D) {
    const sess = (D.sess || [])[0], q = S.quotes || {}, sym = (window.TkChart && TkChart.current && TkChart.current.sym) || lsGet("tk-sym", "") || "XAUUSD", qq = q[sym];
    const nC = (S.trades || []).filter(t => t.status === "closed").length, pages = (D.pages || []).length;
    const mon = (S.trades || []).filter(t => t.status === "closed" && dayKey(t.open_time).slice(0, 7) === todayKey().slice(0, 7)), mr = mon.reduce((s, t) => s + (+t.r || 0), 0);
    const T = [["Gráfico", qq && qq.last ? A.num(qq.last, qq.last > 100 ? 2 : 5) : sym, qq && qq.last ? sym : "Tu mercado", "#analizar", "Abrir el gráfico"],
      ["Backtesting", sess ? esc(sess.sym || sess.symbol || "Sesión") : "Practica", sess ? esc(sess.name || "") : "sin arriesgar dinero", "#backtest", sess ? "Continuar sesión" : "Nueva sesión"],
      ["Psicología", nC >= 20 ? "Tus dos versiones" : `${nC}`, nC >= 20 ? "listas" : "de 20 operaciones", "#comofuncionas", "Cómo funcionas tú"],
      ["Diario", String(pages), pages === 1 ? "página" : "páginas", "#diario", "Escribir hoy"],
      ["Calendario", mon.length ? fmtV(mr) : "—", mon.length ? A.MESES_L ? A.MESES_L[new Date().getMonth()] : "este mes" : "sin días operados", "#calendario", "Ver el mes"]];
    return `<section aria-label="Tus apartados"><h2 class="f9-lbl">Tus apartados</h2><div class="f9-tiles">${T.map(([n, v, s, h, a]) => `<a class="f9-tile" href="${h}"><span class="f9-n">${n}</span><span class="f9-v">${v}<small>${s}</small></span><span class="f9-a">${a} →</span></a>`).join("")}</div></section>`;
  }
  /* ---------- 5 · para aprender: solo lo que ya tiene algo que decir ---------- */
  function learn(D) {
    const X = X2.dayX(D), C = (S.trades || []).filter(t => t.status === "closed"), n = C.length, now = Date.now();
    const ev7 = C.filter(t => now - new Date(t.open_time) < 7 * 864e5 && (!evaluate(t).good || +t.r < 0)).length;
    const evM = C.filter(t => dayKey(t.open_time).slice(0, 7) === todayKey().slice(0, 7) && !evaluate(t).good).length;
    const show = [], lock = [];
    if (X.focus && /lf-hd/.test(X.focus)) show.push(X.focus);
    if (ev7) show.push(X.learn); else lock.push(["La operación para aprender", "cuando tengas una pérdida o una operación fuera del plan", 0]);
    if (n >= 15) show.push(X.disc); else lock.push(["Tus patrones", `con 15 operaciones · llevas ${n}`, n / 15]);
    if (evM) show.push(X.cost); else lock.push(["Precio de lo evitable", "con tu primera operación fuera del plan del mes", 0]);
    if (n < 20) lock.push(["Tus dos versiones", `con 20 operaciones · llevas ${n}`, n / 20]);
    if (!show.length && !lock.length) return "";
    return `<section aria-label="Para aprender más rápido"><h2 class="f9-lbl">Para aprender más rápido</h2>
      ${show.length ? `<div class="hd-g f9-learn" style="grid-template-columns:repeat(${show.length === 4 ? 2 : Math.min(show.length, 3)},minmax(0,1fr))">${show.join("")}</div>` : ""}
      ${lock.length ? `<div class="f9-lock">${lock.map(([t, d, p]) => `<div><b>${t}</b><span>Se desbloquea ${d}</span>${p ? `<i><u style="width:${Math.round(Math.min(1, p) * 100)}%"></u></i>` : ""}</div>`).join("")}</div>` : ""}</section>`;
  }
  /* ---------- 7 · tus normas de hoy (y de dónde sale el dinero) ---------- */
  function rules(D) {
    const p = D.p, acc = (S.accts || []).length > 0;
    return `<div class="f9-card"><h2 class="f9-lbl">Tus normas de hoy</h2><ul class="f9-rules"><li>Máximo <b>${p.maxTrades || 3} operaciones</b></li><li>Límite del día <b>${fmtLim(p.dayLimitR || 2)}</b></li><li>Horario <b>${esc(p.start)} – ${esc(p.end)}</b></li></ul>
      ${!acc && A.moneyOn && A.moneyOn() ? `<p class="f9-note">El dinero está calculado con tus operaciones. <a href="#cartera">Añade tu cuenta</a> para que sea exacto.</p>` : ""}<a class="f9-link" href="#plan">Ver mi plan →</a></div>`;
  }
  /* ---------- tu mañana (versión sencilla; la «parte de la mañana» completa llegará después) ---------- */
  function morning(D) {
    const nh = (D.todayEv || []).filter(e => e.impact === "High"), inS = nh.filter(e => { const m = A.minOfDate(e.ts); return m >= D.a - 15 && m <= D.b + 15; });
    const prev = Object.keys(S.dlog || {}).filter(k => /^d\d/.test(k) && k.slice(1) < todayKey()).sort().pop(), ayer = prev && S.dlog[prev].close && S.dlog[prev].close.manana;
    const rule = (S.basePlan && S.basePlan.rules || [])[0];
    const head = inS.length ? `Hoy hay ${inS.length === 1 ? "una noticia fuerte" : inS.length + " noticias fuertes"} dentro de tu horario: ${inS.slice(0, 2).map(e => `${esc(e.title)} a las ${new Date(e.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`).join(" y ")}.`
      : nh.length ? "Las noticias fuertes de hoy caen fuera de tu horario." : "Hoy no hay noticias fuertes.";
    return `<div class="f9-card f9-morn"><h2 class="f9-lbl">Tu mañana · la escribe Tickora</h2><p class="f9-serif">${head}</p>
      <p class="f9-p">${rule ? `Tu regla: si ${esc(rule.si)} ${esc(rule.entonces)}` : ""}${ayer ? ` Ayer te dijiste: <i>«${esc(ayer)}»</i>.` : ""}</p>
      <div class="f9-row">${S.planOk && S.planOk.day === todayKey() ? `<span class="f9-ok">${I('<path d="M5 10.5l3 3 7-7"/>', 14)} Te comprometiste a las ${new Date(S.planOk.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>` : `<button type="button" class="x-ch pri" data-hc-commit>Me comprometo hoy</button>`}<a class="f9-link" href="#hoy">Ver Mi día</a></div></div>`;
  }
  /* ---------- 1 · durante tu sesión ---------- */
  function during(D) {
    const p = D.p, mx = p.maxTrades || 3, used = D.today.length, L = p.dayLimitR || 2, dr = D.st.n ? D.st.tot : 0, margin = Math.max(0, L + Math.min(0, dr));
    const X = X2.dayX(D), last = D.today.slice().sort((a, b) => new Date(b.open_time) - new Date(a.open_time))[0];
    const span = Math.max(1, D.b - D.a), x = m => Math.max(0, Math.min(100, (m - D.a) / span * 100));
    const zones = (D.todayEv || []).filter(e => e.impact === "High").map(e => A.minOfDate(e.ts)).filter(m => m >= D.a - 15 && m <= D.b + 15);
    const cand = window.tkCandPreview ? window.tkCandPreview() : null;
    return `<div class="f9-cab">${X.sem}
      <div class="f9-card"><h2 class="f9-lbl">Operaciones</h2><div class="f9-big">${used}<small>de ${mx}</small></div><div class="f9-dots">${Array.from({ length: Math.max(mx, used) }, (_, i) => { const t = D.today.slice().sort((a, b) => new Date(a.open_time) - new Date(b.open_time))[i]; return `<i class="${t ? (t.status === "closed" && !evaluate(t).good ? "bad" : "ok") : ""}">${t ? "" : i + 1}</i>`; }).join("")}</div></div>
      <div class="f9-card"><h2 class="f9-lbl">Aún puedes perder</h2><div class="f9-big">${margin > 0 ? fmtVabs(margin) : "0"}</div><div class="f9-bar"><u style="width:${Math.round(margin / L * 100)}%"></u></div></div>
      <div class="f9-card"><h2 class="f9-lbl">Resultado de hoy</h2><div class="f9-big">${fmtV(dr, D.st.mt)}</div><small class="f9-m">${last ? esc(last.symbol) + " · " + new Date(last.open_time).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "Aún sin operaciones"}</small></div></div>
      <div class="f9-g2"><div class="f9-card"><h2 class="f9-lbl">Tu sesión · ${esc(p.start)} – ${esc(p.end)}</h2>
        <div class="f9-tl">${zones.map(m => `<i class="z" style="left:${x(m - 15)}%;width:${x(m + 15) - x(m - 15)}%"></i>`).join("")}${D.today.map(t => `<i class="o${t.status === "closed" && !evaluate(t).good ? " bad" : ""}" style="left:${x(A.minOfDate(t.open_time))}%"></i>`).join("")}<i class="now" style="left:${x(D.now)}%"></i></div>
        <div class="f9-tlx"><span>${esc(p.start)}</span><span>${zones.length ? `No entres de ${hm(zones[0] - 15)} a ${hm(zones[0] + 15)}` : "Sin noticias fuertes en tu horario"}</span><span>${esc(p.end)}</span></div></div>
        <div class="f9-card f9-cand${cand && cand[0] === "on" ? " on" : ""}">${I('<rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>', 22)}<div><b>${!cand ? "Candado en MetaTrader apagado" : cand[0] === "on" ? "Candado cerrado" : cand[0] === "off" ? "Candado quitado hoy" : "Candado activo en tu MT5"}</b><small>${!cand ? "Puedes activarlo en Ajustes: tú decides cuándo no te deja operar." : esc(cand[1])}</small></div><a class="f9-link" href="#ajustes">${cand ? "Ajustes" : "Activar"}</a></div></div>
      <div class="f9-row f9-acts"><button type="button" class="x-ch pri" data-hx="pause">Pausa</button><button type="button" class="x-ch" data-f9="emo">Registrar emoción</button><a class="x-ch" href="#analizar">Abrir el gráfico</a><a class="x-ch" href="#hoy">Ver Mi día completo</a></div>`;
  }
  /* ---------- 1 · después de tu sesión ---------- */
  function after(D) {
    const T = D.today.slice().sort((a, b) => new Date(a.open_time) - new Date(b.open_time)), bad = T.filter(t => t.status === "closed" && !evaluate(t).good);
    const k = todayKey(), cl = (X3 && X3.dlogOf ? X3.dlogOf(k).close : null) || {};
    const learnTxt = !T.length ? "Hoy no operaste. Si era lo que tocaba, también es una partida ganada." : bad.length ? `La operación de las ${new Date(bad[0].open_time).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} se salió de tu plan: ${esc((evaluate(bad[0]).fail[0] || {}).bad || "revísala")}.` : `${T.length === 1 ? "Tu operación fue" : "Todas tus operaciones fueron"} dentro del plan. Eso es lo que cuenta.`;
    const fld = (key, label, ph) => `<label class="f9-f"><span>${label}</span><textarea data-f9c="${key}" rows="2" placeholder="${ph}">${esc(cl[key] || "")}</textarea></label>`;
    return `<div class="f9-g2 f9-after"><div class="f9-card"><h2 class="f9-lbl">Tus operaciones de hoy</h2>
        ${T.length ? T.map(t => { const ok = t.status !== "closed" || evaluate(t).good; return `<a class="f9-op" href="#op/${encodeURIComponent(t.id)}"><span>${esc(t.symbol)} · ${t.type === "buy" || /buy|compra/i.test(t.side || t.type || "") ? "compra" : "venta"} · ${new Date(t.open_time).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span><span><em class="f9-tag ${ok ? "b" : "r"}">${t.status !== "closed" ? "Abierta" : ok ? "Dentro del plan" : "Evitable"}</em>${t.status === "closed" ? fmtV(+t.r || 0) : ""}</span></a>`; }).join("") : `<p class="f9-m">Hoy no has operado.</p>`}
        <div class="f9-learnt"><span class="f9-tag">Lo que aprendiste hoy</span><p class="f9-serif">${learnTxt}</p></div></div>
      <div class="f9-card f9-close"><h2 class="f9-lbl">Cierre del día · 2 minutos</h2>${fld("bien", "Lo que hiciste bien", "Escribe o dicta…")}${fld("mejor", "Lo que mejorarías", "Escribe o dicta…")}${fld("manana", "Una cosa para mañana", "Mañana la verás aquí al empezar")}
        <div class="f9-row"><button type="button" class="x-ch pri" data-f9="close">${cl.ts ? "Guardar cambios" : "Guardar mi cierre"}</button>${cl.ts ? `<span class="f9-ok">${I('<path d="M5 10.5l3 3 7-7"/>', 14)} Guardado</span>` : `<span class="f9-m">+1 punto a tus objetivos</span>`}</div></div></div>
      <div class="f9-row f9-acts"><a class="x-ch" href="#diario">Ver el día en tu diario</a><a class="x-ch" href="#comofuncionas">Cómo funcionas tú</a><a class="x-ch" href="#backtest">Practicar en backtesting</a></div>`;
  }
  function view() {
    X2.loadAll();
    const D = X2.hData(), ph = D.phase, h = new Date().getHours(), hi = h < 6 ? "Buenas noches" : h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
    const toStart = D.a - D.now, toEnd = D.b - D.now, nm = first();
    const T = D.today, bad = T.filter(t => t.status === "closed" && !evaluate(t).good).length;
    const title = ph === "antes" ? `${hi}, ${nm}.<br><em>Tu sesión empieza a las ${esc(D.p.start)}</em>`
      : ph === "en" ? (bad ? `Para un momento, ${nm}. <em>Ya llevas una fuera del plan.</em>` : T.length ? `Vas bien, ${nm}. <em>${T.length === 1 ? "Una operación" : T.length + " operaciones"}, dentro del plan.</em>` : `${hi}, ${nm}. <em>Estás en tu horario.</em>`)
      : `${hi}, ${nm}.<br><em>${!T.length ? "Hoy no has operado." : bad ? "Hoy se te escapó alguna." : "Partida ganada: todo dentro del plan."}</em>`;
    const sub = ph === "antes" ? `Faltan ${dur(toStart)}. Antes de operar: tu chequeo y tu mañana.` : ph === "en" ? `Quedan ${dur(toEnd)} de sesión.` : T.length ? `${T.length} ${T.length === 1 ? "operación" : "operaciones"} · ${fmtV(D.st.n ? D.st.tot : 0, D.st.mt)}` : "Tu horario ha terminado: toca revisar, no operar.";
    const pill = `${cap(new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }))} · ${ph === "antes" ? "Antes de tu sesión" : ph === "en" ? "En sesión" : "Sesión terminada"}`;
    const nameAsk = !realName() ? `<button type="button" class="f9-name" data-f9="name">¿Cómo te llamas?</button>` : "";
    return `<div class="f9" data-ph="${ph}"><div class="hx-top"><span class="hx-pill"><i class="f9-ph ${ph}"></i>${pill}</span>${sw("fase")}</div>
      <header class="f9-hero"><h1 class="f9-hi">${title}</h1><p class="f9-sub">${sub}${nameAsk}</p>
        ${ph !== "despues" ? `<div class="hx-q" id="hxq" aria-live="polite">${X2.heroQ(D)}</div>` : ""}</header>
      <div class="f9-body">
      ${ph === "antes" ? `${steps()}<div class="f9-g2">${morning(D)}${rules(D)}</div>${tiles(D)}${learn(D)}`
        : ph === "en" ? `${during(D)}${steps()}`
        : `${after(D)}${steps()}${tiles(D)}${learn(D)}`}
      </div></div>`;
  }
  function bind() {
    document.querySelectorAll("[data-home3]").forEach(b => b.onclick = () => { const m = b.dataset.home3; lsSet("tk-home3", m); if (m !== "fase") lsSet("tk-home", m); S.lastView = null; A.render(); });
    if (MODE() !== "fase") return;
    if (X2.bindHero) X2.bindHero(); if (X2.bindDay) X2.bindDay(); if (X2.bindWidgets) X2.bindWidgets(document);
    if (X2.loadMente) X2.loadMente(); if (X2.loadPlanOk) X2.loadPlanOk(); if (X2.loadMini) X2.loadMini();
    if (!S.news && window.tkLoadNews) window.tkLoadNews().then(rep).catch(() => 0);
    if (X3 && X3.loadAllD && !S.d3Loaded) Promise.resolve(X3.loadAllD()).then(rep).catch(() => 0);
    const root = document.querySelector(".f9"); if (!root || root.__b) return; root.__b = true;
    root.addEventListener("click", async e => {
      const b = e.target.closest("[data-f9]"); if (!b) return; const k = b.dataset.f9;
      if (k === "stepsoff") { lsSet("tk-steps-off", "1"); rep(); }
      else if (k === "emo") { if (window.tkEmoModal) window.tkEmoModal(); }
      else if (k === "name") { const n = (prompt("¿Cómo quieres que te llame Tickora?", "") || "").trim().slice(0, 40); if (!n) return; S.name = n; S.user.user_metadata = Object.assign({}, S.user.user_metadata, { name: n }); await sb.auth.updateUser({ data: { name: n } }); toast("Encantado, " + n.split(" ")[0]); rep(); }
      else if (k === "close") {
        const v = {}; root.querySelectorAll("[data-f9c]").forEach(t => { v[t.dataset.f9c] = t.value.trim(); });
        if (!v.bien && !v.mejor && !v.manana) { toast("Escribe al menos una cosa"); return; }
        if (X3 && X3.setDlog) { await X3.setDlog(todayKey(), { close: Object.assign({}, v, { ts: Date.now() }) }); toast("Cierre guardado. Mañana verás tu frase al empezar"); rep(); }
      }
    });
  }
  let rq = 0; const rep = () => { cancelAnimationFrame(rq); rq = requestAnimationFrame(() => { if ((location.hash === "#inicio" || location.hash === "" || location.hash === "#") && MODE() === "fase") { S.lastView = null; A.render(); } }); };
  V.inicio = {
    view(r) {
      if (MODE() !== "fase") { const h = V0.view(r); return h.replace(/<div class="hx-sw"[\s\S]*?<\/div>/, sw(MODE())); }
      return view();
    },
    bind(r) {
      if (MODE() !== "fase") { V0.bind(r); bind(); return; }
      bind();
    }
  };
  // repintar cada minuto (el momento del día cambia solo)
  setInterval(() => { if (document.visibilityState === "visible" && document.querySelector(".f9") && !document.querySelector(".f9 textarea:focus,.f9 #hxq :focus")) rep(); }, 60000);
  if (S.loaded && (location.hash === "#inicio" || !location.hash)) { S.lastView = null; A.render(); }
})();
