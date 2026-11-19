/* Tickora · reglas (19-nov-2026)
   Motor determinista y sin dependencias que comparten la app (navegador), el servidor (función «guardian») y los tests.
   Aquí se decide si se ha pasado un límite, si una operación está dentro del plan y qué aviso toca. Nada de IA:
   solo cuentas con los datos y las normas que escribió el propio trader. Se carga como script normal y deja
   todo en globalThis.TkRules. */
(function (G) {
  "use strict";
  /* ---------- valores por defecto (todo se puede cambiar en Ajustes › Tu guardián) ---------- */
  const DEF = {
    on: true, push: true,
    maxops: true, loss: true, lossSteps: [50, 80], horario: true, stop: true,
    revenge: true, revengeMin: 10, lotUp: true,
    streak: true, streakN: 2, streakMin: 15,
    news: true, newsMin: 5, fondeo: true, fondeoWarn: 35, spamMin: 15,
    badRule: "Opero con la mitad de riesgo y como mucho una operación."
  };
  const NUMW = { una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
  const nf = (v, d) => (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace(".", ",").replace(/(,\d*?)0+$/, "$1").replace(/,$/, "");
  const fR = v => nf(v, 1) + " R";
  const minOf = s => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const fmtCache = {};
  function parts(ts, tz) {
    const k = tz || "";
    const f = fmtCache[k] || (fmtCache[k] = new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }));
    const o = {}; f.formatToParts(new Date(ts)).forEach(p => { o[p.type] = p.value; });
    const h = +o.hour % 24;
    return { day: o.year + "-" + o.month + "-" + o.day, min: h * 60 + +o.minute, wd: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(o.weekday) };
  }
  const inSession = (m, s, e) => s == null || e == null ? true : s <= e ? m >= s && m <= e : m >= s || m <= e;
  const isLoss = t => t.r != null ? +t.r < 0 : t.profit != null ? +t.profit < 0 : false;
  const vol = t => t.volume == null ? null : +t.volume;

  /* ---------- divisas de cada mercado (para las noticias) ---------- */
  const IDX = { US30: "USD", US100: "USD", NAS100: "USD", US500: "USD", SPX500: "USD", USTEC: "USD", DJ30: "USD", GER40: "EUR", DE40: "EUR", EU50: "EUR", FRA40: "EUR", ESP35: "EUR", SPA35: "EUR", UK100: "GBP", JP225: "JPY", JPN225: "JPY" };
  function curOf(sym) {
    const s = String(sym || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    for (const k in IDX) if (s.startsWith(k)) return [IDX[k]];
    if (/^(XAU|XAG|XPT|XPD|WTI|BRENT|USOIL|UKOIL|XTI|XBR|BTC|ETH|SOL|XRP|BNB|ADA|DOGE|LTC)/.test(s)) return ["USD"];
    const m = s.match(/^([A-Z]{3})([A-Z]{3})/); return m ? [m[1], m[2]] : ["USD"];
  }

  /* ---------- la regla de pérdidas seguidas que escribió el trader ---------- */
  function streakRule(plan) {
    for (const r of (plan && plan.rules) || []) {
      const si = String(r.si || "").toLowerCase(), en = String(r.entonces || "").toLowerCase();
      const m = si.match(/pierdo\s+(\d+|una|uno|dos|tres|cuatro|cinco)\s+(?:operaciones\s+|veces\s+)?seguid[ao]s/);
      if (!m) continue;
      const n = +m[1] || NUMW[m[1]] || 2, mm = en.match(/(\d+)\s*(?:min|minutos)/), hh = en.match(/(\d+)\s*(?:h\b|horas?)/), rest = /resto del d[ií]a|cierro el d[ií]a|se acab[oó] el d[ií]a|no opero m[aá]s/.test(en);
      return { n, min: mm ? +mm[1] : hh ? +hh[1] * 60 : rest ? 24 * 60 : null, txt: (String(r.si || "").replace(/,\s*$/, "") + ", " + String(r.entonces || "")).trim() };
    }
    return null;
  }

  /* ---------- límites de la cuenta de fondeo, pasados a R ---------- */
  function acctLimitsR(acct, riskPct) {
    if (!acct) return null; const rp = +riskPct || 0.5, toR = (v, u) => u === "R" ? +v : +v / rp;
    const d = +acct.dailyDD > 0 ? toR(acct.dailyDD, acct.dailyU) : null, m = +acct.maxDD > 0 ? toR(acct.maxDD, acct.maxU) : null;
    return d == null && m == null ? null : { day: d, max: m };
  }

  /* ---------- ¿esta operación estaba dentro del plan? (la misma lógica que la pantalla) ---------- */
  function checkTrade(t, plan, dayTrades, tz) {
    const p = plan || {}, day = (dayTrades || []).slice().sort((a, b) => Date.parse(a.open_time) - Date.parse(b.open_time)), idx = day.findIndex(x => x.id === t.id);
    const before = day.slice(0, Math.max(0, idx)).reduce((s, x) => s + (+x.r || 0), 0), c = [];
    c.push({ k: "stop", ok: t.sl != null && +t.sl !== 0, bad: "Entraste sin stop" });
    if (t.sl != null && +t.sl !== 0) c.push({ k: "stopmov", ok: !t.sl_moved, bad: "Moviste el stop en contra" });
    if (t.risk_pct != null && p.riskPct) c.push({ k: "riesgo", ok: +t.risk_pct <= p.riskPct * 1.15, bad: "Arriesgaste " + nf(+t.risk_pct, 2) + " %, más que tu " + nf(p.riskPct, 2) + " %" });
    const s = minOf(p.start), e = minOf(p.end);
    if (s != null && e != null && t.open_time) c.push({ k: "horario", ok: inSession(parts(Date.parse(t.open_time), tz).min, s, e), bad: "Fuera de tu horario (" + p.start + "–" + p.end + ")" });
    if (idx >= 0 && p.maxTrades) c.push({ k: "maxops", ok: idx < p.maxTrades, bad: "Operación número " + (idx + 1) + ": tu máximo es " + p.maxTrades });
    if (idx > 0 && p.dayLimitR) c.push({ k: "limite", ok: before > -p.dayLimitR, bad: "Ya habías llegado a tu límite del día" });
    const fail = c.filter(x => !x.ok);
    return { good: fail.length === 0, fail: fail.map(f => ({ k: f.k, bad: f.bad })), total: c.length };
  }

  /* ---------- el guardián: qué avisos tocan ahora (ordenados de más a menos importante) ---------- */
  function guardian(ctx) {
    const cfg = Object.assign({}, DEF, (ctx && ctx.cfg) || {}), plan = (ctx && ctx.plan) || {}, now = (ctx && ctx.now) || Date.now(), tz = ctx && ctx.tz;
    if (cfg.on === false) return [];
    const P = parts(now, tz), today = P.day, A = [], add = a => A.push(a), acc = ctx.acctName ? " · " + ctx.acctName : "";
    const T = ((ctx && ctx.trades) || []).filter(t => t && t.open_time).map(t => Object.assign({}, t, { ot: Date.parse(t.open_time), ct: t.close_time ? Date.parse(t.close_time) : null }))
      .filter(t => isFinite(t.ot) && parts(t.ot, tz).day === today).sort((a, b) => a.ot - b.ot);
    const closed = T.filter(t => t.status === "closed" && t.ct).sort((a, b) => a.ct - b.ct), open = T.filter(t => t.status !== "closed");
    const recent = t => now - t.ot <= 30 * 60e3 && t.ot <= now + 60e3;
    const max = +plan.maxTrades || 0, n = T.length, s = minOf(plan.start), e = minOf(plan.end);

    /* operaciones del día */
    if (cfg.maxops && max) {
      if (n > max) add({ rule: "maxops", key: `maxops:over:${today}:${n}`, prio: 92, level: "stop", action: "end", title: "Te has pasado de tu máximo", msg: `Llevas ${n} operaciones hoy y tu máximo es ${max}. Cierra el día: lo que venga ya no es tu plan.` });
      else if (n === max) add({ rule: "maxops", key: `maxops:max:${today}`, prio: 90, level: "stop", action: "end", title: "Has llegado a tu máximo", msg: `Has hecho tus ${max} operaciones de hoy. Por hoy se acabó: así lo decidiste tú, en frío.` });
      else if (n === max - 1 && max > 1) add({ rule: "maxops", key: `maxops:pen:${today}`, prio: 45, level: "warn", action: "none", title: "Te queda una operación", msg: `Llevas ${n} de ${max}. Que la última sea solo si está clarísima en tu plan.` });
    }
    /* límite de pérdida del día (con lo ya cerrado) */
    const sumR = closed.reduce((a, t) => a + (+t.r || 0), 0), used = Math.max(0, -sumR), lim = +plan.dayLimitR || 0;
    if (cfg.loss && lim > 0 && used > 0) {
      const pct = used / lim * 100, money = ctx.oneR ? ` (${nf(used * ctx.oneR, 0)} ${ctx.cur || "€"} de ${nf(lim * ctx.oneR, 0)} ${ctx.cur || "€"})` : "";
      if (pct >= 100 - 1e-9) add({ rule: "loss", key: `loss:100:${today}`, prio: 100, level: "stop", action: "end", title: "Has llegado a tu límite del día", msg: `Has perdido ${fR(used)} hoy y tu límite es ${fR(lim)}${money}. Fin de sesión: cierra la plataforma y escribe tu cierre.` });
      else {
        const steps = (cfg.lossSteps || []).map(Number).filter(x => x > 0 && x < 100).sort((a, b) => b - a), st = steps.find(x => pct >= x);
        if (st != null) add({ rule: "loss", key: `loss:${st}:${today}`, prio: st >= 80 ? 70 : 40, level: "warn", action: "none", title: `Llevas el ${Math.floor(pct)} % de tu límite del día`, msg: `Has perdido ${fR(used)} de ${fR(lim)}${money}. Te quedan ${fR(lim - used)}: baja el ritmo y opera solo lo más claro.` });
      }
    }
    /* fuera de horario */
    if (cfg.horario && s != null && e != null) T.filter(recent).forEach(t => { const m = parts(t.ot, tz).min; if (!inSession(m, s, e)) add({ rule: "horario", key: `horario:${t.id}`, tradeId: t.id, prio: 60, level: "warn", action: "none", title: "Fuera de tu horario", msg: `Has abierto ${t.symbol} a las ${hhmm(m)}, fuera de tu horario (${plan.start}–${plan.end}). Tu norma: fuera de horario, gráfico cerrado.` }); });
    /* stop */
    if (cfg.stop) open.forEach(t => {
      if (t.sl == null || +t.sl === 0) add({ rule: "stop", key: `stop:none:${t.id}`, tradeId: t.id, prio: 82, level: "stop", action: "none", title: "Operación sin stop", msg: `Has entrado en ${t.symbol} sin stop. Ponlo ahora: tu norma es entrar siempre con stop.` });
      else if (t.sl_moved) add({ rule: "stop", key: `stop:moved:${t.id}`, tradeId: t.id, prio: 78, level: "warn", action: "none", title: "Has movido el stop en contra", msg: `En ${t.symbol} has alejado el stop. Tu norma: el stop se queda donde lo pusiste al entrar.` });
    });
    /* revancha y lotaje después de perder */
    T.filter(recent).forEach(t => {
      const prev = closed.filter(x => x.id !== t.id && x.ct <= t.ot).slice(-1)[0]; if (!prev || !isLoss(prev)) return;
      const gap = (t.ot - prev.ct) / 60e3;
      if (cfg.revenge && gap < (+cfg.revengeMin || 10)) add({ rule: "revenge", key: `revenge:${t.id}`, tradeId: t.id, prio: 66, level: "warn", action: "pause", pauseMin: +cfg.streakMin || 10, title: "Entrada justo después de perder", msg: `Has entrado en ${t.symbol} ${Math.max(0, Math.round(gap))} min después de una pérdida. Antes de seguir: ¿está en tu plan o es para recuperar?` });
      const v1 = vol(t), v0 = vol(prev);
      if (cfg.lotUp && v1 != null && v0 != null && v1 > v0 * 1.0001) add({ rule: "lotUp", key: `lot:${t.id}`, tradeId: t.id, prio: 64, level: "warn", action: "none", title: "Más lotaje justo después de perder", msg: `Has pasado de ${nf(v0, 2)} a ${nf(v1, 2)} lotes tras una pérdida. Tu riesgo es ${nf(+plan.riskPct || 0.5, 2)} % por operación, gane o pierda la anterior.` });
    });
    /* pérdidas seguidas: la regla del propio trader */
    if (cfg.streak) {
      const sr = streakRule(plan), N = (sr && sr.n) || +cfg.streakN || 2, pm = (sr && sr.min) || +cfg.streakMin || 15;
      const lastN = closed.slice(-N);
      if (lastN.length === N && lastN.every(isLoss)) {
        const last = lastN[N - 1], until = last.ct + pm * 60e3, after = T.filter(t => t.ot > last.ct);
        const ruleTxt = sr ? `Tu regla: «Si ${sr.txt}».` : `Has perdido ${N} seguidas.`;
        if (after.length && after[0].ot < until) add({ rule: "streak", key: `streak:broke:${after[0].id}`, tradeId: after[0].id, prio: 88, level: "stop", action: "pause", until, title: "Has vuelto a entrar en tu pausa", msg: `${ruleTxt} Has abierto ${after[0].symbol} antes de que acabara.` });
        else if (!after.length && now < until) add({ rule: "streak", key: `streak:${last.id}`, tradeId: last.id, prio: 86, level: "stop", action: "pause", until, title: `${N} pérdidas seguidas`, msg: `${ruleTxt} Levántate de la pantalla: la cuenta atrás es tuya.` });
      }
    }
    /* noticia fuerte de tus mercados */
    if (cfg.news && (ctx.news || []).length) {
      const curs = new Set(); (ctx.syms || []).concat(T.map(t => t.symbol)).forEach(sy => curOf(sy).forEach(c => curs.add(c)));
      const live = open.length > 0 || inSession(P.min, s, e);
      if (live) (ctx.news || []).forEach(ev => {
        const dt = (ev.ts - now) / 60e3; if (!(ev.impact === "High" || ev.impact === 3) || dt <= 0 || dt > (+cfg.newsMin || 5) || !curs.has(ev.cur)) return;
        add({ rule: "news", key: `news:${ev.ts}:${ev.cur}`, prio: 58, level: "warn", action: "none", title: `Noticia fuerte en ${Math.ceil(dt)} min`, msg: `${ev.title} (${ev.cur}) a las ${hhmm(parts(ev.ts, tz).min)}. Si no tienes una operación ya pensada para esto, espera a que pase.` });
      });
    }
    /* cuenta de fondeo: distancia a los límites de la empresa */
    const L = cfg.fondeo ? acctLimitsR(ctx.acct, plan.riskPct) : null;
    if (L) {
      const w = (+cfg.fondeoWarn || 35) / 100, nm = (ctx.acct && ctx.acct.name) || "tu cuenta";
      if (L.day) { const left = L.day - used; if (left <= 0) add({ rule: "fondeo", key: `fondeo:day0:${today}`, prio: 99, level: "stop", action: "end", title: "Has tocado la pérdida diaria de la empresa", msg: `En ${nm} has llegado a la pérdida máxima diaria (${fR(L.day)}). Cierra todo: un paso más puede costarte la cuenta.` }); else if (left / L.day <= w) add({ rule: "fondeo", key: `fondeo:day:${today}`, prio: 72, level: "warn", action: "none", title: "Cerca de la pérdida diaria de la empresa", msg: `En ${nm} te quedan ${fR(left)} para la pérdida máxima diaria (${fR(L.day)}).` }); }
      if (L.max && ctx.totalR != null) { const left = L.max + Math.min(0, +ctx.totalR); if (left <= 0) add({ rule: "fondeo", key: `fondeo:max0`, prio: 98, level: "stop", action: "end", title: "Has tocado la pérdida máxima de la empresa", msg: `En ${nm} has llegado a la pérdida máxima total (${fR(L.max)}).` }); else if (left / L.max <= w) add({ rule: "fondeo", key: `fondeo:max:${today}`, prio: 74, level: "warn", action: "none", title: "Cerca de la pérdida máxima de la empresa", msg: `En ${nm} te quedan ${fR(left)} para la pérdida máxima total (${fR(L.max)}).` }); }
    }
    A.forEach(a => { if (acc && !a.msg.includes(acc)) a.title += acc; });
    return A.sort((a, b) => b.prio - a.prio);
  }

  /* ---------- un solo aviso a la vez, sin repetirse ---------- */
  // seen: { [key]: { at, ack } }, fam: { [rule]: último aviso en ms }
  function pick(alerts, seen, fam, now, cfg) {
    const sp = ((cfg && +cfg.spamMin) || DEF.spamMin) * 60e3; seen = seen || {}; fam = fam || {};
    for (const a of alerts || []) {
      const s = seen[a.key]; if (s && s.ack) continue;
      if (s && s.at) return a; // ya se está enseñando: sigue hasta que lo cierres
      if (a.level !== "stop" && fam[a.rule] && now - fam[a.rule] < sp) continue;
      return a;
    }
    return null;
  }

  /* ---------- el asistente nunca recomienda qué comprar o vender ---------- */
  const MKT = "(eur|usd|gbp|jpy|chf|aud|cad|nzd|eurusd|gbpusd|usdjpy|xauusd|oro|gold|plata|petr[oó]leo|nasdaq|nas100|us100|us30|dow|sp500|s&p|us500|dax|ger40|ibex|bitcoin|btc|ethereum|eth|cripto|el mercado|el precio|el par|este par|esta acci[oó]n|acciones?|divisas?)";
  const ADV = [
    /\b(compro|vendo|comprar[ií]as?|vender[ií]as?|compra|vende|entro|entrar[ií]as?|abro|cierro|salgo|me pongo (largo|corto)|voy (largo|corto))\b[^?.!]{0,40}\b(ahora|ya|hoy|ma[nñ]ana|esta semana|en este momento)\b/i,
    new RegExp("\\b(compro|vendo|compra|vende|comprar|vender|invierto|invertir|entro|entrar|largo|corto|long|short)\\b[^?.!]{0,25}\\b" + MKT + "\\b", "i"),
    /\b(deber[ií]a|debo|me conviene|merece la pena|es (buen|mal) momento para)\s+(comprar|vender|entrar|salir|invertir|cerrar|abrir)\b/i,
    new RegExp("\\b(va a|vaya a|crees que|piensas que)\\s+(subir|bajar|caer|romper|rebotar)|\\b(subir[aá]|bajar[aá]|caer[aá])(?![a-záéíóúñ])|hacia d[oó]nde va|qu[eé] (opinas|piensas|me dices) (de|del|sobre) " + MKT, "i"),
    /\b(se[nñ]al(es)?|predicci[oó]n|pron[oó]stico|previsi[oó]n de precio|precio objetivo|niveles? (de|para) (entrada|compra|venta|soporte|resistencia))\b/i,
    /\b(d[oó]nde|a qu[eé] precio)\s+(pongo|meto|coloco|entro|compro|vendo)\b/i,
    /\b(recomi[eé]nda(me|s)?|recomiendas|me recomiendas)\b[^?.!]{0,30}\b(par|activo|mercado|acci[oó]n|cripto|invertir|operar|comprar|vender)\b/i,
    /\b(en qu[eé]|qu[eé] (par|activo|mercado))\s+(invierto|opero|meto|entro)\b/i
  ];
  const ADVICE_REPLY = "Eso no te lo puedo decir: Tickora no da recomendaciones de inversión, ni señales, niveles u opiniones sobre el mercado. Lo que sí puedo hacer es ayudarte con tu plan y tu forma de operar: por ejemplo, «¿cómo voy esta semana?», «¿a qué hora opero mejor?» o «¿qué norma rompo más?».";
  /* preguntas sobre tu forma de operar («¿por qué entro tarde en el mercado?») no son pedir consejo de inversión */
  const SELF = /\b(por qu[eé]|c[oó]mo (voy|me va|lo hago|hago|mejoro|evito|dejo)|cu[aá]nt[oa]s?|cu[aá]ndo (suelo|pierdo|gano|entro|fallo)|qu[eé] (norma|regla|hora|d[ií]a|emoci[oó]n|error)|mi plan|mis (normas|reglas|operaciones|resultados|errores)|suelo|me cuesta|me va (mejor|peor)|me sale|hice|hago mal)(?![a-záéíóúñ])/i;
  const HARD = [ADV[2], ADV[3], ADV[4], ADV[5]], SOFT = [ADV[0], ADV[1], ADV[6], ADV[7]];
  const isAdvice = q => { const s = String(q || ""); if (HARD.some(re => re.test(s))) return true; return SOFT.some(re => re.test(s)) && !SELF.test(s); };
  const OUT_BAD = /\b(te recomiendo (comprar|vender|entrar)|deber[ií]as (comprar|vender|entrar)|compra ahora|vende ahora|el precio (subir[aá]|bajar[aá]|va a subir|va a bajar)|ponte (largo|corto))\b/i;
  const safeOut = text => OUT_BAD.test(String(text || "")) ? ADVICE_REPLY : text;

  G.TkRules = { DEF, parts, minOf, inSession, curOf, streakRule, acctLimitsR, checkTrade, guardian, pick, isAdvice, safeOut, ADVICE_REPLY, nf };
})(typeof globalThis !== "undefined" ? globalThis : this);
