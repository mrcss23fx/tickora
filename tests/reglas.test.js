// Tests del motor de reglas de Tickora. Se ejecutan con: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
require("../reglas.js");
const R = globalThis.TkRules;

const TZ = "Europe/Madrid";
// 19-nov-2026 a las 16:00 en Madrid = 15:00 UTC
const T0 = Date.parse("2026-11-19T15:00:00Z");
const PLAN = { riskPct: 0.5, maxTrades: 3, dayLimitR: 2, start: "15:30", end: "17:30", rules: [{ si: "pierdo dos seguidas,", entonces: "me levanto 15 minutos." }] };
const at = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return new Date(Date.UTC(2026, 10, 19, h - 1, m)).toISOString(); }; // hora de Madrid → UTC
let seq = 0;
const tr = (o) => Object.assign({ id: "t" + (++seq), symbol: "EURUSD", side: "buy", volume: 0.5, sl: 1.09, sl_moved: false, status: "closed", r: 1 }, o);
const now = (hhmm) => Date.parse(at(hhmm));
const rules = (a) => a.map(x => x.key.split(":").slice(0, 2).join(":"));

test("las horas se leen en la zona del trader", () => {
  assert.equal(R.parts(T0, TZ).min, 16 * 60);
  assert.equal(R.parts(T0, TZ).day, "2026-11-19");
  assert.equal(R.parts(Date.parse("2026-11-19T23:30:00Z"), TZ).day, "2026-11-20");
});

test("horario que cruza la medianoche", () => {
  assert.equal(R.inSession(23 * 60, 22 * 60, 2 * 60), true);
  assert.equal(R.inSession(1 * 60, 22 * 60, 2 * 60), true);
  assert.equal(R.inSession(12 * 60, 22 * 60, 2 * 60), false);
});

test("la regla de pérdidas seguidas se lee de lo que escribió el trader", () => {
  assert.deepEqual(R.streakRule(PLAN).n, 2);
  assert.deepEqual(R.streakRule(PLAN).min, 15);
  assert.equal(R.streakRule({ rules: [{ si: "pierdo 3 operaciones seguidas", entonces: "cierro el día" }] }).min, 24 * 60);
  assert.equal(R.streakRule({ rules: [{ si: "me aburro", entonces: "salgo a andar" }] }), null);
});

test("operaciones del día: aviso en la penúltima, fin al llegar y al pasarse", () => {
  const a2 = R.guardian({ plan: PLAN, tz: TZ, now: now("16:30"), trades: [tr({ open_time: at("15:40"), close_time: at("15:50") }), tr({ open_time: at("16:00"), close_time: at("16:10") })] });
  assert.ok(rules(a2).includes("maxops:pen"));
  const a3 = R.guardian({ plan: PLAN, tz: TZ, now: now("16:30"), trades: [1, 2, 3].map(i => tr({ open_time: at("15:4" + i), close_time: at("15:5" + i) })) });
  assert.equal(a3[0].key.startsWith("maxops:max"), true); assert.equal(a3[0].action, "end");
  const a4 = R.guardian({ plan: PLAN, tz: TZ, now: now("16:30"), trades: [1, 2, 3, 4].map(i => tr({ open_time: at("15:4" + i), close_time: at("15:5" + i) })) });
  assert.ok(rules(a4).includes("maxops:over"));
  const a1 = R.guardian({ plan: PLAN, tz: TZ, now: now("16:30"), trades: [tr({ open_time: at("15:40"), close_time: at("15:50") })] });
  assert.equal(a1.filter(a => a.rule === "maxops").length, 0);
});

test("límite de pérdida: 50 %, 80 % y fin de sesión al 100 %", () => {
  const P = Object.assign({}, PLAN, { maxTrades: 10 });
  const run = (rs) => R.guardian({ plan: P, tz: TZ, now: now("17:20"), trades: rs.map((r, i) => tr({ r, open_time: at("15:3" + i), close_time: at("15:3" + i) })), cfg: { streak: false } }).filter(a => a.rule === "loss");
  assert.equal(run([-0.9]).length, 0);                                // 45 %
  assert.equal(run([-1]).map(a => a.key.split(":")[1])[0], "50");    // justo 50 %
  assert.equal(run([-1, -0.6]).map(a => a.key.split(":")[1])[0], "80"); // 80 %
  const end = run([-1, -1]);                                           // 100 %
  assert.equal(end[0].key.split(":")[1], "100"); assert.equal(end[0].action, "end"); assert.equal(end[0].level, "stop");
  assert.equal(run([-1, 2]).length, 0);                               // ganó después: no hay pérdida neta
  const custom = R.guardian({ plan: P, tz: TZ, now: now("17:20"), trades: [tr({ r: -0.7, open_time: at("15:30"), close_time: at("15:35") })], cfg: { lossSteps: [30] } }).filter(a => a.rule === "loss");
  assert.equal(custom[0].key.split(":")[1], "30");
});

