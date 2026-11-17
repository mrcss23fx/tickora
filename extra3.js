/* Tickora · Diario que se escribe casi solo, toque tras cada operación, repaso de la semana,
   Mis estrategias, recordatorios y frase del día. Depende de TKAPP, TK_X, TK_X2, TK_DIARIO. */
(function () {
  "use strict";
  const A = window.TKAPP, X = window.TK_X, X2 = window.TK_X2, V = window.TK_VIEWS;
  if (!A || !X || !X2 || !V) return;
  const { S, sb, esc, fmtV, fmtMs, dayKey, todayKey, evaluate, tradeStats, toast, lsGet, lsSet, minOf } = A;
  const { $, $$, I, IC, closed, fmtD } = X;
  const { hData, mkOf, glyph, EMOL, NK, NLAB, dateOf, re, healthOk } = X2;
  const DI = () => window.TK_DIARIO;

  /* ---------------- datos ---------------- */
  const WHY = ["Setup claro", "Esperé la confirmación", "Seguí mi plan", "Me aburría", "Quería recuperar", "Miedo a perderlo", "Me vine arriba", "Por una noticia", "Impulso"];
  const WHY_BAD = new Set(["Me aburría", "Quería recuperar", "Miedo a perderlo", "Me vine arriba", "Impulso"]);
  const PRE = ["Solo mi setup", "Operar menos", "Solo mirar", "Proteger lo ganado", "Paciencia"];
  const saveDoc = (col, id, data) => sb.from("docs").upsert({ user_id: S.user.id, col, id, data, updated_at: new Date().toISOString() }).then(({ error }) => { if (error) toast("No se pudo guardar"); return !error; });
  async function loadCol(col) { const { data, error } = await sb.from("docs").select("id,data").eq("col", col); return error ? null : (data || []); }
  function loadAllD() {
    if (S.d3Loading) return S.d3Loading;
    S.d3Loading = Promise.all([loadCol("dlog"), loadCol("strat"), loadCol("recs")]).then(([dl, st, rc]) => {
      S.dlog = {}; (dl || []).forEach(d => S.dlog[d.id] = d.data || {});
      S.strats = (st || []).map(d => Object.assign({ id: d.id }, d.data)).sort((a, b) => (a.created || 0) - (b.created || 0));
      S.recs = {}; (rc || []).forEach(d => S.recs[d.id] = d.data || {});
      S.d3Loaded = true; if (X2.gRefresh) X2.gRefresh();
    });
    return S.d3Loading;
  }
  const dlogOf = k => (S.dlog || {})["d" + k] || {};
  async function setDlog(k, patch) { const cur = Object.assign({}, dlogOf(k), patch); S.dlog = S.dlog || {}; S.dlog["d" + k] = cur; await saveDoc("dlog", "d" + k, cur); if (X2.gRefresh) X2.gRefresh(); }
  async function setReview(t, patch) {
    t.review = Object.assign({}, t.review || {}, patch, { wts: Date.now() });
    const { error } = await sb.from("trades").update({ review: t.review }).eq("id", t.id);
    if (error) toast("No se pudo guardar"); if (X2.gRefresh) X2.gRefresh();
  }
  const answered = t => { const r = t.review || {}; return !!((r.mot && r.mot.length) || r.wtxt || r.strat || r.err || (typeof r.why === "string" && r.why.trim())); };
  const saidOf = rv => rv.wtxt || (typeof rv.why === "string" ? rv.why.trim() : "");

  /* ---------------- voz ---------------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const MIC = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
  const micBtn = id => SR ? `<button type="button" class="dj-mic" data-mic="${id}" aria-label="Dictar en voz alta" title="Dictar en voz alta">${MIC}</button>` : "";
  let rec = null;
  function startMic(btn) {
    const ta = document.getElementById(btn.dataset.mic); if (!ta || !SR) return;
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = "es-ES"; rec.interimResults = true; rec.continuous = true;
    const base = ta.value ? ta.value.replace(/\s*$/, " ") : ""; let fin = "";
    btn.classList.add("on"); btn.setAttribute("aria-label", "Parar el dictado");
    rec.onresult = e => { let tmp = ""; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) fin += r[0].transcript; else tmp += r[0].transcript; } ta.value = (base + fin + tmp).replace(/^\s+/, ""); };
    rec.onerror = ev => { if (ev.error === "not-allowed") toast("Permite el micrófono para dictar"); };
    rec.onend = () => { btn.classList.remove("on"); btn.setAttribute("aria-label", "Dictar en voz alta"); rec = null; ta.dispatchEvent(new Event("change", { bubbles: true })); };
    try { rec.start(); } catch (e) { rec = null; btn.classList.remove("on"); }
  }

  /* ---------------- frase del día ---------------- */
  const QUOTES = ["El mercado no te debe nada. Tu plan sí te debe algo: que lo cumplas.", "Una pérdida dentro del plan es una buena operación con mal resultado.", "No necesitas operar hoy. Necesitas operar bien cuando toque.", "La paciencia también es una posición.", "Si dudas, no hay entrada. La siguiente llegará.", "Protege tu capital como protegerías tu tiempo: no lo regales.", "Tu ventaja aparece en muchas operaciones, no en una.", "El enfado no sabe leer un gráfico.", "Primero el stop. Después todo lo demás.", "Ganar sin plan enseña malas costumbres.", "Lo que no apuntas, lo repites.", "Un buen día es el que cumples tu plan, aunque cierres en rojo.", "Cuanto más quieres recuperar, más pierdes. Para.", "El mejor trader de hoy es el que sabe cuándo no operar.", "Opera lo que ves, no lo que esperas."];
  const quoteToday = () => { const d = new Date(), n = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate(); return QUOTES[n % QUOTES.length]; };
  window.tkQuote = quoteToday;

  /* ---------------- recordatorios ---------------- */
  const REC_W = [["antes", "Antes de empezar"], ["perdida", "Después de una pérdida"], ["calenton", "Con el calentón"], ["siempre", "En cualquier momento"]];
  const REC_DEF = [{ t: "Las pérdidas son parte del juego. Una pérdida no es un fallo.", w: "perdida" }, { t: "Mi trabajo es seguir el plan, no acertar.", w: "antes" }, { t: "Si quiero recuperar, me levanto 10 minutos.", w: "calenton" }];
  const recList = () => ((S.recs || {}).list || {}).items || REC_DEF;
  function recFor(w) { const L = recList().filter(x => x.w === w || x.w === "siempre"); if (!L.length) return null; const d = new Date(); return L[(d.getDate() + d.getHours()) % L.length].t; }
  window.tkRecFor = recFor;

  /* ---------------- estrategias ---------------- */
  const strats = () => S.strats || [];
  const stratName = id => { const s = strats().find(x => x.id === id); return s ? s.name : null; };

  /* ---------------- piezas del día ---------------- */
  function chips(list, sel, attr, extra = "") { const on = new Set(sel || []); return `<div class="dj-chips" role="group">${list.map(c => `<button type="button" class="dj-chip${on.has(c) ? " on" : ""}${WHY_BAD.has(c) ? " bad" : ""}" ${attr}="${esc(c)}" ${extra} aria-pressed="${on.has(c)}">${esc(c)}</button>`).join("")}</div>`; }
  function tradeMoment(t, i, open) {
    const ev = t.status === "closed" ? evaluate(t) : null, rv = t.review || {}, done = answered(t);
    const dur = t.close_time ? Math.max(1, Math.round((new Date(t.close_time) - new Date(t.open_time)) / 6e4)) : null;
    const auto = [ev ? (ev.good ? (t.r < 0 ? "Pérdida buena: respetaste tu plan" : "Dentro del plan") : "Fuera del plan: " + esc(ev.fail.map(f => (NLAB[NK(f.fix)] || f.label || "").toLowerCase()).filter(Boolean)[0] || "una norma")) : "Abierta", dur ? dur + " min" : "", rv.feel ? "te sentías <b>" + esc(String(rv.feel).toLowerCase()) + "</b>" : ""].filter(Boolean).join(" · ");
    const st = strats();
    const q = ev && !ev.good ? "¿Qué pasó antes de entrar?" : t.r < 0 ? "Hiciste bien en salir. ¿Por qué entraste?" : "¿Por qué entraste?";
    return `<div class="dj-mo${done ? " done" : ""}${open ? " now" : ""}" id="mo-${esc(t.id)}"><span class="dj-dot" aria-hidden="true"></span>
      <div class="dj-h"><b>${esc(t.symbol || "")} · ${t.side === "buy" ? "Compra" : "Venta"}${t.status === "closed" ? " · " + fmtV(t.r, A.mOf(t)) : ""}</b><small>${new Date(t.open_time).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}${done ? " · hecho" : ""}</small></div>
      <div class="dj-auto">${auto}</div>
      ${ev && !ev.good ? `<button type="button" class="dt-go" data-dt="${esc(t.id)}">${rv.err ? "Fallo encontrado · ver" : "Buscar el fallo · 1 min"}</button>` : ""}
      ${done && !open ? `<div class="dj-sum">${(rv.mot || []).map(w => `<span class="dj-chip on${WHY_BAD.has(w) ? " bad" : ""}">${esc(w)}</span>`).join("")}${rv.strat && stratName(rv.strat) ? `<span class="dj-chip st on">${esc(stratName(rv.strat))}</span>` : ""}${saidOf(rv) ? `<p class="dj-said">«${esc(saidOf(rv))}»</p>` : ""}<button type="button" class="dj-edit" data-djopen="${esc(t.id)}">Cambiar</button></div>`
      : `<p class="dj-q">${q}</p>${chips(WHY, rv.mot, "data-why", `data-tid="${esc(t.id)}"`)}
        ${st.length ? `<p class="dj-q2">¿Qué estrategia era?</p><div class="dj-chips">${st.map(s => `<button type="button" class="dj-chip st${rv.strat === s.id ? " on" : ""}" data-strat="${esc(s.id)}" data-tid="${esc(t.id)}" aria-pressed="${rv.strat === s.id}">${esc(s.name)}</button>`).join("")}<button type="button" class="dj-chip st${rv.strat === "none" ? " on" : ""}" data-strat="none" data-tid="${esc(t.id)}">Ninguna</button></div>` : `<p class="dj-hint">Crea tus estrategias en <a href="#estrategias">Mi plan › Estrategias</a> y podrás marcar cuál usaste.</p>`}
        <div class="dj-in"><textarea id="tx-${esc(t.id)}" class="dj-ta" rows="1" data-wtxt="${esc(t.id)}" placeholder="Añade una frase (opcional)…" maxlength="400">${esc(saidOf(rv))}</textarea>${micBtn("tx-" + t.id)}</div>`}
    </div>`;
  }
  function closeSugs(D) {
    const C = closed(D.today), good = C.filter(t => evaluate(t).good), bad = C.filter(t => !evaluate(t).good);
    const bien = []; if (C.length && C.every(t => !evaluate(t).fail.some(f => NK(f.fix) === "stop"))) bien.push("Respeté el stop"); if (C.length <= (D.p.maxTrades || 3)) bien.push("No pasé de mi máximo"); if (!C.length) bien.push("No forcé ninguna entrada"); if (good.length && good.some(t => t.r < 0)) bien.push("Acepté la pérdida"); bien.push("Esperé mi setup");
    const mej = bad.length ? [...new Set(bad.flatMap(t => evaluate(t).fail.map(f => NLAB[NK(f.fix)]).filter(Boolean)))].slice(0, 3) : []; mej.push("Esperar más tras perder", "Entrar con menos prisa");
    const man = ["Solo mi setup", "Operar menos", "Parar a la hora", "Respirar antes de entrar"];
    return { bien: [...new Set(bien)].slice(0, 4), mej: [...new Set(mej)].slice(0, 4), man };
  }
  function dayView() {
    const D = hData(), k = S.djDay || todayKey(), isT = k === todayKey(), dl = dlogOf(k), M = healthOk() ? (S.mente || {})[k] : null;
    const T = (S.trades || []).filter(t => t.open_time && dayKey(t.open_time) === k).sort((a, b) => new Date(a.open_time) - new Date(b.open_time));
    const Dk = isT ? D : Object.assign({}, D, { today: T });
    const preDone = !!((dl.pre && (dl.pre.txt || (dl.pre.chips || []).length)));
    const ph = isT ? D.phase : "despues", closeOpen = ph === "despues" || T.some(t => t.status === "closed");
    const clDone = !!(dl.close && (dl.close.bien || dl.close.mejor || dl.close.manana));
    const firstOpen = T.find(t => t.status === "closed" && !answered(t));
    const moments = 1 + T.length + (closeOpen ? 1 : 0), doneN = (preDone ? 1 : 0) + T.filter(answered).length + (closeOpen && clDone ? 1 : 0);
    const left = []; if (!preDone) left.push("antes de empezar"); T.filter(t => !answered(t)).forEach(t => left.push("tu operación de " + (t.symbol || ""))); if (closeOpen && !clDone) left.push("el cierre del día");
    const C = 2 * Math.PI * 15, fr = moments ? doneN / moments : 0;
    const mk = M && M.emo ? mkOf(EMOL[M.emo] || M.emo) : null;
    const preAuto = [M ? `Llegaste <b>${esc(EMOL[M.emo] || M.emo || "—")}</b>${M.score != null ? " (nota " + M.score + ")" : ""}` : (healthOk() ? "Sin chequeo" : ""), M && M.sit ? `tu regla: <b>si ${esc(M.sit)} → ${esc(M.then)}</b>` : "", (S.plandias || {})[k] ? "te comprometiste con tu plan" : ""].filter(Boolean).join(" · ");
    const pre = `<div class="dj-mo${preDone ? " done" : ""}${!preDone && isT && ph === "antes" ? " now" : ""}"><span class="dj-dot" aria-hidden="true"></span><div class="dj-h"><b>Antes de empezar</b><small>${preDone && dl.pre.ts ? new Date(dl.pre.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) + " · hecho" : ""}</small></div>
      ${preAuto ? `<div class="dj-auto">${preAuto}${mk ? `<span class="dj-g">${glyph(mk, 34, 14)}</span>` : ""}</div>` : ""}
      ${preDone && !S.djEditPre ? `<div class="dj-sum">${(dl.pre.chips || []).map(c => `<span class="dj-chip on">${esc(c)}</span>`).join("")}${dl.pre.txt ? `<p class="dj-said">«${esc(dl.pre.txt)}»</p>` : ""}<button type="button" class="dj-edit" data-djpre>Cambiar</button></div>`
      : `<p class="dj-q">¿Qué vas a hacer hoy?</p>${chips(PRE, (dl.pre || {}).chips, "data-pre")}<div class="dj-in"><textarea id="tx-pre" class="dj-ta" rows="1" data-pretxt placeholder="Una frase para ti (opcional)…" maxlength="300">${esc((dl.pre || {}).txt || "")}</textarea>${micBtn("tx-pre")}</div>`}</div>`;
    const sg = closeSugs(Dk), cl = dl.close || {};
    const fld = (key, lab, sugs) => `<div class="dj-cf"><label for="cl-${key}">${lab}</label><div class="dj-chips sm">${sugs.map(s => `<button type="button" class="dj-chip" data-csug="${key}" data-v="${esc(s)}">${esc(s)}</button>`).join("")}</div><div class="dj-in"><textarea id="cl-${key}" class="dj-ta" rows="1" data-cl="${key}" maxlength="300" placeholder="Escribe o toca una sugerencia…">${esc(cl[key] || "")}</textarea>${micBtn("cl-" + key)}</div></div>`;
    const close = `<div class="dj-mo${clDone ? " done" : ""}${closeOpen && !clDone && !firstOpen ? " now" : ""}${closeOpen ? "" : " later"}"><span class="dj-dot" aria-hidden="true"></span><div class="dj-h"><b>Cierre del día</b><small>${closeOpen ? (clDone ? "hecho" : "") : "después de las " + esc(D.p.end || "")}</small></div>
      ${closeOpen ? `<div class="dj-auto">${T.length ? `${closed(T).length} cerradas · ${fmtV(tradeStats(closed(T)).tot, tradeStats(closed(T)).mt)} · ${closed(T).filter(t => evaluate(t).good).length} dentro del plan` : "Hoy no operaste. No operar también es una decisión."}</div>${fld("bien", "Lo que hiciste bien", sg.bien)}${fld("mejor", "Lo que mejorarías", sg.mej)}${fld("manana", "Una cosa para mañana", sg.man)}` : `<div class="dj-auto">Tres preguntas cortas: lo que hiciste bien, lo que mejorarías y una cosa para mañana.</div>`}</div>`;
    const nav = `<div class="dj-day"><button type="button" class="dj-nb" data-djd="-1" aria-label="Día anterior"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg></button><b>${isT ? "Hoy" : A.greet ? new Date(k + "T12:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) : k}</b><button type="button" class="dj-nb" data-djd="1" aria-label="Día siguiente" ${isT ? "disabled" : ""}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg></button></div>`;
    const prog = `<div class="dj-prog"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="t"/><circle cx="18" cy="18" r="15" class="f" style="stroke-dasharray:${(fr * C).toFixed(1)} ${C.toFixed(1)}"/></svg><div><b>${doneN === moments ? "Día anotado" : doneN + " de " + moments + " momentos"}</b><small>${doneN === moments ? "Ya cuenta para tus objetivos. Mañana te espera lo que te dijiste." : "Te queda: " + left.slice(0, 3).join(", ") + (left.length > 3 ? "…" : "")}</small></div>${nav}</div>`;
    return `${prog}<div class="dj-tl">${pre}${T.map(t => tradeMoment(t, 0, t === firstOpen || S.djOpen === t.id)).join("")}${T.length ? "" : `<div class="dj-mo later"><span class="dj-dot" aria-hidden="true"></span><div class="dj-h"><b>Tus operaciones</b></div><div class="dj-auto">${isT ? "Cuando entres, cada operación aparecerá aquí ya escrita. Solo tendrás que decir por qué." : "Este día no operaste."}</div></div>`}${close}</div>`;
  }
  function insight() {
    const C = closed((S.trades || []).filter(t => new Date(t.open_time) >= Date.now() - 120 * 864e5)), by = {};
    C.forEach(t => ((t.review || {}).mot || []).forEach(w => { const o = by[w] || (by[w] = { n: 0, bad: 0 }); o.n++; if (!evaluate(t).good) o.bad++; }));
    const L = Object.entries(by).filter(([, o]) => o.n >= 3);
    const worst = L.filter(([, o]) => o.bad / o.n >= .6).sort((a, b) => b[1].bad / b[1].n - a[1].bad / a[1].n || b[1].n - a[1].n)[0];
    if (worst) return worst[1].bad === worst[1].n ? `Las ${worst[1].n} veces que marcaste «${esc(worst[0])}», la operación fue evitable.` : `Cuando marcas «${esc(worst[0])}», ${worst[1].bad} de ${worst[1].n} operaciones acaban siendo evitables.`;
    const best = L.filter(([, o]) => (o.n - o.bad) / o.n >= .8).sort((a, b) => b[1].n - a[1].n)[0];
    if (best) return `Cuando marcas «${esc(best[0])}», el ${Math.round((best[1].n - best[1].bad) / best[1].n * 100)} % de tus operaciones va dentro del plan.`;
    const n = C.filter(answered).length;
    return n ? `Llevas ${n} ${n === 1 ? "operación anotada" : "operaciones anotadas"}. A partir de 3 veces el mismo motivo, aquí verás qué te dice tu diario.` : "Marca por qué entras en cada operación. Con unas pocas, aquí verás qué motivos te sacan del plan.";
  }
  function weekStrip() {
    const mon = new Date(); mon.setHours(12, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); const tk = todayKey();
    return `<div class="dj-wk">${Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(d.getDate() + i); const k = dayKey(d), dl = dlogOf(k), T = (S.trades || []).filter(t => t.open_time && dayKey(t.open_time) === k);
      const tot = 1 + T.length + (T.length || dl.close ? 1 : 0), dn = ((dl.pre && (dl.pre.txt || (dl.pre.chips || []).length)) ? 1 : 0) + T.filter(answered).length + (dl.close && (dl.close.bien || dl.close.mejor || dl.close.manana) ? 1 : 0);
      return `<button type="button" class="${k === tk ? "td" : ""}${k > tk ? " fu" : ""}" data-djgo="${k}" ${k > tk ? "disabled" : ""} aria-label="${d.toLocaleDateString("es-ES", { weekday: "long" })}: ${dn} de ${tot}"><i><b style="height:${Math.round(Math.min(1, dn / tot) * 100)}%"></b></i>${"LMXJVSD"[i]}</button>`; }).join("")}</div>`;
  }
  function ayer() {
    const tk = todayKey(), dl = Object.entries(S.dlog || {}).filter(([k, v]) => /^d\d/.test(k) && k.slice(1) < tk && v && v.close && v.close.manana).sort((a, b) => a[0] < b[0] ? 1 : -1)[0];
    if (!dl) return `<p class="dj-sp m">Esta noche, en el cierre, déjate una frase para mañana. Te estará esperando aquí.</p>`;
    const ago = Math.round((new Date(tk + "T12:00") - new Date(dl[0].slice(1) + "T12:00")) / 864e5);
    return `<p class="dj-sp">«${esc(dl[1].close.manana)}»</p><small class="dj-sm">${ago <= 1 ? "Ayer" : "Hace " + ago + " días"}</small>`;
  }

  /* ---------------- semana ---------------- */
  const STOP = new Set("a al algo con de del el en es esta este ha he hoy la las le lo los me mi muy más no o para pero por que qué se si sin su sus te tu un una uno y ya yo".split(" "));
  function weekView() {
    const off = S.djW || 0, mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) + off * 7); const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    const keys = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(d.getDate() + i); return dayKey(d); });
    const T = (S.trades || []).filter(t => t.open_time && keys.includes(dayKey(t.open_time))), C = closed(T);
    const texts = []; let writes = 0;
    keys.forEach(k => { const dl = dlogOf(k); if (dl.pre && (dl.pre.txt || (dl.pre.chips || []).length)) { writes++; if (dl.pre.txt) texts.push([k, dl.pre.txt]); } if (dl.close && (dl.close.bien || dl.close.mejor || dl.close.manana)) { writes++; ["bien", "mejor", "manana"].forEach(f => dl.close[f] && texts.push([k, dl.close[f]])); } });
    T.forEach(t => { if (answered(t)) { writes++; if (saidOf(t.review)) texts.push([dayKey(t.open_time), saidOf(t.review)]); } });
    const freq = {}; texts.forEach(([, s]) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-zñ0-9]+/).forEach(w => { if (w.length > 3 && !STOP.has(w)) freq[w] = (freq[w] || 0) + 1; }));
    T.forEach(t => ((t.review || {}).mot || []).forEach(w => { const kw = w.toLowerCase(); freq[kw] = (freq[kw] || 0) + 1; }));
    const words = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10), wmax = words.length ? words[0][1] : 1;
    const by = {}; C.forEach(t => ((t.review || {}).mot || []).forEach(w => { const o = by[w] || (by[w] = { n: 0, bad: 0, h: [] }); o.n++; if (!evaluate(t).good) { o.bad++; o.h.push(new Date(t.open_time).getHours()); } }));
    const rep = Object.entries(by).filter(([, o]) => o.n >= 2 && o.bad >= 2).sort((a, b) => b[1].bad - a[1].bad)[0];
    const goodT = C.filter(t => evaluate(t).good && answered(t) && t.r > 0).sort((a, b) => b.r - a.r)[0];
    const bestDay = goodT ? dayKey(goodT.open_time) : null;
    const wk = "w" + keys[0], wdoc = (S.dlog || {})[wk] || {};
    const q = rep ? `Si notas «${rep[0].toLowerCase()}», ¿qué vas a hacer en vez de entrar?` : C.some(t => !evaluate(t).good) ? "¿Qué harás distinto la próxima vez que te salgas del plan?" : "¿Qué hiciste esta semana que quieres repetir la que viene?";
    const lbl = `${mon.getDate()} ${mon.toLocaleDateString("es-ES", { month: "short" })} – ${sun.getDate()} ${sun.toLocaleDateString("es-ES", { month: "short" })}`;
    const head = writes ? `Esta semana escribiste ${writes} ${writes === 1 ? "vez" : "veces"}.${words.length ? ` Lo que más se repite: «${esc(words[0][0])}»${words[1] ? ` y «${esc(words[1][0])}»` : ""}.` : ""}` : "Esta semana aún no has escrito nada. Un toque por operación ya cuenta.";
    const dname = k => new Date(k + "T12:00").toLocaleDateString("es-ES", { weekday: "long" });
    const items = [
      ["Tu mejor momento", goodT ? `${cap(dname(bestDay))}: ${esc(goodT.symbol)} ${fmtMs(goodT.r, A.mOf(goodT))}${saidOf(goodT.review) ? ` · «${esc(saidOf(goodT.review))}»` : (goodT.review.mot || []).length ? ` · ${esc(goodT.review.mot.join(", ").toLowerCase())}` : ""}.` : "Cuando anotes una operación buena, aparecerá aquí."],
      ["Lo que se repite", rep ? `${rep[1].bad} veces marcaste «${esc(rep[0])}» y ${rep[1].bad === rep[1].n ? "todas fueron" : rep[1].bad + " de " + rep[1].n + " fueron"} evitables${rep[1].h.length ? ", sobre todo hacia las " + Math.round(rep[1].h.reduce((a, b) => a + b, 0) / rep[1].h.length) + ":00" : ""}.` : C.length ? "Nada que se repita en tus operaciones evitables. Bien." : "Sin operaciones esta semana."]
    ];
    const mAgo = Object.entries(S.dlog || {}).filter(([k, v]) => /^d\d/.test(k) && v && v.close && (v.close.manana || v.close.bien)).map(([k, v]) => [k.slice(1), v.close.manana || v.close.bien]).filter(([k]) => { const d = (Date.now() - new Date(k + "T12:00")) / 864e5; return d >= 24 && d <= 45; }).sort()[0];
    return `<div class="dw-g"><div class="dw-main"><div class="dw-h"><span class="dj-k">Repaso del ${lbl}</span><div class="dj-day"><button type="button" class="dj-nb" data-djw="-1" aria-label="Semana anterior"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg></button><button type="button" class="dj-nb" data-djw="1" aria-label="Semana siguiente" ${off >= 0 ? "disabled" : ""}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg></button></div></div>
        <h2 class="dw-t">${head}</h2>
        <div class="dw-pts">${items.map(([t, d], i) => `<div class="dw-p"><span class="n">${i + 1}</span><div><b>${t}</b><small>${d}</small></div></div>`).join("")}
          <div class="dw-p"><span class="n">3</span><div><b>Para la semana que viene</b><small>Tu pregunta:</small><p class="dw-q">${esc(wdoc.q || q)}</p><div class="dj-in"><textarea id="dw-a" class="dj-ta" rows="2" data-wans="${wk}" data-q="${esc(wdoc.q || q)}" maxlength="400" placeholder="Tu respuesta…">${esc(wdoc.a || "")}</textarea>${micBtn("dw-a")}</div>${wdoc.a ? `<small class="dj-sm">Guardada. La verás al empezar la semana.</small>` : ""}</div></div></div></div>
      <div class="dw-side"><div class="dj-c"><span class="dj-k">Las palabras de tu semana</span>${words.length ? `<div class="dw-w">${words.map(([w, n]) => `<span style="font-size:${(12 + n / wmax * 10).toFixed(0)}px">${esc(w)}</span>`).join("")}</div>` : `<p class="dj-sm">Aparecerán cuando escribas.</p>`}</div>
        ${mAgo ? `<div class="dj-c"><span class="dj-k">Hace un mes escribiste</span><p class="dj-sp">«${esc(mAgo[1])}»</p><small class="dj-sm">${new Date(mAgo[0] + "T12:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" })}</small></div>` : ""}
        <div class="dj-c"><span class="dj-k">Tu semana en números</span><div class="dw-n"><div><b>${C.length}</b><small>operaciones</small></div><div><b>${C.filter(answered).length}</b><small>anotadas</small></div><div><b>${C.length ? Math.round(C.filter(t => evaluate(t).good).length / C.length * 100) + " %" : "—"}</b><small>en plan</small></div></div></div></div></div>`;
  }
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  /* ---------------- vista Diario ---------------- */
  const DI0 = V.diario;
  V.diario = {
    view(r) {
      if (r && r.id) return DI0.view(r);
      if (!S.d3Loaded) loadAllD().then(() => { if ((location.hash || "").startsWith("#diario")) re(); });
      const tab = S.djTab || "hoy";
      const tabs = `<div class="dj-tabs" role="tablist">${[["hoy", "Hoy"], ["semana", "Semana"], ["libro", "Tu libro"], ["cuaderno", "Cuaderno libre"]].map(([k, l]) => `<button type="button" role="tab" data-djtab="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}</div>`;
      if (tab === "cuaderno") return `<div class="stack dj" style="gap:18px"><div class="xhead"><div><h1>Tu cuaderno <em>libre</em></h1><div class="small muted">Para escribir largo: páginas en blanco o con plantilla</div></div></div>${tabs}${DI0.view(r)}</div>`;
      if (tab === "libro" && window.TK_LIBRO) return `<div class="stack dj" style="gap:18px">${window.TK_LIBRO.head()}${tabs}${!S.d3Loaded ? `<div class="dj-c" aria-busy="true">Cargando tu libro…</div>` : window.TK_LIBRO.view()}</div>`;
      const body = !S.d3Loaded ? `<div class="dj-c" aria-busy="true">Cargando tu diario…</div>` : tab === "semana" ? weekView() : `<div class="dj-g"><div>${dayView()}</div><aside class="dj-side">
        <div class="dj-c"><span class="dj-k">Lo que te dijiste ayer</span>${ayer()}</div>
        <div class="dj-c"><span class="dj-k">Tu diario te dice</span><p class="dj-sp">${insight()}</p></div>
        <div class="dj-c"><span class="dj-k">Esta semana</span>${weekStrip()}<small class="dj-sm">Una línea o un toque ya cuenta. Volver es lo que importa.</small></div>
        <div class="dj-c dj-qt"><span class="dj-k">Frase del día</span><p class="dj-sp">${esc(quoteToday())}</p></div></aside></div>`;
      return `<div class="stack dj" style="gap:18px"><div class="xhead"><div><h1>${tab === "semana" ? "Tu semana, <em>leída por ti</em>" : "Tu diario <em>de hoy</em>"}</h1><div class="small muted">${tab === "semana" ? "Lo que escribiste, junto, y una sola pregunta para la semana que viene" : "Tickora ya ha escrito lo que pasó. Tú solo añades el porqué · 2 minutos"}</div></div></div>${tabs}${body}</div>`;
    },
    bind(r) {
      if (r && r.id) return DI0.bind(r);
      $$("[data-djtab]").forEach(b => b.onclick = () => { S.djTab = b.dataset.djtab; re(); });
      if ((S.djTab || "hoy") === "cuaderno") { DI0.bind(r); return; }
      if (S.djTab === "libro") { if (window.TK_LIBRO) window.TK_LIBRO.bind(); return; }
      bindDay(document.getElementById("main") || document);
      $$("[data-djw]").forEach(b => b.onclick = () => { S.djW = Math.min(0, (S.djW || 0) + +b.dataset.djw); re(); });
      $$("[data-wans]").forEach(ta => { const sv = () => { const k = ta.dataset.wans, cur = Object.assign({}, (S.dlog || {})[k] || {}, { q: ta.dataset.q, a: ta.value.trim() }); S.dlog[k] = cur; saveDoc("dlog", k, cur); }; ta.onchange = sv; ta.onblur = sv; });
    }
  };
  function autoGrow(ta) { ta.style.height = "auto"; ta.style.height = Math.min(220, ta.scrollHeight) + "px"; }
  function bindDay(root) {
    const k = S.djDay || todayKey();
    root.querySelectorAll(".dj-ta").forEach(ta => { autoGrow(ta); ta.addEventListener("input", () => autoGrow(ta)); });
    root.querySelectorAll("[data-mic]").forEach(b => b.onclick = () => startMic(b));
    root.querySelectorAll("[data-djd]").forEach(b => b.onclick = () => { const d = new Date((S.djDay || todayKey()) + "T12:00"); d.setDate(d.getDate() + +b.dataset.djd); const nk = dayKey(d); S.djDay = nk >= todayKey() ? null : nk; re(); });
    root.querySelectorAll("[data-djgo]").forEach(b => b.onclick = () => { S.djDay = b.dataset.djgo === todayKey() ? null : b.dataset.djgo; S.djTab = "hoy"; re(); });
    root.querySelectorAll("[data-pre]").forEach(b => b.onclick = () => { const dl = dlogOf(k), pre = Object.assign({ chips: [] }, dl.pre || {}), c = b.dataset.pre; pre.chips = pre.chips.includes(c) ? pre.chips.filter(x => x !== c) : pre.chips.concat(c); pre.ts = Date.now(); const ta = $("#tx-pre"); if (ta) pre.txt = ta.value.trim(); setDlog(k, { pre }).then(re); });
    const pt = root.querySelector("[data-pretxt]"); if (pt) { const sv = () => { const dl = dlogOf(k), pre = Object.assign({ chips: [] }, dl.pre || {}, { txt: pt.value.trim(), ts: Date.now() }); if ((dl.pre || {}).txt === pre.txt) return; setDlog(k, { pre }); }; pt.onchange = sv; pt.onblur = sv; }
    root.querySelectorAll("[data-djpre]").forEach(b => b.onclick = () => { S.djEditPre = true; re(); });
    root.querySelectorAll("[data-djopen]").forEach(b => b.onclick = () => { S.djOpen = b.dataset.djopen; re(); });
    const tOf = id => (S.trades || []).find(t => t.id === id);
    root.querySelectorAll("[data-why]").forEach(b => b.onclick = () => { const t = tOf(b.dataset.tid); if (!t) return; const cur = (t.review || {}).mot || [], c = b.dataset.why, mot = cur.includes(c) ? cur.filter(x => x !== c) : cur.concat(c); const ta = document.getElementById("tx-" + t.id); setReview(t, Object.assign({ mot }, ta ? { wtxt: ta.value.trim() } : {})).then(() => { S.djOpen = t.id; re(); }); });
    root.querySelectorAll("[data-strat]").forEach(b => b.onclick = () => { const t = tOf(b.dataset.tid); if (!t) return; const v = (t.review || {}).strat === b.dataset.strat ? null : b.dataset.strat; setReview(t, { strat: v }).then(() => { S.djOpen = t.id; re(); }); });
    root.querySelectorAll("[data-wtxt]").forEach(ta => { const sv = () => { const t = tOf(ta.dataset.wtxt); if (!t || ((t.review || {}).wtxt || "") === ta.value.trim()) return; setReview(t, { wtxt: ta.value.trim() }); }; ta.onchange = sv; ta.onblur = sv; });
    root.querySelectorAll("[data-cl]").forEach(ta => { const sv = () => { const dl = dlogOf(k), close = Object.assign({}, dl.close || {}, { [ta.dataset.cl]: ta.value.trim(), ts: Date.now() }); if (((dl.close || {})[ta.dataset.cl] || "") === ta.value.trim()) return; setDlog(k, { close }); }; ta.onchange = sv; ta.onblur = sv; });
    root.querySelectorAll("[data-csug]").forEach(b => b.onclick = () => { const ta = document.getElementById("cl-" + b.dataset.csug); if (!ta) return; ta.value = ta.value.trim() ? ta.value.trim().replace(/\.?$/, ". ") + b.dataset.v : b.dataset.v; autoGrow(ta); ta.dispatchEvent(new Event("change")); });
  }

  /* ---------------- toque justo después de cada operación ---------------- */
  function pendingTrade() {
    if (!S.d3Loaded || !S.trades) return null;
    const skip = new Set(lsGet("tk-whyskip", [])), lim = Date.now() - 6 * 36e5;
    return closed(S.trades).filter(t => t.close_time && new Date(t.close_time) >= lim && !answered(t) && !skip.has(t.id)).sort((a, b) => new Date(b.close_time) - new Date(a.close_time))[0] || null;
  }
  function sheet(t) {
    if (document.querySelector(".dj-sheet") || !t) return;
    const ev = evaluate(t), loss = t.r < 0, rv = { mot: [], strat: null };
    const recT = loss ? recFor("perdida") : null;
    const box = document.createElement("div"); box.className = "dj-sheet"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "¿Por qué entraste?");
    const paint = () => { box.innerHTML = `<div class="dj-sp2"><span class="dj-hd" aria-hidden="true"></span>
      <h3>¿Por qué entraste?</h3><div class="dj-auto">${esc(t.symbol)} · ${t.side === "buy" ? "Compra" : "Venta"} · ${fmtV(t.r, A.mOf(t))} · ${ev.good ? (loss ? "respetaste tu plan" : "dentro del plan") : "fuera del plan"}</div>
      ${recT ? `<div class="dj-rec"><span class="dj-k">Tu recordatorio</span>${esc(recT)}</div>` : ""}
      ${chips(WHY, rv.mot, "data-swhy")}
      ${strats().length ? `<p class="dj-q2">¿Qué estrategia era?</p><div class="dj-chips">${strats().map(s => `<button type="button" class="dj-chip st${rv.strat === s.id ? " on" : ""}" data-sst="${esc(s.id)}">${esc(s.name)}</button>`).join("")}</div>` : ""}
      <div class="dj-in"><textarea id="sh-tx" class="dj-ta" rows="2" maxlength="400" placeholder="Cuéntalo en una frase (opcional)…"></textarea>${micBtn("sh-tx")}</div>
      ${!ev.good ? `<button type="button" class="dt-go" data-dt="${esc(t.id)}">No seguiste el plan · buscar el fallo en 1 min</button>` : ""}<div class="dj-sb"><button type="button" class="x-ch" data-sno>Ahora no</button><button type="button" class="x-ch pri" data-sok>Guardar</button></div></div>`; bind(); };
    const close = () => { box.classList.remove("in"); setTimeout(() => box.remove(), 220); document.removeEventListener("keydown", ek); };
    const ek = e => { if (e.key === "Escape") { skip(); } };
    const skip = () => { const L = lsGet("tk-whyskip", []); L.push(t.id); lsSet("tk-whyskip", L.slice(-200)); close(); };
    const bind = () => {
      box.querySelectorAll("[data-swhy]").forEach(b => b.onclick = () => { const c = b.dataset.swhy; rv.mot = rv.mot.includes(c) ? rv.mot.filter(x => x !== c) : rv.mot.concat(c); const tx = box.querySelector("#sh-tx").value; paint(); box.querySelector("#sh-tx").value = tx; });
      box.querySelectorAll("[data-sst]").forEach(b => b.onclick = () => { rv.strat = rv.strat === b.dataset.sst ? null : b.dataset.sst; const tx = box.querySelector("#sh-tx").value; paint(); box.querySelector("#sh-tx").value = tx; });
      box.querySelectorAll("[data-mic]").forEach(b => b.onclick = () => startMic(b));
      box.querySelector("[data-sno]").onclick = skip;
      box.querySelector("[data-sok]").onclick = async () => { const tx = box.querySelector("#sh-tx").value.trim(); if (!rv.mot.length && !rv.strat && !tx) { skip(); return; } await setReview(t, { mot: rv.mot, strat: rv.strat, wtxt: tx }); toast("Anotado. +1 a tu diario de hoy"); close(); if ((location.hash || "").startsWith("#diario")) re(); };
    };
    box.addEventListener("click", e => { if (e.target === box) skip(); });
    document.addEventListener("keydown", ek); paint(); document.body.appendChild(box); requestAnimationFrame(() => box.classList.add("in"));
  }
  function checkSheet() { if (document.hidden || /^#(analizar|diario)/.test(location.hash || "")) return; const t = pendingTrade(); if (t) sheet(t); }
  window.tkWhySheet = checkSheet;

  /* ---------------- Mis estrategias ---------------- */
  function stratStats(id) { const C = closed((S.trades || []).filter(t => (t.review || {}).strat === id)); return { st: tradeStats(C), n: C.length, inPlan: C.length ? Math.round(C.filter(t => evaluate(t).good).length / C.length * 100) : null }; }
  function stratForm(s) {
    const x = s || { name: "", desc: "", conds: [], syms: [], start: "", end: "", img: "" };
    return `<form class="es-f" data-esform="${esc(x.id || "")}"><div class="es-fg"><label class="field"><span>Nombre</span><input class="input" name="name" value="${esc(x.name)}" maxlength="50" placeholder="p. ej. Retroceso tras ruptura" required></label>
      <label class="field"><span>Mercados</span><input class="input" name="syms" value="${esc((x.syms || []).join(", "))}" maxlength="80" placeholder="NAS100, EURUSD"></label>
      <label class="field"><span>Desde</span><input class="input" name="start" type="time" value="${esc(x.start || "")}"></label><label class="field"><span>Hasta</span><input class="input" name="end" type="time" value="${esc(x.end || "")}"></label></div>
      <label class="field"><span>En una frase, qué buscas</span><input class="input" name="desc" value="${esc(x.desc || "")}" maxlength="160" placeholder="Rompe el máximo de la mañana, vuelve a tocarlo y entro a favor"></label>
      <label class="field"><span>Condiciones para entrar (una por línea)</span><textarea class="input" name="conds" rows="4" maxlength="800" placeholder="Ruptura clara con vela grande&#10;Retroceso al nivel roto&#10;Vela de confirmación">${esc((x.conds || []).join("\n"))}</textarea></label>
      <label class="field"><span>Captura de ejemplo (pega con Ctrl+V o elige una imagen)</span><input class="input" type="file" accept="image/*" name="img"></label>${x.img ? `<img class="es-img" src="${esc(x.img)}" alt="Captura de ejemplo de ${esc(x.name)}">` : ""}
      <div class="row" style="gap:8px"><button type="submit" class="x-ch pri">Guardar estrategia</button><button type="button" class="x-ch" data-escancel>Cancelar</button>${x.id ? `<button type="button" class="x-ch" data-esdel="${esc(x.id)}" style="margin-left:auto">Borrar</button>` : ""}</div></form>`;
  }
  async function shrink(file) { return new Promise(res => { const fr = new FileReader(); fr.onload = () => { const im = new Image(); im.onload = () => { const s = Math.min(1, 900 / im.width), c = document.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", .72)); }; im.onerror = () => res(""); im.src = fr.result; }; fr.readAsDataURL(file); }); }
  V.estrategias = {
    view() {
      if (!S.d3Loaded) loadAllD().then(() => { if ((location.hash || "").startsWith("#estrategias")) re(); });
      const L = strats(), ed = S.esEdit;
      const cards = L.map(s => { if (ed === s.id) return `<div class="es-c ed">${stratForm(s)}</div>`; const k = stratStats(s.id), st = k.st;
        return `<article class="es-c">${s.img ? `<img class="es-img" src="${esc(s.img)}" alt="Captura de ejemplo de ${esc(s.name)}">` : `<div class="es-ph" aria-hidden="true"><svg viewBox="0 0 120 50" preserveAspectRatio="none"><polyline points="0,40 18,34 30,38 46,22 58,26 74,12 90,18 120,6"/></svg></div>`}
          <div class="es-b"><div class="es-h"><h3>${esc(s.name)}</h3><button type="button" class="xib" data-esedit="${esc(s.id)}" aria-label="Editar ${esc(s.name)}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/></svg></button></div>
          ${s.desc ? `<p class="es-d">${esc(s.desc)}</p>` : ""}<div class="es-m">${(s.syms || []).map(x => `<span>${esc(x)}</span>`).join("")}${s.start ? `<span>${esc(s.start)}–${esc(s.end || "")}</span>` : ""}</div>
          ${(s.conds || []).length ? `<ol class="es-cn">${s.conds.map(c => `<li>${esc(c)}</li>`).join("")}</ol>` : ""}
          <div class="es-n"><div><b>${k.n ? fmtMs(st.tot, st.mt) : "—"}</b><small>resultado</small></div><div><b>${k.n}</b><small>operaciones</small></div><div><b>${st.win == null ? "—" : Math.round(st.win) + " %"}</b><small>acierto</small></div><div><b>${k.inPlan == null ? "—" : k.inPlan + " %"}</b><small>en plan</small></div></div></div></article>`; }).join("");
      const untag = closed(S.trades || []).filter(t => !(t.review || {}).strat).length;
      return `<div class="stack es" style="gap:18px"><div class="xhead"><div><h1>Mis <em>estrategias</em></h1><div class="small muted">Cada estrategia con sus condiciones y sus resultados reales. Marca cuál usaste en cada operación desde el Diario.</div></div><button type="button" class="x-ch pri" data-esnew>${I(IC.plus, 14, 2)} Nueva estrategia</button></div>
        ${ed === "new" ? `<div class="es-c ed">${stratForm(null)}</div>` : ""}
        ${L.length ? `<div class="es-g">${cards}</div>${untag ? `<p class="small muted">${untag} ${untag === 1 ? "operación cerrada sin" : "operaciones cerradas sin"} estrategia. Márcalas en el <a href="#diario">Diario</a>.</p>` : ""}` : ed === "new" ? "" : `<div class="es-empty"><b>Aún no tienes estrategias</b><p>Escribe tu forma de operar: qué buscas, las condiciones para entrar y una captura de ejemplo. Después verás cuánto te da cada una.</p><button type="button" class="x-ch pri" data-esnew>Crear mi primera estrategia</button></div>`}</div>`;
    },
    bind() {
      $$("[data-esnew]").forEach(b => b.onclick = () => { S.esEdit = "new"; re(); });
      $$("[data-esedit]").forEach(b => b.onclick = () => { S.esEdit = b.dataset.esedit; re(); });
      $$("[data-escancel]").forEach(b => b.onclick = () => { S.esEdit = null; re(); });
      $$("[data-esdel]").forEach(b => b.onclick = async () => { if (!confirm("¿Borrar esta estrategia? Las operaciones marcadas con ella se quedan sin estrategia.")) return; const id = b.dataset.esdel; const { error } = await sb.from("docs").delete().eq("col", "strat").eq("id", id); if (error) return toast("No se pudo borrar"); S.strats = strats().filter(x => x.id !== id); S.esEdit = null; re(); });
      $$("[data-esform]").forEach(f => {
        let img = null; const old = strats().find(x => x.id === f.dataset.esform);
        f.querySelector("[name=img]").onchange = async e => { const fl = e.target.files && e.target.files[0]; if (fl) img = await shrink(fl); };
        f.addEventListener("paste", async e => { const it = [...(e.clipboardData || {}).items || []].find(i => i.type.startsWith("image/")); if (it) { img = await shrink(it.getAsFile()); toast("Captura añadida"); } });
        f.onsubmit = async e => { e.preventDefault(); const fd = new FormData(f), name = String(fd.get("name") || "").trim(); if (!name) return;
          const x = Object.assign({}, old || { id: "st" + Date.now().toString(36), created: Date.now() }, { name, desc: String(fd.get("desc") || "").trim(), syms: String(fd.get("syms") || "").split(/[,;]/).map(s => s.trim().toUpperCase()).filter(Boolean), start: fd.get("start") || "", end: fd.get("end") || "", conds: String(fd.get("conds") || "").split("\n").map(s => s.trim()).filter(Boolean) });
          if (img) x.img = img; const { id, ...data } = x; const ok = await saveDoc("strat", id, data); if (!ok) return;
          S.strats = strats().filter(s => s.id !== id).concat(x).sort((a, b) => (a.created || 0) - (b.created || 0)); S.esEdit = null; toast("Estrategia guardada"); re(); };
      });
    }
  };

  /* ---------------- recordatorios y lista antes de cada entrada (en Mi plan) ---------------- */
  const CHK_DEF = ["¿Encaja con una de mis estrategias?", "¿Tengo entrada, stop y objetivo claros?", "¿El riesgo es el de mi plan?", "¿Estoy tranquilo y con la cabeza aquí?", "¿Hay una noticia fuerte cerca?", "Si es que sí a todo, entro. Si no, espero."];
  const chkList = () => ((S.recs || {}).check || {}).items || CHK_DEF;
  window.tkEntryCheck = chkList;
  function recBlock() {
    const L = recList(), C = chkList(), ed = S.recEdit;
    return `<div class="rc-g"><div class="rc-c"><div class="rc-h"><span class="dj-k">Tus recordatorios</span>${ed === "rec" ? "" : `<button type="button" class="x-ch" data-recedit="rec">Editar</button>`}</div>
        ${ed === "rec" ? `<div class="rc-ed">${L.map((x, i) => `<div class="rc-row"><input class="input" data-rct="${i}" value="${esc(x.t)}" maxlength="140"><select class="xsel" data-rcw="${i}">${REC_W.map(([k, l]) => `<option value="${k}" ${x.w === k ? "selected" : ""}>${l}</option>`).join("")}</select><button type="button" class="xib" data-rcdel="${i}" aria-label="Quitar">${I(IC.trash, 14)}</button></div>`).join("")}<div class="row" style="gap:8px"><button type="button" class="x-ch" data-rcadd>+ Añadir</button><button type="button" class="x-ch pri" data-rcsave>Guardar</button></div></div>`
        : `<p class="rc-sub">Frases tuyas que Tickora te enseña en el momento justo.</p>${REC_W.map(([k, l]) => { const it = L.filter(x => x.w === k); return it.length ? `<div class="rc-w"><span>${l}</span>${it.map(x => `<p>«${esc(x.t)}»</p>`).join("")}</div>` : ""; }).join("")}`}</div>
      <div class="rc-c"><div class="rc-h"><span class="dj-k">Antes de cada entrada</span>${ed === "chk" ? "" : `<button type="button" class="x-ch" data-recedit="chk">Editar</button>`}</div>
        ${ed === "chk" ? `<div class="rc-ed"><textarea class="input" id="chkTa" rows="7" maxlength="900">${esc(C.join("\n"))}</textarea><small class="dj-sm">Una pregunta por línea.</small><div class="row" style="gap:8px"><button type="button" class="x-ch pri" data-chksave>Guardar</button><button type="button" class="x-ch" data-recedit="">Cancelar</button></div></div>`
        : `<p class="rc-sub">Te las pregunta el Gráfico antes de entrar.</p><ol class="rc-ck">${C.map(c => `<li>${esc(c)}</li>`).join("")}</ol>`}</div>
      <div class="rc-c rc-q"><span class="dj-k">Frase del día</span><p class="dj-sp">${esc(quoteToday())}</p><a class="x-ch" href="#estrategias">Mis estrategias →</a></div></div>`;
  }
  function bindRec() {
    $$("[data-recedit]").forEach(b => b.onclick = () => { S.recEdit = b.dataset.recedit || null; S.recDraft = recList().map(x => Object.assign({}, x)); re(); });
    const draft = () => S.recDraft || (S.recDraft = recList().map(x => Object.assign({}, x)));
    $$("[data-rct]").forEach(i => i.oninput = () => { draft()[+i.dataset.rct].t = i.value; });
    $$("[data-rcw]").forEach(i => i.onchange = () => { draft()[+i.dataset.rcw].w = i.value; });
    $$("[data-rcdel]").forEach(b => b.onclick = () => { draft().splice(+b.dataset.rcdel, 1); S.recs = S.recs || {}; S.recs.list = { items: draft() }; re(); });
    const ad = $("[data-rcadd]"); if (ad) ad.onclick = () => { draft().push({ t: "", w: "siempre" }); S.recs = S.recs || {}; S.recs.list = { items: draft() }; re(); };
    const sv = $("[data-rcsave]"); if (sv) sv.onclick = async () => { const items = draft().map(x => ({ t: String(x.t || "").trim(), w: x.w })).filter(x => x.t); S.recs = S.recs || {}; S.recs.list = { items }; await saveDoc("recs", "list", { items }); S.recEdit = null; S.recDraft = null; toast("Recordatorios guardados"); re(); };
    const cs = $("[data-chksave]"); if (cs) cs.onclick = async () => { const items = $("#chkTa").value.split("\n").map(s => s.trim()).filter(Boolean); S.recs = S.recs || {}; S.recs.check = { items }; await saveDoc("recs", "check", { items }); S.recEdit = null; toast("Lista guardada"); re(); };
  }
  const PL0 = V.plan;
  if (PL0) V.plan = {
    view(r) { if (!S.d3Loaded) loadAllD().then(() => { if ((location.hash || "").startsWith("#plan")) re(); }); const h = PL0.view(r); const i = h.indexOf('<div class="pg-edit">'); const blk = `<div class="tn-sep"><span>Tu libro de reglas</span></div>${recBlock()}`; return i > 0 ? h.slice(0, i) + blk + h.slice(i) : h + blk; },
    bind(r) { if (PL0.bind) PL0.bind(r); bindRec(); }
  };

  window.TK_X3 = { loadAllD, setReview, saveDoc, dlogOf, setDlog, answered, saidOf, micBtn, startMic, recList, strats, stratName, WHY_BAD, autoGrow };

  /* ---------------- arranque ---------------- */
  setInterval(() => { if (S.user && S.trades) { if (!S.d3Loaded) loadAllD(); else checkSheet(); } }, 20000);
  setTimeout(() => { if (S.user && S.trades) loadAllD().then(checkSheet); }, 2500);
  if (A.S && A.S.loaded) { A.S.lastView = null; A.render(); }
})();
