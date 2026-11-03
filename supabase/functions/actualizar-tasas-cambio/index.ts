/**
 * Edge Function `actualizar-tasas-cambio` — escritor diario del catálogo GLOBAL
 * de tasas (`public.currency_rates`, base USD, proveedor OpenExchangeRates).
 *
 * Reconstruida el 2026-11-03: el proyecto Supabase anterior se borró y con él la
 * versión 19 desplegada, cuyo código nunca estuvo en un repositorio. Esta es la
 * primera versión versionada.
 *
 * ── Contrato (el que ya envían los llamadores de la base) ──────────────────────
 *   POST /functions/v1/actualizar-tasas-cambio
 *   Autenticación: la clave secreta del proyecto (`sb_secret_…`) o la
 *   `service_role` heredada, en `apikey` o en `Authorization: Bearer`.
 *   - `fn_cron_actualizar_tasas()` (cron diario) la lee de Vault
 *     (`service_role_key`) y manda { source: 'daily_real_api', scheduled: true,
 *     use_real_api: true }.
 *   - `fill_historical_rates_real_api()` y `fill_missing_currency_dates()` mandan
 *     además `target_date` (YYYY-MM-DD) para rellenar un día pasado.
 *   Cuerpo opcional; los campos desconocidos se ignoran.
 *
 * ── Qué hace ───────────────────────────────────────────────────────────────────
 *   1. Valida a quien llama (falla cerrado: 401 sin clave válida). Se despliega
 *      con verify_jwt=false porque `sb_secret_…` no es un JWT y la pasarela lo
 *      rechazaría; la validación se hace aquí, contra las claves que el runtime
 *      inyecta (SUPABASE_SECRET_KEYS y SUPABASE_SERVICE_ROLE_KEY).
 *   2. Decide el día con `public.fn_today_system()` (ADR-004, deuda 1): el día
 *      del catálogo, no el día UTC. La versión 19 cortaba el día de
 *      `toISOString()` (el día UTC), lo que prohíbe la regla 1 de
 *      docs/reglas-fechas-timezone.md. Aquí no se calcula ningún día en Deno.
 *   3. Sin `target_date` (o con el de hoy): `latest.json` y fila con el día de
 *      hoy. Con un `target_date` pasado: `historical/<día>.json` y fila con ese
 *      día (la deuda 3 del ADR-004: antes se ignoraba y siempre escribía hoy).
 *      Un `target_date` futuro es 400.
 *   4. Escribe solo las monedas del catálogo con `auto_update` y activas, por la
 *      RPC `update_global_exchange_rates` (la misma que usa el rellenador del
 *      ERP, `tasasCambio.server.ts`): actualiza la fila de (code, rate_date) si
 *      existe y si no la inserta. Ejecutarla dos veces el mismo día deja las
 *      mismas filas; el índice único `idx_currency_rates_code_date` lo garantiza.
 *   5. Registra cada ejecución, buena o mala, en `exchange_rates_logs`
 *      (`log_exchange_rates_execution`).
 *
 * ── Secreto ────────────────────────────────────────────────────────────────────
 *   OPENEXCHANGERATES_API_KEY, en Edge Functions › Secrets del proyecto. Nunca en
 *   el código ni en la URL que se registra. Si falta, responde 503 y no escribe.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const API_PROVEEDOR = "https://openexchangerates.org/api";
const MONEDA_BASE = "USD";
const FUENTE_DIARIA = "openexchangerates";
const FUENTE_HISTORICA = "openexchangerates_historical";
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

interface RespuestaProveedor {
  base: string;
  timestamp: number;
  rates: Record<string, number>;
}

class ErrorHttp extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(status: number, cuerpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// ── Autenticación ────────────────────────────────────────────────────────────

/** Claves de servidor que el runtime inyecta: las nuevas (JSON por nombre) y la heredada. */
function clavesDeServidor(): string[] {
  const claves: string[] = [];
  const nuevas = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (nuevas) {
    try {
      for (const valor of Object.values(JSON.parse(nuevas) as Record<string, unknown>)) {
        if (typeof valor === "string" && valor.length > 0) claves.push(valor);
      }
    } catch {
      console.error("[tasas] SUPABASE_SECRET_KEYS no es JSON válido");
    }
  }
  const heredada = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (heredada) claves.push(heredada);
  return claves;
}

