/* Tickora · Informe del backtesting (18-nov-2026), al estilo de un probador de estrategias profesional:
   resultado, caída, factor de beneficio, curva frente al mercado, por mes, Monte Carlo, dentro y fuera de muestra,
   lo que más te costó y todas las operaciones exportables. Sustituye a Backtesting › Análisis. */
(function () {
  "use strict";
  const A = window.TKAPP, V = window.TK_VIEWS;
  if (!A || !V) return;
  const { S, esc } = A;
  const BT = () => window.TK_BT;
  const nf = (v, d) => (v == null || !isFinite(v)) ? "—" : Number(v).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fR = (r, d) => (r > 0 ? "+" : r < 0 ? "−" : "") + nf(Math.abs(r), d == null ? 1 : d) + " R";
  const money = (v, cur) => { try { return new Intl.NumberFormat("es-ES", { style: "currency", currency: cur || "USD", maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 }).format(v); } catch (e) { return nf(v, 0) + " $"; } };
  const sgn = v => v > 0 ? "+" : v < 0 ? "−" : "";
  const paperAcct = () => { try { return Object.assign({ start: 10000, riskPct: 0.5, cur: "USD" }, JSON.parse(localStorage.getItem("tk-paper") || "{}")); } catch (e) { return { start: 10000, riskPct: 0.5, cur: "USD" }; } };
  const re = () => { S.lastView = null; A.render(); };

  function dataset() {
    const f = S.btaF || "", m = S.btaM || "bt";
    let L = (S.btTrades || []).filter(t => t.r != null && t.exit_time).map(t => Object.assign({}, t, { r: +t.r, x: t.x || {} }));
    L = L.filter(t => m === "live" ? t.x.mode === "live" : t.x.mode !== "live");
    if (m !== "live") L = !f ? L : f === "__none" ? L.filter(t => !t.session_id) : L.filter(t => t.session_id === f);
    L.sort((a, b) => new Date(a.exit_time) - new Date(b.exit_time));
    const sess = m !== "live" && f && f !== "__none" ? (S.bts || []).find(x => x.id === f) : null, pa = paperAcct();
    const size = sess && +sess.size ? +sess.size : pa.start, risk = sess && +sess.risk ? +sess.risk : pa.riskPct, cur = pa.cur || "USD";
    L.forEach(t => { t.m = t.x.money != null ? +t.x.money : t.r * size * risk / 100; });
    return { L, sess, size, risk, cur, f, m };
  }
  function stats(D) {
    const L = D.L, n = L.length, W = L.filter(t => t.r > 0), Lo = L.filter(t => t.r < 0);
    const net = L.reduce((s, t) => s + t.m, 0), netR = L.reduce((s, t) => s + t.r, 0), gp = W.reduce((s, t) => s + t.m, 0), gl = -Lo.reduce((s, t) => s + t.m, 0);
    let eq = D.size, peak = D.size, ddP = 0, ddM = 0, peakT = L[0] ? new Date(L[0].entry_time).getTime() : 0, ddDays = 0, cumR = 0, pkR = 0, ddR = 0;
    const curve = [{ t: L[0] ? new Date(L[0].entry_time).getTime() : Date.now(), v: 0, dd: 0 }];
    L.forEach(t => { eq += t.m; cumR += t.r; pkR = Math.max(pkR, cumR); ddR = Math.min(ddR, cumR - pkR); const tt = new Date(t.exit_time).getTime();
      if (eq > peak) { peak = eq; peakT = tt; } const d = (eq - peak) / peak * 100; if (d < ddP) { ddP = d; ddM = eq - peak; } if (eq < peak) ddDays = Math.max(ddDays, (tt - peakT) / 864e5);
      curve.push({ t: tt, v: (eq - D.size) / D.size * 100, dd: d }); });
    return { n, w: W.length, net, netR, pct: net / D.size * 100, pf: gl ? gp / gl : null, win: n ? W.length / n * 100 : null, avg: n ? netR / n : null, avgM: n ? net / n : null, ddP, ddM, ddR, ddDays: Math.round(ddDays), curve };
  }
  /* Monte Carlo: 1.000 órdenes distintas de tus mismas operaciones */
  function monte(D, runs) {
    const rs = D.L.map(t => t.r), n = rs.length; if (n < 10) return null;
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const dds = [], paths = [];
    for (let k = 0; k < runs; k++) {
      const a = rs.slice(); for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      let c = 0, p = 0, d = 0; const path = k < 70 ? [0] : null;
      for (const r of a) { c += r; p = Math.max(p, c); d = Math.min(d, c - p); if (path) path.push(c); }
      dds.push(-d); if (path) paths.push(path);
    }
    dds.sort((x, y) => x - y); const q = p => dds[Math.min(dds.length - 1, Math.floor(p * dds.length))];
    const lim = D.sess && +D.sess.max ? +D.sess.max : 10, limR = lim / D.risk, ruin = dds.filter(x => x >= limR).length / dds.length;
    return { p5: q(.05), p50: q(.5), p95: q(.95), ruin, lim, paths, n };
  }
  function svgCurve(C, bh) {
    const W = 760, H = 230, pad = 28; if (C.length < 2) return "";
    const t0 = C[0].t, t1 = C[C.length - 1].t || t0 + 1, vals = C.map(c => c.v).concat(bh ? bh.map(b => b.v) : []).concat(C.map(c => c.dd));
    const mn = Math.min(0, ...vals), mx = Math.max(0.1, ...vals), X = t => pad + (t - t0) / Math.max(1, t1 - t0) * (W - pad - 8), Y = v => 10 + (mx - v) / (mx - mn || 1) * (H - 34);
    const line = C.map((c, i) => (i ? "L" : "M") + X(c.t).toFixed(1) + " " + Y(c.v).toFixed(1)).join(" ");
    const dd = C.map((c, i) => (i ? "L" : "M") + X(c.t).toFixed(1) + " " + Y(c.dd).toFixed(1)).join(" ") + ` L${X(t1).toFixed(1)} ${Y(0).toFixed(1)} L${X(t0).toFixed(1)} ${Y(0).toFixed(1)}Z`;
    const b = bh && bh.length > 1 ? bh.filter(x => x.t >= t0 && x.t <= t1).map((x, i) => (i ? "L" : "M") + X(x.t).toFixed(1) + " " + Y(x.v).toFixed(1)).join(" ") : "";
    const ticks = [mx, (mx + mn) / 2, mn].map(v => `<text x="2" y="${Y(v) + 4}" class="rp-ax">${sgn(v)}${nf(Math.abs(v), 1)} %</text>`).join("");
    const d0 = new Date(t0).toLocaleDateString("es-ES", { day: "numeric", month: "short" }), d1 = new Date(t1).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
    return `<svg viewBox="0 0 ${W} ${H}" class="rp-svg" role="img" aria-label="Curva de la cuenta en porcentaje"><line x1="${pad}" x2="${W - 8}" y1="${Y(0)}" y2="${Y(0)}" class="rp-zero"/>${ticks}
      <path d="${dd}" class="rp-dd"/>${b ? `<path d="${b}" class="rp-bh"/>` : ""}<path d="${line}" class="rp-eq"/><text x="${pad}" y="${H - 4}" class="rp-ax">${d0}</text><text x="${W - 8}" y="${H - 4}" class="rp-ax" text-anchor="end">${d1}</text></svg>`;
  }
  function svgMonte(M) {
    const W = 420, H = 170; const all = M.paths.flat(), mn = Math.min(...all), mx = Math.max(...all), n = M.n;
    const X = i => 4 + i / n * (W - 8), Y = v => 6 + (mx - v) / (mx - mn || 1) * (H - 12);
    return `<svg viewBox="0 0 ${W} ${H}" class="rp-svg" role="img" aria-label="Monte Carlo: caminos posibles de tus operaciones">${M.paths.map(p => `<path d="${p.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ")}" class="rp-mc"/>`).join("")}<line x1="4" x2="${W - 4}" y1="${Y(0)}" y2="${Y(0)}" class="rp-zero"/></svg>`;
  }
  function costs(D) {
    const L = D.L, out = [];
    const giveBack = L.filter(t => (t.x.mfe || 0) >= 1 && t.r < 0); if (giveBack.length) out.push([giveBack.reduce((s, t) => s + t.r, 0), `Ganancias que se volvieron pérdida`, `${giveBack.length} llegaron a +1 R y acabaron en negativo`]);
    const man = L.filter(t => t.x.why === "manual" && t.r < 0); if (man.length) out.push([man.reduce((s, t) => s + t.r, 0), "Cerradas a mano en pérdida", `${man.length} antes de que el precio llegara al stop o al objetivo`]);
    const byH = {}; L.forEach(t => { const h = new Date(t.entry_time).getHours(); (byH[h] = byH[h] || []).push(t.r); });
    const wh = Object.entries(byH).filter(([, a]) => a.length >= 3).map(([h, a]) => [+h, a.reduce((s, r) => s + r, 0), a.length]).sort((a, b) => a[1] - b[1])[0];
    if (wh && wh[1] < 0) out.push([wh[1], `Operar de ${String(wh[0]).padStart(2, "0")}:00 a ${String(wh[0] + 1).padStart(2, "0")}:00`, `tu peor hora (${wh[2]} operaciones)`]);
    const after = []; for (let i = 2; i < L.length; i++) if (L[i - 1].r < 0 && L[i - 2].r < 0) after.push(L[i]);
    if (after.length >= 3) { const s = after.reduce((a, t) => a + t.r, 0); if (s < 0) out.push([s, "Seguir tras dos pérdidas", `${after.length} operaciones justo después de dos pérdidas`]); }
    return out.sort((a, b) => a[0] - b[0]).slice(0, 3);
  }
  function months(D) {
    const by = {}; D.L.forEach(t => { const d = new Date(t.exit_time), k = d.getFullYear(); (by[k] = by[k] || Array(12).fill(null)); by[k][d.getMonth()] = (by[k][d.getMonth()] || 0) + t.r; });
    const M = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
    return `<div class="rp-mo"><span></span>${M.map(m => `<span class="h">${m}</span>`).join("")}${Object.keys(by).sort().map(y => `<span class="h">${y}</span>${by[y].map(v => v == null ? `<span></span>` : `<span class="${v >= 0 ? "g" : "r"}" style="--a:${Math.min(1, .25 + Math.abs(v) / 15)}" title="${sgn(v)}${nf(Math.abs(v), 1)} R">${sgn(v)}${nf(Math.abs(v), Math.abs(v) >= 10 ? 0 : 1)}</span>`).join("")}`).join("")}</div>`;
  }
  async function loadBH(D) {
    const syms = Array.from(new Set(D.L.map(t => t.symbol))); if (syms.length !== 1 || !window.TkChart) return;
    const key = syms[0] + "|" + (D.L[0] && D.L[0].entry_time); if (S.bhKey === key) return; S.bhKey = key; S.bh = null;
    try { const r = await TkChart.bars(syms[0], "1d", { invoke: (n, b) => A.sb.functions.invoke(n, { body: b }) }); const t0 = new Date(D.L[0].entry_time).getTime(), t1 = new Date(D.L[D.L.length - 1].exit_time).getTime();
      const bars = (r.bars || []).filter(b => b.timestamp >= t0 - 864e5 && b.timestamp <= t1 + 864e5); if (bars.length > 1) { const p0 = bars[0].close; S.bh = bars.map(b => ({ t: b.timestamp, v: (b.close / p0 - 1) * 100 })); }
    } catch (e) { S.bh = null; }
    if (location.hash.startsWith("#btanalisis")) re();
  }
  function exportData(D, kind) {
    const head = ["#", "Entrada", "Salida", "Mercado", "Marco", "Lado", "Precio entrada", "Stop", "Objetivo", "Precio salida", "Motivo", "R", "Resultado", "Máx. a favor (R)", "Máx. en contra (R)", "Comisión", "Modo"];
    const rows = D.L.map((t, i) => [i + 1, new Date(t.entry_time).toISOString(), new Date(t.exit_time).toISOString(), t.symbol, t.tf, t.side === "buy" ? "Compra" : "Venta", t.entry, t.stop, t.tp, t.exit, t.x.why === "stop" ? "Stop" : t.x.why === "tp" ? "Objetivo" : t.x.why === "manual" ? "A mano" : "", t.r, Math.round(t.m * 100) / 100, t.x.mfe != null ? t.x.mfe : "", t.x.mae != null ? t.x.mae : "", t.x.com || 0, t.x.mode === "live" ? "Práctica en vivo" : "Backtesting"]);
    const name = "tickora-backtesting-" + new Date().toISOString().slice(0, 10);
    if (kind === "csv") { const csv = [head].concat(rows).map(r => r.map(v => { const s = String(v == null ? "" : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(";")).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = name + ".csv"; document.body.appendChild(a); a.click(); a.remove(); return; }
    const go = () => { const X = window.XLSX, ws = X.utils.aoa_to_sheet([head].concat(rows)), wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Operaciones"); X.writeFile(wb, name + ".xlsx"); };
    if (window.XLSX) go(); else { const s = document.createElement("script"); s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"; s.onload = go; s.onerror = () => A.toast("No se pudo preparar el Excel; descarga el CSV"); document.head.appendChild(s); }
  }

  const V0 = V.btanalisis;
  V.btanalisis = {
    view(r) {
      if (!S.btLoaded && BT()) { BT().loadSessions().then(() => { if (location.hash.startsWith("#btanalisis")) re(); }); return `<div class="stack"><div class="xhead"><div><h1>Informe</h1></div></div><div class="card muted">Cargando tus operaciones de práctica…</div></div>`; }
      const D = dataset(), s = stats(D), M = monte(D, 1000), C = costs(D), sess = D.sess;
      loadBH(D);
      const fil = `<div class="row" style="gap:8px;flex-wrap:wrap"><div class="rp-seg" role="group" aria-label="Tipo de práctica"><button type="button" data-rpm="bt" aria-pressed="${D.m !== "live"}">Backtesting</button><button type="button" data-rpm="live" aria-pressed="${D.m === "live"}">Práctica en vivo</button></div>
        ${D.m !== "live" ? `<select class="xsel" id="btaF" aria-label="Sesión"><option value="">Todas las sesiones</option><option value="__none" ${D.f === "__none" ? "selected" : ""}>Práctica sin sesión</option>${(S.bts || []).map(x => `<option value="${esc(x.id)}" ${D.f === x.id ? "selected" : ""}>${esc(x.name || "Sesión")}</option>`).join("")}</select>` : ""}
        ${s.n ? `<button type="button" class="btn2" data-rpx="csv">Exportar CSV</button><button type="button" class="btn2" data-rpx="xlsx">Exportar Excel</button>` : ""}</div>`;
      const head = `<div class="xhead"><div><h1>Informe</h1><div class="small muted">${sess ? `Sesión «${esc(sess.name || "")}» · ${esc((sess.syms || []).join(", "))} · ${esc(sess.from || "")} → ${esc(sess.to || "")}` : D.m === "live" ? "Tus operaciones de práctica con el precio en vivo" : "Todas tus operaciones de backtesting"}</div></div>${fil}</div>`;
      if (!s.n) return `<div class="stack" style="gap:18px">${head}<div class="card stack" style="gap:8px;align-items:flex-start"><b>Aún no hay operaciones cerradas aquí.</b><span class="small muted">Abre el gráfico en modo Backtesting, practica con Comprar y Vender y vuelve: verás tu informe completo.</span><a class="btn" href="#backtest">Ir a mis sesiones</a></div>${V0 && V0.view ? `<details class="card"><summary><b>Tu tiempo de estudio</b></summary>${V0.view(r)}</details>` : ""}</div>`;
      const com = D.L.reduce((a, t) => a + (+t.x.com || 0), 0), slip = D.L.find(t => t.x.slip != null), mag = D.L.some(t => t.x.mode !== "live");
      const conf = s.n < 30 ? ["Poco", `${s.n} de 30 operaciones: aún puede ser suerte`] : s.n < 100 ? ["Casi", `${s.n} de 100 operaciones`] : ["Sí", `${s.n} operaciones`];
      const ios = s.n >= 20 ? (() => { const k = Math.floor(s.n * .7), a = D.L.slice(0, k), b = D.L.slice(k), ea = a.reduce((x, t) => x + t.r, 0) / a.length, eb = b.reduce((x, t) => x + t.r, 0) / b.length;
        const d0 = new Date(a[0].exit_time).toLocaleDateString("es-ES", { day: "numeric", month: "short" }), d1 = new Date(a[a.length - 1].exit_time).toLocaleDateString("es-ES", { day: "numeric", month: "short" }), d2 = new Date(b[b.length - 1].exit_time).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
        const msg = ea > 0 && eb > 0 ? [`Se mantiene en la parte final: buena señal.`, "ok"] : ea > 0 && eb <= 0 ? [`En la parte final deja de funcionar: puede que te hayas adaptado a esos meses.`, "bad"] : ea <= 0 && eb > 0 ? [`Mejora al final: quizá estás aprendiendo.`, "ok"] : [`No funciona en ninguna de las dos partes.`, "bad"];
        return `<div class="rp-io"><div><span>Primer 70 % (${d0} – ${d1})</span><b>${fR(ea, 2)}</b><small>por operación</small></div><div><span>Último 30 % (hasta ${d2})</span><b>${fR(eb, 2)}</b><small>por operación</small></div></div><p class="rp-msg ${msg[1]}">${msg[0]}</p><p class="small muted">Si una idea solo funciona en los meses en los que la probaste, no es fiable. Por eso se mira aparte la parte final.</p>`; })() : `<p class="small muted">Con 20 operaciones o más compararé la primera parte con la última para ver si tu idea se mantiene.</p>`;
      const k = (l, v, sub, cls) => `<div class="rp-k"><small>${l}</small><b class="${cls || ""}">${v}</b><em>${sub}</em></div>`;
      return `<div class="stack rp" style="gap:16px">${head}
        <div class="rp-hon"><span>Capital <b>${money(D.size, D.cur)}</b> · riesgo <b>${nf(D.risk, 2)} %</b> por operación</span><span>Comisión <b>${com ? money(com, D.cur) + " en total" : "sin comisión"}</b></span><span>Deslizamiento <b>${slip ? nf(slip.x.slip, 1) + " pips" : "—"}</b></span>${mag ? `<span>Si el stop y el objetivo caen en la misma vela, se mira <b>la vela de 1 minuto</b></span><span>Futuro <b>oculto en todo momento</b></span>` : ""}</div>
        <div class="rp-kp">${k("Resultado neto", money(s.net, D.cur), `${fR(s.netR)} · ${sgn(s.pct)}${nf(Math.abs(s.pct), 1)} %`, s.net >= 0 ? "up" : "dn")}${k("Caída máxima", `${nf(s.ddP, 1)} %`, `${fR(s.ddR)} · ${s.ddDays} días`)}${k("Factor de beneficio", s.pf == null ? (s.n >= 5 ? "Sin pérdidas" : "—") : nf(s.pf, 2), "lo ganado ÷ lo perdido")}${k("Aciertos", nf(s.win, 0) + " %", `${s.w} de ${s.n}`)}${k("Operación media", fR(s.avg, 2), money(s.avgM, D.cur))}${k("¿Fiable?", conf[0], conf[1])}</div>
        <div class="rp-g2"><div class="card"><div class="rp-h"><h2 class="h2b">Curva de tu cuenta</h2><span class="small muted"><i class="rp-l eq"></i>tú <i class="rp-l bh"></i>${S.bh ? "el mercado" : "(el mercado: cargando o no disponible)"} <i class="rp-l dd"></i>caídas</span></div>${svgCurve(s.curve, S.bh)}</div>
          <div class="card"><div class="rp-h"><h2 class="h2b">Monte Carlo</h2><span class="small muted">1.000 órdenes distintas de tus operaciones</span></div>${M ? `${svgMonte(M)}<p class="rp-p">En 9 de cada 10 casos tu peor caída estaría entre <b>${fR(-M.p5)}</b> y <b>${fR(-M.p95)}</b> (${nf(M.p5 * D.risk, 1)} % y ${nf(M.p95 * D.risk, 1)} % de la cuenta). ${sess && sess.mode === "fondeo" || M.ruin > 0 ? `Si la cuenta corta al −${nf(M.lim, 0)} %, hay un <b>${nf(M.ruin * 100, 0)} %</b> de riesgo de perderla.` : ""}</p><p class="small muted">Las mismas operaciones pueden llegar en otro orden. Así ves la caída que deberías esperar, no solo la que te tocó.</p>` : `<p class="small muted">Hacen falta 10 operaciones para simular.</p>`}</div></div>
        <div class="rp-g3"><div class="card"><h2 class="h2b">Por mes</h2>${months(D)}<p class="small muted">En R. Verde y rojo solo aquí, como en el calendario.</p></div>
          <div class="card"><h2 class="h2b">Dentro y fuera de muestra</h2>${ios}</div>
          <div class="card"><h2 class="h2b">Lo que más te costó</h2>${C.length ? C.map(c => `<div class="rp-c"><b>${fR(c[0])}</b><span>${esc(c[1])}<small>${esc(c[2])}</small></span></div>`).join("") : `<p class="small muted">Nada destaca todavía. Sigue practicando.</p>`}</div></div>
        <div class="card"><div class="rp-h"><h2 class="h2b">Operaciones</h2><span class="small muted">${s.n} · las más recientes primero</span></div><div class="rp-tw"><table class="rp-t"><thead><tr><th>#</th><th>Cierre</th><th>Mercado</th><th>Lado</th><th>Entrada</th><th>Salida</th><th>Motivo</th><th>R</th><th>Resultado</th><th>Máx. a favor</th><th>Máx. en contra</th></tr></thead><tbody>
          ${D.L.slice().reverse().slice(0, 200).map((t, i) => `<tr><td>${s.n - i}</td><td>${new Date(t.exit_time).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td><b>${esc(t.symbol)}</b></td><td>${t.side === "buy" ? "Compra" : "Venta"}</td><td>${nf(+t.entry, 5).replace(/0+$/, "").replace(/,$/, "")}</td><td>${nf(+t.exit, 5).replace(/0+$/, "").replace(/,$/, "")}</td><td>${t.x.why === "stop" ? "Stop" : t.x.why === "tp" ? "Objetivo" : t.x.why === "manual" ? "A mano" : "—"}</td><td class="${t.r >= 0 ? "up" : "dn"}">${fR(t.r, 2)}</td><td class="${t.m >= 0 ? "up" : "dn"}">${money(t.m, D.cur)}</td><td>${t.x.mfe != null ? fR(t.x.mfe, 1) : "—"}</td><td>${t.x.mae != null ? fR(-t.x.mae, 1) : "—"}</td></tr>`).join("")}</tbody></table></div></div>
        ${V0 && V0.view && D.m !== "live" ? `<details class="card"><summary><b>Tu tiempo de estudio</b> <span class="small muted">· minutos, velas repasadas y resultado por sesión</span></summary><div class="rp-old">${V0.view(r).replace(/id="btaF"/g, "id=\"btaF0\"")}</div></details>` : ""}
      </div>`;
    },
    bind(r) {
      if (V0 && V0.bind) try { V0.bind(r); } catch (e) { /* vista antigua */ }
      const q = s => document.querySelectorAll(s);
      const f = document.getElementById("btaF"); if (f) f.onchange = () => { S.btaF = f.value; S.bhKey = null; re(); };
      q("[data-rpm]").forEach(b => b.onclick = () => { S.btaM = b.dataset.rpm; S.bhKey = null; re(); });
      q("[data-rpx]").forEach(b => b.onclick = () => exportData(dataset(), b.dataset.rpx));
    }
  };
  /* el botón «Ver el informe completo» del panel del gráfico */
  window.TkChartExt2 = (window.TkChartExt2 || []).concat([(me, X, HK) => {
    if (me.key !== "main") return;
    HK.report = () => { const run = S.btRun; S.btaM = X.R.on ? "bt" : "live"; S.btaF = X.R.on ? (run ? run.id : "__none") : ""; S.btLoaded = false; location.hash = "#btanalisis"; };
  }]);
})();
