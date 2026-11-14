/* Tickora · Aprender: los cuatro tipos de operación, el detective del error, el catálogo de errores
   y «Tu libro» (pestaña del Diario). Depende de TKAPP, TK_X, TK_X2, TK_X3. */
(function () {
  "use strict";
  const A = window.TKAPP, X = window.TK_X, X2 = window.TK_X2, X3 = window.TK_X3, V = window.TK_VIEWS;
  if (!A || !X || !X2 || !X3 || !V) return;
  const { S, esc, fmtV, dayKey, todayKey, evaluate, toast } = A;
  const { $$, closed } = X;
  const { re, dateOf, EMOL, healthOk } = X2;
  const DAY = 864e5;
  const svg = (p, s = 22, w = 1.7) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const tsOf = t => new Date(t.close_time || dateOf(t)).getTime();
  const hhmm = t => new Date(t.open_time || dateOf(t)).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const wday = t => new Date(dateOf(t)).toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");

  /* ---------------- los cuatro tipos ---------------- */
  const TYPES = {
    ok: { l: "Bien hecha", d: "Hiciste lo que tocaba y salió bien. Esto es lo que quieres repetir.", q: "Seguir el plan y ganar: así se construye la confianza.", ic: '<path d="M4 12l5 5L20 6"/>' },
    bp: { l: "Buena pérdida", d: "Seguiste el plan y aun así perdiste. Es normal y forma parte del juego: no cambies nada por una pérdida así.", q: "Perder así es hacerlo bien.", ic: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>' },
    su: { l: "Suerte peligrosa", d: "Ganaste rompiendo tus reglas. Parece un acierto, pero te enseña a repetir lo que tarde o temprano te hará perder.", ic: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/>' },
    er: { l: "Error", d: "Rompiste el plan y perdiste. Aquí está lo que más puedes aprender: descubre qué falló.", ic: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.01"/>' }
  };
  const TK = ["ok", "bp", "su", "er"];
  function typeOf(t) { if (!t || t.status !== "closed") return null; const g = evaluate(t).good, w = (+t.r || 0) >= 0; return g ? (w ? "ok" : "bp") : (w ? "su" : "er"); }
  window.tkTypeOf = typeOf;

  /* ---------------- errores ---------------- */
  const AREAS = [
    ["anal", "Análisis", "Leí mal el gráfico", '<path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/>'],
    ["entr", "Entrada", "Entré mal o pronto", '<path d="M5 12h12M13 6l6 6-6 6"/>'],
    ["gest", "Gestión", "Stop o tamaño", '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>'],
    ["sal", "Salida", "Salí mal o tarde", '<path d="M19 12H7M11 6l-6 6 6 6"/>'],
    ["cab", "Cabeza", "Emoción, prisa", '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c1 1.3 2.2 1.8 3.5 1.8s2.5-.5 3.5-1.8M9 9.5v.01M15 9.5v.01"/>']
  ];
  const AREA = Object.fromEntries(AREAS.map(a => [a[0], a]));
  const E = (id, a, say, tu, name, rule, les) => ({ id, a, say, tu, name, rule, les });
  const ERR = [
    E("fakesig", "anal", "Vi una señal que no era", "Viste una señal que no era", "Ver señales que no eran", "Si la señal no cumple todos los puntos de mi estrategia → no es mi señal.", "Cuando tienes ganas de operar, el ojo encuentra señales en todas partes. Decide tu lista de condiciones, no tus ganas."),
    E("trend", "anal", "Fui contra la tendencia", "Fuiste contra la tendencia", "Operar contra la tendencia", "Si voy contra la tendencia del marco mayor → espero o no entro.", "Ir contra la tendencia puede salir, pero tienes menos a favor. Mientras aprendes, opera a favor de la corriente."),
    E("htf", "anal", "No miré el marco mayor", "No miraste el marco mayor", "No mirar el marco mayor", "Antes de entrar → miro el gráfico en una temporalidad mayor.", "Lo que en 5 minutos parece una subida puede ser un rebote dentro de una caída en 1 hora. El contexto cambia la lectura."),
    E("news", "entr", "Entré tras una noticia fuerte", "Entraste tras una noticia fuerte", "Entrar tras una noticia fuerte", "Si hay noticia fuerte → espero 15 minutos antes de buscar entradas.", "Tras una noticia el precio se mueve rápido y sin dirección clara, el diferencial sube y los stops saltan. Esperar es gratis."),
    E("noconf", "entr", "Entré sin confirmación", "Entraste sin confirmación", "Entrar sin confirmación", "Si no hay confirmación → no hay entrada. Prefiero perderla.", "Entrar antes de tiempo es adivinar. Perderte una operación no cuesta nada; entrar mal, sí."),
    E("chase", "entr", "Entré tarde, persiguiendo el precio", "Entraste tarde, persiguiendo el precio", "Perseguir el precio", "Si el precio ya se ha ido → la dejo pasar.", "Cuando persigues el precio entras donde otros ya están saliendo, y tu stop queda lejos o mal puesto."),
    E("notsetup", "entr", "No era mi setup", "Entraste en algo que no era tu setup", "Entrar sin que sea tu setup", "Si no es mi setup → no es mi operación.", "Cada entrada fuera de tu setup hace imposible saber si tu estrategia funciona. Tus datos solo valen si haces siempre lo mismo."),
    E("stopmove", "gest", "Moví el stop", "Moviste el stop", "Mover el stop", "Si el precio va hacia mi stop → no lo toco. La pérdida ya estaba aceptada al entrar.", "Mover el stop convierte una pérdida pequeña y prevista en una grande. Tu plan funciona porque las pérdidas son siempre del mismo tamaño."),
    E("risk", "gest", "Arriesgué de más", "Arriesgaste de más", "Arriesgar más de lo previsto", "Si no he calculado el tamaño con mi riesgo → no entro.", "Si una operación arriesga el doble, una mala racha normal se convierte en un agujero. El tamaño se calcula, no se siente."),
    E("nostop", "gest", "No puse stop", "No pusiste stop", "Entrar sin stop", "Si no tengo el stop puesto → no hay entrada.", "Sin stop, una sola operación puede borrar semanas de trabajo. El stop es lo que hace que una pérdida sea pequeña."),
    E("addlos", "gest", "Añadí a una perdedora", "Añadiste a una operación que perdía", "Añadir a una perdedora", "Si la operación va en contra → no añado. Nunca.", "Añadir a una operación que pierde es apostar más a una idea que el mercado ya te está diciendo que falla."),
    E("earlyout", "sal", "Salí antes por miedo", "Saliste antes por miedo", "Salir antes por miedo", "Si la operación va bien → dejo que llegue al objetivo o al stop.", "Si cortas pronto las ganancias pero dejas las pérdidas completas, puedes acertar mucho y aun así perder dinero."),
    E("notake", "sal", "No recogí en el objetivo", "No recogiste en el objetivo", "No recoger en el objetivo", "Si llega a mi objetivo → cierro. El plan ya decidió.", "El objetivo lo pusiste con la cabeza fría. Cambiarlo en caliente suele ser avaricia."),
    E("impulse", "sal", "Cerré por impulso", "Cerraste por impulso", "Cerrar por impulso", "Antes de cerrar a mano → me pregunto si lo dice el plan o el miedo.", "Cerrar sin un motivo del plan es dejar que la emoción gestione la operación."),
    E("letrun", "sal", "Dejé correr una perdedora", "Dejaste correr una operación que perdía", "Dejar correr una perdedora", "Si toca mi stop → se acaba. Sin esperar a que vuelva.", "Esperar a que vuelva es como el principiante convierte pérdidas pequeñas en grandes."),
    E("revenge", "cab", "Operé para recuperar", "Operaste para recuperar", "Operar para recuperar", "Si quiero recuperar → me levanto 10 minutos.", "Después de perder, el cerebro busca recuperar rápido. Es justo cuando peor decides."),
    E("over", "cab", "Operé de más", "Operaste de más", "Operar de más", "Si llego a mi máximo de operaciones → cierro el gráfico.", "Más operaciones no es más dinero. Normalmente las primeras son las buenas y las últimas, las de las ganas."),
    E("tired", "cab", "Operé cansado o distraído", "Operaste cansado o distraído", "Operar cansado o distraído", "Si estoy cansado o distraído → hoy solo miro.", "Cansado ves peor, decides más rápido y aceptas peor las pérdidas. Descansar también es parte del trabajo."),
    E("bored", "cab", "Operé por aburrimiento", "Operaste por aburrimiento", "Operar por aburrimiento", "Si me aburro → apunto lo que veo, pero no entro.", "La mayor parte del tiempo el mercado no ofrece nada. Ese rato sin operar también es tu trabajo."),
    E("hours", "cab", "Operé fuera de mi horario", "Operaste fuera de tu horario", "Operar fuera de horario", "Fuera de mi horario → gráfico cerrado.", "Tu horario es cuando estás preparado y el mercado se mueve como esperas. Fuera de él, operas a ciegas."),
    E("limit", "cab", "Seguí tras mi límite del día", "Seguiste operando tras tu límite del día", "Seguir tras tu límite del día", "Al llegar a mi límite del día → se acabó el día.", "El límite existe para que un mal día no se convierta en una mala semana. Pasarlo casi siempre lo empeora.")
  ];
  const ERRK = Object.fromEntries(ERR.map(e => [e.id, e]));
  const WHYS = [["noacept", "No quería aceptar la pérdida", "porque no querías aceptar la pérdida"], ["girar", "Pensé que iba a girar", "porque pensaste que iba a girar"], ["miedo", "Miedo", "por miedo"], ["prisa", "Prisa por no perderlo", "por las prisas de no perder el movimiento"], ["recup", "Quería recuperar", "porque querías recuperar"], ["cans", "Estaba cansado", "porque estabas cansado"], ["conf", "Exceso de confianza", "por exceso de confianza"], ["nose", "No lo sé", ""]];
  const WHYK = Object.fromEntries(WHYS.map(w => [w[0], w]));
  const MOT2ERR = { "Quería recuperar": "revenge", "Me aburría": "bored" };
  function autoErr(t) {
    const ev = evaluate(t), out = [];
    ev.fail.forEach(f => { const b = f.bad || ""; const id = /sin stop/i.test(b) ? "nostop" : /moviste el stop/i.test(b) ? "stopmove" : /arriesgaste/i.test(b) ? "risk" : /horario/i.test(b) ? "hours" : /máximo/i.test(b) ? "over" : /límite/i.test(b) ? "limit" : null; if (id) out.push(id); });
    if (!ev.good) ((t.review || {}).mot || []).forEach(m => { if (MOT2ERR[m]) out.push(MOT2ERR[m]); });
    return out;
  }
  function errorsOf(t) { const s = new Set(t.status === "closed" ? autoErr(t) : []); const e = (t.review || {}).err; if (e && ERRK[e.id]) s.add(e.id); return [...s]; }
  const allClosed = () => closed(S.trades || []);
  function occ(since) { const L = []; allClosed().forEach(t => { const ts = tsOf(t); if (since && ts < since) return; errorsOf(t).forEach(id => L.push({ id, t, ts })); }); return L; }
  const inPlan = (txt) => X3.recList().some(x => x.t.trim() === txt.trim());
  async function addRule(id) {
    const e = ERRK[id]; if (!e) return; if (inPlan(e.rule)) { toast("Esa regla ya está en tu plan"); return; }
    const items = X3.recList().map(x => Object.assign({}, x)).concat({ t: e.rule, w: "antes" });
    S.recs = S.recs || {}; S.recs.list = { items }; await X3.saveDoc("recs", "list", { items });
    toast("Añadida a tu plan: te la recordaremos antes de entrar");
  }

  /* ---------------- detective del error ---------------- */
  function detective(t) {
    if (!t || document.querySelector(".dt-wrap")) return;
    const sh = document.querySelector(".dj-sheet"); if (sh) sh.remove();
    const ev = evaluate(t), auto = autoErr(t), prev = (t.review || {}).err || {};
    const st = { id: prev.id || auto[0] || null, why: prev.why || null, txt: prev.txt || "" };
    st.a = prev.a || (st.id && ERRK[st.id] ? ERRK[st.id].a : null);
    const tp = typeOf(t);
    const box = document.createElement("div"); box.className = "dt-wrap"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Detective del error");
    const pista = () => {
      const p = []; if (auto.length) { const L = auto.map(id => ERRK[id].tu.toLowerCase()); p.push(L.length > 1 ? L.slice(0, -1).join(", ") + " y " + L[L.length - 1] : L[0]); }
      const said = X3.saidOf(t.review || {}); const mot = ((t.review || {}).mot || []).filter(m => X3.WHY_BAD.has(m));
      if (mot.length) p.push("marcaste «" + mot.join(", ").toLowerCase() + "»");
      return p.length ? `Tickora ya ve una pista: ${esc(p.join("; "))}.${said ? ` Escribiste: «${esc(said)}».` : ""}` : said ? `Escribiste: «${esc(said)}».` : "Tus reglas no detectan nada raro: piensa qué pasó de verdad.";
    };
    const n30 = () => { if (!st.id) return 0; const since = Date.now() - 30 * DAY; return 1 + allClosed().filter(x => x.id !== t.id && tsOf(x) >= since && errorsOf(x).includes(st.id)).length; };
    const paint = () => {
      const e = st.id ? ERRK[st.id] : null, w = st.why ? WHYK[st.why] : null, n = n30();
      box.innerHTML = `<div class="dt-box"><button type="button" class="dt-x" data-dtx aria-label="Cerrar">${svg('<path d="M6 6l12 12M18 6 6 18"/>', 18, 2)}</button>
        <span class="dj-k dt-eye">Detective del error</span><h3>¿Qué falló <em>de verdad</em>?</h3>
        <div class="dt-tr"><b>${esc(t.symbol || "")} · ${t.side === "buy" ? "Compra" : "Venta"}</b><span>${hhmm(t)} · ${esc(new Date(dateOf(t)).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" }))}</span><span class="mono">${fmtV(t.r, A.mOf(t))}</span>${tp ? `<span class="ap-tag t-${tp}">${TYPES[tp].l}</span>` : ""}</div>
        <p class="dt-pista">${pista()}</p>
        <div class="dt-st"><div class="dt-h"><i>1</i><b>¿Dónde falló?</b><small>Toca una</small></div><div class="dt-tiles">${AREAS.map(a => `<button type="button" class="dt-ti" data-dta="${a[0]}" aria-pressed="${st.a === a[0]}">${svg(a[3], 24)}<b>${a[1]}</b><small>${a[2]}</small></button>`).join("")}</div></div>
        ${st.a ? `<div class="dt-st"><div class="dt-h"><i>2</i><b>¿Qué pasó exactamente?</b><small>${AREA[st.a][1]}</small></div><div class="dj-chips">${ERR.filter(x => x.a === st.a).map(x => `<button type="button" class="dj-chip${st.id === x.id ? " on" : ""}" data-dti="${x.id}" aria-pressed="${st.id === x.id}">${esc(x.say)}${auto.includes(x.id) ? ` <span class="dt-auto">detectado</span>` : ""}</button>`).join("")}</div></div>` : ""}
        ${e ? `<div class="dt-st"><div class="dt-h"><i>3</i><b>¿Por qué lo hiciste?</b><small>Lo más honesto que puedas</small></div><div class="dj-chips">${WHYS.map(x => `<button type="button" class="dj-chip${st.why === x[0] ? " on" : ""}" data-dtw="${x[0]}" aria-pressed="${st.why === x[0]}">${x[1]}</button>`).join("")}</div></div>` : ""}
        ${e && w ? `<div class="dt-res"><span class="dj-k">Causa encontrada</span><h4>${esc(e.tu)}${w[2] ? " " + esc(w[2]) : ""}. <span>${n > 1 ? `Es la ${n}.ª vez este mes.` : "Es la primera vez que lo encuentras: bien visto."}</span></h4>
          ${w[0] === "nose" ? `<p class="dt-les">No pasa nada por no saberlo. La próxima vez, justo antes de entrar, fíjate en qué sientes: ahí suele estar la respuesta.</p>` : ""}
          <div class="dt-rule"><div>Regla propuesta: <b>${esc(e.rule)}</b></div><button type="button" class="x-ch pri" data-dtrule ${inPlan(e.rule) ? "disabled" : ""}>${inPlan(e.rule) ? "Ya está en tu plan" : "Añadir a mi plan"}</button></div>
          <p class="dt-les"><b>En 30 segundos:</b> ${esc(e.les)}</p>
          <div class="dj-in"><textarea id="dt-tx" class="dj-ta" rows="1" maxlength="400" placeholder="¿Algo más que quieras recordar? (opcional)">${esc(st.txt)}</textarea>${X3.micBtn("dt-tx")}</div></div>` : ""}
        <div class="dj-sb"><button type="button" class="x-ch" data-dtx>${e && w ? "Cerrar" : "Ahora no"}</button><button type="button" class="x-ch pri" data-dtok ${e ? "" : "disabled"}>Guardar en mi catálogo</button></div></div>`;
      bind();
    };
    const keep = () => { const ta = box.querySelector("#dt-tx"); if (ta) st.txt = ta.value; };
    const close = () => { box.classList.remove("in"); setTimeout(() => box.remove(), 220); document.removeEventListener("keydown", ek); };
    const ek = ev2 => { if (ev2.key === "Escape") close(); };
    const bind = () => {
      box.querySelectorAll("[data-dtx]").forEach(b => b.onclick = close);
      box.querySelectorAll("[data-dta]").forEach(b => b.onclick = () => { keep(); if (st.a !== b.dataset.dta) { st.a = b.dataset.dta; if (st.id && ERRK[st.id].a !== st.a) { st.id = null; } } paint(); });
      box.querySelectorAll("[data-dti]").forEach(b => b.onclick = () => { keep(); st.id = b.dataset.dti; paint(); });
      box.querySelectorAll("[data-dtw]").forEach(b => b.onclick = () => { keep(); st.why = b.dataset.dtw; paint(); const r = box.querySelector(".dt-res"); if (r && r.scrollIntoView) r.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
      box.querySelectorAll("[data-mic]").forEach(b => b.onclick = () => X3.startMic(b));
      const ta = box.querySelector("#dt-tx"); if (ta) { X3.autoGrow(ta); ta.oninput = () => X3.autoGrow(ta); }
      const rb = box.querySelector("[data-dtrule]"); if (rb) rb.onclick = async () => { keep(); await addRule(st.id); paint(); };
      const ok = box.querySelector("[data-dtok]"); if (ok) ok.onclick = async () => { keep(); if (!st.id) return; ok.disabled = true; await X3.setReview(t, { err: { id: st.id, a: ERRK[st.id].a, why: st.why || null, txt: (st.txt || "").trim(), ts: Date.now() } }); toast("Guardado en tu catálogo de errores"); close(); re(); };
    };
    box.addEventListener("click", ev2 => { if (ev2.target === box) close(); });
    document.addEventListener("keydown", ek); paint(); document.body.appendChild(box); requestAnimationFrame(() => box.classList.add("in"));
  }
  window.tkDetective = id => detective((S.trades || []).find(t => t.id === id));
  document.addEventListener("click", ev => { const b = ev.target.closest && ev.target.closest("[data-dt]"); if (!b) return; ev.preventDefault(); window.tkDetective(b.dataset.dt); });

  /* ---------------- vista · Tus decisiones ---------------- */
  const PER = [[30, "Este mes"], [90, "3 meses"], [0, "Todo"]];
  const trLink = t => `<a class="ap-tr" href="#op/${encodeURIComponent(t.id)}">${esc(t.symbol || "")} · ${wday(t)}</a>`;
  function quad(k, L) {
    const T = TYPES[k], last = L.slice().sort((a, b) => tsOf(b) - tsOf(a));
    const said = k === "ok" || k === "bp" ? last.map(t => X3.saidOf(t.review || {})).find(Boolean) : null;
    const reason = t => { const e = errorsOf(t)[0]; return e ? " · " + ERRK[e].say.toLowerCase() : ""; };
    const chips = last.slice(0, k === "su" || k === "er" ? 2 : 3).map(t => k === "su" || k === "er" ? `<a class="ap-tr" href="#op/${encodeURIComponent(t.id)}">${esc(t.symbol || "")} · ${wday(t)}${esc(reason(t))}</a>` : trLink(t)).join("") + (last.length > (k === "su" || k === "er" ? 2 : 3) ? `<span class="ap-tr more">+${last.length - (k === "su" || k === "er" ? 2 : 3)} más</span>` : "");
    const todo = k === "er" || k === "su" ? last.find(t => !(t.review || {}).err) : null;
    return `<div class="ap-q t-${k}"><div class="ap-qt"><span class="ap-ic">${svg(T.ic, 28, 1.8)}</span><b>${T.l}</b><span class="ap-n mono">${L.length}</span></div>
      <p>${T.d}</p>${T.q ? `<p class="ap-quote">«${esc(said || T.q)}»</p>` : ""}${k === "su" ? `<span class="ap-flag">La trampa del principiante</span>` : ""}
      ${L.length ? `<div class="ap-trs">${chips}</div>` : `<div class="ap-trs"><span class="ap-tr more">Ninguna todavía</span></div>`}
      ${todo ? `<button type="button" class="ap-go" data-dt="${esc(todo.id)}">Buscar el fallo →</button>` : ""}</div>`;
  }
  function decisiones() {
    const per = S.apPer == null ? 30 : S.apPer, since = per ? Date.now() - per * DAY : 0;
    const C = allClosed().filter(t => tsOf(t) >= since), G = { ok: [], bp: [], su: [], er: [] };
    C.forEach(t => G[typeOf(t)].push(t));
    const n = C.length, good = G.ok.length + G.bp.length;
    const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    const W = Array.from({ length: 6 }, (_, i) => { const a = mon.getTime() - (5 - i) * 7 * DAY, b = a + 7 * DAY, o = { ok: 0, bp: 0, su: 0, er: 0, n: 0 }; allClosed().forEach(t => { const s = tsOf(t); if (s >= a && s < b) { o[typeOf(t)]++; o.n++; } }); return o; });
    const wmax = Math.max(1, ...W.map(w => w.n)), tw = W[5], pw = W[4];
    const wtxt = !tw.n ? "Esta semana aún no has operado." : !(tw.su + tw.er) ? "Esta semana, ni un error ni una suerte. <b>Así se avanza.</b>" : pw.n && (tw.ok + tw.bp) / tw.n > (pw.ok + pw.bp) / pw.n ? `Esta semana haces bien más operaciones que la anterior: <b>${Math.round((tw.ok + tw.bp) / tw.n * 100)} %</b>.` : `Esta semana, ${tw.su + tw.er} de ${tw.n} fuera del plan. Mira qué se repite en <a href="#errores">Tus errores</a>.`;
    const head = !n ? "Cuando cierres operaciones, aquí verás cuántas hiciste bien, no solo cuántas ganaste." : `${good} de ${n} las hiciste bien.${G.su.length ? ` <span class="c-su">${G.su.length} ${G.su.length === 1 ? "ganancia fue" : "ganancias fueron"} suerte</span>: no las cuentes como aciertos.` : G.er.length ? ` ${G.er.length} ${G.er.length === 1 ? "fue un error" : "fueron errores"}: ahí está lo que más puedes aprender.` : " Sigue así."}`;
    return `<div class="stack ap" style="gap:18px"><div class="xhead"><div><h1>Tus operaciones, <em>por cómo las hiciste</em></h1><div class="small muted">No importa solo si ganaste. Importa si lo hiciste bien${n ? ` · ${n} ${n === 1 ? "operación" : "operaciones"}` : ""}</div></div></div>
      <div class="dj-tabs" role="group" aria-label="Periodo">${PER.map(([d, l]) => `<button type="button" data-apper="${d}" aria-selected="${per === d}">${l}</button>`).join("")}</div>
      <div class="ap-g"><div class="ap-mx"><span></span><span class="ap-ax">Ganaste</span><span class="ap-ax">Perdiste</span><span class="ap-ax v">Seguiste el plan</span>${quad("ok", G.ok)}${quad("bp", G.bp)}<span class="ap-ax v">Te saltaste el plan</span>${quad("su", G.su)}${quad("er", G.er)}</div>
      <aside class="ap-side"><div class="dj-c"><span class="dj-k">Lo que dicen tus números</span><p class="ap-big">${head}</p>
        ${n ? `<div class="ap-bar" role="img" aria-label="${TK.map(k => TYPES[k].l + " " + G[k].length).join(", ")}">${TK.map(k => G[k].length ? `<i class="t-${k}" style="flex:${G[k].length}"></i>` : "").join("")}</div><div class="ap-lg">${TK.map(k => `<span class="t-${k}">${TYPES[k].l} ${G[k].length}</span>`).join("")}</div>` : ""}</div>
        <div class="dj-c"><span class="dj-k">Semana a semana</span><div class="ap-wk">${W.map((w, i) => `<div title="${w.n} operaciones"><span style="height:${Math.round(w.n / wmax * 100)}%">${["er", "su", "bp", "ok"].map(k => w[k] ? `<i class="t-${k}" style="flex:${w[k]}"></i>` : "").join("")}</span><small>${i === 5 ? "Esta" : "−" + (5 - i)}</small></div>`).join("")}</div><p class="ap-sm">${wtxt}</p></div>
        <div class="dj-c"><span class="dj-k">Las dos preguntas</span><p class="ap-sm">Cada operación responde a dos cosas: <b>¿seguiste el plan?</b> y <b>¿ganaste?</b> Solo la primera depende de ti. Por eso una pérdida dentro del plan cuenta como bien hecha, y una ganancia fuera de él, no.</p></div></aside></div></div>`;
  }

  /* ---------------- vista · Tus errores ---------------- */
  function errStats() {
    const now = Date.now(), O = occ(0), M = {};
    O.forEach(o => { const m = M[o.id] || (M[o.id] = { id: o.id, n30: 0, tot: 0, last: 0, first: Infinity, w: Array(8).fill(0), r14: 0, p14: 0, why: {} }); m.tot++; m.last = Math.max(m.last, o.ts); m.first = Math.min(m.first, o.ts); const age = (now - o.ts) / DAY; if (age <= 30) m.n30++; if (age <= 14) m.r14++; else if (age <= 28) m.p14++; const wi = 7 - Math.floor(age / 7); if (wi >= 0 && wi < 8) m.w[wi]++; const e = (o.t.review || {}).err; if (e && e.id === o.id && e.why) m.why[e.why] = (m.why[e.why] || 0) + 1; });
    return M;
  }
  function errores() {
    const now = Date.now(), M = errStats(), list = Object.values(M).filter(m => m.n30 > 0).sort((a, b) => b.n30 - a.n30 || b.last - a.last), top = list[0];
    const sup = Object.values(M).filter(m => m.tot >= 2 && now - m.last >= 21 * DAY).sort((a, b) => a.last - b.last);
    const occ30 = occ(now - 30 * DAY), hard = occ30.filter(o => ["gest", "cab"].includes(ERRK[o.id].a)).length;
    const pend = allClosed().filter(t => tsOf(t) >= now - 30 * DAY && ["er", "su"].includes(typeOf(t)) && !(t.review || {}).err).sort((a, b) => tsOf(b) - tsOf(a));
    const status = m => now - m.last >= 21 * DAY ? ["dn", "Superado"] : now - m.first <= 14 * DAY ? ["nw", "Nuevo"] : m.r14 > m.p14 ? ["up", "Va a más"] : m.r14 < m.p14 ? ["dn", "Va a menos"] : ["st", "Estable"];
    const ago = ts => { const d = Math.floor((now - ts) / DAY); return d < 1 ? "hoy" : d === 1 ? "ayer" : d < 7 ? new Date(ts).toLocaleDateString("es-ES", { weekday: "long" }) : "hace " + d + " días"; };
    let hero;
    if (top) {
      const e = ERRK[top.id], wy = Object.entries(top.why).sort((a, b) => b[1] - a[1])[0];
      const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
      const days = Array.from({ length: 5 }, (_, i) => { const d = new Date(mon.getTime() + i * DAY), k = dayKey(d), T = allClosed().filter(t => dayKey(dateOf(t)) === k); return k > todayKey() ? "fu" : !T.length ? "rest" : T.some(t => errorsOf(t).includes(top.id)) ? "bad" : "on"; });
      const ok = days.filter(d => d === "on").length, tr = days.filter(d => d === "on" || d === "bad").length;
      hero = `<div class="er-hero"><div><span class="dj-k">Tu error número 1 este mes</span><h2>${esc(e.name)}</h2><p>${top.n30} ${top.n30 === 1 ? "vez" : "veces"} en 30 días.${wy ? ` ${wy[1] === top.n30 ? "Todas" : wy[1] + " de ellas"} dijiste «${esc(WHYK[wy[0]][1].toLowerCase())}».` : ""} ${esc(e.les)}</p></div>
        <div class="er-goal"><span class="dj-k">Reto de esta semana</span><p>Ni una vez «${esc(e.name.toLowerCase())}». Tickora lo comprueba con tus operaciones.</p><div class="er-days">${days.map((d, i) => `<i class="${d}" title="${"LMXJV"[i]}"></i>`).join("")}</div><small>${tr ? `${ok} de ${tr} ${tr === 1 ? "día" : "días"} cumplidos` : "Aún no has operado esta semana"}</small></div></div>`;
    } else hero = `<div class="er-hero empty"><div><span class="dj-k">Tu catálogo está vacío</span><h2>${allClosed().length ? "Ningún error en 30 días" : "Aún no hay errores"}</h2><p>Los errores llegan aquí de dos formas: Tickora detecta solo los que rompen tus reglas (stop, riesgo, horario, máximo, límite) y tú añades los demás con el <b>detective del error</b> después de cada operación fuera del plan.</p></div></div>`;
    const rows = list.map(m => { const e = ERRK[m.id], [sc, sl] = status(m), mx = Math.max(1, ...m.w), open = S.erOpen === m.id;
      return `<div class="er-row${open ? " open" : ""}"><button type="button" class="er-rb" data-eropen="${m.id}" aria-expanded="${open}"><span class="er-n mono">${m.n30}</span><span class="er-t"><b>${esc(e.name)}</b><small>${AREA[e.a][1]}${Object.keys(m.why).length ? " · " + esc(WHYK[Object.entries(m.why).sort((a, b) => b[1] - a[1])[0][0]][1].toLowerCase()) : ""}</small></span><span class="er-sp" aria-hidden="true">${m.w.map((v, i) => `<i class="${i === 7 ? "l" : ""}" style="height:${v ? Math.max(12, Math.round(v / mx * 100)) : 4}%"></i>`).join("")}</span><span class="er-st ${sc}">${sl}</span><span class="er-ev"><b>${m.n30} ${m.n30 === 1 ? "evitable" : "evitables"}</b>última: ${ago(m.last)}</span></button>
        ${open ? `<div class="er-more"><p><b>Por qué importa:</b> ${esc(e.les)}</p><div class="dt-rule"><div>Regla: <b>${esc(e.rule)}</b></div><button type="button" class="x-ch pri" data-errule="${m.id}" ${inPlan(e.rule) ? "disabled" : ""}>${inPlan(e.rule) ? "Ya está en tu plan" : "Añadir a mi plan"}</button></div></div>` : ""}</div>`; }).join("");
    return `<div class="stack ap er" style="gap:18px"><div class="xhead"><div><h1>Tu catálogo <em>de errores</em></h1><div class="small muted">Cada fallo que encuentras se guarda aquí. Verlos repetidos es el primer paso para dejar de cometerlos</div></div></div>
      <div class="ap-g"><div class="er-main">${hero}${rows ? `<div class="er-list">${rows}</div>` : ""}</div>
      <aside class="ap-side">
        ${pend.length ? `<div class="dj-c"><span class="dj-k">Pendientes de revisar</span><p class="ap-sm">Operaciones fuera del plan en las que aún no has buscado el fallo.</p><div class="er-pend">${pend.slice(0, 5).map(t => `<button type="button" data-dt="${esc(t.id)}"><span class="ap-dot t-${typeOf(t)}"></span><span>${esc(t.symbol || "")} · ${wday(t)} ${hhmm(t)}</span><b>Buscar →</b></button>`).join("")}</div></div>` : ""}
        <div class="dj-c"><span class="dj-k">Errores superados</span>${sup.length ? sup.map(m => `<div class="er-sup">${svg('<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>', 28)}<div><b>${esc(ERRK[m.id].name)}</b><small>${Math.floor((now - m.last) / DAY)} días sin cometerlo</small></div></div>`).join("") : `<p class="ap-sm">Cuando pases 3 semanas sin repetir un error, aparecerá aquí como superado.</p>`}</div>
        ${occ30.length ? `<div class="dj-c"><span class="dj-k">Lo que esto te dice</span><p class="ap-big">${hard / occ30.length >= .5 ? `${Math.round(hard / occ30.length * 10)} de cada 10 errores son <span class="c-hi">de gestión o de cabeza</span>.` : `${Math.round((occ30.length - hard) / occ30.length * 10)} de cada 10 errores son <span class="c-hi">de análisis o de entrada</span>.`}</p><p class="ap-sm">${hard / occ30.length >= .5 ? "No necesitas aprender más estrategia: necesitas respetar la que ya tienes." : "Repasa tu estrategia: define mejor cuándo es tu señal y cuándo no."}</p></div>` : ""}
      </aside></div></div>`;
  }
  const bindAp = () => {
    $$("[data-apper]").forEach(b => b.onclick = () => { S.apPer = +b.dataset.apper; re(); });
    $$("[data-eropen]").forEach(b => b.onclick = () => { S.erOpen = S.erOpen === b.dataset.eropen ? null : b.dataset.eropen; re(); });
    $$("[data-errule]").forEach(b => b.onclick = async () => { await addRule(b.dataset.errule); re(); });
  };
  const ensure = () => { if (!S.d3Loaded) X3.loadAllD().then(() => { if (/^#(aprender|errores)/.test(location.hash)) re(); }); };
  V.aprender = { view() { ensure(); return decisiones(); }, bind: bindAp };
  V.errores = { view() { ensure(); return errores(); }, bind: bindAp };
  window.tkApTile = k => { const C = allClosed().filter(t => tsOf(t) >= Date.now() - 30 * DAY); if (k === "aprender") { const g = C.filter(t => evaluate(t).good).length; return [C.length ? g + "/" + C.length : "—", "bien hechas este mes", null]; } const o = occ(Date.now() - 30 * DAY); return [String(o.length), o.length === 1 ? "error este mes" : "errores este mes", null]; };

  /* ---------------- Tu libro ---------------- */
  const MESL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const dl = k => X3.dlogOf(k);
  const hasDl = k => { const d = dl(k); return !!((d.pre && (d.pre.txt || (d.pre.chips || []).length)) || (d.close && (d.close.bien || d.close.mejor || d.close.manana))); };
  function bookData() {
    const set = new Set(), tk = todayKey();
    (S.trades || []).forEach(t => { if (t.open_time) set.add(dayKey(t.open_time)); });
    Object.keys(S.dlog || {}).forEach(k => { if (/^d\d/.test(k) && hasDl(k.slice(1))) set.add(k.slice(1)); });
    if (healthOk()) Object.entries(S.mente || {}).forEach(([k, v]) => { if (v && v.emo && /^\d{4}-/.test(k)) set.add(k); });
    (S.pages || []).forEach(p => { if (p.created && !p.isTpl) set.add(dayKey(new Date(p.created))); });
    const days = [...set].filter(k => k <= tk).sort();
    const tradesOn = k => (S.trades || []).filter(t => t.open_time && dayKey(t.open_time) === k).sort((a, b) => new Date(a.open_time) - new Date(b.open_time));
    /* curva: % dentro del plan en las últimas 10 operaciones cerradas */
    const C = allClosed().slice().sort((a, b) => tsOf(a) - tsOf(b)); let ci = 0; const win = [];
    const arc = days.map(k => { while (ci < C.length && dayKey(dateOf(C[ci])) <= k) { win.push(evaluate(C[ci]).good ? 1 : 0); if (win.length > 10) win.shift(); ci++; } return win.length ? win.reduce((a, b) => a + b, 0) / win.length : null; });
    /* momentos clave */
    const ms = {}; const put = (k, t) => { const d = days.find(x => x >= k); if (d && !ms[d]) ms[d] = t; };
    let streak = 0, firstClean = false, week = false, det = false;
    days.forEach((k, i) => { const T = closed(tradesOn(k)); if (T.length) { const all = T.every(t => evaluate(t).good); if (all && !firstClean) { firstClean = true; put(k, "Primer día sin romper el plan"); } streak = all ? streak + 1 : 0; if (streak === 5 && !week) { week = true; put(k, "Primera semana sin romper el plan"); } }
      if (!det && T.some(t => (t.review || {}).err)) { det = true; put(k, "Primer fallo encontrado con el detective"); }
      if (i + 1 === 10 || i + 1 === 30 || i + 1 === 100) put(k, `${i + 1} días en tu libro`); });
    const M = errStats(); Object.values(M).forEach(m => { if (m.tot >= 2 && Date.now() - m.last >= 21 * DAY) put(dayKey(new Date(m.last + 21 * DAY)), "Error superado: " + ERRK[m.id].name.toLowerCase()); });
    return { days, arc, ms, tradesOn };
  }
  function chapTitle(i, keys, B) {
    if (i === 0) return "Los primeros pasos";
    const pct = ks => { const T = closed(ks.flatMap(B.tradesOn)); return T.length ? T.filter(t => evaluate(t).good).length / T.length : null; };
    const a = pct(keys), b = pct(B.prevKeys || []);
    if (a == null) return "Mirar y escribir";
    if (a >= .8) return "Cumpliendo el plan"; if (b != null && a - b >= .1) return "Cada vez mejor"; if (b != null && b - a >= .1) return "Un mes para aprender"; return "Siguiendo el camino";
  }
  function bookHead() {
    const B = bookData(), f = B.days[0];
    return `<div class="xhead"><div><h1>Tu historia <em>como trader</em></h1><div class="small muted">Se escribe sola cada día con todo lo que haces en Tickora${f ? ` · Empezaste el ${new Date(f + "T12:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" })} · ${B.days.length} ${B.days.length === 1 ? "día escrito" : "días escritos"}` : ""}</div></div></div>`;
  }
  function dayColor(T) { const ty = closed(T).map(typeOf); return ty.includes("er") ? "er" : ty.includes("su") ? "su" : ty.length ? (ty.includes("ok") ? "ok" : "bp") : "wr"; }
  function bookView() {
    if (!S.pagesLoaded && window.TK_DIARIO && !S.bkPgTry) { S.bkPgTry = true; window.TK_DIARIO.loadPages().then(() => { if (S.djTab === "libro") re(); }); }
    const B = bookData(), D = B.days;
    if (!D.length) return `<div class="bk-empty dj-c"><span class="dj-k">Tu libro está en blanco</span><p class="ap-big">Empieza el primer día que operes o escribas en Tickora.</p><p class="ap-sm">Cada día se añade una página sola: tu plan, tus operaciones, cómo te sentiste, lo que escribiste y lo que aprendiste. Con el tiempo verás tu progreso desde el principio.</p></div>`;
    const sel = D.includes(S.bkDay) ? S.bkDay : D[D.length - 1], si = D.indexOf(sel);
    /* capítulos */
    const ch = []; D.forEach(k => { const m = k.slice(0, 7); let c = ch[ch.length - 1]; if (!c || c.m !== m) { c = { m, keys: [] }; ch.push(c); } c.keys.push(k); });
    ch.forEach((c, i) => { B.prevKeys = i ? ch[i - 1].keys : []; c.t = chapTitle(i, c.keys, B); });
    const chOf = k => ch.findIndex(c => c.keys.includes(k));
    const rail = ch.slice().reverse().map(c => { const i = ch.indexOf(c); return `<div class="bk-ch"><span class="dj-k">Capítulo ${i + 1}</span><b>${cap(MESL[+c.m.slice(5) - 1])} · ${c.t}</b>${c.keys.slice().reverse().map(k => `<button type="button" class="bk-d${k === sel ? " on" : ""}" data-bkd="${k}" aria-current="${k === sel ? "date" : "false"}"><i class="ap-dot t-${dayColor(B.tradesOn(k))}"></i>${cap(new Date(k + "T12:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric" }).replace(".", ""))}<small>Día ${D.indexOf(k) + 1}</small></button>`).join("")}</div>`; }).join("");
    /* curva */
    const pts = B.arc.map((v, i) => v == null ? null : [D.length === 1 ? 450 : i / (D.length - 1) * 900, 86 - v * 72]).filter(Boolean);
    const first = B.arc.find(v => v != null), lastV = [...B.arc].reverse().find(v => v != null);
    const msK = Object.keys(B.ms).sort();
    const path = pts.length ? "M" + pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" L") : "";
    const marks = msK.map(k => { const i = D.indexOf(k), v = B.arc[i]; return v == null ? "" : `<i style="left:${(D.length === 1 ? 50 : i / (D.length - 1) * 100).toFixed(2)}%;top:${((86 - v * 72) / 96 * 100).toFixed(2)}%" title="${esc(B.ms[k])}"></i>`; }).join("");
    const arc = `<div class="dj-c bk-arc"><div class="bk-ah"><b>Desde el primer día</b><span>${first != null ? `Operaciones dentro de tu plan · de ${Math.round(first * 100)} % a ${Math.round(lastV * 100)} %` : "Cuando cierres operaciones, aquí verás cómo mejoras"}</span></div>
      ${pts.length > 1 ? `<div class="bk-plot"><span class="bk-ms" aria-hidden="true">${marks}</span><svg viewBox="0 0 900 96" preserveAspectRatio="none" role="img" aria-label="Evolución de tus operaciones dentro del plan"><path d="${path} L${pts[pts.length - 1][0].toFixed(1)},96 L${pts[0][0].toFixed(1)},96Z" class="bk-fill"/><path d="${path}" class="bk-line" vector-effect="non-scaling-stroke"/></svg></div>` : `<div class="bk-flat"></div>`}
      <div class="bk-ml"><span>Día 1 · ${new Date(D[0] + "T12:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>${msK.slice(-3).map(k => `<button type="button" class="bk-mk" data-bkd="${k}">${esc(B.ms[k])}</button>`).join("")}<span>Hoy</span></div></div>`;
    /* página del día */
    const T = B.tradesOn(sel), Cd = closed(T), d = dl(sel), M = healthOk() ? (S.mente || {})[sel] : null, ty = Cd.map(typeOf);
    const pre = []; if (M && M.emo) pre.push(`Llegaste <b>${esc((EMOL[M.emo] || M.emo).toLowerCase())}</b>${M.score != null ? ` (nota ${M.score})` : ""}.`); if (d.pre && (d.pre.chips || []).length) pre.push(`Te propusiste: <b>${esc(d.pre.chips.join(", ").toLowerCase())}</b>.`); if (M && M.sit) pre.push(`Tu regla: si ${esc(M.sit)} → ${esc(M.then || "")}.`);
    const feels = [...new Set([M && M.emo ? (EMOL[M.emo] || M.emo) : null].concat(T.map(t => (t.review || {}).feel)).filter(Boolean))];
    const wrote = [d.pre && d.pre.txt].concat(T.map(t => X3.saidOf(t.review || {}))).filter(Boolean);
    const pg = (S.pages || []).filter(p => p.created && !p.isTpl && dayKey(new Date(p.created)) === sel);
    const errs = []; T.forEach(t => { const e = (t.review || {}).err; if (e && ERRK[e.id]) errs.push(ERRK[e.id].tu + (e.why && WHYK[e.why] && WHYK[e.why][2] ? " " + WHYK[e.why][2] : "") + "."); });
    const ttl = !Cd.length ? (T.length ? "Un día con operaciones abiertas" : "Un día sin operar") : ty.includes("er") ? "Un día para aprender" : ty.includes("su") ? "Ganar no siempre es acertar" : ty.every(x => x === "bp") ? "Perder bien también cuenta" : "Un día dentro del plan";
    const lesson = (d.close && (d.close.mejor || d.close.manana)) || errs[0] || null;
    const d1 = D.find(k => closed(B.tradesOn(k)).length), d1C = d1 ? closed(B.tradesOn(d1)) : [];
    const cmp = d1 && d1 !== sel && Cd.length ? `El ${new Date(d1 + "T12:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" })} hiciste ${d1C.length} ${d1C.length === 1 ? "operación" : "operaciones"} y ${d1C.filter(t => !evaluate(t).good).length} rompían el plan. Este día, ${Cd.length} y ${Cd.filter(t => !evaluate(t).good).length || "ninguna"}.` : null;
    const ci = chOf(sel);
    const left = `<div class="bk-pg"><span class="bk-num">Día ${si + 1} · Capítulo ${ci + 1}</span><h2>${cap(new Date(sel + "T12:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }))}</h2>
      <div class="bk-s"><span class="dj-k">Cómo empezaste</span><p>${pre.length ? pre.join(" ") : "No dejaste nada escrito antes de empezar."}</p></div>
      <div class="bk-s"><span class="dj-k">Lo que hiciste</span>${T.length ? `<div class="bk-trs">${T.map(t => { const k = typeOf(t), rv = t.review || {}, why = X3.saidOf(rv) || (rv.mot || [])[0] || (errorsOf(t)[0] ? ERRK[errorsOf(t)[0]].say : ""); return `<a href="#op/${encodeURIComponent(t.id)}"><i class="ap-dot t-${k || "wr"}"></i><span>${esc(t.symbol || "")} · ${hhmm(t)} · ${k ? TYPES[k].l : "Abierta"}</span><small>${esc(String(why).toLowerCase())}</small></a>`; }).join("")}</div>` : `<p>No operaste. No operar también es una decisión.</p>`}</div>
      ${feels.length ? `<div class="bk-s"><span class="dj-k">Cómo te sentiste</span><div class="dj-chips sm">${feels.map(f => `<span class="dj-chip">${esc(f)}</span>`).join("")}</div></div>` : ""}
      ${wrote.length || pg.length ? `<div class="bk-s"><span class="dj-k">Lo que escribiste</span>${wrote.slice(0, 3).map(w => `<p class="bk-hand">«${esc(w)}»</p>`).join("")}${pg.map(p => `<a class="bk-pgl" href="#diario/${encodeURIComponent(p.id)}">Página: ${esc(p.title || "Sin título")}</a>`).join("")}</div>` : ""}</div>`;
    const right = `<div class="bk-pg"><span class="bk-num">Lo que aprendiste</span><h2>${ttl}</h2>
      <div class="bk-box"><span class="dj-k">Lección del día</span><p class="bk-hand">${lesson ? esc(lesson) : sel === todayKey() ? "Esta noche, en el cierre del Diario, apunta qué harías distinto. Aparecerá aquí." : "Este día no dejaste lección escrita."}</p></div>
      ${d.close && d.close.bien ? `<div class="bk-s"><span class="dj-k">Lo que hiciste bien</span><p>${esc(d.close.bien)}</p></div>` : ""}
      ${d.close && d.close.manana ? `<div class="bk-s"><span class="dj-k">Para el día siguiente</span><p>${esc(d.close.manana)}</p></div>` : ""}
      ${errs.length > (lesson === errs[0] ? 1 : 0) ? `<div class="bk-s"><span class="dj-k">Fallos encontrados</span>${errs.map(x => `<p>${esc(x)}</p>`).join("")}</div>` : ""}
      ${Cd.some(t => ["su", "er"].includes(typeOf(t)) && !(t.review || {}).err) ? `<button type="button" class="dt-go" data-dt="${esc(Cd.find(t => ["su", "er"].includes(typeOf(t)) && !(t.review || {}).err).id)}">Buscar el fallo de este día · 1 min</button>` : ""}
      ${cmp ? `<div class="bk-s"><span class="dj-k">Comparado con tu primer día</span><p>${cmp}</p></div>` : ""}
      ${B.ms[sel] ? `<div class="bk-mile">${svg('<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>', 26)}<div><b>Momento clave</b> · ${esc(B.ms[sel])}</div></div>` : ""}
      <div class="bk-foot"><button type="button" class="dj-nb2" data-bkd="${D[si - 1] || ""}" ${si ? "" : "disabled"}>← Día ${si}</button><button type="button" class="dj-nb2" data-bkd="${D[si + 1] || ""}" ${si < D.length - 1 ? "" : "disabled"}>Día ${si + 2} →</button></div></div>`;
    return `<div class="bk-g"><nav class="dj-c bk-rail" aria-label="Días de tu libro">${rail}</nav><div class="bk-main">${arc}<article class="bk-book">${left}${right}</article></div></div>`;
  }
  function bookBind() {
    $$("[data-bkd]").forEach(b => b.onclick = () => { if (!b.dataset.bkd) return; S.bkDay = b.dataset.bkd; re(); const bk = document.querySelector(".bk-book"); if (bk && window.innerWidth < 900) bk.scrollIntoView({ block: "start" }); });
    const on = document.querySelector(".bk-d.on"); if (on && on.scrollIntoView) { const r = on.closest(".bk-rail"); if (r) { if (window.innerWidth < 900) r.scrollLeft = on.offsetLeft - 20; else if (on.offsetTop > r.clientHeight - 40) r.scrollTop = on.offsetTop - 80; } }
  }
  window.TK_LIBRO = { head: bookHead, view: bookView, bind: bookBind };

  if (A.S && A.S.loaded) { A.S.lastView = null; A.render(); }
})();