/** Clave con la que esta función escribe: la secreta `default`, o la heredada. */
function claveParaEscribir(): string | null {
  const nuevas = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (nuevas) {
    try {
      const porNombre = JSON.parse(nuevas) as Record<string, unknown>;
      if (typeof porNombre.default === "string" && porNombre.default) return porNombre.default;
    } catch {
      // se cae a la heredada
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

/** Comparación en tiempo constante respecto al contenido. */
function igualesEnTiempoConstante(a: string, b: string): boolean {
  const ca = new TextEncoder().encode(a);
  const cb = new TextEncoder().encode(b);
  const largo = Math.max(ca.length, cb.length);
  let diferencia = ca.length ^ cb.length;
  for (let i = 0; i < largo; i++) diferencia |= (ca[i] ?? 0) ^ (cb[i] ?? 0);
  return diferencia === 0;
}

function credencialPresentada(req: Request): string | null {
  const apikey = req.headers.get("apikey")?.trim();
  if (apikey) return apikey;
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : null;
}

function llamadorAutorizado(req: Request): boolean {
  const presentada = credencialPresentada(req);
  if (!presentada) return false;
  const claves = clavesDeServidor();
  // Sin claves en el entorno no hay contra qué validar: falla cerrado.
  let ok = false;
  for (const clave of claves) ok = igualesEnTiempoConstante(presentada, clave) || ok;
  return ok;
}

// ── Proveedor ────────────────────────────────────────────────────────────────

async function pedirAlProveedor(ruta: string, appId: string, intento = 1): Promise<RespuestaProveedor> {
  const url = `${API_PROVEEDOR}/${ruta}?app_id=${encodeURIComponent(appId)}`;
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "GO-Admin-ERP/1.0" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    if (intento < 3) {
      await new Promise((r) => setTimeout(r, 2000));
      return pedirAlProveedor(ruta, appId, intento + 1);
    }
    throw new ErrorHttp(502, `No se pudo contactar a OpenExchangeRates: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (respuesta.status >= 500 && intento < 3) {
    await new Promise((r) => setTimeout(r, 2000));
    return pedirAlProveedor(ruta, appId, intento + 1);
  }
  if (!respuesta.ok) {
    // Nunca se registra la URL: lleva la clave.
    throw new ErrorHttp(502, `OpenExchangeRates respondió ${respuesta.status} ${respuesta.statusText}`);
  }
  const datos = (await respuesta.json()) as Partial<RespuestaProveedor>;
  if (!datos || typeof datos.rates !== "object" || datos.rates === null || typeof datos.timestamp !== "number") {
    throw new ErrorHttp(502, "Respuesta de OpenExchangeRates sin tasas");
  }
  return { base: datos.base ?? MONEDA_BASE, timestamp: datos.timestamp, rates: datos.rates as Record<string, number> };
}

// ── Base de datos ────────────────────────────────────────────────────────────

async function registrar(db: SupabaseClient, exito: boolean, detalle: Record<string, unknown>, error: string | null) {
  const { error: logError } = await db.rpc("log_exchange_rates_execution", {
    p_execution_date: new Date().toISOString(), // instante completo, no un día
    p_success: exito,
    p_error_message: error,
    p_organizations_total: 0,
    p_organizations_success: 0,
    p_organizations_error: 0,
    p_details: [detalle],
  });
  if (logError) console.error("[tasas] no se pudo registrar la ejecución:", logError.message);
}

/** Día del catálogo según la base (ADR-004). Única fuente: `fn_today_system()`. */
async function diaDelCatalogo(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.rpc("fn_today_system");
  if (error || typeof data !== "string" || !DIA_RE.test(data)) {
    throw new ErrorHttp(500, `No se pudo leer fn_today_system(): ${error?.message ?? "respuesta inválida"}`);
  }
  return data;
}

async function leerCuerpo(req: Request): Promise<Record<string, unknown>> {
  const texto = await req.text();
  if (!texto.trim()) return {};
  try {
    const cuerpo = JSON.parse(texto);
    return cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo) ? cuerpo : {};
  } catch {
    throw new ErrorHttp(400, "El cuerpo no es JSON válido");
  }
}

// ── Manejador ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { success: false, error: "Solo se admite POST" });
  if (!llamadorAutorizado(req)) return json(401, { success: false, error: "No autorizado" });

  const urlProyecto = Deno.env.get("SUPABASE_URL");
  const clave = claveParaEscribir();
  if (!urlProyecto || !clave) {
    return json(500, { success: false, error: "El runtime no expone SUPABASE_URL o la clave secreta" });
  }
  const db = createClient(urlProyecto, clave, { auth: { persistSession: false, autoRefreshToken: false } });

  const inicio = Date.now();
  let origen = "desconocido";
  let rateDate: string | null = null;
  try {
    const cuerpo = await leerCuerpo(req);
    origen = typeof cuerpo.source === "string" ? cuerpo.source.slice(0, 60) : "manual";

    const hoy = await diaDelCatalogo(db);
    let historico = false;
    rateDate = hoy;
    if (cuerpo.target_date !== undefined && cuerpo.target_date !== null && cuerpo.target_date !== "") {
      const objetivo = String(cuerpo.target_date);
      if (!DIA_RE.test(objetivo) || Number.isNaN(Date.parse(`${objetivo}T00:00:00Z`))) {
        throw new ErrorHttp(400, `target_date inválido: ${objetivo.slice(0, 20)}`);
      }
      if (objetivo > hoy) throw new ErrorHttp(400, `target_date ${objetivo} es posterior a hoy (${hoy})`);
      historico = objetivo < hoy;
      rateDate = objetivo;
    }

    // Falla cerrado sin la clave del proveedor: no se escribe nada inventado.
    const appId = Deno.env.get("OPENEXCHANGERATES_API_KEY")?.trim();
    if (!appId) {
      throw new ErrorHttp(
        503,
        "Falta el secreto OPENEXCHANGERATES_API_KEY (Supabase › Edge Functions › Secrets). No se escribió ninguna tasa.",
      );
    }

    const { data: monedas, error: errMonedas } = await db
      .from("currencies")
      .select("code")
      .eq("auto_update", true)
      .eq("is_active", true);
    if (errMonedas) throw new ErrorHttp(500, `No se pudo leer el catálogo de monedas: ${errMonedas.message}`);
    if (!monedas || monedas.length === 0) throw new ErrorHttp(500, "No hay monedas activas con auto_update en el catálogo");

    const datos = await pedirAlProveedor(historico ? `historical/${rateDate}.json` : "latest.json", appId);
    if (datos.base !== MONEDA_BASE) throw new ErrorHttp(502, `El proveedor devolvió base ${datos.base}, se esperaba ${MONEDA_BASE}`);

    const tasas: Record<string, number> = {};
    const sinTasa: string[] = [];
    for (const { code } of monedas as Array<{ code: string }>) {
      const codigo = code.trim();
      if (codigo === MONEDA_BASE) tasas[codigo] = 1;
      else if (typeof datos.rates[codigo] === "number" && datos.rates[codigo] > 0) tasas[codigo] = datos.rates[codigo];
      else sinTasa.push(codigo);
    }

    const fuente = historico ? FUENTE_HISTORICA : FUENTE_DIARIA;
    const { data: resultado, error: errRpc } = await db.rpc("update_global_exchange_rates", {
      rates: tasas,
      source: fuente,
      api_timestamp: datos.timestamp,
      rate_date: rateDate,
      base_currency_code: MONEDA_BASE,
    });
    if (errRpc) throw new ErrorHttp(500, `update_global_exchange_rates falló: ${errRpc.message}`);
    const r = (resultado ?? {}) as Record<string, unknown>;
    if (r.success !== true) throw new ErrorHttp(500, `update_global_exchange_rates: ${String(r.message ?? "sin detalle")}`);

    const salida = {
      success: true,
      rate_date: rateDate,
      source: fuente,
      origen,
      base_currency: MONEDA_BASE,
      timestamp: datos.timestamp,
      inserted_count: Number(r.inserted_count ?? 0),
      updated_count: Number(r.updated_count ?? 0),
      skipped_count: Number(r.skipped_count ?? 0),
      currencies_total: monedas.length,
      sin_tasa_del_proveedor: sinTasa,
      execution_time_ms: Date.now() - inicio,
      message: `Tasas del ${rateDate} guardadas: ${Number(r.inserted_count ?? 0)} nuevas, ${Number(r.updated_count ?? 0)} actualizadas`,
    };
    await registrar(db, true, { operation: "edge_actualizar_tasas", ...salida }, null);
    return json(200, salida);
  } catch (err) {
    const status = err instanceof ErrorHttp ? err.status : 500;
    const mensaje = err instanceof Error ? err.message : String(err);
    console.error(`[tasas] ${status} ${mensaje}`);
    await registrar(db, false, { operation: "edge_actualizar_tasas", origen, rate_date: rateDate, status }, mensaje);
    return json(status, { success: false, error: mensaje, rate_date: rateDate, execution_time_ms: Date.now() - inicio });
  }
});
