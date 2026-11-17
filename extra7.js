/* Tickora · «Cómo funcionas tú» (16-nov-2026): mezcla de «Tus dos versiones» (C) y «Tu mapa de trader» (B).
   Todo se calcula con los datos del propio usuario: operaciones, chequeos, cierres, Conócete y ayudas. */
(function () {
  "use strict";
  const A = window.TKAPP, X2 = window.TK_X2, X3 = window.TK_X3, V = window.TK_VIEWS;
  if (!A || !X2 || !V) return;
  const { S, sb, esc, toast, evaluate, dayKey, todayKey } = A;
  const { re, healthOk, loadMente, PTRIG, PCALM, PTONE, mDone } = X2;
  const lab = (L, v) => (L.find(x => x[0] === v) || [])[1] || "";
  const WD = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
  const STL = { Tranquilo: "Tranquilo y descansado", Normal: "Normal", Nervioso: "Nervioso o con prisa", Cansado: "Cansado o con poco sueño" };
  const EXP = { empiezo: "Estoy empezando", "6m": "Menos de 6 meses", "2a": "De 6 meses a 2 años", mas: "Más de 2 años" };
  const GOAL = { reto: "Aprobar un reto de fondeo", extra: "Ganar un dinero extra", vivir: "Vivir del trading", aprender: "Aprender a operar bien" };
  const d10 = p => Math.round(p * 10);
  const hh = h => `${h}:00`;

  const stOf = k => {
    if (!healthOk()) return null; const m = (S.mente || {})[k]; if (!m || !mDone(m)) return null;
    if (m.emo === "cansado" || m.r <= 2) return "Cansado";
    if (["nervioso", "frustrado", "prisa", "miedo"].includes(m.emo) || m.c <= 2) return "Nervioso";
    if ((m.emo === "tranquilo" || m.emo === "ganas" || !m.emo) && m.c >= 4 && m.r >= 3) return "Tranquilo";
    return "Normal";
  };
  function rowsOf() {
    const C = (S.trades || []).filter(t => t.status === "closed" && t.open_time).sort((a, b) => new Date(a.open_time) - new Date(b.open_time));
    const byDay = {}; C.forEach(t => { const k = dayKey(t.open_time); (byDay[k] = byDay[k] || []).push(t); });
    return C.map(t => {
      const k = dayKey(t.open_time), same = byDay[k], i = same.indexOf(t), p1 = same[i - 1], p2 = same[i - 2], ev = evaluate(t);
      return { t, good: ev.good, k, st: stOf(k), h: new Date(t.open_time).getHours(), wd: new Date(t.open_time).getDay(), n: i + 1,
        afterLoss: p1 ? +p1.r < 0 : null, after2W: !!(p1 && p2 && +p1.r > 0 && +p2.r > 0), riskUp: !!(p1 && +p1.r < 0 && ev.fail.some(f => /arriesgaste/i.test(f.bad || ""))) };
    });
  }
  /* cada «factor» divide tus operaciones en grupos y mira en cuál cumples más y en cuál menos */
  function factors(R) {
    const F = [
      { id: "st", key: r => r.st },
      { id: "h", key: r => r.h },
      { id: "n", key: r => r.n <= 2 ? "12" : "3+" },
      { id: "al", key: r => r.afterLoss == null ? null : r.afterLoss ? "si" : "no" },
      { id: "wd", key: r => r.wd }
    ];
    return F.map(f => {
      const g = {}; R.forEach(r => { const v = f.key(r); if (v == null) return; (g[v] = g[v] || []).push(r.good); });
      const L = Object.entries(g).filter(([, a]) => a.length >= 3).map(([v, a]) => ({ v: isNaN(+v) || f.id === "n" ? v : +v, n: a.length, p: a.filter(Boolean).length / a.length }));
      if (L.length < 2) return null;
      L.sort((a, b) => b.p - a.p || b.n - a.n);
      return Object.assign({}, f, { best: L[0], worst: L[L.length - 1], gap: L[0].p - L[L.length - 1].p, all: L });
    }).filter(Boolean);
  }
  const phraseOf = good => { if (!X3) return null; const R = (S.trades || []).filter(t => t.status === "closed" && t.review && evaluate(t).good === good).sort((a, b) => new Date(b.open_time) - new Date(a.open_time)); for (const t of R) { const s = X3.saidOf(t.review); if (s && s.length > 6) return s; } return null; };

  /* ---------- tus dos versiones ---------- */
  function versions(R, F) {
    const need = 20;
    if (R.length < need || !F.some(f => f.gap >= .2)) {
      return `<div class="cf-wait dj-c"><span class="dj-k">Tus dos versiones</span><h2>Aún te estoy conociendo</h2><p>Con ${need} operaciones cerradas Tickora podrá enseñarte al trader que cumple su plan y al que no, y qué los separa. Llevas ${R.length}.</p><div class="cf-bar"><i style="width:${Math.min(100, R.length / need * 100)}%"></i></div></div>`;
    }
    const fv = id => F.find(f => f.id === id && f.gap >= .15);
    const match = (r, which) => F.filter(f => f.gap >= .15).filter(f => { const v = f.key(r); return v != null && String(v) === String(f[which].v); }).length;
    const grp = which => { const M = R.filter(r => match(r, which) >= 2); return M.length >= 3 ? M.filter(r => r.good).length / M.length : F.slice().sort((a, b) => b.gap - a.gap)[0][which].p; };
    const pB = grp("best"), pW = grp("worst");
    const rowsL = [];
    const row = (k, b, w) => { if (b || w) rowsL.push([k, b || "—", w || "—"]); return ""; };
    const st = fv("st"), h = fv("h"), n = fv("n"), wd = fv("wd");
    const AL = R.filter(r => r.afterLoss), alBad = AL.filter(r => !r.good).length, ru = AL.filter(r => r.riskUp).length;
    const pg = phraseOf(true), pb = phraseOf(false), nm = (S.name || "").split(" ")[0] || "tú";
    [
      row("Llega", st && STL[st.best.v], st && STL[st.worst.v]),
      row("Opera", h ? `De ${hh(h.best.v)} a ${hh(h.best.v + 1)}${wd ? `, sobre todo los ${WD[wd.best.v]}` : ""}` : wd && `Sobre todo los ${WD[wd.best.v]}`, h ? `De ${hh(h.worst.v)} a ${hh(h.worst.v + 1)}${wd ? ` y los ${WD[wd.worst.v]}` : ""}` : wd && `Los ${WD[wd.worst.v]}`),
      row("Hace", n && (n.best.v === "12" ? "1 o 2 operaciones y para" : "3 o más operaciones"), n && (n.worst.v === "12" ? "1 o 2 operaciones" : "3 o más operaciones")),
      AL.length >= 3 ? row("Tras perder", `Sigue su plan (${AL.length - alBad} de ${AL.length} veces)`, ru && ru * 2 >= alBad ? `Entra con más tamaño (${ru} de ${AL.length} veces)` : `Rompe el plan (${alBad} de ${AL.length} veces)`) : "",
      row("Escribe", pg && `«${esc(pg)}»`, pb && `«${esc(pb)}»`)
    ];
    const rws = j => `<div class="cf-rows">${rowsL.map(r => `<div class="cf-r"><small>${r[0]}</small><span>${r[j]}</span></div>`).join("")}</div>`;
    const T = F.filter(f => f.gap >= .15).sort((a, b) => b.gap - a.gap).map(f => three(f)).filter(Boolean).slice(0, 3);
    const who = esc(nm === "tú" ? "trader" : nm);
    return `<div class="cf-vs"><div class="cf-side best"><span class="cf-k">Tu mejor versión</span><h2>El ${who} que cumple</h2><div class="cf-big">${d10(pB)} de 10<small>operaciones dentro del plan</small></div>${rws(1)}</div>
      <div class="cf-mid" aria-hidden="true"><i></i><span>Lo que os separa</span><i></i></div>
      <div class="cf-side worst"><span class="cf-k">Tu peor versión</span><h2>El ${who} que se lía</h2><div class="cf-big">${d10(pW)} de 10<small>operaciones dentro del plan</small></div>${rws(2)}</div></div>
      ${T.length ? `<div class="cf-three"><h3>Las ${T.length === 1 ? "cosa" : T.length === 2 ? "dos cosas" : "tres cosas"} que te convierten en tu mejor versión</h3><div class="cf-tg">${T.map((t, i) => `<div><b>${i + 1} · ${t[0]}</b><p>${t[1]}</p></div>`).join("")}</div></div>` : ""}`;
  }
  function three(f) {
    const x = d10(f.worst.p), y = d10(f.best.p);
    if (f.id === "st") { const hard = f.worst.v === "Cansado" || f.worst.v === "Nervioso";
      return [hard ? `Los días ${f.worst.v === "Cansado" ? "cansado" : "nervioso"}, menos` : `Ojo cuando llegas ${f.worst.v === "Tranquilo" ? "tranquilo" : "normal"}`, `Llegando ${STL[f.worst.v].toLowerCase()} cumples el plan ${x} de cada 10 veces; ${STL[f.best.v].toLowerCase()}, ${y}.${hard ? " Esos días, una operación menos." : " Haz tu chequeo con calma también esos días."}`]; }
    if (f.id === "h") return [`Opera en tu mejor hora`, `De ${hh(f.best.v)} a ${hh(f.best.v + 1)} cumples ${y} de cada 10; de ${hh(f.worst.v)} a ${hh(f.worst.v + 1)}, solo ${x}.`];
    if (f.id === "n" && f.best.v === "12") return [`Para tras dos operaciones`, `En tus dos primeras operaciones del día cumples ${y} de cada 10; a partir de la tercera, ${x}.`];
    if (f.id === "al" && f.worst.v === "si") return [`Para tras una pérdida`, `Después de perder cumples el plan ${x} de cada 10 veces; el resto, ${y}. Una pausa entre medias te protege.`];
    if (f.id === "wd") return [`Cuidado los ${WD[f.worst.v]}`, `Los ${WD[f.worst.v]} cumples ${x} de cada 10; los ${WD[f.best.v]}, ${y}.`];
    return null;
  }

  /* ---------- lo que te saca del plan ---------- */
  function triggers(R, F, P) {
    const hide = P.hide || [], ok = P.ok || [], out = [];
    const stat = (L, txt) => L.length >= 3 ? { n: L.length, bad: L.filter(r => !r.good).length, txt } : null;
    const decl = { revancha: stat(R.filter(r => r.afterLoss), "veces rompiste el plan tras una pérdida"), euforia: stat(R.filter(r => r.after2W), "veces rompiste el plan tras dos ganancias"), cansancio: stat(R.filter(r => r.st === "Cansado"), "veces rompiste el plan llegando cansado") };
    (P.trig || []).forEach(k => {
      if (hide.includes(k)) return; const d = decl[k];
      out.push({ id: k, title: lab(PTRIG, k), metric: d ? `${d.bad} de ${d.n}` : "", w: d ? d.bad / d.n : 0, sub: d ? `${d.bad} de ${d.n} ${d.txt}` : "Lo dijiste en el Conócete. Lo confirmaré con tus operaciones.", src: d ? (d.bad / d.n >= .4 ? "Lo dijiste tú y lo confirman tus operaciones" : "Lo dijiste tú, pero tus operaciones dicen que lo llevas bien") : "Lo dijiste tú" });
    });
    const wd = F.find(f => f.id === "wd" && f.gap >= .2), h = F.find(f => f.id === "h" && f.gap >= .2), n = F.find(f => f.id === "n" && f.gap >= .2 && f.worst.v === "3+");
    if (wd && !hide.includes("wd")) out.push({ id: "wd", title: `Los ${WD[wd.worst.v]}`, metric: `${d10(wd.worst.p)} de 10`, w: 1 - wd.worst.p, sub: `Cumples el plan ${d10(wd.worst.p)} de cada 10 veces; tu mejor día, ${d10(wd.best.p)}`, src: "Descubierto por Tickora" });
    if (h && !hide.includes("h")) out.push({ id: "h", title: `A partir de las ${hh(h.worst.v)}`, metric: `${d10(h.worst.p)} de 10`, w: 1 - h.worst.p, sub: `De ${hh(h.worst.v)} a ${hh(h.worst.v + 1)} cumples ${d10(h.worst.p)} de cada 10`, src: "Descubierto por Tickora" });
    if (n && !hide.includes("n")) out.push({ id: "n", title: "Operar de más", metric: `${d10(n.worst.p)} de 10`, w: 1 - n.worst.p, sub: `Desde tu tercera operación del día cumples ${d10(n.worst.p)} de cada 10`, src: "Descubierto por Tickora" });
    if (!out.length) return `<p class="cf-p">${(P.trig || []).length ? "Has quitado todo lo de esta lista." : "Haz el Conócete y opera unos días: aquí aparecerá lo que más te saca del plan."}</p>`;
    return out.slice(0, 5).map(o => `<div class="cf-tgc"><div class="cf-tt"><b>${esc(o.title)}</b>${o.metric ? `<span class="mono">${o.metric}</span>` : ""}</div>${o.metric ? `<div class="cf-m"><i style="width:${Math.round(o.w * 100)}%"></i></div>` : ""}<small>${esc(o.sub)}</small><div class="cf-yn"><span>${o.src}</span>${ok.includes(o.id) ? `<em>Confirmado por ti</em>` : `<button type="button" data-cfyes="${o.id}">Es verdad</button>`}<button type="button" data-cfno="${o.id}">No es así</button></div></div>`).join("");
  }

  /* ---------- dónde cumples tu plan: hora × cómo llegas (o día de la semana) ---------- */
  function heat(R) {
    const withSt = R.filter(r => r.st), useSt = withSt.length >= 6;
    const rowsK = useSt ? ["Tranquilo", "Normal", "Nervioso", "Cansado"].filter(s => withSt.some(r => r.st === s)) : [1, 2, 3, 4, 5].filter(d => R.some(r => r.wd === d));
    const cnt = {}; R.forEach(r => cnt[r.h] = (cnt[r.h] || 0) + 1);
    const cols = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => +e[0]).sort((a, b) => a - b);
    if (R.length < 6 || !cols.length || !rowsK.length) return `<p class="cf-p">Con unas cuantas operaciones más verás aquí a qué horas${healthOk() ? " y llegando cómo" : ""} cumples tu plan.</p>`;
    const cell = (rk, h) => { const L = R.filter(r => r.h === h && (useSt ? r.st === rk : r.wd === rk)); if (L.length < 2) return `<span class="hm0">—</span>`; const p = L.filter(r => r.good).length / L.length; return `<span class="hm${p >= .8 ? 4 : p >= .6 ? 3 : p >= .4 ? 2 : 1}" title="${L.length} operaciones">${Math.round(p * 100)}</span>`; };
    return `<div class="cf-hm" style="grid-template-columns:96px repeat(${cols.length},1fr)"><span></span>${cols.map(h => `<span class="cf-hh">${hh(h)}</span>`).join("")}${rowsK.map(rk => `<span class="cf-hr">${useSt ? rk : ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"][rk]}</span>${cols.map(h => cell(rk, h)).join("")}`).join("")}</div>
      <p class="cf-p">% de operaciones dentro del plan por hora${useSt ? " y según cómo llegaste (tu chequeo)" : " y día de la semana"}. «—» = menos de 2 operaciones.</p>`;
  }

  /* ---------- lo que funciona contigo ---------- */
  function helps(R) {
    const H = S.helps || [], P = S.menteP || {}, calm = (P.calm || [])[0];
    const res = k => { const E = H.filter(e => e.k === k); if (!E.length) return null; let w = 0; E.forEach(e => { const nx = R.find(r => new Date(r.t.open_time).getTime() > e.ts && dayKey(r.t.open_time) === dayKey(new Date(e.ts))); if (!nx || nx.good) w++; }); return [w, E.length]; };
    const L = [["pausa", "Pausa recomendada"], ["bloqueo", "Bloquear Tickora"]].map(([k, l]) => { const r = res(k); return r ? `<div class="cf-w"><span>${l}</span><b class="mono">${r[0]} de ${r[1]}</b><i><u style="width:${Math.round(r[0] / r[1] * 100)}%"></u></i></div>` : ""; }).join("");
    return `${L || `<p class="cf-p">Aún no has usado ninguna pausa ni bloqueo. Cuando lo hagas, Tickora mirará si tu siguiente operación fue dentro del plan, y aquí verás qué te funciona.</p>`}
      ${L ? `<p class="cf-p">Cuenta como «funcionó» si tu siguiente operación ese día fue dentro del plan, o si no volviste a operar.</p>` : ""}
      ${calm ? `<div class="cf-calm"><small>Lo que me dijiste que te calma</small>${esc(lab(PCALM, calm))}</div>` : ""}`;
  }

  /* ---------- la página ---------- */
  function know(R) {
    const ch = Object.values(S.mente || {}).filter(m => mDone(m)).length, ci = Object.entries(S.dlog || {}).filter(([k, d]) => /^d/.test(k) && d && d.close && (d.close.bien || d.close.mejor || d.close.manana)).length, tot = R.length + ch + ci;
    const lv = tot < 25 ? "Empezando a conocerte" : tot < 80 ? "Bastante" : tot < 160 ? "Bien" : "De verdad";
    return `<div class="dj-c"><span class="dj-k">Cuánto te conozco</span><b class="cf-lv">${lv}</b><div class="cf-bar"><i style="width:${Math.min(100, tot / 160 * 100)}%"></i></div><p class="cf-p">${R.length} operaciones, ${ch} chequeos y ${ci} cierres. ${tot < 160 ? "Cuanto más uses Tickora, mejor te conoceré." : "Ya te conozco bien."}</p></div>`;
  }
  function week(R) {
    const now = Date.now(), a = R.filter(r => now - new Date(r.t.open_time) < 7 * 864e5), b = R.filter(r => { const d = now - new Date(r.t.open_time); return d >= 7 * 864e5 && d < 14 * 864e5; });
    const p = L => L.length ? d10(L.filter(r => r.good).length / L.length) : null, pa = p(a), pb = p(b);
    const L = [];
    if (pa != null) L.push(pb != null ? `Esta semana cumples el plan <b>${pa} de 10</b> veces; la anterior, ${pb}.` : `Esta semana cumples el plan <b>${pa} de 10</b> veces.`);
    const F = factors(R).filter(f => f.gap >= .2).sort((x, y) => y.gap - x.gap)[0]; if (F && three(F)) L.push(`Lo que más te separa de tu mejor versión: <b>${three(F)[0].toLowerCase()}</b>.`);
    return L.length ? `<div class="dj-c"><span class="dj-k">Esta semana</span>${L.map(x => `<p class="cf-p" style="margin-top:6px">${x}</p>`).join("")}</div>` : "";
  }
  function ficha(R, P) {
    const nm = S.name || "Tú", ini = nm.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const sy = {}; R.slice(-60).forEach(r => sy[r.t.symbol] = (sy[r.t.symbol] || 0) + 1); const mk = Object.entries(sy).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]).join(", ");
    if (P.v !== 2) return `<div class="cn-card"><div class="cn-hd"><span class="cn-ph">${esc(ini)}</span><div><b>${esc(nm)}</b><small>Tu ficha está sin hacer</small></div></div><p class="cf-p" style="margin-top:12px">Con el Conócete (2 minutos) Tickora sabrá qué te saca del plan, qué te calma y cómo quieres que te hable.</p><a class="x-ch pri" href="#conocete" style="margin-top:12px;display:inline-flex">Hacer el Conócete</a></div>`;
    return `<div class="cn-card"><div class="cn-hd"><span class="cn-ph">${esc(ini)}</span><div><b>${esc(nm)}</b><small>Trader · ${esc((EXP[P.exp] || "").toLowerCase())}</small></div></div>
      <div class="cn-st"><div><small>Objetivo</small>${esc(GOAL[P.goal] || "—")}</div><div><small>Tono</small>${esc(lab(PTONE, P.tone) || "—")}</div><div><small>Te calma</small>${esc(lab(PCALM, (P.calm || [])[0]) || "—")}</div><div><small>Mercados</small>${esc(mk || "—")}</div></div>
      ${P.why ? `<div class="cn-why">«${esc(P.why)}»</div>` : ""}<a class="cf-edit" href="#conocete">Cambiar mi ficha</a></div>`;
  }
  function phraseCard() {
    let s = phraseOf(false), from = "Lo escribiste tras una operación fuera del plan";
    if (!s) { const D = Object.entries(S.dlog || {}).filter(([k, d]) => /^d/.test(k) && d && d.close && d.close.manana).sort((a, b) => a[0] < b[0] ? 1 : -1)[0]; if (D) { s = D[1].close.manana; from = "Tu «una cosa para mañana» más reciente"; } }
    return `<div class="dj-c"><span class="dj-k">Tu frase clave</span>${s ? `<p class="cf-q">«${esc(s)}»</p><p class="cf-p">${from}. Tickora te la recordará cuando vuelvas a esa situación.</p>` : `<p class="cf-p">Cuando escribas por qué entraste o tu cierre del día, aquí aparecerá la frase que más te puede ayudar.</p>`}</div>`;
  }
  let loading = false;
  function ensure() {
    if (loading) return; const need = [];
    if (healthOk() && !S.menteLoaded) need.push(loadMente());
    if (X3 && !S.d3Loaded) need.push(X3.loadAllD());
    if (!S.helps && window.tkHelpsLoad) need.push(window.tkHelpsLoad());
    if (!need.length) return; loading = true;
    Promise.all(need.map(p => Promise.resolve(p).catch(() => 0))).then(() => { loading = false; if (location.hash.startsWith("#comofuncionas")) { S.lastView = null; re(); } });
  }
  V.comofuncionas = {
    view() {
      ensure();
      const R = rowsOf(), F = factors(R), P = S.menteP || {};
      return `<div class="stack cf" style="gap:18px"><div class="xhead"><div><h1>Cómo funcionas <em>tú</em></h1><div class="small muted">Todo lo que Tickora sabe de ti, calculado con tus operaciones${healthOk() ? ", tus chequeos" : ""} y lo que escribes. Se actualiza solo</div></div></div>
        ${versions(R, F)}
        <div class="cf-g"><div class="cf-col">${ficha(R, P)}${know(R)}${week(R)}</div>
          <div class="cf-col"><div class="dj-c"><span class="dj-k">Lo que te saca del plan</span><div class="cf-tgl">${triggers(R, F, P)}</div></div><div class="dj-c"><span class="dj-k">Dónde cumples tu plan</span>${heat(R)}</div></div>
          <div class="cf-col"><div class="dj-c"><span class="dj-k">Lo que funciona contigo</span>${helps(R)}</div>${phraseCard()}<p class="cf-p cf-ctl">Lo que marques como «No es así» deja de usarse. <button type="button" data-cfreset>Borrar lo que Tickora ha deducido de ti</button></p></div></div></div>`;
    },
    bind() {
      const P = () => Object.assign({}, S.menteP || {}), save = async p => { S.menteP = p; if (!healthOk()) { S.lastView = null; re(); return; } const { error } = await sb.from("docs").upsert({ user_id: S.user.id, col: "mente", id: "perfil", data: p, updated_at: new Date().toISOString() }); if (error) toast("No se pudo guardar"); S.lastView = null; re(); };
      document.querySelectorAll("[data-cfno]").forEach(b => b.onclick = () => { const p = P(), k = b.dataset.cfno; p.hide = [...new Set((p.hide || []).concat(k))]; p.trig = (p.trig || []).filter(x => x !== k); p.ok = (p.ok || []).filter(x => x !== k); save(p); toast("Quitado: Tickora deja de usarlo"); });
      document.querySelectorAll("[data-cfyes]").forEach(b => b.onclick = () => { const p = P(), k = b.dataset.cfyes; p.ok = [...new Set((p.ok || []).concat(k))]; save(p); });
      const rs = document.querySelector("[data-cfreset]"); if (rs) rs.onclick = () => { if (!confirm("¿Borrar lo que Tickora ha deducido de ti (confirmaciones y lo que quitaste)? Tu ficha del Conócete se queda.")) return; const p = P(); delete p.hide; delete p.ok; save(p); };
    }
  };
  /* si la página se abrió directamente aquí y se pintó antes de que existiera esta vista, se vuelve a pintar */
  const fix = () => { if (location.hash.startsWith("#comofuncionas") && S.user && !document.querySelector(".cf")) { S.lastView = null; A.render(); } };
  [0, 800, 2500, 5000].forEach(ms => setTimeout(fix, ms)); window.addEventListener("load", () => setTimeout(fix, 300));
})();
