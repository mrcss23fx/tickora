/* Tickora · Pausa o bloqueo (16-nov-2026). El usuario elige si, cuando necesita parar, Tickora se lo
   recomienda (como hasta ahora) o bloquea su pantalla el tiempo que él pida. El bloqueo sobrevive a recargar
   la página y se guarda en la cuenta (user_metadata.lockUntil), así que también vale en el móvil.
   Tickora no puede bloquear MetaTrader desde la web. */
(function () {
  "use strict";
  const A = window.TKAPP, V = window.TK_VIEWS;
  if (!A || !V) return;
  const { S, sb, esc, toast, lsGet, lsSet, todayKey, evaluate, dayKey } = A;
  const MINS = [5, 10, 15, 30, 60];
  const md = () => (S.user && S.user.user_metadata) || {};
  const cfg = () => Object.assign({ mode: "aviso", min: 15, auto: false }, md().brk || {});
  const fmtT = ms => new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const endOfDay = () => { const d = new Date(); d.setHours(23, 59, 0, 0); return d.getTime(); };
  async function saveMeta(patch) {
    S.user.user_metadata = Object.assign({}, md(), patch);
    const { error } = await sb.auth.updateUser({ data: patch }); if (error) toast("No se pudo guardar");
  }
  const lockUntil = () => Math.max(+lsGet("tk-lock", "0") || 0, +md().lockUntil || 0);

  /* ---------- la pantalla de bloqueo ---------- */
  let tick = 0;
  function showLock() {
    const until = lockUntil(); if (until <= Date.now()) { hideLock(); return; }
    let box = document.getElementById("tk-lock");
    const P = S.menteP || {}, calmT = { respirar: "Respira despacio: 5 segundos dentro, 5 fuera.", escribir: "Escribe en un papel cómo te sientes.", mover: "Levántate y camina unos minutos.", plan: "Relee tu plan con calma.", pausa: "Aléjate de la pantalla.", hablar: "Habla con alguien un rato." }[(P.calm || [])[0]] || "Levántate, bebe agua y aléjate de la pantalla.";
    if (!box) {
      box = document.createElement("div"); box.id = "tk-lock"; box.className = "lk"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Tickora está bloqueada");
      document.body.appendChild(box); document.body.classList.add("lk-on");
    }
    box.innerHTML = `<div class="lk-in"><span class="lk-k">Tickora está en pausa</span><div class="lk-ring" aria-hidden="true"><i></i></div>
      <div class="lk-t mono" id="lk-t" aria-live="off"></div><p class="lk-s">Bloqueada hasta las <b>${fmtT(until)}</b>. Lo pediste tú, en frío, para un momento como este.</p>
      ${P.why ? `<p class="lk-why">«${esc(P.why)}»<small>Tu porqué</small></p>` : ""}
      <p class="lk-do"><b>Mientras tanto:</b> ${esc(calmT)}</p>
      <details class="lk-esc"><summary>Desbloquear antes</summary><p>Para desbloquear, escribe exactamente: <b>quiero saltarme mi pausa</b></p><div class="lk-row"><input id="lk-in" class="input" autocomplete="off" spellcheck="false" aria-label="Escribe la frase para desbloquear"><button type="button" class="x-ch" id="lk-go" disabled>Desbloquear</button></div><small>Tickora lo anotará.</small></details></div>`;
    const inp = box.querySelector("#lk-in"), go = box.querySelector("#lk-go");
    inp.oninput = () => { go.disabled = inp.value.trim().toLowerCase() !== "quiero saltarme mi pausa"; };
    go.onclick = () => endLock(true);
    const paint = () => { const left = lockUntil() - Date.now(); if (left <= 0) { endLock(false); return; } const m = Math.floor(left / 6e4), s = Math.floor(left / 1e3) % 60, el = document.getElementById("lk-t"); if (el) el.textContent = m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; };
    clearInterval(tick); paint(); tick = setInterval(paint, 1000);
    setTimeout(() => { const f = box.querySelector("summary"); if (f) f.focus({ preventScroll: true }); }, 50);
  }
  function hideLock() { clearInterval(tick); const b = document.getElementById("tk-lock"); if (b) b.remove(); document.body.classList.remove("lk-on"); }
  async function endLock(early) {
    lsSet("tk-lock", "0"); hideLock(); S.pauseUntil = 0;
    if (early) { const n = (+lsGet("tk-lockbreak-" + todayKey(), "0") || 0) + 1; lsSet("tk-lockbreak-" + todayKey(), String(n)); toast("Pausa terminada antes de tiempo"); }
    else toast("Pausa terminada. Vuelve con calma");
    await saveMeta({ lockUntil: 0, lockBreaks: early ? (+md().lockBreaks || 0) + 1 : (+md().lockBreaks || 0) });
    S.lastView = null; A.render();
  }
  async function lock(min) {
    const until = min === "dia" ? endOfDay() : Date.now() + min * 6e4;
    lsSet("tk-lock", String(until)); S.pauseUntil = until; showLock();
    await saveMeta({ lockUntil: until });
  }
  /* elegir cuánto tiempo, en el momento */
  function askLock() {
    if (document.getElementById("lk-ask")) return;
    const c = cfg(); let sel = c.min;
    const box = document.createElement("div"); box.id = "lk-ask"; box.className = "lk-ask"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Bloquear Tickora");
    const paint = () => { box.innerHTML = `<div class="lk-box"><b class="lk-h">¿Cuánto tiempo bloqueo Tickora?</b><p>No podrás usar Tickora hasta que acabe. Es tu decisión, tomada ahora en frío.</p><div class="lk-opts">${MINS.map(m => `<button type="button" class="dj-chip${sel === m ? " on" : ""}" data-lm="${m}" aria-pressed="${sel === m}">${m} min</button>`).join("")}<button type="button" class="dj-chip${sel === "dia" ? " on" : ""}" data-lm="dia" aria-pressed="${sel === "dia"}">El resto del día</button></div><div class="lk-acts"><button type="button" class="x-ch" data-lx>Cancelar</button><button type="button" class="x-ch pri" data-lgo>Bloquear ${sel === "dia" ? "hasta mañana" : sel + " minutos"}</button></div></div>`;
      box.querySelectorAll("[data-lm]").forEach(b => b.onclick = () => { sel = b.dataset.lm === "dia" ? "dia" : +b.dataset.lm; paint(); });
      box.querySelector("[data-lx]").onclick = close; box.querySelector("[data-lgo]").onclick = () => { close(); lock(sel); }; };
    const close = () => { box.remove(); document.removeEventListener("keydown", ek); };
    const ek = e => { if (e.key === "Escape") close(); };
    box.addEventListener("click", e => { if (e.target === box) close(); });
    paint(); document.body.appendChild(box); document.addEventListener("keydown", ek); setTimeout(() => { const f = box.querySelector("[data-lgo]"); f && f.focus(); }, 30);
  }
  /* la función que usan todos los botones de pausa de la app */
  window.tkPause = () => { const c = cfg(); if (c.mode === "bloqueo") { askLock(); return true; } S.pauseUntil = Date.now() + c.min * 6e4; toast(`Pausa de ${c.min} minutos. Aléjate de la pantalla`); return false; };
  window.tkPauseLabel = () => { const c = cfg(); return c.mode === "bloqueo" ? "Bloquear Tickora" : `Pausa ${c.min} min`; };

  /* bloqueo automático tras dos pérdidas seguidas (solo si el usuario lo eligió) */
  setInterval(() => {
    const c = cfg(); if (c.mode !== "bloqueo" || !c.auto || lockUntil() > Date.now() || !S.trades) return;
    const tk = todayKey(), C = S.trades.filter(t => t.status === "closed" && t.close_time && dayKey(t.close_time) === tk).sort((a, b) => new Date(a.close_time) - new Date(b.close_time)), l2 = C.slice(-2);
    if (l2.length < 2 || !l2.every(t => +t.r < 0)) return;
    const last = l2[1]; if (lsGet("tk-lockauto", "") === last.id || Date.now() - new Date(last.close_time) > 30 * 6e4) return;
    lsSet("tk-lockauto", last.id); lock(c.min); toast("Dos pérdidas seguidas: Tickora se bloquea, como pediste");
  }, 15000);

  /* comprobar al cargar y al volver a la pestaña (el bloqueo sigue aunque recargues) */
  const check = () => { if (S.user && lockUntil() > Date.now()) showLock(); else if (document.getElementById("tk-lock")) hideLock(); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  let tries = 0; const iv = setInterval(() => { if (S.user) { check(); clearInterval(iv); } else if (++tries > 60) clearInterval(iv); }, 500);

  /* ---------- Ajustes: «Cuando necesites parar» ---------- */
  const card = () => { const c = cfg(); return `<div class="card stack lk-cfg" style="gap:12px" id="pausa"><h2>Cuando necesites parar</h2>
    <div class="small muted">Tras dos pérdidas seguidas o con el calentón, Tickora te propone parar. Elige cómo.</div>
    <div class="seg" role="group" aria-label="Qué hace Tickora" style="width:max-content">${[["aviso", "Recomendármelo"], ["bloqueo", "Bloquear Tickora"]].map(([k, l]) => `<button type="button" data-lkmode="${k}" aria-pressed="${c.mode === k}">${l}</button>`).join("")}</div>
    <div class="small muted">${c.mode === "bloqueo" ? "Tickora tapará toda su pantalla con una cuenta atrás. Solo se puede quitar antes escribiendo una frase, y queda anotado." : "Tickora te recomendará una pausa y te dejará seguir usando la app."}</div>
    <div><div style="font-weight:600;font-size:14px;margin-bottom:8px">Tiempo por defecto</div><div class="row" style="gap:6px;flex-wrap:wrap">${MINS.map(m => `<button type="button" class="dj-chip${c.min === m ? " on" : ""}" data-lkmin="${m}" aria-pressed="${c.min === m}">${m} min</button>`).join("")}</div><div class="small muted" style="margin-top:6px">Al bloquear podrás elegir otro tiempo en ese momento, o el resto del día.</div></div>
    ${c.mode === "bloqueo" ? `<label class="row" style="gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" data-lkauto ${c.auto ? "checked" : ""} style="width:18px;height:18px;margin-top:2px"><span><b style="font-size:14px">Bloquear solo tras dos pérdidas seguidas</b><br><span class="small muted">Si en la misma sesión pierdes dos operaciones seguidas, Tickora se bloquea ${c.min} minutos sin preguntarte.</span></span></label>` : ""}
    <div class="small muted" style="border-top:1px solid var(--linea);padding-top:10px">Tickora no puede bloquear MetaTrader desde la web: bloquea su propia pantalla (gráfico, boleto y todo lo demás).</div></div>`; };
  const V0 = V.ajustes;
  V.ajustes = {
    view(r) {
      let h = V0 && V0.view ? V0.view(r) : window.viewPlan ? window.viewPlan("ajustes") : "";
      const i = h.indexOf('<div class="card stack" style="gap:12px" id="unidad">');
      return i < 0 ? h + card() : h.slice(0, i) + card() + h.slice(i);
    },
    bind(r) {
      if (V0 && V0.bind) V0.bind(r);
      const set = async patch => { await saveMeta({ brk: Object.assign(cfg(), patch) }); S.lastView = null; A.render(); toast("Guardado"); };
      document.querySelectorAll("[data-lkmode]").forEach(b => b.onclick = () => set({ mode: b.dataset.lkmode }));
      document.querySelectorAll("[data-lkmin]").forEach(b => b.onclick = () => set({ min: +b.dataset.lkmin }));
      const au = document.querySelector("[data-lkauto]"); if (au) au.onchange = () => set({ auto: au.checked });
    }
  };
  if (S.loaded && location.hash === "#ajustes") { S.lastView = null; A.render(); }
})();
