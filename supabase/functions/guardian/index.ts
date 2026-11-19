// Tickora · el guardián en el servidor (19-nov-2026).
// Lo llama la base de datos cada vez que MT5 abre, cierra o cambia una operación, y pg_cron cada minuto (pausas, noticias,
// resumen del domingo). Las normas se deciden con reglas.js (el mismo archivo que usa la app y que tiene tests): aquí no hay IA.
// Guarda cada aviso en agent_events (la memoria común) y envía al móvil el más importante que sea nuevo.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";
import "./reglas.js";
const R = (globalThis as any).TkRules;

const DEFAULT_PLAN = { riskPct: 0.5, maxTrades: 3, dayLimitR: 2, start: "15:30", end: "17:30", rules: [{ si: "pierdo dos seguidas,", entonces: "me levanto 15 minutos." }] };
let NEWS: { t: number; ev: any[] } | null = null;
async function news() {
  if (NEWS && Date.now() - NEWS.t < 20 * 60e3) return NEWS.ev;
  const ev: any[] = [];
  for (const u of ["https://nfs.faireconomy.media/ff_calendar_thisweek.json", "https://nfs.faireconomy.media/ff_calendar_nextweek.json"]) {
    try { const r = await fetch(u, { headers: { "User-Agent": "Tickora/1.0 (guardian)" } }); if (!r.ok) continue; const j = await r.json(); if (Array.isArray(j)) for (const e of j) { const ts = Date.parse(e.date); if (isFinite(ts)) ev.push({ ts, cur: String(e.country || ""), impact: String(e.impact || ""), title: String(e.title || "") }); } } catch (_) { /* la otra semana */ }
  }
  if (ev.length) NEWS = { t: Date.now(), ev }; return ev.length ? ev : (NEWS ? NEWS.ev : []);
}
function effPlan(d: any, today: string) {
  d = d || {}; const p = Object.assign({}, DEFAULT_PLAN, d.current || {});
  if (d.pending && d.pendingFrom && d.pendingFrom <= today) Object.assign(p, d.pending); return p;
}
function planWith(base: any, a: any) {
  const p = Object.assign({}, base); if (!a) return p;
  const n = (v: any) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(x) && x > 0 ? x : null; };
  const rp = n(a.risk), mt = n(a.maxTradesDay), dd = n(a.dailyDD);
  if (rp) p.riskPct = rp; if (mt) p.maxTrades = mt;
  if (dd) { const r = a.dailyU === "R" ? dd : dd / p.riskPct; if (r < p.dayLimitR) p.dayLimitR = r; }
  return p;
}
const acctName = (a: any) => a ? (a.name || [a.broker, a.number].filter(Boolean).join(" ") || "tu cuenta") : "";

