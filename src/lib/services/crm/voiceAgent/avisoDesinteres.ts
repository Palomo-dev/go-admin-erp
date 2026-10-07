/**
 * Aviso INMEDIATO al vendedor cuando el agente de voz marca perdida una
 * oportunidad o le deja la tarea de decidir (decisión del dueño, 2026-10-07).
 *
 * Mecanismo: el sistema de avisos del ERP, el mismo de `POST …/lose`
 * (`member_notices` + correo). Se escribe con `fn_avisos_miembro_poner` (la
 * misma función de los triggers: comprueba que el destinatario sea miembro
 * activo y deduplica por llave) y se despacha en el momento con
 * `despacharAvisosPendientes` (`avisos/despachoAvisos.ts`, sin next/server,
 * para que corra también en el ws-server). La campana lo recibe por Realtime.
 * Los triggers omiten su aviso genérico para estos casos (migración
 * 20261007210403): un solo aviso, con contenido útil.
 *
 * Destinatario: el responsable de la oportunidad (`salesperson_id`); si no
 * tiene, quien la creó (`created_by`). Sin ninguno, no hay aviso y se registra.
 *
 * Enlaces: el sistema de avisos lleva UN enlace por aviso (campana y correo).
 * Va a la oportunidad con `?llamada=<calls.id>`: la oportunidad muestra la
 * franja del agente con «Escuchar la llamada» (Llamadas `?call=`) y «Reabrir».
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { despacharAvisosPendientes } from '@/lib/services/avisos/despachoAvisos';
import { contextoMoneda, formatMoneda } from '@/lib/utils/moneda';
import type { RazonDesinteres } from './desinteresConfig';

export type TipoAvisoDesinteres = 'perdida' | 'tarea';

export interface DatosAvisoDesinteres {
  tipo: TipoAvisoDesinteres;
  oportunidad: { id: string; name: string };
  /** Motivo de pérdida tal como queda en `loss_reason`. */
  motivo: string;
  /** Resumen breve de la llamada (duración y lo que dijo el cliente). */
  resumen: string | null;
  /** `calls.id` de la llamada (para el enlace a Llamadas). */
  callId: string | null;
  /** Por qué no se cerró (solo en `tarea`). */
  razones?: RazonDesinteres[];
  /** Valor comparado contra la excepción, si aplica. */
  valor?: { monto: number; moneda: string } | null;
  umbral?: { monto: number; moneda: string } | null;
}

export interface ContenidoAvisoDesinteres {
  titulo: string;
  cuerpo: string;
  href: string;
}

function dinero(v: { monto: number; moneda: string }): string {
  return formatMoneda(v.monto, contextoMoneda(v.moneda));
}

function porQueNoSeCerro(d: DatosAvisoDesinteres): string {
  const r = new Set(d.razones ?? []);
  if (r.has('excepcion_valor') && d.valor && d.umbral) {
    return `No se cerró porque vale ${dinero(d.valor)} (igual o más que ${dinero(d.umbral)}).`;
  }
  if (r.has('excepcion_valor_sin_tasa')) return 'No se cerró: no hay tasa de cambio para comparar su valor con el monto configurado.';
  if (r.has('excepcion_etapa')) return 'No se cerró porque está en una etapa avanzada del pipeline.';
  if (r.has('politica_etapa')) return 'No se cerró porque la etapa del agente está en «Sugerir».';
  if (r.has('modo_tarea')) return 'Tu organización pidió que el agente no cierre oportunidades: decide tú.';
  return 'No se pudo cerrar automáticamente: decide tú.';
}

/** Contenido del aviso. Sin datos personales del cliente más allá del nombre de la oportunidad. */
export function contenidoAvisoDesinteres(d: DatosAvisoDesinteres): ContenidoAvisoDesinteres {
  const nombre = d.oportunidad.name.trim() || 'Sin nombre';
  const resumen = d.resumen ? ` ${d.resumen.replace(/\s+/g, ' ').trim()}` : '';
  const href = `/app/crm/oportunidades/${d.oportunidad.id}${d.callId ? `?llamada=${encodeURIComponent(d.callId)}` : ''}`;
  if (d.tipo === 'perdida') {
    return {
      titulo: `El agente de voz marcó perdida «${nombre}»`,
      cuerpo: `Motivo: ${d.motivo}.${resumen} Abre la oportunidad para escuchar la llamada o reabrirla.`.slice(0, 1000),
      href,
    };
  }
  return {
    titulo: `Decide sobre «${nombre}»: el cliente no tiene interés`,
    cuerpo: `${porQueNoSeCerro(d)} Motivo: ${d.motivo}.${resumen} Abre la oportunidad para escuchar la llamada.`.slice(0, 1000),
    href,
  };
}

