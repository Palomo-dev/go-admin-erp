// ============================================================================
// Edge Function: chat-widget — widget de chat público de los sitios web
// ============================================================================
// Reconstruida el 2026-11-03: la versión anterior (v76) nunca estuvo en un
// repositorio y se perdió con el proyecto Supabase borrado. El contrato se
// rehízo desde ADR-001, el HANDOFF del chat (2026-09-29), las migraciones del
// widget y el código del ERP que guarda la configuración del canal.
//
// Pública (`verify_jwt: false`): se valida sola con la `public_key` del canal.
//
//   GET  /chat-widget      → el script que se pega en cualquier página.
//   POST /chat-widget      → API del script. Cuerpo JSON (se envía como
//                            text/plain para no pagar la petición previa de CORS):
//     { accion: 'config',      clave, pagina }
//     { accion: 'sesion',      clave, token?, pagina, referente, dispositivo }
//     { accion: 'identificar', clave, token, nombre?, correo?, telefono?, empresa? }
//     { accion: 'enviar',      clave, token, texto, idCliente }
//     { accion: 'sondear',     clave, token, despues }
//
// Reglas que no se negocian:
// - La organización y el canal salen SIEMPRE de `channels.public_key` resuelto
//   aquí, y la conversación de la sesión del token. Nada del cuerpo decide a
//   qué organización se escribe.
// - Service role solo en el servidor; al navegador no sale ninguna clave.
// - El visitante solo inserta `role='customer'`. La respuesta la escribe una
//   persona desde el ERP o `ai-auto-response`, que dispara el trigger
//   `trg_ai_auto_response` al insertar el mensaje (no se llama desde aquí).
// - Límite de tasa: por sesión en la base (`trg_widget_limite_de_tasa`, lee
//   `conversations.metadata.sessionId`) y por IP aquí, con el mismo contador
//   atómico `widget_registrar_uso`.
// - Si el canal tiene dominios permitidos, solo esos (y los sitios GO Admin de
//   la organización) pueden usarlo.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore: import por URL (se resuelve en el runtime de Supabase)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dentroDeHorarioLaboral, type HorarioSemanal } from "../_shared/ai-chat/politicaRespuesta.ts";
import {
  MAXIMO_TEXTO_MENSAJE,
  clavePublicaValida,
  hostsDeLaOrganizacion,
  limpiarTexto,
  mensajeParaVisitante,
  normalizarConfiguracion,
  origenPermitido,
  partirNombre,
  relojDeLaZona,
  tipoDispositivo,
  tokenValido,
  urlSegura,
  validarDatosVisitante,
  type ConfiguracionPublica,
  type FilaMensaje,
} from "../_shared/chat-widget/reglas.ts";
import { iniciarWidgetGoChat } from "./cliente.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const API = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/chat-widget`;

/** Límites por IP y canal, por hora. El de la sesión vive en la base (100/h). */
const SESIONES_POR_IP_HORA = 30;
const MENSAJES_POR_IP_HORA = 300;
const DURACION_SESION_DIAS = 30;
const MAXIMO_CUERPO = 16 * 1024;
const TTL_CANAL_MS = 60_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

// ---------------------------------------------------------------------------
// Script
// ---------------------------------------------------------------------------

const SCRIPT = `/*! GO Chat · widget de chat del sitio web */\n(${iniciarWidgetGoChat.toString()})(window, ${JSON.stringify(API)});\n`;