async function oneUser(sb: any, uid: string, now: number, cron: boolean) {
  const [{ data: docs }, { data: trades }] = await Promise.all([
    sb.from("docs").select("col,id,data").eq("user_id", uid).in("col", ["v1", "guardian", "acct"]),
    sb.from("trades").select("id,account,symbol,side,volume,open_time,close_time,sl,tp,sl_moved,r,profit,status,risk_pct,review").eq("user_id", uid).gte("open_time", new Date(now - 400 * 864e5).toISOString()).order("open_time", { ascending: false }).limit(3000),
  ]);
  const D = (c: string, i?: string) => (docs || []).find((x: any) => x.col === c && (!i || x.id === i));
  const G = (D("guardian", "cfg") || {}).data || {}, cfg = Object.assign({}, R.DEF, G.cfg || {}), tz = G.tz || "Europe/Madrid";
  const P0 = R.parts(now, tz), base = effPlan((D("v1", "plan") || {}).data, P0.day);
  const accts = (docs || []).filter((x: any) => x.col === "acct").map((x: any) => Object.assign({ id: x.id }, x.data));
  const T = (trades || []) as any[], recentT = T.filter(t => now - Date.parse(t.open_time) < 30 * 864e5);
  const syms = [...new Set(recentT.map(t => t.symbol))];
  const NEWSL = cfg.news ? await news() : [];
  const rows: any[] = [];
  /* guardián: por cuenta (cada una con sus normas) */
  const today = T.filter(t => R.parts(Date.parse(t.open_time), tz).day === P0.day);
  const groups = new Map<string, any[]>(); today.forEach(t => { const k = String(t.account || ""); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(t); });
  if (!groups.size) groups.set("", []);
  for (const [k, list] of groups) {
    const a = accts.find((x: any) => String(x.number || "") === k) || null, plan = planWith(base, a);
    const totalR = a ? T.filter(t => String(t.account || "") === k && t.status === "closed" && (!a.start || String(t.open_time) >= String(a.start))).reduce((s, t) => s + (+t.r || 0), 0) : null;
    const al = R.guardian({ plan, tz, now, trades: list, syms, news: NEWSL, cfg, acct: a ? Object.assign({ name: acctName(a) }, a) : null, totalR, acctName: groups.size > 1 && a ? acctName(a) : "" });
    al.forEach((x: any) => rows.push({ user_id: uid, agent: "guardian", kind: x.rule, key: x.key, level: x.level, title: x.title, msg: x.msg, trade_id: x.tradeId || null, data: { prio: x.prio, action: x.action, until: x.until || null, pauseMin: x.pauseMin || null, acct: k || null } }));
  }
  /* analista: cada operación cerrada en los últimos 20 minutos, dentro o fuera del plan y por qué */
  T.filter(t => t.status === "closed" && t.close_time && now - Date.parse(t.close_time) < 20 * 60e3).forEach(t => {
    const a = accts.find((x: any) => String(x.number || "") === String(t.account || "")) || null, plan = planWith(base, a);
    const day = T.filter(x => String(x.account || "") === String(t.account || "") && R.parts(Date.parse(x.open_time), tz).day === R.parts(Date.parse(t.open_time), tz).day);
    const c = R.checkTrade(t, plan, day, tz), res = t.r != null ? R.nf(+t.r, 2) + " R" : "";
    rows.push({ user_id: uid, agent: "analista", kind: "cierre", key: "cierre:" + t.id, level: "info", trade_id: t.id, title: c.good ? (+t.r < 0 ? "Pérdida buena" : "Dentro del plan") : "Fuera del plan",
      msg: `${t.symbol} ${t.side === "buy" ? "compra" : "venta"} ${res}. ` + (c.good ? "Seguiste tu plan." : "Te saltaste: " + c.fail.map((f: any) => f.bad.toLowerCase()).join("; ") + "."), data: { good: c.good, fail: c.fail.map((f: any) => f.k), r: t.r } });
  });
  /* revisor: el domingo desde las 18:00, el parte de la semana y la norma en foco propuesta */
  if (cron && P0.wd === 6 && P0.min >= 18 * 60) {
    const mon = new Date(Date.parse(P0.day + "T12:00:00Z") - 6 * 864e5).toISOString().slice(0, 10);
    const W = T.filter(t => t.status === "closed" && R.parts(Date.parse(t.open_time), tz).day >= mon && R.parts(Date.parse(t.open_time), tz).day <= P0.day);
    if (W.length) {
      const ev = W.map(t => { const a = accts.find((x: any) => String(x.number || "") === String(t.account || "")) || null; return { t, c: R.checkTrade(t, planWith(base, a), T.filter(x => String(x.account || "") === String(t.account || "") && R.parts(Date.parse(x.open_time), tz).day === R.parts(Date.parse(t.open_time), tz).day), tz) }; });
      const good = ev.filter(x => x.c.good).length, cost = ev.filter(x => !x.c.good && +x.t.r < 0).reduce((s, x) => s - +x.t.r, 0), cnt: Record<string, number> = {}, eur: Record<string, number> = {};
      ev.forEach(x => x.c.fail.forEach((f: any) => { cnt[f.k] = (cnt[f.k] || 0) + 1; if (+x.t.r < 0) eur[f.k] = (eur[f.k] || 0) - +x.t.r; }));
      const most = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0], dear = Object.entries(eur).sort((a, b) => b[1] - a[1])[0];
      const LBL: Record<string, string> = { stop: "Entrar siempre con stop", stopmov: "No mover el stop en contra", riesgo: "Respetar tu riesgo", horario: "Operar solo en tu horario", maxops: "Respetar tu máximo de operaciones", limite: "Parar en tu límite del día" };
      const prop = dear && (!most || dear[0] !== most[0]) && dear[1] > 0 ? dear : most;
      rows.push({ user_id: uid, agent: "revisor", kind: "semana", key: "semana:" + mon, level: "info", title: "Tu parte de la semana está listo",
        msg: `${W.length} operaciones, ${Math.round(good / W.length * 100)} % dentro del plan. Lo evitable te costó ${R.nf(cost, 1)} R.` + (prop ? ` Propuesta de foco para la semana que viene: «${LBL[prop[0]] || prop[0]}».` : " Esta semana no rompiste ninguna norma."),
        data: { n: W.length, good, costR: cost, focus: prop ? prop[0] : null, why: prop ? (prop === most ? "la que más rompiste" : "la que más te costó") : null, week: mon } });
    }
  }
  if (!rows.length) return { n: 0 };
  const { data: ins } = await sb.from("agent_events").upsert(rows, { onConflict: "user_id,key", ignoreDuplicates: true }).select("id,agent,kind,key,level,title,msg,data");
  const fresh = (ins || []) as any[];
  /* al móvil: solo el aviso nuevo más importante (los del guardián) y el parte del domingo */
  const top = fresh.filter(x => x.agent === "guardian" && x.level !== "info").sort((a, b) => (b.data?.prio || 0) - (a.data?.prio || 0))[0] || fresh.find(x => x.agent === "revisor");
  if (top && cfg.push !== false) {
    const pub = SECRETS.vapid_public, priv = SECRETS.vapid_private;
    if (pub && priv) {
      const { data: subs } = await sb.from("push_subs").select("endpoint,sub").eq("user_id", uid);
      for (const s of subs || []) {
        try { await webpush.sendNotification(s.sub, JSON.stringify({ title: top.title, body: top.msg, url: top.agent === "revisor" ? "./#ahorro" : "./#inicio" }), { TTL: 900 }); }
        catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint); }
      }
    }
  }
  return { n: fresh.length };
}

