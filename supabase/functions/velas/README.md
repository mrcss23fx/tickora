// Velas públicas (respaldo cuando MT5 está cerrado). Desplegada en Supabase como función «velas» (v7, 25-nov-2026).
// Fuentes: Dukascopy (divisas, metales, materias primas, índices, acciones, ETF y bonos en CFD; Yahoo de respaldo para los de siempre).
// La cripto la pide el navegador directamente a Binance. Uso en pruebas: sustituir por un proveedor con licencia antes de cobrar.
//
// Peticiones:
//   {sym, tf, to?, last?}  → velas de un mercado ({bars:[[t,o,h,l,c,v]…], more, digits, src})
//   {catalog: 1}           → catálogo del buscador ({list:[[símbolo, categoría, subgrupo, país, nombre, decimales]…]}, ~1.570 mercados)
//   {quotes: [símbolos]}   → precio y cambio del día de hasta 40 mercados en una sola llamada ({q:{SYM:{last, chg, t, digits}}})
//
// mercados.ts (compartido con «alertas»): de qué código de Dukascopy sale cada nombre de Tickora (AAPL.US → AAPL.US/USD, NAS100 → USATECH.IDX/USD…).
