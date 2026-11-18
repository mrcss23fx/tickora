/* Tickora · «Lo que te ahorras» (18-nov-2026): el parte de la semana (opción A) y la franja de Inicio (opción B).
   Se compara al usuario consigo mismo: lo que le costaban sus errores evitables al empezar (o antes de Tickora, si subió
   su historial) frente a lo que le cuestan ahora. Todo es una estimación con sus datos y se dice así. */
(function () {
  "use strict";
  const A = window.TKAPP, V = window.TK_VIEWS; if (!A || !V) return;
  const { S, sb, esc, evaluate, mOf, moneyOn, num, dayKey, CURS, dispCur, toast } = A;
  const DAY = 864e5, MIN_W = 3, MIN_T = 20;
  const ICO = {
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    pause: '<circle cx="12" cy="12" r="8"/><path d="M10 9v6M14 9v6"/>',
    rule: '<path d="M5 12l4 4 10-10"/>',
    l: '<path d="M15 6l-6 6 6 6"/>', r: '<path d="M9 6l6 6-6 6"/>'
  };
  const ic = (k, s) => `<svg width="${s || 18}" height="${s || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>`;
  const addW = (w, n) => monday(w + n * 7 * DAY + 3 * DAY);
  const monday = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return d.getTime(); };
  const M = () => moneyOn();
  const val = t => { if (M()) { const m = mOf(t); return m == null ? null : m; } return t.r == null ? null : +t.r; };
  const fmt = (v, sign) => { if (v == null || !isFinite(v)) return "—"; const s = sign && v > 0.5 ? "+" : sign && v < -0.5 ? "−" : ""; if (!M()) return s + num(Math.abs(v), 1).replace(/,0$/, "") + " R"; const c = dispCur(); return s + num(Math.round(Math.abs(v)), 0) + " " + (CURS[c] || c); };
  const RULE = [["stop", /sin stop|moviste el stop/i, "poner y respetar el stop"], ["riesgo", /arriesgaste/i, "tu riesgo por operación"], ["horario", /horario/i, "tu horario"], ["maxops", /operación número/i, "tu máximo de operaciones"], ["limite", /límite/i, "tu límite del día"]];
  const fmtWeek = w => { const a = new Date(w), b = new Date(w + 6 * DAY), m = d => d.toLocaleDateString("es-ES", { month: "long" }); return a.getMonth() === b.getMonth() ? `del ${a.getDate()} al ${b.getDate()} de ${m(b)}` : `del ${a.getDate()} de ${m(a)} al ${b.getDate()} de ${m(b)}`; };
  const short = w => new Date(w).toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");

  /* ---------- datos ---------- */
  let evs = null, evLoading = false;
  async function loadEvents() {
    if (evLoading || evs) return; evLoading = true;
    try { const { data } = await sb.from("bridge_lockev").select("ts,kind,sym,reason").gte("ts", new Date(Date.now() - 400 * DAY).toISOString()).order("ts", { ascending: false }).limit(1000); evs = data || []; } catch (e) { evs = []; }
    evLoading = false; rep();
  }
  function rows() {
    const C = (S.trades || []).filter(t => t.status === "closed" && t.open_time).sort((a, b) => new Date(a.open_time) - new Date(b.open_time));
    const byDay = {}; C.forEach(t => { const k = dayKey(t.open_time); (byDay[k] = byDay[k] || []).push(t); });
    return C.map(t => { const k = dayKey(t.open_time), d = byDay[k], i = d.indexOf(t), e = evaluate(t), v = val(t), p1 = d[i - 1], p2 = d[i - 2];
      return { t, ts: new Date(t.open_time).getTime(), w: monday(t.open_time), k, good: e.good, fail: e.fail.map(f => f.bad || ""), v, afterLoss: !!(p1 && +p1.r < 0), after2L: !!(p1 && p2 && +p1.r < 0 && +p2.r < 0) }; });
  }
  const costOf = L => L.filter(r => !r.good && r.v != null && r.v < 0).reduce((s, r) => s - r.v, 0);
  const avgLoss = L => { const x = L.filter(r => r.v != null); if (x.length < 2) return 0; const m = x.reduce((s, r) => s + r.v, 0) / x.length; return m < 0 ? -m : 0; };
  const weeksOf = L => [...new Set(L.map(r => r.w))].sort((a, b) => a - b);
  function model() {
    const R = rows(); if (!R.length) return { state: "vacio" };
    const start = S.user && S.user.created_at ? new Date(S.user.created_at).getTime() : 0;
    let base = R.filter(r => r.ts < start), pre = true;
    { const W = weeksOf(base).slice(-8); base = base.filter(r => W.includes(r.w)); }
    if (base.length < MIN_T || weeksOf(base).length < MIN_W) {
      pre = false; base = []; const W = weeksOf(R);
      for (const w of W) { base = R.filter(r => r.w <= w); if (weeksOf(base).length >= 4 && base.length >= MIN_T) break; }
      if (base.length < MIN_T || weeksOf(base).length < MIN_W) return { state: "conociendo", n: R.length, wk: weeksOf(R).length };
    }
    const BW = weeksOf(base), bEnd = BW[BW.length - 1], after = R.filter(r => r.w > bEnd);
    const bWeek = costOf(base) / BW.length, bEvN = base.filter(r => !r.good).length / BW.length, bPlan = base.filter(r => r.good).length / base.length;
    const sit = { dos: avgLoss(base.filter(r => r.after2L)), horario: avgLoss(base.filter(r => r.fail.some(f => /horario/i.test(f)))), maxops: avgLoss(base.filter(r => r.fail.some(f => /operación número/i.test(f)))), limite: avgLoss(base.filter(r => r.fail.some(f => /límite/i.test(f)))), evit: avgLoss(base.filter(r => !r.good)), afterLoss: avgLoss(base.filter(r => r.afterLoss)) };
    const rate = {}; RULE.forEach(([k, re]) => { rate[k] = base.filter(r => r.fail.some(f => re.test(f))).length / BW.length; });
    const tw = monday(Date.now()), AW = weeksOf(after), total = AW.reduce((s, w) => s + (bWeek - costOf(after.filter(r => r.w === w))), 0);
    return { state: "ok", R, base, BW, bEnd, after, bWeek, bEvN, bPlan, sit, rate, pre, total, tw };
  }
  function week(Mo, w) {
    const L = Mo.R.filter(r => r.w === w), cost = costOf(L), saved = Mo.bWeek - cost, now = Date.now();
    const lastDay = Math.min(4, w === Mo.tw ? ((new Date().getDay() + 6) % 7) : 4);
    let days = 0, won = 0; for (let i = 0; i <= lastDay; i++) { const k = dayKey(w + i * DAY + 12 * 3600e3); if (w + i * DAY > now) break; days++; if (!L.some(r => r.k === k && !r.good)) won++; }
    /* de dónde sale */
    const wEnd = w + 7 * DAY, E = (evs || []).filter(e => { const t = new Date(e.ts).getTime(); return t >= w && t < wEnd && ["cerrada", "mt5", "orden"].includes(e.kind); });
    const lockV = E.reduce((s, e) => s + (Mo.sit[e.reason] != null ? Mo.sit[e.reason] : Mo.sit.evit) || 0, 0);
    const H = (S.helps || []).filter(h => h.ts >= w && h.ts < wEnd && (h.k === "pausa" || h.k === "bloqueo"));
    const worked = H.filter(h => { const nx = Mo.R.find(r => r.ts > h.ts && r.k === dayKey(h.ts)); return !nx || nx.good; });
    const pauseV = worked.length * (Mo.sit.afterLoss || Mo.sit.evit || 0);
    let best = null; RULE.forEach(([k, re, l]) => { const n = L.filter(r => r.fail.some(f => re.test(f))).length, d = Mo.rate[k] - n; if (Mo.rate[k] >= 0.5 && d > 0 && (!best || d > best.d)) best = { k, l, n, was: Mo.rate[k], d }; });
    let lv = lockV, pv = pauseV; const pos = Math.max(0, saved);
    if (lv + pv > pos && lv + pv > 0) { const k = pos / (lv + pv); lv *= k; pv *= k; }
    const rest = Math.max(0, pos - lv - pv);
    const reasons = [...new Set(E.map(e => ({ dos: "tras dos pérdidas", horario: "fuera de horario", maxops: "al pasar tu máximo", limite: "en tu límite del día", noticia: "con noticia fuerte", manual: "con tu bloqueo", chequeo: "sin chequeo", semaforo: "con el semáforo en rojo" }[e.reason] || "por tus normas")))];
    return { L, cost, saved, days, won, E, lv, H, worked, pv, best, rest, reasons, plan: L.length ? L.filter(r => r.good).length / L.length : null, evN: L.filter(r => !r.good).length };
  }

  /* ---------- la franja de Inicio ---------- */
  window.tkSaveStrip = () => {
    try {
      if (!S.loaded || !(S.trades || []).length) return "";
      if (evs === null) loadEvents(); if (!S.helps && window.tkHelpsLoad) window.tkHelpsLoad().then(rep).catch(() => 0);
      const Mo = model(); if (Mo.state === "conociendo") { const f = Math.max(0, MIN_T - Mo.n); return `<a class="sv-strip lite" href="#ahorro"><span class="sv-ic">${ic("lock")}</span><span><b>Te estoy conociendo.</b> ${f ? `En ${f} operaciones más` : `En ${MIN_W - Mo.wk} semana${MIN_W - Mo.wk === 1 ? "" : "s"} más`} verás cada semana lo que te ahorras con Tickora.</span></a>`; }
      if (Mo.state !== "ok") return "";
      const W = week(Mo, Mo.tw);
      if (!W.L.length) return Mo.total > 0 ? `<a class="sv-strip" href="#ahorro"><span class="sv-ic">${ic("lock")}</span><span class="sv-st"><small>Con Tickora, desde que empezaste</small><span><b class="sv-n">${fmt(Mo.total)}</b> que antes perdías en errores evitables</span></span><span class="sv-go">Ver tu parte</span></a>` : "";
      return W.saved > 0 ? `<a class="sv-strip" href="#ahorro"><span class="sv-ic">${ic("lock")}</span><span class="sv-st"><small>Con Tickora, esta semana</small><span><b class="sv-n">${fmt(W.saved)}</b> que antes perdías${Mo.total > W.saved ? ` · ${fmt(Mo.total)} desde que empezaste` : ""}</span></span><span class="sv-go">Ver de dónde sale</span></a>`
        : `<a class="sv-strip lite" href="#ahorro"><span class="sv-ic">${ic("lock")}</span><span>Esta semana tus errores evitables te han costado <b>${fmt(W.cost)}</b>. ${Mo.pre ? "Antes de Tickora" : "Al empezar"}, ${fmt(Mo.bWeek)} por semana.</span></a>`;
    } catch (e) { return ""; }
  };

  /* ---------- el parte de la semana ---------- */
  let selW = null;
  function bars(Mo, w) {
    const W = []; for (let i = 5; i >= 0; i--) W.push(addW(w, -i));
    const C = W.map(x => { const L = Mo.R.filter(r => r.w === x); return L.length ? costOf(L) : null; }), mx = Math.max(Mo.bWeek, ...C.filter(c => c != null), 1);
    return `<div class="sv-bars" style="--base:${(Mo.bWeek / mx * 100).toFixed(1)}"><i class="sv-base"><span>${Mo.pre ? "Antes de Tickora" : "Al empezar"} · ${fmt(Mo.bWeek)}</span></i>${W.map((x, i) => { const c = C[i], now = x === w, pre = x <= Mo.bEnd; return `<div class="${now ? "now" : ""}${pre ? " pre" : ""}"><em>${c == null ? "—" : c ? "−" + fmt(c) : fmt(0)}</em><b style="height:${c == null ? 0 : Math.max(2, c / mx * 100)}%"></b><span>${now ? "Esta" : short(x)}</span></div>`; }).join("")}</div>`;
  }
  function viewAhorro() {
    if (evs === null) loadEvents(); if (!S.helps && window.tkHelpsLoad) window.tkHelpsLoad().then(rep).catch(() => 0);
    const Mo = model();
    const head = `<div class="xhead"><div><h1>Lo que te <em>ahorras</em></h1><div class="small muted">Tu parte de la semana: lo que te cuestan tus errores evitables, comparado contigo mismo</div></div></div>`;
    if (Mo.state === "vacio") return `<div class="stack sv" style="gap:18px">${head}<div class="card sv-empty"><h3>Aún no hay operaciones</h3><p class="muted">Cuando operes, aquí verás cada semana cuánto te ahorras con tus normas. Si subes tu historial de MetaTrader, Tickora sabrá desde el primer día cuánto te costaban tus errores antes.</p><a class="btn" href="#bienvenida">Subir mi historial</a></div></div>`;
    if (Mo.state === "conociendo") return `<div class="stack sv" style="gap:18px">${head}<div class="card sv-empty"><h3>Te estoy conociendo</h3><p class="muted">Para decirte cuánto te ahorras necesito saber cuánto te costaban tus errores al principio: al menos ${MIN_T} operaciones en ${MIN_W} semanas. No te voy a enseñar un número inventado.</p>
      <div class="sv-prog"><span>Operaciones</span><i><u style="width:${Math.min(100, Mo.n / MIN_T * 100)}%"></u></i><b>${Math.min(Mo.n, MIN_T)} de ${MIN_T}</b></div><div class="sv-prog"><span>Semanas</span><i><u style="width:${Math.min(100, Mo.wk / MIN_W * 100)}%"></u></i><b>${Math.min(Mo.wk, MIN_W)} de ${MIN_W}</b></div>
      <p class="muted small">¿Tienes historial de antes en MetaTrader? <a href="#bienvenida">Súbelo</a> y lo tendrás al momento.</p></div></div>`;
    const AW = [...new Set(Mo.after.map(r => r.w))]; let w = selW != null ? selW : (Mo.R.some(r => r.w === Mo.tw) || new Date().getDay() >= 3 || new Date().getDay() === 0 ? Mo.tw : addW(Mo.tw, -1));
    if (w <= Mo.bEnd) w = Mo.tw;
    const W = week(Mo, w), first = Math.min(...AW.concat([Mo.tw])), canPrev = addW(w, -1) > Mo.bEnd && addW(w, -1) >= first, canNext = w < Mo.tw;
    const ref = Mo.pre ? "antes de Tickora" : "en tus primeras semanas";
    const title = !W.L.length ? `Esta semana aún no has operado.` : W.saved > 0.5 ? `${w === Mo.tw ? "Esta semana" : "Esa semana"} no perdiste <em>${fmt(W.saved)}</em> que antes sí perdías.` : `${w === Mo.tw ? "Esta semana" : "Esa semana"} tus errores evitables te costaron <em class="sv-neg">${fmt(W.cost)}</em>.`;
    const sub = !W.L.length ? `Operar menos cuando no toca también es ahorrar. ${ref[0].toUpperCase() + ref.slice(1)}, tus errores evitables te costaban ${fmt(Mo.bWeek)} por semana.`
      : W.saved > 0.5 ? `Tus errores evitables te costaron ${fmt(W.cost)}. ${ref[0].toUpperCase() + ref.slice(1)} te costaban ${fmt(Mo.bWeek)} por semana. No depende del mercado: depende de ti.`
      : `${ref[0].toUpperCase() + ref.slice(1)} te costaban ${fmt(Mo.bWeek)} por semana. No pasa nada: mira abajo qué norma se te escapó y céntrate en esa.`;
    const why = W.saved > 0.5 ? `<div class="sv-k">De dónde sale</div>
      ${W.E.length && W.lv > 0.5 ? `<div class="sv-row"><span class="sv-ic">${ic("lock")}</span><span><b>Tu candado actuó ${W.E.length === 1 ? "1 vez" : W.E.length + " veces"}</b><small>${esc((x => x.charAt(0).toUpperCase() + x.slice(1))(W.reasons.join(" · ")))}</small></span><span class="sv-m t">≈ ${fmt(W.lv)}</span></div>` : ""}
      ${W.worked.length && W.pv > 0.5 ? `<div class="sv-row"><span class="sv-ic v">${ic("pause")}</span><span><b>Paraste ${W.H.length === 1 ? "1 vez" : W.H.length + " veces"}</b><small>${W.worked.length} de ${W.H.length} veces, tu siguiente operación fue dentro del plan (o no volviste a operar)</small></span><span class="sv-m v">≈ ${fmt(W.pv)}</span></div>` : ""}
      ${W.rest > 0.5 ? `<div class="sv-row"><span class="sv-ic b">${ic("rule")}</span><span><b>${W.best ? `Respetaste ${esc(W.best.l)}` : "Respetaste tus normas, tú solo"}</b><small>${W.best ? `${ref[0].toUpperCase() + ref.slice(1)} te la saltabas ${num(W.best.was, 1).replace(/,0$/, "")} veces por semana; esta semana, ${W.best.n === 0 ? "ninguna" : W.best.n}` : "Menos operaciones fuera del plan que al empezar"}</small></span><span class="sv-m b">≈ ${fmt(W.rest)}</span></div>` : ""}
      <div class="sv-how"><b>Cómo lo calculamos:</b> sumamos lo que perdiste en operaciones fuera de tu plan y lo comparamos con lo que te pasaba ${ref} (${Mo.BW.length} semanas, ${Mo.base.length} operaciones). El candado y las pausas se valoran con lo que perdías tú en esas mismas situaciones${Mo.sit.dos ? ` (tras dos pérdidas, ${fmt(Mo.sit.dos)} de media en la siguiente operación)` : ""}. Es una estimación con tus datos, no una promesa.</div>`
      : `<div class="sv-k">Lo que se te escapó</div>${W.L.filter(r => !r.good).slice(0, 4).map(r => `<a class="sv-row" href="#op/${esc(r.t.id)}"><span class="sv-ic r">${ic("rule")}</span><span><b>${esc(r.t.symbol || "")} · ${new Date(r.ts).toLocaleDateString("es-ES", { weekday: "long" })}</b><small>${esc(r.fail[0] || "Fuera del plan")}</small></span><span class="sv-m r">${r.v != null && r.v < 0 ? "−" + fmt(-r.v) : fmt(r.v, true)}</span></a>`).join("") || `<p class="muted">Ninguna operación fuera del plan esta semana.</p>`}
      <div class="sv-how"><b>Cómo lo calculamos:</b> lo que perdiste en operaciones fuera de tu plan, comparado con lo que te pasaba ${ref} (${Mo.BW.length} semanas, ${Mo.base.length} operaciones).</div>`;
    const pp = p => p == null ? "—" : Math.round(p * 100) + " %";
    return `<div class="stack sv" style="gap:18px">${head}
      <div class="sv-nav"><button type="button" data-svw="-1" ${canPrev ? "" : "disabled"} aria-label="Semana anterior">${ic("l", 16)}</button><span>Semana ${fmtWeek(w)}</span><button type="button" data-svw="1" ${canNext ? "" : "disabled"} aria-label="Semana siguiente">${ic("r", 16)}</button></div>
      <div class="sv-hero"><h2>${title}</h2><p>${sub}</p></div>
      <div class="sv-g2"><div class="card sv-c"><div class="sv-k">Lo que te costaron tus errores evitables, semana a semana</div>${bars(Mo, w)}</div><div class="card sv-c">${why}</div></div>
      <div class="sv-g3">
        <div class="card sv-c"><div class="sv-k">Dentro del plan</div><div class="sv-stat">${pp(W.plan)}</div><div class="sv-meter"><i style="width:${Math.round((W.plan || 0) * 100)}%" class="t"></i></div><small class="muted">${Mo.pre ? "Antes de Tickora" : "Al empezar"}: ${pp(Mo.bPlan)}</small></div>
        <div class="card sv-c"><div class="sv-k">Partidas ganadas</div><div class="sv-stat">${W.won} de ${W.days}</div><div class="sv-meter"><i style="width:${W.days ? Math.round(W.won / W.days * 100) : 0}%" class="v"></i></div><small class="muted">Días de la semana sin ninguna operación fuera del plan</small></div>
        <div class="card sv-c"><div class="sv-k">Errores evitables</div><div class="sv-stat">${W.evN}</div><div class="sv-meter"><i style="width:${Math.min(100, W.evN / Math.max(1, Mo.bEvN, W.evN) * 100)}%" class="r"></i></div><small class="muted">${Mo.pre ? "Antes de Tickora" : "Al empezar"}: ${num(Mo.bEvN, 1).replace(/,0$/, "")} por semana</small></div>
      </div>
      <div class="sv-acts"><a class="btn" href="#errores">Ver mis errores</a><button type="button" class="btn ghost" data-svsave>Guardar en mi diario</button></div>
      <p class="muted small" style="margin:0">Desde que empezaste: ${Mo.total >= 0 ? `${fmt(Mo.total)} menos en errores evitables que ${ref}` : `tus errores evitables te han costado ${fmt(-Mo.total)} más que ${ref}`}.</p></div>`;
  }
  V.ahorro = {
    view: viewAhorro,
    bind() {
      document.querySelectorAll("[data-svw]").forEach(b => b.onclick = () => { const Mo = model(); const cur = selW != null ? selW : Mo.tw; selW = addW(cur, +b.dataset.svw); if (selW >= Mo.tw) selW = null; S.lastView = null; A.render(); });
      const sv = document.querySelector("[data-svsave]"); if (sv) sv.onclick = async () => {
        const h = document.querySelector(".sv-hero"); if (!h) return; const t = h.querySelector("h2").textContent.trim(), p = h.querySelector("p").textContent.trim();
        try { const id = "p" + Date.now().toString(36); const { error } = await sb.from("docs").upsert({ user_id: S.user.id, col: "page", id, data: { title: "Mi semana · " + document.querySelector(".sv-nav span").textContent.replace(/^Semana /, ""), cover: "tema", html: `<p><b>${esc(t)}</b></p><p>${esc(p)}</p>` + Array.from(document.querySelectorAll(".sv-row b")).map(x => `<p>${esc(x.textContent)} · ${esc((x.parentNode.querySelector("small") || {}).textContent || "")}</p>`).join(""), created: Date.now(), updated: Date.now() }, updated_at: new Date().toISOString() }); if (error) throw error; S.pagesLoaded = false; toast("Guardado en tu diario"); } catch (e) { toast("No se pudo guardar: " + (e.message || e)); }
      };
    }
  };
  let rq = 0; const rep = () => { cancelAnimationFrame(rq); rq = requestAnimationFrame(() => { const h = location.hash; if (h.startsWith("#ahorro") || ((h === "#inicio" || h === "" || h === "#") && document.querySelector(".sv-strip,.f9") && !document.querySelector("input:focus,textarea:focus"))) { S.lastView = null; A.render(); } }); };
  const fix = () => { if (location.hash.startsWith("#ahorro") && S.user && !document.querySelector(".sv")) { S.lastView = null; A.render(); } };
  [0, 800, 2500, 5000].forEach(ms => setTimeout(fix, ms));
  /* la franja de Inicio: si Inicio se pintó antes de tener las operaciones, se vuelve a pintar una vez */
  let tries = 0; const tf = setInterval(() => { if (++tries > 20) return clearInterval(tf); if (!S.loaded || !(S.trades || []).length) return; const h = location.hash; if ((h === "#inicio" || h === "" || h === "#") && document.querySelector(".f9") && !document.querySelector(".sv-strip")) { if (evs === null) loadEvents(); else rep(); } clearInterval(tf); }, 700);
})();