/** Duración legible: «1 min 42 s», «35 s». */
export function duracionLegible(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

/**
 * Resumen breve de la llamada para el aviso: duración y la última respuesta
 * del cliente (recortada). Se arma en el runtime, sin otra llamada al modelo.
 */
export function resumenBreveLlamada(
  turnos: ReadonlyArray<{ role: string; content: string }>,
  inicio: Date | null,
  ahora: Date = new Date(),
): string | null {
  const partes: string[] = [];
  if (inicio) partes.push(`Llamada de ${duracionLegible((ahora.getTime() - inicio.getTime()) / 1000)}`);
  const ultimo = [...turnos].reverse().find((t) => t.role === 'user' && t.content.trim());
  if (ultimo) {
    const dicho = ultimo.content.replace(/\s+/g, ' ').trim();
    partes.push(`el cliente dijo: «${dicho.length > 140 ? `${dicho.slice(0, 139)}…` : dicho}»`);
  }
  if (!partes.length) return null;
  const texto = partes.join('; ');
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}.`;
}

export type ResultadoAvisoDesinteres =
  | { enviado: true; avisoId: string | null; destinatario: string }
  | { enviado: false; motivo: 'sin_destinatario' | 'sin_entidad' | 'error'; detalle?: string };

export interface ContextoAvisoDesinteres {
  orgId: number;
  /** Cliente con clave de servicio (ws-server): la organización ya viene del contexto de la llamada. */
  supabase: SupabaseClient;
  /** Llave de idempotencia de la llamada (`voice_agent_calls.id`). */
  llaveLlamada: string;
  responsable: string | null;
  creador: string | null;
  /** Entidad del aviso: la oportunidad (perdida) o la tarea creada (tarea). */
  tareaId?: string | null;
  /** Inyectable en tests. */
  despachar?: (orgId: number, db: SupabaseClient) => Promise<unknown>;
}

export async function avisarVendedorDesinteres(
  ctx: ContextoAvisoDesinteres,
  datos: DatosAvisoDesinteres,
): Promise<ResultadoAvisoDesinteres> {
  const destinatario = ctx.responsable ?? ctx.creador;
  if (!destinatario) {
    console.warn(`[avisoDesinteres] org ${ctx.orgId}, oportunidad ${datos.oportunidad.id}: sin responsable ni creador; no hay a quién avisar`);
    return { enviado: false, motivo: 'sin_destinatario' };
  }
  const esTarea = datos.tipo === 'tarea';
  const entidadId = esTarea ? ctx.tareaId ?? null : datos.oportunidad.id;
  if (!entidadId) return { enviado: false, motivo: 'sin_entidad' };
  const c = contenidoAvisoDesinteres(datos);
  const evento = esTarea ? 'tarea.asignada' : 'oportunidad.perdida';
  try {
    const { data, error } = await ctx.supabase.rpc('fn_avisos_miembro_poner', {
      p_org: ctx.orgId,
      p_recipient: destinatario,
      p_actor: null,
      p_event: evento,
      p_entity_type: esTarea ? 'task' : 'opportunity',
      p_entity_id: entidadId,
      p_title: c.titulo,
      p_body: c.cuerpo,
      p_href: c.href,
      p_key: `${ctx.orgId}:voz.desinteres.${datos.tipo}:${datos.oportunidad.id}:${ctx.llaveLlamada}`,
      p_subject_key: `voz.desinteres:${datos.oportunidad.id}`,
    });
    if (error) throw new Error(error.message);
    // En el momento, también desde el ws-server: no se espera al cron.
    await (ctx.despachar ?? despacharAvisosPendientes)(ctx.orgId, ctx.supabase);
    return { enviado: true, avisoId: (data as string | null) ?? null, destinatario };
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error(`[avisoDesinteres] org ${ctx.orgId}, oportunidad ${datos.oportunidad.id}: ${detalle}`);
    return { enviado: false, motivo: 'error', detalle };
  }
}
