//+------------------------------------------------------------------+
//| Tickora.mq5                                                      |
//| Envía tus operaciones de MetaTrader 5 a tu Tickora:             |
//| se apuntan solas, con la captura del gráfico al entrar y salir.  |
//|                                                                  |
//| Cómo se usa:                                                     |
//| 1. MT5: Herramientas → Opciones → Asesores expertos → marca       |
//|    «Permitir WebRequest para las URL de la lista» y añade:        |
//|    https://xsvezicjksfrklwjskfv.supabase.co                      |
//| 2. Arrastra este programa a cualquier gráfico y activa           |
//|    «Trading algorítmico» (botón de arriba).                      |
//| 3. En el gráfico sale un código de 6 cifras: escríbelo en la app |
//|    (Mi plan → Conectar MT5). Queda vinculado para siempre.       |
//| Mantén abierto un gráfico de cada mercado que operes: de ahí     |
//| sale la captura. El programa NUNCA abre operaciones.             |
//| Candado (2.0): si lo activas en Tickora (Ajustes), cuando se     |
//| cumple una de tus normas el programa te avisa, cierra al momento |
//| las operaciones nuevas o cierra MetaTrader, según elijas.        |
//| Para cerrar operaciones necesita «Trading algorítmico» activado. |
//+------------------------------------------------------------------+
#property copyright   "Tickora"
#property version     "2.00"
#property description "Apunta solas tus operaciones en Tickora, con la captura del gráfico al entrar y al salir. Nunca abre operaciones. Con el candado activado en Tickora puede avisarte, cerrar las operaciones nuevas o cerrar MetaTrader cuando se cumple una de tus normas."
#include <Trade\Trade.mqh>

input string Clave           = "";    // Clave (opcional: si la dejas vacía, te enseña un código para vincular)
input bool   GuardarCapturas = true;  // Guardar la captura del gráfico
input int    AnchoCaptura    = 1000;  // Ancho de la captura (píxeles)
input int    AltoCaptura     = 560;   // Alto de la captura (píxeles)
input bool   RehacerFoto     = true;  // Si no hubo foto en el momento, rehacerla con el historial

#define BT_URL      "https://xsvezicjksfrklwjskfv.supabase.co"
#define BT_RPC      "/rest/v1/rpc/bridge_ingest"
#define BT_APIKEY   "sb_publishable_qLIhdI4CuQuisOstwl0fWg_dhW61xcm"
#define BT_VERSION  "2.0"
#define BT_LOCKFILE "tickora_candado.txt"
#define BT_KEYFILE  "bitacora_clave.txt"
#define BT_STATE    "bitacora_estado.csv"
#define BT_CAPFILE  "bitacora_captura.png"

//--- lo que sabemos de cada posición
struct PosState
  {
   ulong             id;
   double            sl0;        // stop con el que entraste
   bool              slMoved;    // moviste el stop en contra
   bool              openSent;
   bool              closedSent;
  };
PosState g_pos[];

//--- envíos pendientes (se reintentan si falla la conexión)
struct Job
  {
   ulong             id;
   int               kind;       // 0 = entrada, 1 = salida
   datetime          due;        // hora local a la que enviarlo
   int               tries;
   string            capture;    // captura en base64
  };
Job g_jobs[];

datetime g_lastOk   = 0;
datetime g_lastPing = 0;
datetime g_lastScan = 0;
string   g_key      = "";                       // clave en uso (de los parámetros o vinculada con código)
string   g_secret   = "";                       // secreto mientras se vincula
string   g_code     = "";                       // código de 6 cifras que se enseña en el gráfico
datetime g_codeAt   = 0;
string   g_status   = "Conectando…";
bool     g_urlAlert = false;
//--- precios en vivo para el gráfico de la app
string   g_wSym     = "";                       // mercado que estás mirando en la app
string   g_wTf      = "";
datetime g_wUntil   = 0;                        // hasta cuándo seguimos enviando (se renueva mientras miras)
string   g_lastReq  = "";                       // último historial servido
ulong    g_lastSync = 0;
datetime g_lastPair = 0;
//--- candado
string   g_lock      = "";                      // configuración que manda la app (texto con «|»)
bool     g_lockOn    = false;
long     g_lockSince = 0;                       // desde cuándo (ms, hora universal) está cerrado
string   g_lockWhy   = "";
string   g_lockCode  = "";
string   g_lockEv[];                            // lo que ha hecho, pendiente de enviar
ulong    g_lockDone[];                          // operaciones y órdenes ya atendidas
datetime g_lockShown = 0;                       // cuándo enseñamos el aviso de «no dejar usar MT5»
CTrade   g_trade;

//+------------------------------------------------------------------+
int OnInit()
  {
   LoadState();
   LoadLock();
   g_key = StringLen(Clave) >= 10 ? Clave : LoadKey();
   EventSetMillisecondTimer(1000);
   if(g_key == "")
      StartPairing();                              // sin clave: enseñamos un código para vincular con la app
   else
     {
      CatchUp();
      SendPing();
     }
   ShowStatus();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   SaveState();
   ObjectDelete(0, "bt_code1");
   ObjectDelete(0, "bt_code2");
   LockPaint(false);
   Comment("");
  }

//+------------------------------------------------------------------+
//| Cada operación que entra o sale                                  |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   if(g_key == "")
      return;                                      // aún sin vincular: se recogerá al vincular (últimos 7 días)
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD || trans.type == TRADE_TRANSACTION_ORDER_ADD)
      CheckLock();                                 // el candado reacciona en el momento
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
     {
      if(!HistoryDealSelect(trans.deal))
         return;
      long dtype = HistoryDealGetInteger(trans.deal, DEAL_TYPE);
      if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL)
         return;                                   // depósitos, comisiones sueltas…
      long  entry = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
      ulong pos   = (ulong)HistoryDealGetInteger(trans.deal, DEAL_POSITION_ID);
      string sym  = HistoryDealGetString(trans.deal, DEAL_SYMBOL);
      if(entry == DEAL_ENTRY_IN)
        {
         int k = FindOrAddPos(pos);
         if(g_pos[k].openSent)
            return;                                // aumento de una posición ya enviada
         // esperamos 20 s por si pones el stop justo después de entrar
         AddJob(pos, 0, TimeLocal() + 20, Capture(sym));
        }
      else
         if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY || entry == DEAL_ENTRY_INOUT)
           {
            // MT5 avisa del cierre un instante antes de quitar la posición:
            // apuntamos el envío y comprobamos unos segundos después si se cerró del todo
            FindOrAddPos(pos);
            AddJob(pos, 1, TimeLocal() + 3, Capture(sym));
           }
     }
   else
      if(trans.type == TRADE_TRANSACTION_POSITION)
         WatchStop(trans.position);
  }

