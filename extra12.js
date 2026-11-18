/* Tickora · Avisos de las alertas (18-nov-2026): en la app al momento y, si lo activas, como notificación en este
   dispositivo aunque Tickora esté cerrado (notificaciones push; en iPhone, con Tickora añadida a la pantalla de inicio). */
(function () {
  "use strict";
  const A = window.TKAPP; if (!A) return;
  const { S, sb, toast } = A;
  const VAPID = "BDHCxYMD3oWvduK5xWNyMv7uh57oEjcjMai_maomt9tGj1bbKAtmqqBNkrJt4gceIhz5-nfO-uq97BCVhvA_0bk";
  const b64 = s => { const p = "=".repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  const can = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window.navigator.standalone || matchMedia("(display-mode: standalone)").matches);
  let on = null;
  async function state() { if (!can()) return "no"; try { const r = await navigator.serviceWorker.getRegistration("./"); const s = r && await r.pushManager.getSubscription(); on = !!s && Notification.permission === "granted"; } catch (e) { on = false; } return on; }
  window.tkPushState = () => {
    if (ios()) return `<span class="gx-muted" style="font-size:12px">En iPhone: añade Tickora a la pantalla de inicio (Compartir › Añadir a inicio) para recibir avisos con la app cerrada.</span>`;
    if (!can()) return `<span class="gx-muted" style="font-size:12px">Este navegador no admite avisos con la web cerrada; los verás aquí al abrir Tickora.</span>`;
    if (on === null) { state().then(() => { (window.TkChart && TkChart.all || []).forEach(c => c.hk && c.hk.repaint && c.hk.repaint()); }); return ""; }
    return on ? `<span class="gx-muted" style="font-size:12px">Avisos activados en este dispositivo.</span>` : Notification.permission === "denied" ? `<span class="gx-muted" style="font-size:12px">Tienes los avisos bloqueados en este navegador: actívalos en los permisos del sitio.</span>` : `<button type="button" class="gx-btn" data-push>Avisarme en este dispositivo</button>`;
  };
  window.tkPushOn = async () => {
    if (!can()) { toast("Este navegador no admite avisos"); return false; }
    try {
      const perm = await Notification.requestPermission(); if (perm !== "granted") { toast("Sin permiso no puedo avisarte con la web cerrada"); return false; }
      const reg = await navigator.serviceWorker.register("sw.js", { scope: "./" }); await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) });
      const j = sub.toJSON(); const { error } = await sb.from("push_subs").upsert({ endpoint: j.endpoint, sub: j }); if (error) throw error;
      on = true; toast("Listo: te avisaré en este dispositivo"); return true;
    } catch (e) { toast("No se pudieron activar los avisos: " + (e.message || e)); return false; }
  };
  window.tkPushOffer = () => { if (on === false && can() && !ios() && Notification.permission === "default" && !sessionStorage.getItem("tk-pushask")) { sessionStorage.setItem("tk-pushask", "1"); setTimeout(() => { if (confirm("¿Quieres que te avise en este dispositivo cuando salte la alerta, aunque Tickora esté cerrada?")) window.tkPushOn(); }, 300); } };
  /* en la app: al momento */
  let ch = null;
  function listen() {
    if (ch || !S.user) return;
    ch = sb.channel("alertas-" + S.user.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "alert_events", filter: "user_id=eq." + S.user.id }, p => {
      const x = p.new || {}; toast("Alerta · " + (x.msg || x.sym || ""));
      if (document.hidden && "Notification" in window && Notification.permission === "granted" && !on) { try { new Notification("Alerta · " + (x.sym || ""), { body: x.msg || "", icon: "icon-192.png" }); } catch (e) { /* sin notificaciones */ } }
      window.tkAlertsChanged && window.tkAlertsChanged();
    }).subscribe();
  }
  const t = setInterval(() => { if (S.user && S.loaded) { listen(); state(); clearInterval(t); } }, 1500);
})();
