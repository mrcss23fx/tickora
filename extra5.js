/* Tickora · «Conócete» (16-nov-2026): 6 situaciones reales + 4 preguntas directas → tu ficha de trader.
   Se guarda en docs col «mente», id «perfil» (v:2), compatible con el perfil anterior (trig, calm, tone). */
(function () {
  "use strict";
  const A = window.TKAPP, X2 = window.TK_X2, X3 = window.TK_X3, V = window.TK_VIEWS;
  if (!A || !X2 || !V) return;
  const { S, sb, esc, toast, todayKey, lsGet, lsSet } = A;
  const { re, healthOk, loadMente, PTRIG, PCALM, PTONE } = X2;
  const TL = Object.fromEntries(PTRIG.map(t => [t[0], t[1]]));

  /* las 6 situaciones: cada respuesta suma a uno o varios puntos débiles */
  const SC = [
    { id: "s1", tags: ["16:05", "Sin operaciones hoy"], t: "EURUSD sale disparado sin ti. Lleva 40 pips y sigue subiendo.", o: [["a", "Entro ya, antes de que se vaya más", { fomo: 2 }], ["b", "Entro si retrocede un poco", { fomo: 1 }], ["c", "Lo dejo pasar: no era mi entrada", {}], ["d", "Me fastidia mucho haberlo perdido", { fomo: 1, impaciencia: 1 }]] },
    { id: "s2", tags: ["15:52", "2 pérdidas seguidas · −100 $", "Te queda 1 operación"], t: "Ves una entrada que se parece a tu setup, pero no del todo. Si sale bien, recuperas el día entero.", o: [["a", "Entro: es la oportunidad de recuperar", { revancha: 2 }], ["b", "Entro, pero con la mitad del tamaño", { revancha: 1 }], ["c", "Espero a que se parezca del todo a mi setup", {}], ["d", "Cierro la plataforma por hoy", {}]] },
    { id: "s3", tags: ["16:40", "3 ganadas seguidas · +180 $"], t: "Hoy todo te sale. Ya has llegado a tu máximo de operaciones y aparece otra entrada.", o: [["a", "Entro con más tamaño: estoy en racha", { euforia: 2 }], ["b", "Hago una más, solo una", { euforia: 1 }], ["c", "Me guardo el día: ya he cumplido", {}], ["d", "Apunto la entrada y miro cómo acaba", {}]] },
    { id: "s4", tags: ["17:10", "1 h 30 min mirando", "Quedan 20 min de tu horario"], t: "Tu entrada no aparece. Llevas toda la sesión esperando.", o: [["a", "Entro en algo parecido para no irme de vacío", { impaciencia: 2 }], ["b", "Me cambio a otro mercado a ver si hay algo", { impaciencia: 1 }], ["c", "Espero hasta el final: si no hay, no hay", {}], ["d", "Cierro y hago otra cosa", {}]] },
    { id: "s5", tags: ["15:40", "Ayer perdiste con este setup"], t: "Aparece tu setup exacto, con todo lo que pide tu estrategia.", o: [["a", "No entro: me da miedo que pase lo de ayer", { dudas: 2 }], ["b", "Entro con menos tamaño, por si acaso", { dudas: 1 }], ["c", "Entro normal: es mi setup", {}], ["d", "Espero una confirmación más", { dudas: 1 }]] },
    { id: "s6", tags: ["15:25", "Has dormido 5 horas", "El móvil lleno de mensajes"], t: "Empieza tu horario en 5 minutos.", o: [["a", "Opero normal, no pasa nada", { cansancio: 2 }], ["b", "Opero, contestando mensajes entre medias", { distraccion: 2 }], ["c", "Opero menos y con más cuidado", { cansancio: 1 }], ["d", "Hoy solo miro el mercado", {}]] }
  ];
  const INS = {
    revancha: ["Te cuesta cerrar un mal día", "Después de perder buscas una forma de seguir. Es lo más común al empezar, y lo vigilaremos juntos.", "Tras dos pérdidas te propondré parar antes de la siguiente."],
    fomo: ["Te duele perderte un movimiento", "Cuando el precio se va sin ti sientes que tienes que entrar. Esperar a tu entrada te ahorrará muchas pérdidas.", "Te marcaré las zonas sin entrar y te avisaré si persigues el precio."],
    euforia: ["Las rachas te suben", "Después de ganar tiendes a arriesgar más o a pasarte de tu máximo.", "Cuando vayas en racha te recordaré tu máximo y tu tamaño."],
    impaciencia: ["Te cuesta esperar", "Cuando no aparece tu entrada, buscas otra. Esperar también es operar.", "Si la sesión va lenta, te recordaré que no operar también cuenta."],
    dudas: ["Una pérdida te frena", "Una mala experiencia te hace dudar aunque la entrada sea buena.", "Cuando dudes de tu setup te enseñaré tus propios números con él."],
    cansancio: ["Operas aunque no estés al 100 %", "Cansado decides peor y aceptas peor las pérdidas.", "Si llegas cansado, te propondré operar menos ese día."],
    distraccion: ["Te cuesta desconectar", "El móvil y lo de fuera te quitan foco mientras operas.", "Te propondré sesiones sin móvil y te avisaré si te dispersas."]
  };
  const EXP = [["empiezo", "Estoy empezando"], ["6m", "Menos de 6 meses"], ["2a", "De 6 meses a 2 años"], ["mas", "Más de 2 años"]];
  const GOAL = [["reto", "Aprobar un reto de fondeo"], ["extra", "Ganar un dinero extra"], ["vivir", "Vivir del trading"], ["aprender", "Aprender a operar bien"]];
  const WHYS = ["Tener más libertad", "Dejar mi trabajo", "Más tiempo con mi familia", "Demostrarme que puedo"];
  const TONEX = { directo: "Dos pérdidas. Pausa de 15 minutos. Ahora.", cercano: "Llevas dos seguidas y sé que apetece recuperar. Levántate 15 minutos, te espero aquí.", datos: "Tras dos pérdidas, la siguiente operación de la mayoría sale peor. Pausa recomendada: 15 minutos." };
  const STEPS = SC.map(s => s.id).concat(["base", "why", "calm", "tone", "ficha"]);
  const lab = (L, v) => (L.find(x => x[0] === v) || [])[1] || "";

  function st() {
    if (S.cono) return S.cono;
    const P = S.menteP || {};
    return (S.cono = { i: 0, ans: Object.assign({}, P.scen || {}), exp: P.exp || "", goal: P.goal || "", why: P.why || "", calm: (P.calm || []).slice(), tone: P.tone || "", trig: null });
  }
  function scores(c) {
    const s = {}; PTRIG.forEach(t => s[t[0]] = 0);
    SC.forEach(q => { const o = q.o.find(x => x[0] === c.ans[q.id]); if (o) Object.entries(o[2]).forEach(([k, v]) => s[k] += v); });
    return s;
  }
  const topTraits = s => Object.entries(s).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

  /* la ficha de la derecha, que se va rellenando */
  function ficha(c) {
    const s = scores(c), mx = Math.max(2, ...Object.values(s)), answered = SC.filter(q => c.ans[q.id]).length, tr = c.trig || topTraits(s), ins = tr[0] && s[tr[0]] >= 2 ? INS[tr[0]] : null;
    const nm = (S.name || (S.user && S.user.user_metadata && S.user.user_metadata.name) || "Tú").trim(), ini = nm.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const cell = (k, v) => `<div class="${v ? "" : "e"}"><small>${k}</small>${v ? esc(v) : "…"}</div>`;
    return `<div class="cn-card"><div class="cn-hd"><span class="cn-ph">${esc(ini)}</span><div><b>${esc(nm)}</b><small>Trader${c.exp ? " · " + esc(lab(EXP, c.exp).toLowerCase()) : ""}</small></div></div>
      <div class="cn-st">${cell("Objetivo", lab(GOAL, c.goal))}${cell("Experiencia", lab(EXP, c.exp))}${cell("Te saca del plan", tr.length ? TL[tr[0]] : "")}${cell("Te calma", c.calm.length ? lab(PCALM, c.calm[0]) : "")}${cell("Tono", lab(PTONE, c.tone))}<div class="e"><small>Mercados</small>De tu MetaTrader</div></div>
      ${c.why ? `<div class="cn-why">«${esc(c.why)}»</div>` : ""}</div>
      ${answered ? `<div class="cn-rev">${ins ? `<b>${ins[0]}</b><p>${ins[1]}</p>` : `<b>Aún te estoy conociendo</b><p>Con cada situación sé un poco más de cómo operas.</p>`}</div>
      <div class="cn-tr" aria-label="Lo que tus respuestas dicen">${PTRIG.map(([k, l]) => `<div><span>${esc(l.replace(/ o .*$/, ""))}</span><i><u style="width:${Math.round(s[k] / mx * 100)}%"></u></i></div>`).join("")}</div>` : ""}
      <p class="cn-note">Tu ficha es tuya: la puedes cambiar o borrar cuando quieras. Con tus operaciones reales, Tickora confirmará o cambiará lo que dicen tus respuestas.</p>`;
  }

  function stepView(c) {
    const k = STEPS.at(c.i), sc = SC.find(q => q.id === k), nS = SC.length, nQ = 4;
    const nav = (ok, nextL) => `<div class="cn-nav">${c.i ? `<button type="button" class="x-ch" data-cn="back">← Atrás</button>` : `<span></span>`}<span class="cn-dots">${STEPS.slice(0, -1).map((x, i) => `<i class="${i < c.i ? "on" : i === c.i ? "now" : ""}"></i>`).join("")}</span><button type="button" class="x-ch pri" data-cn="next" ${ok ? "" : "disabled"}>${nextL || "Siguiente →"}</button></div>`;
    if (sc) {
      const n = SC.indexOf(sc) + 1;
      return `<span class="cn-k vio">Situación ${n} de ${nS}</span><div class="cn-scene"><div class="cn-tags">${sc.tags.map(t => `<span>${esc(t)}</span>`).join("")}</div><p>${esc(sc.t)}</p></div>
        <h2 class="cn-q">¿Qué haces de verdad?</h2><div class="cn-ops" role="radiogroup">${sc.o.map((o, j) => `<button type="button" role="radio" class="cn-o" data-cna="${sc.id}:${o[0]}" aria-checked="${c.ans[sc.id] === o[0]}"><i>${"ABCD"[j]}</i>${esc(o[1])}</button>`).join("")}</div>
        <p class="cn-hint">No hay respuesta buena ni mala. Contesta lo que harías, no lo que deberías hacer.</p>${nav(!!c.ans[sc.id])}`;
    }
    const qn = STEPS.indexOf(k) - nS + 1, head = `<span class="cn-k">Pregunta ${qn} de ${nQ}</span>`;
    if (k === "base") return `${head}<h2 class="cn-h">Cuéntame <em>de dónde partes</em></h2><div class="cn-blk"><b>¿Cuánto tiempo llevas operando?</b><div class="cn-chips">${EXP.map(([v, l]) => `<button type="button" class="dj-chip${c.exp === v ? " on" : ""}" data-cnv="exp:${v}" aria-pressed="${c.exp === v}">${l}</button>`).join("")}</div></div>
      <div class="cn-blk"><b>¿Para qué operas?</b><div class="cn-chips">${GOAL.map(([v, l]) => `<button type="button" class="dj-chip${c.goal === v ? " on" : ""}" data-cnv="goal:${v}" aria-pressed="${c.goal === v}">${l}</button>`).join("")}</div></div>${nav(c.exp && c.goal)}`;
    if (k === "why") return `${head}<h2 class="cn-h">¿Y por qué es <em>importante para ti?</em></h2><p class="cn-p">Lo guardaré con tus palabras y te lo recordaré en los días difíciles. Es opcional.</p>
      <div class="cn-chips">${WHYS.map(w => `<button type="button" class="dj-chip" data-cnw="${esc(w)}">${esc(w)}</button>`).join("")}</div>
      <div class="dj-in cn-in"><textarea id="cn-why" class="dj-ta" rows="2" maxlength="200" placeholder="Ej.: quiero dejar mi trabajo en 2027 y tener más tiempo con mi familia">${esc(c.why)}</textarea>${X3 ? X3.micBtn("cn-why") : ""}</div>${nav(true, c.why ? "Siguiente →" : "Saltar →")}`;
    if (k === "calm") return `${head}<h2 class="cn-h">Cuando te pones nervioso, <em>¿qué te ayuda a volver a la calma?</em></h2><p class="cn-p">Elige las que te funcionen. La primera que marques será la que te proponga.</p>
      <div class="cn-chips">${PCALM.map(([v, l]) => { const i = c.calm.indexOf(v); return `<button type="button" class="dj-chip${i >= 0 ? " on" : ""}" data-cnc="${v}" aria-pressed="${i >= 0}">${i >= 0 ? `<b class="cn-n">${i + 1}</b>` : ""}${l}</button>`; }).join("")}</div>${nav(c.calm.length)}`;
    if (k === "tone") return `${head}<h2 class="cn-h">Cuando te equivoques, <em>¿cómo prefieres que te lo diga?</em></h2><p class="cn-p">El mismo aviso en tres tonos. Elige el que te ayudaría a ti.</p>
      <div class="cn-tones" role="radiogroup">${PTONE.map(([v, l]) => `<button type="button" role="radio" class="cn-to" data-cnv="tone:${v}" aria-checked="${c.tone === v}"><b>${l}</b><span class="cn-msg"><small>Tras dos pérdidas</small>${esc(TONEX[v])}</span></button>`).join("")}</div>${nav(c.tone, "Ver mi ficha →")}`;
    /* ficha final */
    const s = scores(c); if (!c.trig) c.trig = topTraits(s);
    const watch = c.trig.map(t => INS[t][2]).concat(c.exp === "empiezo" || c.exp === "6m" ? ["Te explicaré cada cosa la primera vez que la veas."] : []);
    return `<span class="cn-k">Listo</span><h2 class="cn-h">Esta es <em>tu ficha de trader</em></h2><p class="cn-p">Revísala. Si algo no encaja contigo, cámbialo: nadie te conoce mejor que tú.</p>
      <div class="cn-blk"><b>Lo que más te saca del plan</b><small>Lo he deducido de tus respuestas. Puedes marcar hasta tres.</small><div class="cn-chips">${PTRIG.map(([v, l]) => `<button type="button" class="dj-chip${c.trig.includes(v) ? " on" : ""}" data-cnt="${v}" aria-pressed="${c.trig.includes(v)}">${l}</button>`).join("")}</div></div>
      ${watch.length ? `<div class="cn-blk"><b>Lo que Tickora vigilará contigo</b><ul class="cn-ul">${watch.map(w => `<li>${esc(w)}</li>`).join("")}</ul></div>` : `<div class="cn-blk"><b>Lo que Tickora vigilará contigo</b><p class="cn-p">Tus respuestas no muestran un punto débil claro. Lo descubriremos con tus operaciones.</p></div>`}
      <div class="cn-nav"><button type="button" class="x-ch" data-cn="back">← Atrás</button><span></span><button type="button" class="x-ch pri" data-cn="save">Guardar mi ficha</button></div>`;
  }

  V.conocete = {
    view() {
      if (!healthOk()) return `<div class="cn"><div class="xhead"><div><h1>Conócete</h1><div class="small muted">Antes de empezar</div></div></div><div class="dj-c" style="max-width:640px"><p class="ap-sm" style="margin:0">Para conocerte, Tickora tiene que guardar cómo reaccionas y cómo te sientes al operar. Es información personal: necesita tu permiso y solo la ves tú.</p><a class="x-ch pri" href="#ajustes" style="margin-top:14px;display:inline-flex">Activar en Ajustes</a></div></div>`;
      if (!S.menteLoaded) { loadMente().then(() => { if (location.hash === "#conocete") { S.lastView = null; re(); } }); return `<div class="dj-c" aria-busy="true">Cargando…</div>`; }
      const c = st(), sc = STEPS.at(c.i).startsWith("s");
      return `<div class="cn"><div class="xhead"><div><h1>${sc ? "¿Qué harías <em>tú</em>?" : "Crea tu <em>ficha de trader</em>"}</h1><div class="small muted">${sc ? "Nadie se conoce del todo preguntándose qué le saca del plan. Por eso te pongo en situaciones reales y miro qué eliges" : "Unas preguntas directas. Tu ficha se va rellenando con cada respuesta"} · 2 minutos</div></div></div>
        <div class="cn-g"><div class="dj-c cn-main">${stepView(c)}</div><aside class="cn-side">${ficha(c)}</aside></div></div>`;
    },
    bind() {
      if (!document.querySelector(".cn-main")) return;
      const c = st(), go = () => { S.lastView = null; re(); const m = document.querySelector(".cn-main"); if (m && innerWidth < 900) m.scrollIntoView({ block: "start" }); };
      const keep = () => { const ta = document.getElementById("cn-why"); if (ta) c.why = ta.value.trim(); };
      document.querySelectorAll("[data-cna]").forEach(b => b.onclick = () => { const [q, v] = b.dataset.cna.split(":"); c.ans[q] = v; c.trig = null; go(); });
      document.querySelectorAll("[data-cnv]").forEach(b => b.onclick = () => { const [k, v] = b.dataset.cnv.split(":"); c[k] = v; go(); });
      document.querySelectorAll("[data-cnw]").forEach(b => b.onclick = () => { c.why = b.dataset.cnw; go(); });
      document.querySelectorAll("[data-cnc]").forEach(b => b.onclick = () => { const v = b.dataset.cnc, i = c.calm.indexOf(v); if (i >= 0) c.calm.splice(i, 1); else c.calm.push(v); go(); });
      document.querySelectorAll("[data-cnt]").forEach(b => b.onclick = () => { const v = b.dataset.cnt, i = c.trig.indexOf(v); if (i >= 0) c.trig.splice(i, 1); else if (c.trig.length < 3) c.trig.push(v); else { toast("Como mucho tres"); return; } go(); });
      const ta = document.getElementById("cn-why"); if (ta) { ta.oninput = () => { c.why = ta.value; }; if (X3) X3.autoGrow(ta); }
      document.querySelectorAll("[data-mic]").forEach(b => b.onclick = () => X3 && X3.startMic(b));
      document.querySelectorAll("[data-cn]").forEach(b => b.onclick = async () => {
        const a = b.dataset.cn; keep();
        if (a === "back") { c.i = Math.max(0, c.i - 1); go(); return; }
        if (a === "next") { c.i = Math.min(STEPS.length - 1, c.i + 1); go(); return; }
        if (a === "save") {
          b.disabled = true;
          const P = Object.assign({}, S.menteP || {}, { v: 2, trig: c.trig.slice(), calm: c.calm.slice(), tone: c.tone || "cercano", exp: c.exp, goal: c.goal, why: (c.why || "").trim(), scen: Object.assign({}, c.ans), scores: scores(c), ts: Date.now() });
          const { error } = await sb.from("docs").upsert({ user_id: S.user.id, col: "mente", id: "perfil", data: P, updated_at: new Date().toISOString() });
          if (error) { toast("No se pudo guardar"); b.disabled = false; return; }
          S.menteP = P; S.cono = null; toast("Tu ficha está guardada"); location.hash = "#inicio";
        }
      });
    }
  };
  /* «Ahora no» en la portada: no volver a pedirlo hasta mañana */
  document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-cono-skip]"); if (!b) return; lsSet("tk-conoskip", todayKey()); if (window.__tkHero) window.__tkHero(); else { S.lastView = null; re(); } });
  window.tkConoPending = () => healthOk() && S.menteLoaded && !(S.menteP && S.menteP.v === 2) && lsGet("tk-conoskip", "") !== todayKey();
  /* la portada se pinta antes de que llegue tu perfil: cuando llega, se repinta la pregunta */
  let tries = 0; const iv = setInterval(() => { if (++tries > 40) return clearInterval(iv); const q = document.getElementById("hxq"); if (q && window.__tkHero && !S.hqStep && window.tkConoPending() && !q.querySelector('[href="#conocete"]')) { window.__tkHero(); clearInterval(iv); } }, 500);
  if (A.S && A.S.loaded && location.hash === "#conocete") { S.lastView = null; A.render(); }
})();