//+------------------------------------------------------------------+
//| ¿Has movido el stop en contra?                                   |
//+------------------------------------------------------------------+
void WatchStop(const ulong pos)
  {
   if(!PositionSelectByTicket(pos))
      return;
   int k = FindOrAddPos(pos);
   double sl = PositionGetDouble(POSITION_SL);
   if(!g_pos[k].openSent)
     {
      g_pos[k].sl0 = sl;                           // aún dentro de los primeros 20 s
      return;
     }
   if(g_pos[k].sl0 <= 0)
     {
      if(sl > 0)
         g_pos[k].sl0 = sl;                        // entraste sin stop y lo pusiste después
      return;
     }
   string sym  = PositionGetString(POSITION_SYMBOL);
   double half = SymbolInfoDouble(sym, SYMBOL_POINT) / 2.0;
   long   type = PositionGetInteger(POSITION_TYPE);
   bool against = false;
   if(sl <= 0)
      against = true;                              // quitaste el stop
   else
      if(type == POSITION_TYPE_BUY)
         against = (sl < g_pos[k].sl0 - half);
      else
         against = (sl > g_pos[k].sl0 + half);
   if(against && !g_pos[k].slMoved)
     {
      g_pos[k].slMoved = true;
      SaveState();
     }
  }

//+------------------------------------------------------------------+
void OnTimer()
  {
   datetime now = TimeLocal();
   if(g_key == "")
     {
      if(now - g_lastPair >= 3)
        {
         g_lastPair = now;
         PollPairing();
         ShowStatus();
        }
      return;
     }
   // precios en vivo: cada segundo si estás mirando el gráfico en la app; si no, una pregunta cada 5 s
   ulong ms = GetTickCount64();
   if(ms - g_lastSync >= (g_wUntil > now || ArraySize(g_lockEv) > 0 ? 1000 : 5000))
     {
      g_lastSync = ms;
      Sync();
     }
   CheckLock();
   for(int i = 0; i < ArraySize(g_jobs); i++)
     {
      if(g_jobs[i].due > now)
         continue;
      // un cierre cuya posición aún aparece abierta: esperamos un poco (hasta 3 veces);
      // si sigue abierta es un cierre parcial y se envía como actualización
      if(g_jobs[i].kind == 1 && g_jobs[i].tries < 3 && PositionSelectByTicket(g_jobs[i].id))
        {
         g_jobs[i].tries++;
         g_jobs[i].due = now + 3;
         continue;
        }
      string err = "";
      if(SendJob(g_jobs[i], err))
        {
         RemoveJob(i);
         i--;
        }
      else
        {
         g_jobs[i].tries++;
         g_jobs[i].due = now + 30 * g_jobs[i].tries;
         g_status = "Sin conexión, reintentando: " + err;
         if(g_jobs[i].tries > 20)
           {
            Print("Tickora: no se pudo enviar la posición ", g_jobs[i].id, " (", err, ")");
            RemoveJob(i);
            i--;
           }
        }
     }
   if(now - g_lastPing > 300)
      SendPing();
   if(now - g_lastScan > 600)                     // cada 10 min: ¿algo hecho desde el móvil o con el Mac dormido?
      CatchUp();
   if(now % 5 == 0)
      ShowStatus();
  }

//+------------------------------------------------------------------+
//| Precios en vivo para el gráfico de la app                        |
//+------------------------------------------------------------------+
ENUM_TIMEFRAMES TfOf(const string tf)
  {
   if(tf == "1m") return(PERIOD_M1);
   if(tf == "5m") return(PERIOD_M5);
   if(tf == "15m") return(PERIOD_M15);
   if(tf == "30m") return(PERIOD_M30);
   if(tf == "1h") return(PERIOD_H1);
   if(tf == "4h") return(PERIOD_H4);
   if(tf == "1d") return(PERIOD_D1);
   if(tf == "1w") return(PERIOD_W1);
   return(PERIOD_CURRENT);
  }

string BarsJson(const MqlRates &r[], const int n, const int digits, const long off)
  {
   string out = "";
   for(int i = 0; i < n; i++)
     {
      if(i > 0)
         out += ",";
      out += "[" + IntegerToString(((long)r[i].time - off) * 1000) + "," + DoubleToString(r[i].open, digits) + "," +
             DoubleToString(r[i].high, digits) + "," + DoubleToString(r[i].low, digits) + "," +
             DoubleToString(r[i].close, digits) + "," + IntegerToString(r[i].tick_volume) + "]";
     }
   return(out);
  }

string JsonGet(const string js, const string key)
  {
   int p = StringFind(js, "\"" + key + "\":");
   if(p < 0)
      return("");
   p += StringLen(key) + 3;
   while(p < StringLen(js) && StringGetCharacter(js, p) == ' ')
      p++;                                         // Postgres deja un espacio tras los dos puntos
   if(StringSubstr(js, p, 1) == "\"")
     {
      int q = StringFind(js, "\"", p + 1);
      return(q > p ? StringSubstr(js, p + 1, q - p - 1) : "");
     }
   int e = p;
   while(e < StringLen(js))
     {
      ushort c = StringGetCharacter(js, e);
      if(c == ',' || c == '}')
         break;
      e++;
     }
   return(StringSubstr(js, p, e - p));
  }

void Sync()
  {
   string data = "";
   long   off  = ServerOffset();
   if(g_wUntil > TimeLocal() && g_wSym != "" && SymbolSelect(g_wSym, true))
     {
      ENUM_TIMEFRAMES tf = TfOf(g_wTf);
      int digits = (int)SymbolInfoInteger(g_wSym, SYMBOL_DIGITS);
      MqlRates r[];
      ArraySetAsSeries(r, false);
      int n = CopyRates(g_wSym, tf, 0, 2, r);
      if(n > 0)
         data = "\"live\":{\"sym\":\"" + JsonEsc(g_wSym) + "\",\"tf\":\"" + g_wTf + "\",\"bars\":[" + BarsJson(r, n, digits, off) + "]}";
     }
   int nev = ArraySize(g_lockEv);
   if(nev > 20)
      nev = 20;
   if(nev > 0)
     {
      string ev = "";
      for(int i = 0; i < nev; i++)
         ev += (i > 0 ? "," : "") + g_lockEv[i];
      data += (data != "" ? "," : "") + "\"lockev\":[" + ev + "]";
     }
   string js = "{\"p_key\":\"" + JsonEsc(g_key) + "\",\"p_data\":{" + data + "}}";
   string err = "", resp = "";
   if(!PostTo("/rest/v1/rpc/bridge_sync", js, err, resp))
      return;
   g_lastOk = TimeLocal();
   if(nev > 0)
      ArrayRemove(g_lockEv, 0, nev);               // ya enviados
   string lk = JsonGet(resp, "lock");
   if(lk != "" && lk != g_lock)
     {
      g_lock = lk;
      SaveLock();
     }
   string sym = JsonGet(resp, "sym");
   if(sym == "")
     {
      g_wUntil = 0;                                // nadie mira el gráfico
      return;
     }
   g_wSym = sym;
   g_wTf = JsonGet(resp, "tf");
   g_wUntil = TimeLocal() + 60;
   string req = JsonGet(resp, "req");
   if(req != "" && req != g_lastReq)
      SendHistory(req, StringToInteger(JsonGet(resp, "to")), (int)StringToInteger(JsonGet(resp, "n")));
  }