test("fuera de horario: solo operaciones recientes y fuera de la franja", () => {
  const a = R.guardian({ plan: PLAN, tz: TZ, now: now("18:20"), trades: [tr({ status: "open", open_time: at("18:10") })] });
  assert.ok(a.some(x => x.rule === "horario" && /18:10/.test(x.msg)));
  const b = R.guardian({ plan: PLAN, tz: TZ, now: now("17:00"), trades: [tr({ status: "open", open_time: at("16:50") })] });
  assert.equal(b.filter(x => x.rule === "horario").length, 0);
  const borde = R.guardian({ plan: PLAN, tz: TZ, now: now("17:31"), trades: [tr({ status: "open", open_time: at("17:30") })] });
  assert.equal(borde.filter(x => x.rule === "horario").length, 0);   // las 17:30 todavía es tu horario
});

test("stop: sin stop es aviso fuerte; stop movido, aviso", () => {
  const a = R.guardian({ plan: PLAN, tz: TZ, now: now("16:00"), trades: [tr({ status: "open", sl: null, open_time: at("15:55") })] });
  assert.equal(a[0].rule, "stop"); assert.equal(a[0].level, "stop");
  const z = R.guardian({ plan: PLAN, tz: TZ, now: now("16:00"), trades: [tr({ status: "open", sl: 0, open_time: at("15:55") })] });
  assert.ok(z.some(x => x.key.startsWith("stop:none")));
  const m = R.guardian({ plan: PLAN, tz: TZ, now: now("16:00"), trades: [tr({ status: "open", sl_moved: true, open_time: at("15:55") })] });
  assert.ok(m.some(x => x.key.startsWith("stop:moved")));
  const c = R.guardian({ plan: PLAN, tz: TZ, now: now("16:00"), trades: [tr({ status: "closed", sl: null, open_time: at("15:35"), close_time: at("15:40") })] });
  assert.equal(c.filter(x => x.rule === "stop").length, 0);            // cerrada: eso lo apunta el analista
});

test("revancha y lotaje después de una pérdida", () => {
  const T = [tr({ r: -1, volume: 0.5, open_time: at("15:35"), close_time: at("15:50") }), tr({ status: "open", volume: 1, open_time: at("15:53") })];
  const a = R.guardian({ plan: PLAN, tz: TZ, now: now("15:55"), trades: T, cfg: { streak: false } });
  assert.ok(a.some(x => x.rule === "revenge" && /3 min/.test(x.msg)));
  assert.ok(a.some(x => x.rule === "lotUp" && /0,5 a 1 lotes/.test(x.msg)));
  const T2 = [tr({ r: -1, volume: 0.5, open_time: at("15:35"), close_time: at("15:50") }), tr({ status: "open", volume: 0.5, open_time: at("16:05") })];
  const b = R.guardian({ plan: PLAN, tz: TZ, now: now("16:06"), trades: T2 });
  assert.equal(b.filter(x => x.rule === "revenge" || x.rule === "lotUp").length, 0); // 15 min después y mismo lotaje
  const T3 = [tr({ r: 1, volume: 0.5, open_time: at("15:35"), close_time: at("15:50") }), tr({ status: "open", volume: 1, open_time: at("15:52") })];
  assert.equal(R.guardian({ plan: PLAN, tz: TZ, now: now("15:53"), trades: T3 }).filter(x => x.rule === "revenge" || x.rule === "lotUp").length, 0); // tras ganar, no
  const c = R.guardian({ plan: PLAN, tz: TZ, now: now("15:55"), trades: T, cfg: { revengeMin: 2, lotUp: false, streak: false } });
  assert.equal(c.filter(x => x.rule === "revenge" || x.rule === "lotUp").length, 0); // umbrales del usuario
});

test("pérdidas seguidas: pausa con cuenta atrás y aviso si vuelves a entrar", () => {
  const L = [tr({ r: -1, open_time: at("15:35"), close_time: at("15:45") }), tr({ r: -1, open_time: at("15:50"), close_time: at("16:00") })];
  const a = R.guardian({ plan: PLAN, tz: TZ, now: now("16:05"), trades: L });
  const s = a.find(x => x.rule === "streak"); assert.ok(s); assert.equal(s.action, "pause"); assert.equal(s.until, Date.parse(at("16:15")));
  assert.match(s.msg, /me levanto 15 minutos/);
  assert.equal(R.guardian({ plan: PLAN, tz: TZ, now: now("16:16"), trades: L }).filter(x => x.rule === "streak").length, 0); // la pausa ya pasó
  const b = R.guardian({ plan: Object.assign({}, PLAN, { maxTrades: 5 }), tz: TZ, now: now("16:08"), trades: L.concat(tr({ status: "open", open_time: at("16:07") })) });
  assert.ok(b.some(x => x.key.startsWith("streak:broke")));
  const one = R.guardian({ plan: PLAN, tz: TZ, now: now("16:05"), trades: [tr({ r: 1, open_time: at("15:35"), close_time: at("15:45") }), tr({ r: -1, open_time: at("15:50"), close_time: at("16:00") })] });
  assert.equal(one.filter(x => x.rule === "streak").length, 0);
});

