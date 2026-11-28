/* Tickora · gráfico, parte 4: operar en tu MT5 desde el gráfico, como en TradingView con un bróker conectado.
   - En la barra de comprar y vender, la etiqueta «Práctica» pasa a «MT5 demo» (o «MT5 real») al pulsarla.
   - Comprar y Vender mandan una orden a mercado a tu MT5 con stop a 1,5 ATR, objetivo a 2 R y el lote de tu riesgo.
   - Tus posiciones y órdenes de MT5 salen en el gráfico: arrastra el stop o el objetivo para cambiarlos;
     selecciónalas y pulsa Supr para cerrarlas o anularlas. También en el panel de posiciones.
   - Lo comprueba la app (tu plan) y otra vez el programa de MT5 2.2 (cuenta demo o permitida, lote máximo,
     stop, normas del día). Necesita opts.trade (index.html).
   Se engancha a cada gráfico con window.TkChartExt2 (lo llama grafico2.js). */
(function () {
  "use strict";
  if (!window.TkChart) return;
  const U = TkChart.U;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = (v, d) => (v == null || !isFinite(v)) ? "—" : Number(v).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* lleno */ } }
  };
  const SV = (d, s) => `<svg width="${s || 16}" height="${s || 16}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = { ticket: '<rect x="3" y="4.5" width="14" height="11" rx="2"/><path d="M7 8h6M7 11.5h4"/>', x: '<path d="M5 5l10 10M15 5L5 15"/>' };
  const ORD_TYPE = { 2: ["buy", "lim"], 3: ["sell", "lim"], 4: ["buy", "stp"], 5: ["sell", "stp"] };

  const ext = (me, X, HK) => {
    const T = X.opts && X.opts.trade; if (!T || me.key !== "main") return;
    const { st, ch, R } = X;
    let mode = ls.get("tk-qomode", "sim") === "mt5" ? "mt5" : "sim";
    let busy = "", sel = null, dragging = false, last = null;
    const ov = {};
    const S0 = () => { last = T.state(st.sym) || { ok: false, why: "" }; return last; };
    const dg = s => (s && s.d != null ? s.d : X.digits());
    const rd = (v, s) => +(+v).toFixed(dg(s));
    const fp = (v, s) => (v == null || !isFinite(v)) ? "—" : nf(v, dg(s));
    const money = (v, c) => { try { return Number(v).toLocaleString("es-ES", { style: "currency", currency: c || "USD", maximumFractionDigits: 2 }); } catch (e) { return nf(v, 2) + " " + (c || ""); } };
    const label = s => (s && s.demo === false ? "MT5 real" : "MT5 demo");
    function say(t, ms) { X.hint(t); clearTimeout(say.t); say.t = setTimeout(() => X.hint(""), ms || 3500); }
    const refresh = () => { try { HK.paintQo && HK.paintQo(); HK.stats && HK.stats(); } catch (e) { /* aún montando */ } };

    /* precio de compra y de venta: el del gráfico más el diferencial de tu MT5 */
    function quote(s) {
      const px = st.price || (st.lastBar && st.lastBar.close), q = s && s.q;
      if (q && +q.b > 0 && +q.a > 0) { const sp = Math.max(0, +q.a - +q.b), b = st.prov && st.prov.id === "mt5" && px ? px : +q.b; return { b, a: b + sp }; }
      return px ? { b: px, a: px } : null;
    }
    /* orden a mercado: stop a 1,5 ATR, objetivo a 2 R y el lote de tu riesgo con el saldo de tu MT5 */
    function plan(side, s) {
      const q = quote(s); if (!q) return null;
      const buy = side === "buy", e = buy ? q.a : q.b, d = ((HK.atr && HK.atr()) || e * 0.002) * 1.5;
      const sl = rd(buy ? e - d : e + d, s), tp = rd(buy ? e + 2 * d : e - 2 * d, s);
      const riskM = (+s.acct.bal || 0) * T.riskPct() / 100;
      let lots = T.lots(s.msym, e, sl, riskM), capped = false; const max = +s.acct.max || 0;
      if (lots && max && lots > max) { lots = max; capped = true; }
      return { e, sl, tp, lots, riskM, capped };
    }

    /* ===== la barra de comprar y vender ===== */
    function html() {
      const s = S0();
      const tag = `<button type="button" class="gx-qtag gx-qtog gx-qreal${s.ok && !s.demo ? " gx-qlive" : ""}" data-qo="mode" title="Operas en tu MT5${s.ok ? (s.demo ? " (cuenta demo)" : " (cuenta REAL)") : ""}. Pulsa para volver a la práctica">${s.ok ? label(s) : "MT5"}</button>`;
      if (!s.ok) return `${tag}<span class="gx-qi gx-qwarn">${esc(s.why || "Tu MT5 no está listo.")}</span>`;
      const q = quote(s), p = plan("buy", s), a = s.acct, dis = busy ? " disabled" : "";
      const info = busy || (a.lock ? "Tu plan lo bloquea ahora: " + a.lock
        : (p && p.lots ? `1 R = ${money(p.riskM, a.cur)} · stop a 1,5 ATR${p.capped ? " · lote limitado a " + nf(a.max, 2) : ""}` : "Sin lote: tu MT5 aún no ha mandado los datos de " + s.msym));
      return `${tag}<button type="button" class="gx-qs" data-qo="sell"${dis}><small>VENDER</small>${q ? fp(q.b, s) : "—"}</button><span class="gx-qm" title="Lotes">${p && p.lots ? nf(p.lots, 2) : "—"}</span><button type="button" class="gx-qb" data-qo="buy"${dis}><small>COMPRAR</small>${q ? fp(q.a, s) : "—"}</button>
        <button type="button" class="gx-qt" data-qo="ticket" title="Orden con precio, stop y objetivo en tu MT5" aria-label="Nueva orden en tu MT5"${dis}>${SV(IC.ticket, 15)}</button><span class="gx-qi">${esc(info)}</span>`;
    }
    function setMode(m) {
      mode = m; ls.set("tk-qomode", m);
      if (m === "mt5") { const s = S0(); if (s.ok) T.watch(s.msym, st.tf); } else T.watch(null);
      if (HK.onRestyle) HK.onRestyle(); else redraw(); // quita o vuelve a poner las de práctica y pone las de MT5
      refresh();
    }
    HK.qoReal = {
      avail() { const s = S0(); return !R.on && (s.ok || !!s.why); },
      on() { return mode === "mt5" && !R.on; },
      label() { return label(last || S0()); },
      toggle() {
        if (mode === "mt5") { setMode("sim"); say("Vuelves a la cuenta de práctica."); return; }
        const s = S0(); if (!s.ok) { say(s.why || "Tu MT5 no está listo.", 5000); return; }
        setMode("mt5");
        say(s.demo ? "Operas en tu MT5 (cuenta demo). Cada orden lleva stop y respeta tu plan." : "Cuidado: operas en tu cuenta REAL de MT5. Cada orden lleva stop y respeta tu plan.", 5000);
      },
      html,
      click: side => openMkt(side),
      ticket: () => ticketDlg()
    };

    async function send(cmd, okTxt) {
      if (busy) return null;
      busy = "Enviando a tu MT5…"; refresh();
      let r; try { r = await T.send(cmd); } catch (e) { r = { ok: false, msg: "Sin conexión" }; }
      busy = ""; refresh();
      if (r.ok) { say(okTxt(r), 4000); HK.sound && HK.sound("fill"); } else say((r.plan ? "No se envía: " : "No se ha hecho: ") + r.msg, 6500);
      return r;
    }
    async function openMkt(side) {
      const s = S0(); if (!s.ok) { say(s.why || "Tu MT5 no está listo.", 5000); return; }
      const p = plan(side, s); if (!p) { say("Aún no hay precio."); return; }
      if (!p.lots) { say("No puedo calcular el lote de " + s.msym + ": tu MT5 aún no ha mandado sus datos."); return; }
      await send({ op: "open", sym: s.msym, side, kind: "mkt", lots: p.lots, sl: p.sl, tp: p.tp },
        r => `MT5: ${side === "buy" ? "compra" : "venta"} de ${nf(p.lots, 2)} ${s.msym}${r.res && +r.res.p ? " a " + fp(+r.res.p, s) : ""} · stop ${fp(p.sl, s)} · objetivo ${fp(p.tp, s)}`);
    }

    /* ===== orden con precio, stop y objetivo ===== */
    function ticketDlg() {
      const s = S0(); if (!s.ok) { say(s.why || "Tu MT5 no está listo.", 5000); return; }
      const q = quote(s); if (!q) { say("Aún no hay precio."); return; }
      const d = ((HK.atr && HK.atr()) || q.b * 0.002) * 1.5;
      const o = { side: "buy", kind: "mkt", price: null, sl: null, tp: null, risk: T.riskPct() };
      const calc = () => {
        const buy = o.side === "buy", e = o.kind === "mkt" ? (buy ? q.a : q.b) : (o.price != null ? o.price : rd(buy ? (o.kind === "lim" ? q.a - d / 2 : q.a + d / 2) : (o.kind === "lim" ? q.b + d / 2 : q.b - d / 2), s));
        const sl = o.sl != null ? o.sl : rd(buy ? e - d : e + d, s), tp = o.tp != null ? o.tp : rd(buy ? e + 2 * Math.abs(e - sl) : e - 2 * Math.abs(e - sl), s);
        const rm = (+s.acct.bal || 0) * o.risk / 100; let lots = T.lots(s.msym, e, sl, rm); const max = +s.acct.max || 0; if (lots && max && lots > max) lots = max;
        return { e, sl, tp, rm, lots, rr: Math.abs(e - sl) ? Math.abs(tp - e) / Math.abs(e - sl) : 0 };
      };
      const sum = () => { const c = calc(); return `<span>Arriesgas <b>${money(c.rm, s.acct.cur)}</b> (1 R)</span><span>Objetivo <b>+${nf(c.rr, 1)} R</b></span><span><b>${c.lots ? nf(c.lots, 2) : "—"}</b> lotes</span>`; };
      const paint = () => {
        const c = calc();
        X.openModal(`<div class="gx-dh"><h3>Nueva orden en tu ${esc(label(s))}</h3><button type="button" class="gx-tb gx-ic" data-x aria-label="Cerrar">${SV(IC.x, 18)}</button></div>
          <div class="gx-ot"><p class="gx-muted" style="margin:0">${esc(s.msym)} · se envía a tu MetaTrader y respeta tu plan.</p>
          <div class="gx-seg">${[["buy", "Comprar"], ["sell", "Vender"]].map(([k, l]) => `<button type="button" data-os="${k}" aria-pressed="${o.side === k}">${l}</button>`).join("")}</div>
          <div class="gx-seg">${[["mkt", "A mercado"], ["lim", "Límite"], ["stp", "Stop"]].map(([k, l]) => `<button type="button" data-ok="${k}" aria-pressed="${o.kind === k}">${l}</button>`).join("")}</div>
          <div class="gx-og">${o.kind !== "mkt" ? `<label>Precio<input class="gx-in" data-of="price" inputmode="decimal" value="${fp(c.e, s)}"></label>` : ""}<label>Stop<input class="gx-in" data-of="sl" inputmode="decimal" value="${fp(c.sl, s)}"></label><label>Objetivo<input class="gx-in" data-of="tp" inputmode="decimal" value="${fp(c.tp, s)}"></label><label>Riesgo %<input class="gx-in" data-of="risk" inputmode="decimal" value="${String(o.risk).replace(".", ",")}"></label></div>
          <div class="gx-osum">${sum()}</div>
          <div class="gx-dact"><button type="button" class="gx-btn" data-x>Cancelar</button><button type="button" class="gx-btn gx-pri" data-ogo>Enviar a MT5</button></div></div>`, bind);
      };
      const D = X.$(".gx-dlg");
      const num = v => { const x = parseFloat(String(v).replace(/\./g, "").replace(",", ".")); return isFinite(x) ? x : parseFloat(String(v).replace(",", ".")); };
      function bind() {
        D.onclick = e => {
          const t = e.target.closest("button"); if (!t) return;
          if (t.dataset.x != null) { X.closeModal(); return; }
          if (t.dataset.os) { o.side = t.dataset.os; o.price = o.sl = o.tp = null; paint(); return; }
          if (t.dataset.ok) { o.kind = t.dataset.ok; o.price = o.sl = o.tp = null; paint(); return; }
          if (t.dataset.ogo != null) {
            const c = calc(), buy = o.side === "buy";
            if (buy ? c.sl >= c.e : c.sl <= c.e) { say("El stop tiene que ir " + (buy ? "por debajo" : "por encima") + " de la entrada."); return; }
            if (o.kind === "lim" && (buy ? c.e >= q.a : c.e <= q.b)) { say("Una límite de " + (buy ? "compra va por debajo" : "venta va por encima") + " del precio."); return; }
            if (o.kind === "stp" && (buy ? c.e <= q.a : c.e >= q.b)) { say("Una stop de " + (buy ? "compra va por encima" : "venta va por debajo") + " del precio."); return; }
            if (!c.lots) { say("No puedo calcular el lote de " + s.msym + "."); return; }
            X.closeModal();
            send({ op: "open", sym: s.msym, side: o.side, kind: o.kind, lots: c.lots, price: o.kind === "mkt" ? 0 : c.e, sl: c.sl, tp: c.tp },
              () => `MT5: ${o.kind === "mkt" ? (buy ? "compra" : "venta") : "orden " + (o.kind === "lim" ? "límite" : "stop") + " de " + (buy ? "compra" : "venta") + " a " + fp(c.e, s)} · ${nf(c.lots, 2)} lotes · stop ${fp(c.sl, s)}`);
          }
        };
        D.onchange = e => {
          const f = e.target.dataset.of; if (!f) return; const v = num(e.target.value); if (!isFinite(v) || v <= 0) return;
          o[f] = f === "risk" ? Math.min(5, v) : rd(v, s); const sm = D.querySelector(".gx-osum"); if (sm) sm.innerHTML = sum();
        };
      }
      paint();
    }

    /* ===== tus posiciones y órdenes de MT5 en el gráfico ===== */
    function items(s) {
      const a = s && s.acct; if (!a) return [];
      const pos = (a.pos || []).map(p => ({ kind: "pos", ticket: String(p[0]), sym: p[1], side: +p[2] === 1 ? "sell" : "buy", lots: +p[3], entry: +p[4], sl: +p[5], tp: +p[6], pl: +p[7], t0: +p[8] }));
      const ord = (a.ord || []).filter(o => ORD_TYPE[+o[2]]).map(o => ({ kind: "ord", ticket: String(o[0]), sym: o[1], side: ORD_TYPE[+o[2]][0], pend: ORD_TYPE[+o[2]][1], lots: +o[3], entry: +o[4], sl: +o[5], tp: +o[6], t0: +o[7] }));
      return pos.concat(ord);
    }
    function draw(o, s) {
      const id = o.kind + o.ticket, ms = (U.TF_MS && U.TF_MS[st.tf]) || 3e5, t0 = o.t0 || Date.now(), tw = Math.max(ms * 20, Date.now() - t0 + ms * 8);
      const noSl = !(o.sl > 0), noTp = !(o.tp > 0);
      const pts = [{ timestamp: t0, value: o.entry }, { timestamp: t0 + tw, value: noSl ? o.entry : o.sl }, { timestamp: t0 + tw, value: noTp ? o.entry : o.tp }];
      const ex = { side: o.side, real: true, lots: o.lots, pend: o.pend || null, noSl, noTp, closable: true, plTxt: o.kind === "pos" ? money(o.pl, s.acct.cur) : null };
      if (ov[id] && ch.getOverlays({ id: ov[id] })[0]) { if (!dragging) { try { ch.overrideOverlay({ id: ov[id], extendData: ex, points: pts }); } catch (e) { /* nada */ } } return id; }
      // como en TradingView: entrada, stop en rojo y objetivo en verde; cada línea se arrastra por separado y la «×» cierra
      const evs = U.posLnEvents({
        movable: i => i > 0 || o.kind === "ord",
        onSelected: () => { sel = o.ticket + "|" + o.kind; }, onDeselected: () => { if (sel === o.ticket + "|" + o.kind) sel = null; },
        onClose: () => { const z = items(S0()).find(q => q.kind === o.kind && q.ticket === o.ticket); if (z) closeAsk(z); },
        onEnd: P => moved(o.kind, o.ticket, P)
      });
      const st0 = evs.onPressedMoveStart, en0 = evs.onPressedMoveEnd;
      evs.onPressedMoveStart = ev => { dragging = true; st0(ev); }; evs.onPressedMoveEnd = ev => { dragging = false; en0(ev); };
      ov[id] = ch.createOverlay(Object.assign({ name: "tkPosLn", groupId: "mt5", extendData: ex, points: pts }, evs));
      return id;
    }
    function redraw() {
      const keep = {}, s = last || S0();
      if (mode === "mt5" && !R.on && s.ok && (U.CFG || {}).showPos !== false) items(s).filter(o => o.sym === s.msym).forEach(o => { keep[draw(o, s)] = 1; });
      Object.keys(ov).forEach(id => { if (!keep[id]) { try { ch.removeOverlay({ id: ov[id] }); } catch (e) { /* ya no está */ } delete ov[id]; } });
      if (sel && !items(s).some(o => o.ticket + "|" + o.kind === sel)) sel = null;
    }
    function forget(kind, ticket) { const id = kind + ticket; if (ov[id]) { try { ch.removeOverlay({ id: ov[id] }); } catch (e) { /* nada */ } delete ov[id]; } }
    async function moved(kind, ticket, pts) {
      const s = S0(), o = items(s).find(z => z.kind === kind && z.ticket === ticket); if (!s.ok || !o) { forget(kind, ticket); redraw(); return; }
      const nsl = rd(pts[1].value, s), ntp = rd(pts[2].value, s), npx = rd(pts[0].value, s);
      const sl = !(o.sl > 0) && nsl === rd(o.entry, s) ? 0 : nsl, tp = !(o.tp > 0) && ntp === rd(o.entry, s) ? 0 : ntp;
      const price = kind === "ord" ? npx : 0;
      if (sl === rd(o.sl, s) && tp === rd(o.tp, s) && (kind === "pos" || price === rd(o.entry, s))) { forget(kind, ticket); redraw(); return; }
      const buy = o.side === "buy", ref = kind === "pos" ? (quote(s) || {}).b : price;
      if (sl && ref && (buy ? sl >= ref : sl <= ref)) { say("El stop tiene que quedar " + (buy ? "por debajo" : "por encima") + (kind === "pos" ? " del precio." : " de la entrada.")); forget(kind, ticket); redraw(); return; }
      const r = await send(kind === "pos" ? { op: "modify", sym: o.sym, ticket, sl, tp } : { op: "omodify", sym: o.sym, ticket, price, sl, tp },
        () => kind === "pos" ? `MT5: stop ${sl ? fp(sl, s) : "sin stop"} · objetivo ${tp ? fp(tp, s) : "sin objetivo"}` : `MT5: orden a ${fp(price, s)} · stop ${fp(sl, s)}`);
      if (!r || !r.ok) { forget(kind, ticket); redraw(); } // vuelve a donde estaba en MT5
    }
    function closeAsk(o) {
      const s = S0(); if (!s.ok) { say(s.why || "Tu MT5 no está listo."); return; }
      const what = o.kind === "pos" ? `${o.side === "buy" ? "Compra" : "Venta"} de ${nf(o.lots, 2)} ${esc(o.sym)} · ${money(o.pl, s.acct.cur)}` : `Orden ${o.pend === "lim" ? "límite" : "stop"} de ${o.side === "buy" ? "compra" : "venta"} · ${nf(o.lots, 2)} ${esc(o.sym)} a ${fp(o.entry, s)}`;
      X.openModal(`<div class="gx-dh"><h3>${o.kind === "pos" ? "¿Cerrar la posición?" : "¿Anular la orden?"}</h3><button type="button" class="gx-tb gx-ic" data-x aria-label="Cerrar">${SV(IC.x, 18)}</button></div>
        <p style="margin:0 0 6px">${what}</p><p class="gx-muted" style="margin:0">En tu ${esc(label(s))}, ${o.kind === "pos" ? "a precio de mercado" : "al momento"}.</p>
        <div class="gx-dact"><button type="button" class="gx-btn" data-x>Cancelar</button><button type="button" class="gx-btn gx-pri" data-go>${o.kind === "pos" ? "Cerrar en MT5" : "Anular en MT5"}</button></div>`, () => {
        X.$(".gx-dlg").onclick = e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.x != null) X.closeModal(); if (b.dataset.go != null) { X.closeModal(); doClose(o); } };
      });
    }
    function doClose(o, frac) {
      const s = S0(), lots = frac ? Math.max(0.01, Math.floor(o.lots * frac * 100) / 100) : 0;
      if (o.kind === "pos") send({ op: "close", sym: o.sym, ticket: o.ticket, lots }, r => `MT5: ${lots ? "cerrada una parte (" + nf(lots, 2) + ")" : "posición cerrada"}${r.res && +r.res.p ? " a " + fp(+r.res.p, s) : ""}`);
      else send({ op: "cancel", sym: o.sym, ticket: o.ticket }, () => "MT5: orden anulada");
    }
    function toBE(o) {
      const s = S0(), q = quote(s), buy = o.side === "buy"; if (!q) return;
      if (buy ? q.b <= o.entry : q.a >= o.entry) { say("Para mover el stop a la entrada, el precio tiene que ir a tu favor."); return; }
      send({ op: "modify", sym: o.sym, ticket: o.ticket, sl: rd(o.entry, s), tp: o.tp > 0 ? rd(o.tp, s) : 0 }, () => "MT5: stop en la entrada");
    }
    me.el.addEventListener("pointerdown", () => { sel = null; }, true); // un clic en otro sitio quita la selección
    /* Supr con una posición u orden de MT5 seleccionada: pregunta y la cierra o anula */
    { const prev = HK.delSel; HK.delSel = () => {
      if (sel && mode === "mt5") { const s = S0(), o = items(s).find(z => z.ticket + "|" + z.kind === sel); sel = null; if (o) { closeAsk(o); return true; } }
      return prev ? prev() : false; }; }

    /* ===== en el panel de posiciones y órdenes ===== */
    { const prev = HK.afterPanel; HK.afterPanel = (bp, tab) => {
      prev && prev(bp, tab);
      if (mode !== "mt5" || R.on) return;
      const s = S0(), bps = bp.querySelector(".gx-bps");
      if (bps) bps.innerHTML = s.ok ? `Tu ${esc(label(s))} · Saldo <b>${money(s.acct.bal, s.acct.cur)}</b> · Patrimonio <b>${money(s.acct.eq, s.acct.cur)}</b>` : "Tu MT5 no está listo";
      if (s.ok) { const L = items(s), np = L.filter(o => o.kind === "pos").length, no = L.length - np;
        bp.querySelectorAll("[data-bpt]").forEach(b => { if (b.dataset.bpt === "pos") b.textContent = "Posiciones" + (np ? " (" + np + ")" : ""); if (b.dataset.bpt === "ord") b.textContent = "Órdenes" + (no ? " (" + no + ")" : ""); }); }
      if (tab !== "pos" && tab !== "ord") return;
      const body = bp.querySelector(".gx-bpb"); if (!body) return;
      let h;
      if (!s.ok) h = `<p class="gx-bpe">${esc(s.why || "Tu MT5 no está listo.")}</p>`;
      else {
        const L = items(s).filter(o => o.kind === (tab === "pos" ? "pos" : "ord")), c = s.acct.cur;
        const th = cols => `<tr>${cols.map(x => `<th>${x}</th>`).join("")}</tr>`;
        h = L.length ? `<table>${tab === "pos" ? th(["Mercado", "Lado", "Lotes", "Entrada", "Stop", "Objetivo", "Resultado", ""]) : th(["Mercado", "Tipo", "Lotes", "Precio", "Stop", "Objetivo", ""])}${L.map(o => `<tr><td><b>${esc(o.sym)}</b></td><td class="${o.side === "buy" ? "up" : ""}">${o.kind === "ord" ? (o.pend === "lim" ? "Límite" : "Stop") + " de " : ""}${o.side === "buy" ? (o.kind === "ord" ? "compra" : "Compra") : (o.kind === "ord" ? "venta" : "Venta")}</td><td>${nf(o.lots, 2)}</td><td>${fp(o.entry, s)}</td><td>${o.sl > 0 ? fp(o.sl, s) : "Sin stop"}</td><td>${o.tp > 0 ? fp(o.tp, s) : "—"}</td>${o.kind === "pos" ? `<td class="${o.pl >= 0 ? "up" : "dn"}">${money(o.pl, c)}</td>` : ""}<td class="gx-pa">${o.kind === "pos" ? `<button type="button" class="gx-link" data-rt="be" data-tk="${esc(o.ticket)}">Stop a entrada</button><button type="button" class="gx-link" data-rt="half" data-tk="${esc(o.ticket)}">Cerrar la mitad</button><button type="button" class="gx-link" data-rt="close" data-tk="${esc(o.ticket)}">Cerrar</button>` : `<button type="button" class="gx-link" data-rt="cancel" data-tk="${esc(o.ticket)}">Anular</button>`}</td></tr>`).join("")}</table>`
          : `<p class="gx-bpe">${tab === "pos" ? "Sin posiciones abiertas en tu MT5." : "Sin órdenes pendientes en tu MT5."}</p>`;
        h = `<p class="gx-muted gx-mt5h">Tu ${esc(label(s))} · Saldo <b>${money(s.acct.bal, c)}</b> · Patrimonio <b>${money(s.acct.eq, c)}</b></p>` + h;
      }
      body.innerHTML = h;
      if (!bp.__tkRt) { bp.__tkRt = true; bp.addEventListener("click", e => {
        const b = e.target.closest("[data-rt]"); if (!b) return; e.stopPropagation();
        const s2 = S0(), o = items(s2).find(z => z.ticket === b.dataset.tk); if (!o) return;
        const k = b.dataset.rt; if (k === "close" || k === "cancel") closeAsk(o); if (k === "half") doClose(o, 0.5); if (k === "be") toBE(o);
      }); }
    }; }

    /* ===== se pone al día ===== */
    const onAcct = () => { if (mode !== "mt5") return; S0(); redraw(); refresh(); };
    window.addEventListener("tk-acct", onAcct);
    { const prev = HK.onData; HK.onData = () => { prev && prev(); setTimeout(() => { if (mode === "mt5") { const s = S0(); if (s.ok) T.watch(s.msym, st.tf); } redraw(); }, 160); }; }
    { const prev = HK.onRestyle; HK.onRestyle = () => { prev && prev(); Object.keys(ov).forEach(id => { try { ch.removeOverlay({ id: ov[id] }); } catch (e) { /* nada */ } delete ov[id]; }); redraw(); }; }
    const tm = setInterval(() => { if (mode !== "mt5" || !me.el || !document.body.contains(me.el)) return; const s = S0(); if (s.ok) T.watch(s.msym, st.tf); redraw(); }, 5000);
    { const prev = HK.destroy; HK.destroy = () => { prev && prev(); clearInterval(tm); window.removeEventListener("tk-acct", onAcct); T.watch(null); }; }
    if (mode === "mt5") setTimeout(() => setMode("mt5"), 800);
  };
  window.TkChartExt2 = (window.TkChartExt2 || []).concat([ext]);
})();