void SendHistory(const string req, const long toMs, int n)
  {
   if(!SymbolSelect(g_wSym, true))
      return;
   if(n <= 0 || n > 1500)
      n = 1000;
   ENUM_TIMEFRAMES tf = TfOf(g_wTf);
   int digits = (int)SymbolInfoInteger(g_wSym, SYMBOL_DIGITS);
   long off = ServerOffset();
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int got;
   if(toMs > 0)
      got = CopyRates(g_wSym, tf, (datetime)(toMs / 1000 + off - 1), n, r);
   else
      got = CopyRates(g_wSym, tf, 0, n, r);
   if(got < 0)
      return;                                      // MT5 aún está descargando el historial: lo intentamos en el siguiente segundo
   string js = "{\"p_key\":\"" + JsonEsc(g_key) + "\",\"p_data\":{\"hist\":{\"req\":\"" + JsonEsc(req) + "\",\"sym\":\"" + JsonEsc(g_wSym) +
               "\",\"tf\":\"" + g_wTf + "\",\"bars\":[" + BarsJson(r, got, digits, off) + "]}}}";
   string err = "", resp = "";
   if(PostTo("/rest/v1/rpc/bridge_sync", js, err, resp))
      g_lastReq = req;
  }

//+------------------------------------------------------------------+
//| Al arrancar: lo que pasó mientras MT5 estaba cerrado (7 días)    |
//+------------------------------------------------------------------+
void CatchUp()
  {
   g_lastScan = TimeLocal();
   for(int i = 0; i < PositionsTotal(); i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;
      ulong pos = (ulong)PositionGetInteger(POSITION_IDENTIFIER);
      int k = FindOrAddPos(pos);
      if(g_pos[k].openSent)
         continue;
      datetime opened = (datetime)PositionGetInteger(POSITION_TIME);
      string cap = (TimeTradeServer() - opened < 300) ? Capture(PositionGetString(POSITION_SYMBOL)) : "";
      AddJob(pos, 0, TimeLocal() + 3, cap);
     }
   if(!HistorySelect(TimeCurrent() - 7 * 86400, TimeCurrent() + 86400))
      return;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0)
         continue;
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      long dtype = HistoryDealGetInteger(deal, DEAL_TYPE);
      if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL)
         continue;
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT)
         continue;
      ulong pos = (ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID);
      if(PositionSelectByTicket(pos))
         continue;                                 // sigue abierta
      int k = FindOrAddPos(pos);
      if(!g_pos[k].closedSent && !HasJob(pos, 1))
         AddJob(pos, 1, TimeLocal() + 5, "");
     }
  }

//+------------------------------------------------------------------+
//| Construye y envía una operación                                  |
//+------------------------------------------------------------------+
bool SendJob(Job &job, string &err)
  {
   int k = FindOrAddPos(job.id);
   bool isOpen = PositionSelectByTicket(job.id);
   if(isOpen && !g_pos[k].openSent)
      g_pos[k].sl0 = PositionGetDouble(POSITION_SL);   // el stop que tenías a los 20 s

   if(!HistorySelectByPosition(job.id))
     {
      err = "sin historial";
      return(false);
     }
   string   sym = "";
   long     side = -1;
   double   vol = 0, openPrice = 0, closePrice = 0, dealSL = 0, dealTP = 0;
   double   profit = 0, commission = 0, swap = 0;
   datetime openTime = 0, closeTime = 0;
   int n = HistoryDealsTotal();
   for(int i = 0; i < n; i++)
     {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0)
         continue;
      long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
      long dtype = HistoryDealGetInteger(d, DEAL_TYPE);
      profit     += HistoryDealGetDouble(d, DEAL_PROFIT);
      commission += HistoryDealGetDouble(d, DEAL_COMMISSION) + HistoryDealGetDouble(d, DEAL_FEE);
      swap       += HistoryDealGetDouble(d, DEAL_SWAP);
      if(entry == DEAL_ENTRY_IN)
        {
         if(openTime == 0)
           {
            openTime  = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
            openPrice = HistoryDealGetDouble(d, DEAL_PRICE);
            sym       = HistoryDealGetString(d, DEAL_SYMBOL);
            side      = dtype;
            dealSL    = HistoryDealGetDouble(d, DEAL_SL);
            dealTP    = HistoryDealGetDouble(d, DEAL_TP);
           }
         vol += HistoryDealGetDouble(d, DEAL_VOLUME);
        }
      else
         if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY || entry == DEAL_ENTRY_INOUT)
           {
            closeTime  = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
            closePrice = HistoryDealGetDouble(d, DEAL_PRICE);
           }
     }
   if(openTime == 0 || sym == "")
     {
      err = "operación incompleta";
      return(false);
     }
   double sl0 = g_pos[k].sl0 > 0 ? g_pos[k].sl0 : dealSL;
   double tp  = dealTP;
   if(isOpen)
     {
      if(sl0 <= 0)
         sl0 = PositionGetDouble(POSITION_SL);
      if(tp <= 0)
         tp = PositionGetDouble(POSITION_TP);
     }

   // Riesgo: lo que perdías si el precio tocaba tu stop
   double riskMoney = 0;
   if(sl0 > 0)
     {
      double loss = 0;
      ENUM_ORDER_TYPE ot = (side == DEAL_TYPE_BUY) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      if(OrderCalcProfit(ot, sym, vol, openPrice, sl0, loss))
         riskMoney = MathAbs(loss);
     }
   double net = profit + commission + swap;
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   if(!isOpen)
      balance -= net;                              // saldo aproximado al entrar
   double riskPct = (riskMoney > 0 && balance > 0) ? riskMoney / balance * 100.0 : 0;

   int    dg  = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   long   off = ServerOffset();
   string js  = "{";
   js += "\"version\":\"" + BT_VERSION + "\"";
   js += ",\"account\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\"";
   js += ",\"broker\":\"" + JsonEsc(AccountInfoString(ACCOUNT_COMPANY)) + "\"";
   js += ",\"currency\":\"" + JsonEsc(AccountInfoString(ACCOUNT_CURRENCY)) + "\"";
   js += ",\"position\":\"" + IntegerToString((long)job.id) + "\"";
   js += ",\"symbol\":\"" + JsonEsc(sym) + "\"";
   js += ",\"side\":\"" + (side == DEAL_TYPE_BUY ? "buy" : "sell") + "\"";
   js += ",\"volume\":" + DoubleToString(vol, 2);
   js += ",\"open_time\":" + IntegerToString((long)openTime - off);
   js += ",\"open_price\":" + DoubleToString(openPrice, dg);
   js += ",\"sl\":" + DoubleToString(sl0, dg);
   js += ",\"tp\":" + DoubleToString(tp, dg);
   js += ",\"sl_moved\":" + (g_pos[k].slMoved ? "true" : "false");
   js += ",\"balance\":" + DoubleToString(balance, 2);
   js += ",\"risk_money\":" + DoubleToString(riskMoney, 2);
   js += ",\"risk_pct\":" + DoubleToString(riskPct, 3);
   if(isOpen)
      js += ",\"status\":\"open\"";
   else
     {
      js += ",\"status\":\"closed\"";
      js += ",\"close_time\":" + IntegerToString((long)closeTime - off);
      js += ",\"close_price\":" + DoubleToString(closePrice, dg);
      js += ",\"profit\":" + DoubleToString(profit, 2);
      js += ",\"commission\":" + DoubleToString(commission, 2);
      js += ",\"swap\":" + DoubleToString(swap, 2);
      if(riskMoney > 0)
         js += ",\"r\":" + DoubleToString(net / riskMoney, 2);
     }
   // Sin foto del momento (operación desde el móvil, Mac dormido o sin gráfico abierto):
   // la rehacemos con el historial de precios, con la entrada, la salida, el stop y el objetivo marcados.
   if(job.capture == "" && RehacerFoto && job.tries <= 3)
     {
      bool wantIt = (job.kind == 1 && !isOpen) || (job.kind == 0 && !g_pos[k].openSent);
      if(wantIt)
        {
         job.capture = CaptureHistory(sym, side, openTime, isOpen ? 0 : closeTime, openPrice, closePrice, sl0, tp, !isOpen);
         if(job.capture != "" && !isOpen)
            job.kind = 1;                          // una operación ya cerrada: la foto enseña la operación entera
        }
     }
   if(job.capture != "")
      js += (job.kind == 0 ? ",\"capture_entry\":\"" : ",\"capture_exit\":\"") + job.capture + "\"";
   js += "}";

   if(!Post("{\"p_key\":\"" + JsonEsc(g_key) + "\",\"p_trade\":" + js + "}", err))
      return(false);

   if(job.kind == 0 || isOpen)
      g_pos[k].openSent = true;
   if(!isOpen)
     {
      g_pos[k].openSent   = true;
      g_pos[k].closedSent = true;
     }
   SaveState();
   g_lastOk = TimeLocal();
   g_status = sym + (isOpen ? " · entrada apuntada" : " · operación cerrada y apuntada");
   return(true);
  }