test("noticia fuerte de tus mercados en los próximos minutos", () => {
  const news = [{ ts: now("16:04"), cur: "USD", impact: "High", title: "Ventas minoristas" }, { ts: now("16:03"), cur: "JPY", impact: "High", title: "IPC" }, { ts: now("16:02"), cur: "USD", impact: "Medium", title: "Otra" }];
  const a = R.guardian({ plan: PLAN, tz: TZ, now: now("16:00"), trades: [], syms: ["EURUSD"], news });
  assert.equal(a.filter(x => x.rule === "news").length, 1); assert.match(a[0].msg, /Ventas minoristas/);
  assert.equal(R.guardian({ plan: PLAN, tz: TZ, now: now("15:55"), trades: [], syms: ["EURUSD"], news }).filter(x => x.rule === "news").length, 0); // faltan 9 min
  assert.equal(R.guardian({ plan: PLAN, tz: TZ, now: now("16:00"), trades: [], syms: ["XAUUSD"], news: [{ ts: now("16:04"), cur: "EUR", impact: "High", title: "x" }] }).filter(x => x.rule === "news").length, 0);
  assert.equal(R.guardian({ plan: PLAN, tz: TZ, now: now("12:00"), trades: [], syms: ["EURUSD"], news: [{ ts: now("12:03"), cur: "USD", impact: "High", title: "x" }] }).filter(x => x.rule === "news").length, 0); // fuera de tu sesión y sin operaciones abiertas
});

test("cuenta de fondeo: distancia a la pérdida diaria y total", () => {
  const acct = { name: "FTMO 100k", dailyDD: 5, dailyU: "%", maxDD: 10, maxU: "%" }; // 5 % = 10 R con 0,5 % de riesgo
  const P = Object.assign({}, PLAN, { dayLimitR: 20, maxTrades: 20 });
  const loss = (n) => Array.from({ length: n }, (_, i) => tr({ r: -1, open_time: at("15:3" + (i % 10)), close_time: at("15:3" + (i % 10)) }));
  const a = R.guardian({ plan: P, tz: TZ, now: now("17:00"), trades: loss(7), acct, totalR: -7, cfg: { streak: false } });
  assert.ok(a.some(x => x.key.startsWith("fondeo:day:")));
  const b = R.guardian({ plan: P, tz: TZ, now: now("17:00"), trades: loss(10), acct, totalR: -10, cfg: { streak: false } });
  assert.equal(b[0].key.startsWith("fondeo:day0"), true); assert.equal(b[0].action, "end");
  const c = R.guardian({ plan: P, tz: TZ, now: now("17:00"), trades: loss(1), acct, totalR: -17, cfg: { streak: false } });
  assert.ok(c.some(x => x.key.startsWith("fondeo:max:")));
  assert.deepEqual(R.acctLimitsR({ dailyDD: 2, dailyU: "R" }, 0.5), { day: 2, max: null });
});

test("un solo aviso a la vez, por prioridad y sin repetirse", () => {
  const al = [{ key: "a", rule: "loss", prio: 100, level: "stop" }, { key: "b", rule: "revenge", prio: 66, level: "warn" }, { key: "c", rule: "revenge", prio: 60, level: "warn" }];
  assert.equal(R.pick(al, {}, {}, T0).key, "a");
  assert.equal(R.pick(al, { a: { ack: T0 } }, {}, T0).key, "b");
  assert.equal(R.pick(al, { a: { ack: T0 }, b: { ack: T0 } }, { revenge: T0 - 5 * 60e3 }, T0), null); // misma regla hace 5 min: no se repite
  assert.equal(R.pick(al, { a: { ack: T0 }, b: { ack: T0 } }, { revenge: T0 - 20 * 60e3 }, T0).key, "c");
  assert.equal(R.pick([{ key: "s", rule: "stop", prio: 80, level: "stop" }], {}, { stop: T0 - 60e3 }, T0).key, "s"); // los fuertes no se callan
  assert.equal(R.pick(al, { b: { at: T0 } }, {}, T0).key, "a");
});