function servirScript(): Response {
  return new Response(SCRIPT, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const codificador = new TextEncoder();

function aHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** El token que guarda el navegador nunca se guarda en claro: en la base va su SHA-256. */
async function hashToken(token: string): Promise<string> {
  return aHex(await crypto.subtle.digest("SHA-256", codificador.encode(`gochat:${token}`)));
}

let claveHmac: CryptoKey | null = null;
/** IP seudonimizada (HMAC con un secreto del servidor). La IP en claro no se guarda. */
async function hashIp(ip: string): Promise<string> {
  if (!claveHmac) {
    claveHmac = await crypto.subtle.importKey("raw", codificador.encode(`gochat-ip:${serviceKey}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }
  return aHex(await crypto.subtle.sign("HMAC", claveHmac, codificador.encode(ip))).slice(0, 32);
}

function nuevoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function ipDe(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  return (req.headers.get("cf-connecting-ip") || xff.split(",")[0] || req.headers.get("x-real-ip") || "").trim() || "desconocida";
}

function enMinutos(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// Canal (cacheado por instancia: el sondeo no relee la configuración cada vez)
// ---------------------------------------------------------------------------

interface Canal {
  id: string;
  organizationId: number;
  aiMode: string;
  dominios: unknown[];
  hostsPropios: string[];
  config: ConfiguracionPublica;
  horario: HorarioSemanal | null;
  zonaHoraria: string;
  iaActiva: boolean;
  moneda: string | null;
  negocio: string;
}

const cacheCanales = new Map<string, { canal: Canal | null; vence: number }>();

async function cargarCanal(clave: string): Promise<Canal | null> {
  const cache = cacheCanales.get(clave);
  if (cache && cache.vence > Date.now()) return cache.canal;

  const { data: ch, error } = await supabase
    .from("channels")
    .select("id, organization_id, type, status, ai_mode, business_hours")
    .eq("public_key", clave)
    .eq("type", "website")
    .maybeSingle();
  if (error) throw error;

  let canal: Canal | null = null;
  if (ch && ch.status === "active") {
    const org = ch.organization_id as number;
    const [ajustes, organizacion, dominios, ia, moneda] = await Promise.all([
      supabase.from("channel_website_settings").select("allowed_domains, brand_config, welcome_message, collect_identity").eq("channel_id", ch.id).maybeSingle(),
      supabase.from("organizations").select("name, subdomain, timezone, logo_url").eq("id", org).maybeSingle(),
      supabase.from("organization_domains").select("host").eq("organization_id", org).eq("is_active", true).limit(50),
      supabase.from("ai_settings").select("is_active, auto_response_enabled").eq("organization_id", org).maybeSingle(),
      supabase.from("organization_currencies").select("currency_code").eq("organization_id", org).eq("is_base", true).maybeSingle(),
    ]);
    const s = ajustes.data ?? {};
    const o = organizacion.data ?? {};
    const iaFila = ia.data as { is_active?: boolean; auto_response_enabled?: boolean | null } | null;
    canal = {
      id: ch.id,
      organizationId: org,
      aiMode: ch.ai_mode,
      dominios: Array.isArray(s.allowed_domains) ? s.allowed_domains : [],
      hostsPropios: hostsDeLaOrganizacion(o.subdomain, (dominios.data ?? []).map((d: { host: string }) => d.host)),
      config: normalizarConfiguracion(s.brand_config, s.welcome_message, s.collect_identity, o.logo_url),
      horario: ch.business_hours && typeof ch.business_hours === "object" ? ch.business_hours as HorarioSemanal : null,
      zonaHoraria: o.timezone || "America/Bogota",
      // Misma condición que `trigger_ai_auto_response`: canal no manual e IA activa con respuesta automática.
      iaActiva: ch.ai_mode !== "manual" && iaFila?.is_active === true && iaFila?.auto_response_enabled !== false,
      moneda: typeof moneda.data?.currency_code === "string" ? moneda.data.currency_code.trim() : null,
      negocio: limpiarTexto(o.name, 80),
    };
  }
  cacheCanales.set(clave, { canal, vence: Date.now() + (canal ? TTL_CANAL_MS : 15_000) });
  if (cacheCanales.size > 2000) cacheCanales.clear();
  return canal;
}

function configPublica(c: Canal) {
  return {
    ...c.config,
    enLinea: dentroDeHorarioLaboral(c.horario, relojDeLaZona(new Date(), c.zonaHoraria)),
    ia: c.iaActiva,
    moneda: c.moneda,
    zonaHoraria: c.zonaHoraria,
    negocio: c.negocio,
  };
}

// ---------------------------------------------------------------------------
// Sesión, cliente y conversación
// ---------------------------------------------------------------------------

interface Sesion {
  id: string;
  anon_id: string;
  customer_id: string | null;
  last_seen_at: string;
  expires_at: string;
}

async function sesionDelToken(canal: Canal, token: unknown): Promise<Sesion | null> {
  if (!tokenValido(token)) return null;
  const { data } = await supabase
    .from("widget_sessions")
    .select("id, anon_id, customer_id, last_seen_at, expires_at")
    .eq("session_token", await hashToken(token))
    .eq("channel_id", canal.id)
    .eq("organization_id", canal.organizationId)
    .maybeSingle();
  if (!data || Date.parse(data.expires_at) < Date.now()) return null;
  return data as Sesion;
}

/** ¿Cabe una petición más de esta IP? Mismo contador atómico que usa la base para la sesión. */
async function cabePorIp(canal: Canal, tipo: "sesion" | "mensaje", ipHash: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("widget_registrar_uso", {
    p_channel: canal.id,
    p_session: `ip-${tipo}:${ipHash}`,
    p_limite: tipo === "sesion" ? SESIONES_POR_IP_HORA : MENSAJES_POR_IP_HORA,
  });
  if (error) {
    // Igual que el trigger: un fallo del contador no corta el chat de un cliente legítimo.
    console.error("[chat-widget] widget_registrar_uso", error.message);
    return true;
  }
  return data !== false;
}

/** Cliente del CRM que representa al visitante. Se crea con el primer mensaje o al identificarse. */
async function asegurarCliente(canal: Canal, sesion: Sesion): Promise<string> {
  if (sesion.customer_id) {
    const { data } = await supabase.from("customers").select("id").eq("id", sesion.customer_id).eq("organization_id", canal.organizationId).maybeSingle();
    if (data) return data.id;
  }
  // Correo ficticio `visitor_*@widget.local`: lo reconocen `esCorreoDelWidget`
  // (ai-auto-response) y el perfil del cliente en la bandeja, que nunca lo usan
  // para identificar a nadie. Es único por organización (índice
  // unique_customer_email_per_org) porque lleva el anon_id.
  const correo = `visitor_${sesion.anon_id.replace(/-/g, "")}@widget.local`;
  const { data: existente } = await supabase.from("customers").select("id").eq("organization_id", canal.organizationId).eq("email", correo).maybeSingle();
  let id = existente?.id as string | undefined;
  if (!id) {
    const { data, error } = await supabase
      .from("customers")
      .insert({
        organization_id: canal.organizationId,
        email: correo,
        first_name: "Visitante",
        last_name: "web",
        metadata: { source: "widget", anon_id: sesion.anon_id, channel_id: canal.id },
      })
      .select("id")
      .single();
    if (error) throw error;
    id = data.id as string;
  }
  await supabase.from("widget_sessions").update({ customer_id: id }).eq("id", sesion.id);
  sesion.customer_id = id;
  return id;
}

interface Conversacion { id: string; status: string }

async function conversacionActual(canal: Canal, sesion: Sesion): Promise<Conversacion | null> {
  const { data } = await supabase
    .from("conversations")
    .select("id, status")
    .eq("organization_id", canal.organizationId)
    .eq("channel_id", canal.id)
    .eq("metadata->>sessionId", sesion.anon_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Conversacion | null) ?? null;
}

async function abrirConversacion(canal: Canal, sesion: Sesion, clienteId: string, pagina: string | null): Promise<Conversacion> {
  const actual = await conversacionActual(canal, sesion);
  if (actual && (actual.status === "open" || actual.status === "pending")) return actual;
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      organization_id: canal.organizationId,
      channel_id: canal.id,
      customer_id: clienteId,
      status: "open",
      // `sessionId` lo lee `fn_widget_limite_de_tasa` para el límite por visitante.
      metadata: { source: "widget", sessionId: sesion.anon_id, widget_session_id: sesion.id, pagina_inicio: pagina },
    })
    .select("id, status")
    .single();
  if (error) throw error;
  return data as Conversacion;
}

const COLUMNAS_MENSAJE = "id, role, direction, content_type, content, created_at, metadata";

async function mensajesDe(conversacionId: string, despues: string | null, limite = 50) {
  let q = supabase.from("messages").select(COLUMNAS_MENSAJE).eq("conversation_id", conversacionId);
  if (despues) {
    q = q.gt("created_at", despues).order("created_at", { ascending: true }).limit(limite);
    const { data } = await q;
    return ((data ?? []) as FilaMensaje[]).map(mensajeParaVisitante).filter(Boolean);
  }
  const { data } = await q.order("created_at", { ascending: false }).limit(limite);
  return ((data ?? []) as FilaMensaje[]).reverse().map(mensajeParaVisitante).filter(Boolean);
}

/** ¿Hay una respuesta automática en curso para esta conversación? (indicador «escribiendo»). */
async function iaEscribiendo(canal: Canal, conversacionId: string): Promise<boolean> {
  if (!canal.iaActiva) return false;
  const { data } = await supabase
    .from("ai_jobs")
    .select("id")
    .eq("organization_id", canal.organizationId)
    .eq("conversation_id", conversacionId)
    .eq("status", "processing")
    .gt("created_at", enMinutos(-2))
    .limit(1);
  return (data ?? []).length > 0;
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

type Cuerpo = Record<string, unknown>;

async function accionSesion(canal: Canal, c: Cuerpo, req: Request): Promise<Response> {
  const pagina = urlSegura(c.pagina)?.slice(0, 500) ?? null;
  let sesion = await sesionDelToken(canal, c.token);
  let token = typeof c.token === "string" ? c.token : "";

  if (sesion) {
    await supabase
      .from("widget_sessions")
      .update({ last_seen_at: new Date().toISOString(), is_active: true, current_page: pagina, expires_at: enMinutos(DURACION_SESION_DIAS * 1440) })
      .eq("id", sesion.id);
  } else {
    const ipHash = await hashIp(ipDe(req));
    if (!(await cabePorIp(canal, "sesion", ipHash))) return json({ error: "limite" }, 429);
    token = nuevoToken();
    const { data, error } = await supabase
      .from("widget_sessions")
      .insert({
        organization_id: canal.organizationId,
        channel_id: canal.id,
        anon_id: crypto.randomUUID(),
        session_token: await hashToken(token),
        ip_hash: ipHash,
        user_agent: limpiarTexto(req.headers.get("user-agent"), 300) || null,
        referrer: urlSegura(c.referente)?.slice(0, 500) ?? null,
        current_page: pagina,
        device_type: tipoDispositivo(c.dispositivo),
        is_active: true,
        expires_at: enMinutos(DURACION_SESION_DIAS * 1440),
      })
      .select("id, anon_id, customer_id, last_seen_at, expires_at")
      .single();
    if (error) throw error;
    sesion = data as Sesion;
  }

  const conv = await conversacionActual(canal, sesion);
  let identificado = false;
  if (sesion.customer_id) {
    const { data: cli } = await supabase.from("customers").select("metadata").eq("id", sesion.customer_id).eq("organization_id", canal.organizationId).maybeSingle();
    identificado = !!(cli?.metadata as Record<string, unknown> | null)?.widget_identificado_en;
  }
  return json({
    token,
    identificado,
    conversacion: !!conv,
    mensajes: conv ? await mensajesDe(conv.id, null) : [],
    escribiendo: conv ? await iaEscribiendo(canal, conv.id) : false,
  });
}

async function accionIdentificar(canal: Canal, c: Cuerpo): Promise<Response> {
  const sesion = await sesionDelToken(canal, c.token);
  if (!sesion) return json({ error: "sesion" }, 401);
  const v = validarDatosVisitante(c, canal.config.campos);
  if (!v.ok) return json({ error: "datos", errores: v.errores }, 422);

  const clienteId = await asegurarCliente(canal, sesion);
  const { data: cli } = await supabase.from("customers").select("metadata").eq("id", clienteId).eq("organization_id", canal.organizationId).single();
  const metadata: Record<string, unknown> = { ...((cli?.metadata as Record<string, unknown>) ?? {}), widget_identificado_en: new Date().toISOString() };
  const cambios: Record<string, unknown> = {};
  if (v.datos.nombre) Object.assign(cambios, partirNombre(v.datos.nombre));
  if (v.datos.telefono) cambios.phone = v.datos.telefono;
  if (v.datos.empresa) cambios.company_name = v.datos.empresa;
  if (v.datos.correo) {
    // El correo real no reemplaza al ficticio (es la llave única del visitante):
    // va a `metadata.real_email`, que es lo que leen el perfil de la bandeja y
    // `ai-auto-response`. Si ya existe un cliente con ese correo en ESTA
    // organización, se enlaza como `linked_customer_id` (mismo contrato).
    metadata.real_email = v.datos.correo;
    const { data: real } = await supabase.from("customers").select("id").eq("organization_id", canal.organizationId).eq("email", v.datos.correo).maybeSingle();
    if (real && real.id !== clienteId) metadata.linked_customer_id = real.id;
  }
  cambios.metadata = metadata;
  const { error } = await supabase.from("customers").update(cambios).eq("id", clienteId).eq("organization_id", canal.organizationId);
  if (error) throw error;
  return json({ ok: true });
}

async function accionEnviar(canal: Canal, c: Cuerpo, req: Request): Promise<Response> {
  const sesion = await sesionDelToken(canal, c.token);
  if (!sesion) return json({ error: "sesion" }, 401);
  const texto = limpiarTexto(c.texto, MAXIMO_TEXTO_MENSAJE);
  if (!texto) return json({ error: "vacio" }, 400);
  const idCliente = typeof c.idCliente === "string" && /^[a-f0-9]{8,64}$/.test(c.idCliente) ? c.idCliente : null;

  if (!(await cabePorIp(canal, "mensaje", await hashIp(ipDe(req))))) return json({ error: "limite" }, 429);

  const clienteId = await asegurarCliente(canal, sesion);
  const { data: cli } = await supabase.from("customers").select("metadata").eq("id", clienteId).eq("organization_id", canal.organizationId).maybeSingle();
  const correoReal = ((cli?.metadata as Record<string, unknown> | null)?.real_email as string | undefined) ?? null;
  const { data: ses } = await supabase.from("widget_sessions").select("current_page").eq("id", sesion.id).maybeSingle();
  const pagina = (ses?.current_page as string | null) ?? null;
  const conv = await abrirConversacion(canal, sesion, clienteId, pagina);

  // Reintento del navegador tras un corte de red: no se duplica el mensaje.
  if (idCliente) {
    const { data: previo } = await supabase
      .from("messages")
      .select(COLUMNAS_MENSAJE)
      .eq("conversation_id", conv.id)
      .eq("metadata->>client_id", idCliente)
      .gt("created_at", enMinutos(-30))
      .limit(1)
      .maybeSingle();
    if (previo) return json({ mensaje: mensajeParaVisitante(previo as FilaMensaje) });
  }

  const { data: msg, error } = await supabase
    .from("messages")
    .insert({
      organization_id: canal.organizationId,
      conversation_id: conv.id,
      channel_id: canal.id,
      direction: "inbound",
      role: "customer",
      sender_customer_id: clienteId,
      content_type: "text",
      content: texto,
      // `fn_update_customer_channel_identity` lee visitor_id/session_id/email del payload.
      payload: { visitor_id: sesion.anon_id, session_id: sesion.anon_id, ...(correoReal ? { email: correoReal } : {}) },
      metadata: { source: "widget", client_id: idCliente, page: pagina },
    })
    .select(COLUMNAS_MENSAJE)
    .single();
  if (error) {
    if (String(error.message || "").includes("WIDGET_RATE_LIMIT")) return json({ error: "limite" }, 429);
    throw error;
  }
  await supabase.from("widget_sessions").update({ last_seen_at: new Date().toISOString(), is_active: true }).eq("id", sesion.id);
  return json({ mensaje: mensajeParaVisitante(msg as FilaMensaje) });
}

async function accionSondear(canal: Canal, c: Cuerpo): Promise<Response> {
  const sesion = await sesionDelToken(canal, c.token);
  if (!sesion) return json({ error: "sesion" }, 401);
  const despues = typeof c.despues === "string" && !Number.isNaN(Date.parse(c.despues)) ? c.despues : null;
  const conv = await conversacionActual(canal, sesion);
  // Latido: «en línea» en la pantalla de sesiones del ERP (umbral de 3 min).
  // Se escribe como mucho una vez por minuto para no convertir el sondeo en escrituras.
  if (Date.parse(sesion.last_seen_at) < Date.now() - 60_000) {
    await supabase.from("widget_sessions").update({ last_seen_at: new Date().toISOString(), is_active: true }).eq("id", sesion.id);
  }
  if (!conv) return json({ mensajes: [], escribiendo: false });
  const [mensajes, escribiendo] = await Promise.all([mensajesDe(conv.id, despues), iaEscribiendo(canal, conv.id)]);
  return json({ mensajes, escribiendo, estado: conv.status });
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method === "GET" || req.method === "HEAD") return servirScript();
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  let accion = "";
  try {
    const crudo = await req.text();
    if (crudo.length > MAXIMO_CUERPO) return json({ error: "grande" }, 413);
    let c: Cuerpo;
    try {
      c = JSON.parse(crudo);
    } catch {
      return json({ error: "json" }, 400);
    }
    if (!c || typeof c !== "object") return json({ error: "json" }, 400);
    accion = typeof c.accion === "string" ? c.accion : "";
    if (!clavePublicaValida(c.clave)) return json({ error: "clave" }, 400);

    const canal = await cargarCanal(c.clave);
    if (!canal) return json({ error: "canal_no_disponible" }, 404);
    if (!origenPermitido(req.headers.get("origin"), canal.dominios, canal.hostsPropios)) {
      return json({ error: "dominio_no_permitido" }, 403);
    }

    switch (accion) {
      case "config":
        return json({ config: configPublica(canal) });
      case "sesion":
        return await accionSesion(canal, c, req);
      case "identificar":
        return await accionIdentificar(canal, c);
      case "enviar":
        return await accionEnviar(canal, c, req);
      case "sondear":
        return await accionSondear(canal, c);
      default:
        return json({ error: "accion" }, 400);
    }
  } catch (e) {
    // Al visitante no se le devuelve el detalle: puede llevar nombres de tablas o datos.
    console.error("[chat-widget] error", { accion, mensaje: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
    return json({ error: "interno" }, 500);
  }
});