void SendPing()
  {
   g_lastPing = TimeLocal();
   string err = "";
   // datos de los mercados de tu Observación de mercado: la calculadora de la app los usa para el tamaño exacto
   string syms = "";
   int total = SymbolsTotal(true);
   if(total > 40)
      total = 40;
   for(int i = 0; i < total; i++)
     {
      string s = SymbolName(i, true);
      double tv = SymbolInfoDouble(s, SYMBOL_TRADE_TICK_VALUE_LOSS);
      if(tv <= 0)
         tv = SymbolInfoDouble(s, SYMBOL_TRADE_TICK_VALUE);
      double ts = SymbolInfoDouble(s, SYMBOL_TRADE_TICK_SIZE);
      if(tv <= 0 || ts <= 0)
         continue;
      if(syms != "")
         syms += ",";
      syms += "{\"s\":\"" + JsonEsc(s) + "\",\"tv\":" + DoubleToString(tv, 8) + ",\"ts\":" + DoubleToString(ts, 10) +
              ",\"vmin\":" + DoubleToString(SymbolInfoDouble(s, SYMBOL_VOLUME_MIN), 2) +
              ",\"vstep\":" + DoubleToString(SymbolInfoDouble(s, SYMBOL_VOLUME_STEP), 2) +
              ",\"vmax\":" + DoubleToString(SymbolInfoDouble(s, SYMBOL_VOLUME_MAX), 2) +
              ",\"d\":" + IntegerToString(SymbolInfoInteger(s, SYMBOL_DIGITS)) +
              ",\"p\":" + DoubleToString(SymbolInfoDouble(s, SYMBOL_BID), (int)SymbolInfoInteger(s, SYMBOL_DIGITS)) + "}";
     }
   string js = "{\"p_key\":\"" + JsonEsc(g_key) + "\",\"p_trade\":{\"ping\":\"1\",\"version\":\"" + BT_VERSION +
               "\",\"account\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) +
               "\",\"broker\":\"" + JsonEsc(AccountInfoString(ACCOUNT_COMPANY)) +
               "\",\"balance_now\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) +
               ",\"currency_now\":\"" + JsonEsc(AccountInfoString(ACCOUNT_CURRENCY)) +
               "\",\"symbols\":[" + syms + "]}}";
   if(Post(js, err))
     {
      g_lastOk = TimeLocal();
      if(StringFind(g_status, "Conectando") == 0 || StringFind(g_status, "Sin conexión") == 0)
         g_status = "Conectado";
     }
   else
      g_status = "Sin conexión: " + err;
  }

//+------------------------------------------------------------------+
//| Envío a Tickora                                              |
//+------------------------------------------------------------------+
bool Post(const string body, string &err)
  {
   string resp;
   return(PostTo(BT_RPC, body, err, resp));
  }

bool PostTo(const string rpc, const string body, string &err, string &resp)
  {
   char data[], res[];
   string resHeaders;
   int len = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0)
      ArrayResize(data, len - 1);                  // sin el 0 final
   string headers = "Content-Type: application/json\r\napikey: " + BT_APIKEY + "\r\n";
   ResetLastError();
   int code = WebRequest("POST", BT_URL + rpc, headers, 15000, data, res, resHeaders);
   if(code == -1)
     {
      int e = GetLastError();
      if(e == 4014)
        {
         err = "falta permitir la dirección en Opciones";
         if(!g_urlAlert)
           {
            g_urlAlert = true;
            Alert("Tickora: en Herramientas → Opciones → Asesores expertos, marca «Permitir WebRequest» y añade ", BT_URL);
           }
        }
      else
         err = "sin internet (" + IntegerToString(e) + ")";
      return(false);
     }
   if(code < 200 || code >= 300)
     {
      string txt = CharArrayToString(res, 0, WHOLE_ARRAY, CP_UTF8);
      if(StringFind(txt, "Clave no v") >= 0)
        {
         err = "clave no válida";
         if(StringLen(Clave) < 10)
           {
            FileDelete(BT_KEYFILE);                // la desvinculaste en la app: pedimos un código nuevo
            g_key = "";
            StartPairing();
           }
        }
      else
         err = "error " + IntegerToString(code);
      Print("Tickora: respuesta ", code, " ", StringSubstr(txt, 0, 300));
      return(false);
     }
   resp = CharArrayToString(res, 0, WHOLE_ARRAY, CP_UTF8);
   return(true);
  }