test("el guardián se puede apagar entero o regla a regla", () => {
  const T = [tr({ status: "open", sl: null, open_time: at("18:10") })];
  assert.equal(R.guardian({ plan: PLAN, tz: TZ, now: now("18:12"), trades: T, cfg: { on: false } }).length, 0);
  const a = R.guardian({ plan: PLAN, tz: TZ, now: now("18:12"), trades: T, cfg: { stop: false } });
  assert.ok(a.every(x => x.rule !== "stop")); assert.ok(a.some(x => x.rule === "horario"));
});

test("dentro o fuera del plan (analista), igual que la pantalla", () => {
  const P = Object.assign({}, PLAN);
  const d = [tr({ open_time: at("15:40"), r: -1 }), tr({ open_time: at("15:50"), r: -1.2 }), tr({ open_time: at("16:00"), r: 1, risk_pct: 0.9 }), tr({ open_time: at("18:00"), sl: null })];
  assert.equal(R.checkTrade(d[0], P, d, TZ).good, true);
  const c3 = R.checkTrade(d[2], P, d, TZ); assert.equal(c3.good, false); assert.deepEqual(c3.fail.map(f => f.k).sort(), ["limite", "riesgo"]);
  const c4 = R.checkTrade(d[3], P, d, TZ); assert.deepEqual(c4.fail.map(f => f.k).sort(), ["horario", "maxops", "stop"]);
  assert.equal(R.checkTrade(tr({ open_time: at("16:00"), risk_pct: 0.575 }), P, [], TZ).good, true); // hasta un 15 % por encima vale
});

test("simulación de una sesión completa", () => {
  const P = Object.assign({}, PLAN, { maxTrades: 4 }), seen = {}, fam = {}, shown = [];
  const T = [];
  const step = (hhmm) => { const a = R.guardian({ plan: P, tz: TZ, now: now(hhmm), trades: T, syms: ["EURUSD"], news: [{ ts: now("16:30"), cur: "USD", impact: "High", title: "Peticiones de desempleo" }] }); const p = R.pick(a, seen, fam, now(hhmm), {}); if (p) { shown.push(hhmm + " " + p.key.split(":").slice(0, 2).join(":")); seen[p.key] = { at: now(hhmm), ack: now(hhmm) }; fam[p.rule] = now(hhmm); } return p; };
  T.push(tr({ id: "s1", status: "open", open_time: at("15:35") })); step("15:36");
  Object.assign(T[0], { status: "closed", close_time: at("15:50"), r: -1 }); step("15:51");
  T.push(tr({ id: "s2", status: "open", volume: 1, open_time: at("15:53") })); step("15:53"); step("15:54");
  Object.assign(T[1], { status: "closed", close_time: at("16:05"), r: -1 }); step("16:06");
  step("16:26");
  T.push(tr({ id: "s3", status: "open", open_time: at("16:40") })); step("16:41");
  assert.deepEqual(shown, ["15:51 loss:50", "15:53 revenge:s2", "15:54 lot:s2", "16:06 loss:100", "16:26 news:" + now("16:30"), "16:41 maxops:pen"]);
});

test("el asistente no recomienda qué comprar o vender", () => {
  const trampa = ["¿compro EURUSD ahora?", "¿Vendo el oro hoy?", "¿Debería comprar bitcoin?", "¿El oro va a subir?", "¿Hacia dónde va el nasdaq?", "dame una señal para mañana", "¿Dónde pongo el stop en el euro?", "¿Me recomiendas algún par para operar?", "¿En qué par entro?", "¿Qué opinas del euro?", "¿Es buen momento para comprar?", "¿Subirá el dax?", "dime niveles de entrada", "¿Me pongo largo ya?", "¿Abro un short en el nasdaq?", "pronóstico del eurusd"];
  trampa.forEach(q => assert.equal(R.isAdvice(q), true, q));
  const buenas = ["¿Por qué me cuesta respetar mi riesgo?", "¿Cómo voy esta semana?", "¿A qué hora opero mejor?", "¿Me va mejor en compras o ventas?", "¿Qué norma rompo más?", "¿Por qué entro tarde en el mercado?", "¿Cuántas veces entro en EURUSD fuera de horario?", "¿Qué día de la semana me va peor?", "¿Cómo me va después de una pérdida?", "resumen de mis emociones"];
  buenas.forEach(q => assert.equal(R.isAdvice(q), false, q));
  assert.equal(R.safeOut("Te recomiendo comprar ahora"), R.ADVICE_REPLY);
  assert.equal(R.safeOut("Has cumplido tu plan en 8 de 10 operaciones."), "Has cumplido tu plan en 8 de 10 operaciones.");
});