let SECRETS: Record<string, string> = {};
Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: sec } = await sb.from("app_secrets").select("k,v"); SECRETS = Object.fromEntries((sec || []).map((x: any) => [x.k, x.v]));
  if (!SECRETS.cron || req.headers.get("x-cron") !== SECRETS.cron) return new Response("no", { status: 401 });
  if (SECRETS.vapid_public && SECRETS.vapid_private) webpush.setVapidDetails("mailto:avisos@tickora.app", SECRETS.vapid_public, SECRETS.vapid_private);
  let body: any = {}; try { body = await req.json(); } catch (_) { /* vacío */ }
  const now = Date.now(); let users: string[] = [];
  if (body.user_id) users = [String(body.user_id)];
  else {
    const since = new Date(now - 36 * 3600e3).toISOString();
    const [a, b, c] = await Promise.all([
      sb.from("trades").select("user_id").gte("updated_at", since).limit(5000),
      sb.from("trades").select("user_id").eq("status", "open").limit(5000),
      sb.from("push_subs").select("user_id").limit(5000),
    ]);
    users = [...new Set([...(a.data || []), ...(b.data || []), ...(c.data || [])].map((x: any) => x.user_id))];
    // el domingo por la tarde también quien operó esa semana
    if (new Date(now).getUTCDay() === 0) { const w = await sb.from("trades").select("user_id").gte("open_time", new Date(now - 7 * 864e5).toISOString()).limit(5000); users = [...new Set(users.concat((w.data || []).map((x: any) => x.user_id)))]; }
  }
  let done = 0, ev = 0;
  for (const u of users) { try { const r = await oneUser(sb, u, now, !body.user_id); ev += r.n; done++; } catch (_e) { /* un usuario con datos raros no para a los demás */ } }
  return new Response(JSON.stringify({ users: done, events: ev }), { headers: { "Content-Type": "application/json" } });
});