//+------------------------------------------------------------------+
//| Vincular con un código de 6 cifras                               |
//+------------------------------------------------------------------+
string LoadKey()
  {
   if(!FileIsExist(BT_KEYFILE))
      return("");
   int h = FileOpen(BT_KEYFILE, FILE_READ | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
      return("");
   string k = FileReadString(h);
   FileClose(h);
   StringTrimLeft(k);
   StringTrimRight(k);
   return(StringLen(k) >= 10 ? k : "");
  }

void SaveKey(const string k)
  {
   int h = FileOpen(BT_KEYFILE, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
      return;
   FileWriteString(h, k);
   FileClose(h);
  }

string Unquote(string s)
  {
   StringTrimLeft(s);
   StringTrimRight(s);
   StringReplace(s, "\"", "");
   return(s);
  }

void StartPairing()
  {
   MathSrand((int)(GetTickCount() ^ (uint)TimeLocal()));
   string hex = "0123456789abcdef";
   g_secret = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "-";
   for(int i = 0; i < 40; i++)
      g_secret += StringSubstr(hex, MathRand() % 16, 1);
   string err = "", resp = "";
   if(PostTo("/rest/v1/rpc/bridge_pair_start", "{\"p_secret\":\"" + g_secret + "\"}", err, resp))
     {
      g_code = Unquote(resp);
      g_codeAt = TimeLocal();
      g_status = "Escribe el código en la app";
     }
   else
     {
      g_code = "";
      g_status = "Sin conexión: " + err;
     }
  }

void PollPairing()
  {
   if(g_code == "" || TimeLocal() - g_codeAt > 14 * 60)
     {
      StartPairing();                              // el código caduca a los 15 minutos
      return;
     }
   string err = "", resp = "";
   if(!PostTo("/rest/v1/rpc/bridge_pair_check", "{\"p_secret\":\"" + g_secret + "\"}", err, resp))
      return;
   string k = Unquote(resp);
   if(k == "caducado")
     {
      StartPairing();
      return;
     }
   if(StringLen(k) >= 10)
     {
      g_key = k;
      SaveKey(k);
      g_code = "";
      ObjectDelete(0, "bt_code1");
      ObjectDelete(0, "bt_code2");
      g_status = "Vinculado con tu Tickora";
      CatchUp();
      SendPing();
     }
  }

void ShowCodeLabels()
  {
   string c = g_code;
   if(StringLen(c) == 6)
      c = StringSubstr(c, 0, 3) + " " + StringSubstr(c, 3, 3);
   if(ObjectFind(0, "bt_code1") < 0)
     {
      ObjectCreate(0, "bt_code1", OBJ_LABEL, 0, 0, 0);
      ObjectCreate(0, "bt_code2", OBJ_LABEL, 0, 0, 0);
     }
   ObjectSetInteger(0, "bt_code1", OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, "bt_code1", OBJPROP_XDISTANCE, 20);
   ObjectSetInteger(0, "bt_code1", OBJPROP_YDISTANCE, 60);
   ObjectSetInteger(0, "bt_code1", OBJPROP_FONTSIZE, 30);
   ObjectSetString(0, "bt_code1", OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, "bt_code1", OBJPROP_COLOR, clrRoyalBlue);
   ObjectSetString(0, "bt_code1", OBJPROP_TEXT, "Código: " + c);
   ObjectSetInteger(0, "bt_code2", OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, "bt_code2", OBJPROP_XDISTANCE, 22);
   ObjectSetInteger(0, "bt_code2", OBJPROP_YDISTANCE, 112);
   ObjectSetInteger(0, "bt_code2", OBJPROP_FONTSIZE, 11);
   ObjectSetInteger(0, "bt_code2", OBJPROP_COLOR, clrDimGray);
   ObjectSetString(0, "bt_code2", OBJPROP_TEXT, "Escríbelo en la app: Mi plan → Conectar MetaTrader 5");
   ChartRedraw();
  }

//+------------------------------------------------------------------+
//| Captura del gráfico del mercado (si lo tienes abierto)           |
//+------------------------------------------------------------------+
string Capture(const string sym)
  {
   if(!GuardarCapturas || sym == "")
      return("");
   long cid = 0;
   if(_Symbol == sym)
      cid = ChartID();
   else
     {
      long c = ChartFirst();
      while(c >= 0)
        {
         if(ChartSymbol(c) == sym)
           {
            cid = c;
            break;
           }
         c = ChartNext(c);
        }
     }
   if(cid == 0 && _Symbol != sym)
     {
      Print("Tickora: abre un gráfico de ", sym, " para que se guarde la captura.");
      return("");
     }
   ChartRedraw(cid);
   if(!ChartScreenShot(cid, BT_CAPFILE, AnchoCaptura, AltoCaptura, ALIGN_RIGHT))
      return("");
   return(ReadCapture());
  }

//+------------------------------------------------------------------+
//| Foto rehecha con el historial: abre un gráfico, se coloca en la   |
//| hora de la operación, la marca, hace la foto y lo cierra          |
//+------------------------------------------------------------------+
ENUM_TIMEFRAMES TfFor(const long secs)
  {
   if(secs <= 2 * 3600)
      return(PERIOD_M5);
   if(secs <= 8 * 3600)
      return(PERIOD_M15);
   if(secs <= 3 * 86400)
      return(PERIOD_H1);
   return(PERIOD_H4);
  }

string CaptureHistory(const string sym, const long side, const datetime tOpen, const datetime tClose,
                      const double pOpen, const double pClose, const double sl, const double tp, const bool closed)
  {
   if(!GuardarCapturas || sym == "" || tOpen == 0)
      return("");
   SymbolSelect(sym, true);
   datetime tEnd = closed ? tClose : TimeCurrent();
   if(tEnd < tOpen)
      tEnd = tOpen;
   ENUM_TIMEFRAMES tf = TfFor((long)(tEnd - tOpen));
   int ps = PeriodSeconds(tf);
   MqlRates rates[];
   if(CopyRates(sym, tf, tOpen - ps * 80, tEnd + ps * 20, rates) <= 0)
      return("");                                  // aún no hay historial descargado: se intentará en la próxima vuelta
   long cid = ChartOpen(sym, tf);
   if(cid <= 0)
      return("");
   ChartSetInteger(cid, CHART_AUTOSCROLL, false);
   ChartSetInteger(cid, CHART_SHIFT, false);
   ChartSetInteger(cid, CHART_SCALE, 3);

   string pre = "bt_";
   ObjectCreate(cid, pre + "in", (side == DEAL_TYPE_BUY ? OBJ_ARROW_BUY : OBJ_ARROW_SELL), 0, tOpen, pOpen);
   ObjectSetInteger(cid, pre + "in", OBJPROP_COLOR, clrRoyalBlue);
   ObjectSetInteger(cid, pre + "in", OBJPROP_WIDTH, 3);
   if(sl > 0)
     {
      ObjectCreate(cid, pre + "sl", OBJ_TREND, 0, tOpen, sl, tEnd, sl);
      ObjectSetInteger(cid, pre + "sl", OBJPROP_COLOR, clrDimGray);
      ObjectSetInteger(cid, pre + "sl", OBJPROP_STYLE, STYLE_DOT);
      ObjectSetInteger(cid, pre + "sl", OBJPROP_RAY_RIGHT, false);
     }
   if(tp > 0)
     {
      ObjectCreate(cid, pre + "tp", OBJ_TREND, 0, tOpen, tp, tEnd, tp);
      ObjectSetInteger(cid, pre + "tp", OBJPROP_COLOR, clrRoyalBlue);
      ObjectSetInteger(cid, pre + "tp", OBJPROP_STYLE, STYLE_DASH);
      ObjectSetInteger(cid, pre + "tp", OBJPROP_RAY_RIGHT, false);
     }
   ObjectCreate(cid, pre + "en", OBJ_TREND, 0, tOpen, pOpen, tEnd, pOpen);
   ObjectSetInteger(cid, pre + "en", OBJPROP_COLOR, clrRoyalBlue);
   ObjectSetInteger(cid, pre + "en", OBJPROP_RAY_RIGHT, false);
   if(closed)
     {
      ObjectCreate(cid, pre + "out", OBJ_ARROW_STOP, 0, tClose, pClose);
      ObjectSetInteger(cid, pre + "out", OBJPROP_COLOR, clrBlack);
      ObjectSetInteger(cid, pre + "out", OBJPROP_WIDTH, 2);
      ObjectCreate(cid, pre + "path", OBJ_TREND, 0, tOpen, pOpen, tClose, pClose);
      ObjectSetInteger(cid, pre + "path", OBJPROP_COLOR, clrBlack);
      ObjectSetInteger(cid, pre + "path", OBJPROP_STYLE, STYLE_DOT);
      ObjectSetInteger(cid, pre + "path", OBJPROP_RAY_RIGHT, false);
     }
   ChartRedraw(cid);
   // que la salida quede cerca del borde derecho, con 15 velas de margen
   int shiftEnd = iBarShift(sym, tf, tEnd, false);
   if(shiftEnd < 0)
      shiftEnd = 0;
   int back = shiftEnd - 15;
   if(back < 0)
      back = 0;
   ChartNavigate(cid, CHART_END, -back);
   ChartRedraw(cid);
   Sleep(400);
   bool ok = ChartScreenShot(cid, BT_CAPFILE, AnchoCaptura, AltoCaptura, ALIGN_RIGHT);
   ChartClose(cid);
   if(!ok)
      return("");
   return(ReadCapture());
  }

string ReadCapture()
  {
   int h = FileOpen(BT_CAPFILE, FILE_READ | FILE_BIN);
   if(h == INVALID_HANDLE)
      return("");
   uchar src[], key[], dst[];
   ulong size = FileSize(h);
   if(size == 0 || size > 1000000)
     {
      FileClose(h);
      FileDelete(BT_CAPFILE);
      return("");
     }
   FileReadArray(h, src, 0, (int)size);
   FileClose(h);
   FileDelete(BT_CAPFILE);
   if(CryptEncode(CRYPT_BASE64, src, key, dst) <= 0)
      return("");
   return(CharArrayToString(dst, 0, WHOLE_ARRAY, CP_ACP));
  }

//+------------------------------------------------------------------+
//| Utilidades                                                       |
//+------------------------------------------------------------------+
long ServerOffset()
  {
   long off = (long)(TimeTradeServer() - TimeGMT());
   return((long)MathRound(off / 1800.0) * 1800);   // hora del bróker → hora universal
  }

string JsonEsc(string s)
  {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\n", " ");
   StringReplace(s, "\r", " ");
   StringReplace(s, "\t", " ");
   return(s);
  }

int FindPos(const ulong id)
  {
   for(int i = 0; i < ArraySize(g_pos); i++)
      if(g_pos[i].id == id)
         return(i);
   return(-1);
  }

int FindOrAddPos(const ulong id)
  {
   int k = FindPos(id);
   if(k >= 0)
      return(k);
   k = ArraySize(g_pos);
   ArrayResize(g_pos, k + 1);
   g_pos[k].id = id;
   g_pos[k].sl0 = 0;
   g_pos[k].slMoved = false;
   g_pos[k].openSent = false;
   g_pos[k].closedSent = false;
   return(k);
  }

bool HasJob(const ulong id, const int kind)
  {
   for(int i = 0; i < ArraySize(g_jobs); i++)
      if(g_jobs[i].id == id && g_jobs[i].kind == kind)
         return(true);
   return(false);
  }

void AddJob(const ulong id, const int kind, const datetime due, const string capture)
  {
   if(HasJob(id, kind))
      return;
   int n = ArraySize(g_jobs);
   ArrayResize(g_jobs, n + 1);
   g_jobs[n].id = id;
   g_jobs[n].kind = kind;
   g_jobs[n].due = due;
   g_jobs[n].tries = 0;
   g_jobs[n].capture = capture;
  }

void RemoveJob(const int i)
  {
   int n = ArraySize(g_jobs);
   for(int j = i; j < n - 1; j++)
      g_jobs[j] = g_jobs[j + 1];
   ArrayResize(g_jobs, n - 1);
  }

void SaveState()
  {
   // guardamos solo las últimas 300 posiciones
   int start = MathMax(0, ArraySize(g_pos) - 300);
   int h = FileOpen(BT_STATE, FILE_WRITE | FILE_CSV | FILE_ANSI, ';');
   if(h == INVALID_HANDLE)
      return;
   for(int i = start; i < ArraySize(g_pos); i++)
      FileWrite(h, IntegerToString((long)g_pos[i].id), DoubleToString(g_pos[i].sl0, 8),
                (int)g_pos[i].slMoved, (int)g_pos[i].openSent, (int)g_pos[i].closedSent);
   FileClose(h);
  }

void LoadState()
  {
   ArrayResize(g_pos, 0);
   if(!FileIsExist(BT_STATE))
      return;
   int h = FileOpen(BT_STATE, FILE_READ | FILE_CSV | FILE_ANSI, ';');
   if(h == INVALID_HANDLE)
      return;
   while(!FileIsEnding(h))
     {
      string sid = FileReadString(h);
      if(sid == "")
         break;
      int k = FindOrAddPos((ulong)StringToInteger(sid));
      g_pos[k].sl0        = StringToDouble(FileReadString(h));
      g_pos[k].slMoved    = (StringToInteger(FileReadString(h)) == 1);
      g_pos[k].openSent   = (StringToInteger(FileReadString(h)) == 1);
      g_pos[k].closedSent = (StringToInteger(FileReadString(h)) == 1);
     }
   FileClose(h);
  }

void ShowStatus()
  {
   if(g_key == "")
     {
      if(g_code != "")
         ShowCodeLabels();
      Comment("Tickora · ", g_status);
      return;
     }
   string last = g_lastOk > 0 ? TimeToString(g_lastOk, TIME_MINUTES) : "—";
   int pend = ArraySize(g_jobs);
   Comment("Tickora · ", g_status, "\nÚltimo envío correcto: ", last,
           (pend > 0 ? "\nPendientes de enviar: " + IntegerToString(pend) : ""));
  }
//+------------------------------------------------------------------+

//+------------------------------------------------------------------+
//| Candado: lo configura el usuario en Tickora (Ajustes)            |
//| Campos: 0 versión | 1 modo (0 apagado, 1 avisar, 2 cerrar        |
//| operación, 3 no dejar usar MT5) | 2 bloqueo pedido hasta |        |
//| 3-4 quitado hoy (desde, hasta) | 5 máx. operaciones | 6 pérdida   |
//| máx. del día (dinero) | 7 minutos tras dos pérdidas | 8-9 chequeo |
//| (norma, hecho hasta) | 10-11 semáforo rojo (norma, hasta) |       |
//| 12 horario válido hasta | 13 sesiones a:b,… | 14 noticias a:b,… |
//| 15 minutos de diferencia con la hora universal | 16 actualizado  |
//| Todas las horas en milisegundos y hora universal.                |
//+------------------------------------------------------------------+
void LoadLock()
  {
   int h = FileOpen(BT_LOCKFILE, FILE_READ | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
      return;
   g_lock = FileReadString(h);
   FileClose(h);
  }

void SaveLock()
  {
   int h = FileOpen(BT_LOCKFILE, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
      return;
   FileWriteString(h, g_lock);
   FileClose(h);
  }

long LockNum(string &f[], const int i)
  {
   return(i < ArraySize(f) ? StringToInteger(f[i]) : 0);
  }

bool InWindows(const string list, const long now, long &from)
  {
   if(list == "")
      return(false);
   string w[];
   int n = StringSplit(list, ',', w);
   for(int i = 0; i < n; i++)
     {
      string ab[];
      if(StringSplit(w[i], ':', ab) != 2)
         continue;
      long a = StringToInteger(ab[0]), b = StringToInteger(ab[1]);
      if(now >= a && now < b)
        {
         from = a;
         return(true);
        }
     }
   return(false);
  }

long ToUtcMs(const datetime serverTime)
  {
   return(((long)serverTime - ServerOffset()) * 1000);
  }

// ¿está cerrado el candado ahora? Devuelve el motivo y desde cuándo (0 si no se sabe exacto)
bool LockState(string &why, string &code, long &since)
  {
   why = ""; code = ""; since = 0;
   if(g_lock == "")
      return(false);
   string f[];
   int nf = StringSplit(g_lock, '|', f);
   if(nf < 16)
      return(false);
   int mode = (int)LockNum(f, 1);
   if(mode <= 0)
      return(false);
   long now = (long)TimeGMT() * 1000;
   long offFrom = LockNum(f, 3), offUntil = LockNum(f, 4);
   if(offFrom > 0 && now >= offFrom && now < offUntil)
      return(false);                               // lo quitaste hoy (con la frase y los 10 minutos)
   long manual = LockNum(f, 2);
   if(manual > now)
     {
      why = "Pediste en Tickora no operar hasta las " + TimeToString((datetime)(manual / 1000 + ServerOffset()), TIME_MINUTES) + " (hora del bróker)";
      code = "manual";
      return(true);
     }
   long from = 0;
   if(InWindows(f[14], now, from))
     {
      why = "Noticia fuerte de tus mercados: espera a que pase";
      code = "noticia"; since = from;
      return(true);
     }
   long horizon = LockNum(f, 12);
   if(horizon > now && !InWindows(f[13], now, from))
     {
      why = "Estás fuera de tu horario";
      code = "horario";
      return(true);
     }
   if(LockNum(f, 8) == 1 && now > LockNum(f, 9))
     {
      why = "Aún no has hecho tu chequeo de hoy en Tickora";
      code = "chequeo";
      return(true);
     }
   if(LockNum(f, 10) == 1 && now < LockNum(f, 11))
     {
      why = "Tu semáforo de hoy está en rojo";
      code = "semaforo";
      return(true);
     }
   // lo que ha pasado hoy en la cuenta (día según tu hora)
   long tz = LockNum(f, 15) * 60000;
   long dayStart = (long)MathFloor((double)(now + tz) / 86400000.0) * 86400000 - tz;
   if(!HistorySelect((datetime)(dayStart / 1000 + ServerOffset()), TimeTradeServer() + 60))
      return(false);
   int maxOps = (int)LockNum(f, 5), twoMin = (int)LockNum(f, 7);
   double maxLoss = nf > 6 ? StringToDouble(f[6]) : 0;
   int entries = 0;
   double sum = 0;
   long lastOut = 0, prevOut = 0;
   double lastPl = 0, prevPl = 0;
   int nd = HistoryDealsTotal();
   for(int i = 0; i < nd; i++)
     {
      ulong d = HistoryDealGetTicket(i);
      long  t = HistoryDealGetInteger(d, DEAL_TYPE);
      if(t != DEAL_TYPE_BUY && t != DEAL_TYPE_SELL)
         continue;
      long  e  = HistoryDealGetInteger(d, DEAL_ENTRY);
      long  ms = ToUtcMs((datetime)HistoryDealGetInteger(d, DEAL_TIME));
      double pl = HistoryDealGetDouble(d, DEAL_PROFIT) + HistoryDealGetDouble(d, DEAL_SWAP) + HistoryDealGetDouble(d, DEAL_COMMISSION);
      sum += pl;
      if(e == DEAL_ENTRY_IN)
        {
         entries++;
         if(maxOps > 0 && entries == maxOps)
            since = ms;                            // la última operación permitida
        }
      if(e == DEAL_ENTRY_OUT || e == DEAL_ENTRY_OUT_BY)
        {
         prevOut = lastOut; prevPl = lastPl;
         lastOut = ms; lastPl = pl;
        }
      if(maxLoss > 0 && sum <= -maxLoss && code == "")
        {
         code = "limite"; why = "Has llegado a tu límite del día"; since = ms;
        }
     }
   if(code == "limite")
      return(true);
   if(maxOps > 0 && entries >= maxOps)
     {
      why = "Ya hiciste tus " + IntegerToString(maxOps) + " operaciones de hoy";
      code = "maxops";
      return(true);
     }
   since = 0;
   if(twoMin > 0 && prevOut > 0 && lastPl < 0 && prevPl < 0 && now < lastOut + (long)twoMin * 60000)
     {
      why = "Dos pérdidas seguidas: pausa hasta las " + TimeToString((datetime)((lastOut + (long)twoMin * 60000) / 1000 + ServerOffset()), TIME_MINUTES);
      code = "dos"; since = lastOut;
      return(true);
     }
   return(false);
  }

bool LockDoneHas(const ulong id)
  {
   for(int i = 0; i < ArraySize(g_lockDone); i++)
      if(g_lockDone[i] == id)
         return(true);
   return(false);
  }

void LockDoneAdd(const ulong id)
  {
   int n = ArraySize(g_lockDone);
   if(n > 200)
     {
      ArrayRemove(g_lockDone, 0, 100);
      n = ArraySize(g_lockDone);
     }
   ArrayResize(g_lockDone, n + 1);
   g_lockDone[n] = id;
  }

void LockEvent(const string kind, const string sym, const double cost)
  {
   int n = ArraySize(g_lockEv);
   if(n >= 60)
      return;
   ArrayResize(g_lockEv, n + 1);
   g_lockEv[n] = "{\"t\":" + IntegerToString((long)TimeGMT() * 1000) + ",\"k\":\"" + kind + "\",\"s\":\"" + JsonEsc(sym) +
                 "\",\"r\":\"" + g_lockCode + "\",\"c\":" + DoubleToString(cost, 2) + "}";
  }

void CheckLock()
  {
   if(g_key == "")
      return;
   string why, code;
   long since;
   bool on = LockState(why, code, since);
   long now = (long)TimeGMT() * 1000;
   if(!on)
     {
      if(g_lockOn)
         LockPaint(false);
      g_lockOn = false;
      return;
     }
   if(!g_lockOn || code != g_lockCode)
      g_lockSince = now;                           // desde que lo vemos cerrado
   g_lockOn = true;
   g_lockWhy = why;
   g_lockCode = code;
   long from = since > 0 ? since : g_lockSince;
   string f[];
   StringSplit(g_lock, '|', f);
   int mode = (int)LockNum(f, 1);
   bool acted = false;
   // operaciones abiertas con el candado cerrado
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0 || LockDoneHas(tk))
         continue;
      long opened = ToUtcMs((datetime)PositionGetInteger(POSITION_TIME));
      if(opened <= from)
         continue;                                 // ya estaba abierta antes: no se toca
      string sym = PositionGetString(POSITION_SYMBOL);
      double pl = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      LockDoneAdd(tk);
      if(mode == 1)
        {
         Alert("Tickora · Candado: ", why, ". Has abierto ", sym, ".");
         LockEvent("aviso", sym, 0);
         continue;
        }
      if(g_trade.PositionClose(tk))
        {
         LockEvent("cerrada", sym, pl);
         acted = true;
        }
      else
        {
         Print("Tickora · Candado: no se pudo cerrar ", sym, " (activa «Trading algorítmico»). Error ", GetLastError());
         LockEvent("sinpermiso", sym, 0);
        }
     }
   // órdenes pendientes puestas con el candado cerrado
   if(mode >= 2)
      for(int i = OrdersTotal() - 1; i >= 0; i--)
        {
         ulong ot = OrderGetTicket(i);
         if(ot == 0 || LockDoneHas(ot))
            continue;
         if(ToUtcMs((datetime)OrderGetInteger(ORDER_TIME_SETUP)) <= from)
            continue;
         LockDoneAdd(ot);
         if(g_trade.OrderDelete(ot))
            LockEvent("orden", OrderGetString(ORDER_SYMBOL), 0);
        }
   LockPaint(true);
   // «No dejar usar MT5»: se cierra MetaTrader (nunca en el servidor de MetaQuotes, que vigila las 24 h)
   if(mode == 3 && !TerminalInfoInteger(TERMINAL_VPS))
     {
      if(g_lockShown == 0)
         g_lockShown = TimeLocal();
      if(TimeLocal() - g_lockShown >= 5 && TimeLocal() - g_lastOk <= 15)
        {
         LockEvent("mt5", "", 0);
         Sync();                                   // que Tickora lo sepa antes de cerrar
         SaveState();
         g_lockShown = 0;
         TerminalClose(0);
        }
     }
   else
      g_lockShown = 0;
  }

void LockPaint(const bool show)
  {
   string bg = "tk_lock_bg", t1 = "tk_lock_t1", t2 = "tk_lock_t2";
   if(!show)
     {
      ObjectDelete(0, bg);
      ObjectDelete(0, t1);
      ObjectDelete(0, t2);
      ChartRedraw();
      return;
     }
   string f[];
   StringSplit(g_lock, '|', f);
   int mode = (int)LockNum(f, 1);
   string sub = mode == 1 ? "Puedes operar, pero lo dijiste en frío: mejor no." :
                mode == 2 ? "Si abres una operación, se cerrará al momento." :
                "MetaTrader se cerrará en unos segundos.";
   if(ObjectFind(0, bg) < 0)
     {
      ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, 20);
      ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, 40);
      ObjectSetInteger(0, bg, OBJPROP_XSIZE, 520);
      ObjectSetInteger(0, bg, OBJPROP_YSIZE, 84);
      ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'24,20,32');
      ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, bg, OBJPROP_COLOR, C'196,157,255');
      ObjectSetInteger(0, bg, OBJPROP_BACK, false);
      ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
      ObjectCreate(0, t1, OBJ_LABEL, 0, 0, 0);
      ObjectCreate(0, t2, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, t1, OBJPROP_XDISTANCE, 36);
      ObjectSetInteger(0, t1, OBJPROP_YDISTANCE, 52);
      ObjectSetInteger(0, t2, OBJPROP_XDISTANCE, 36);
      ObjectSetInteger(0, t2, OBJPROP_YDISTANCE, 84);
      ObjectSetInteger(0, t1, OBJPROP_FONTSIZE, 13);
      ObjectSetInteger(0, t2, OBJPROP_FONTSIZE, 10);
      ObjectSetInteger(0, t1, OBJPROP_COLOR, clrWhite);
      ObjectSetInteger(0, t2, OBJPROP_COLOR, C'201,201,207');
      ObjectSetInteger(0, t1, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, t2, OBJPROP_SELECTABLE, false);
     }
   ObjectSetString(0, t1, OBJPROP_TEXT, "Candado de Tickora · " + g_lockWhy);
   ObjectSetString(0, t2, OBJPROP_TEXT, sub);
   ChartRedraw();
  }
