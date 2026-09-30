/**
 * Importación de leads desde archivo (CRM › Leads › Importar). SOLO SERVIDOR.
 *
 * Dos operaciones sobre las filas que manda el asistente (ya mapeadas a campos):
 *  - `validarImportacion`: normaliza, valida y decide qué pasaría con cada fila
 *    SIN escribir nada (vista previa).
 *  - `importarBloque`: vuelve a hacer lo mismo (nunca se fía de la validación
 *    del navegador) y crea cada lead con `createLeadWithCustomer`, el MISMO alta
 *    de `POST /api/crm/leads` (regla dura 7). CRM ola 1 (D2): el lead ES la
 *    ficha de cliente (`lifecycle_stage='lead'`, `lead_source='import'`,
 *    responsable por asignación automática, score desde el ICP con la
 *    prioridad del archivo como banda de respaldo, valor anual en
 *    `metadata.lead.valor_estimado`); ya no se crea `opportunities` 'lead'.
 *    La ficha nueva se revierte si el alta no cuaja.
 *
 * Decisión por fila (deduplicación ANTES de crear, por organización):
 *  - `error`  : sin nombre o sin teléfono/correo válidos.
 *  - `omitir` : repetida en el archivo (`duplicado_archivo`), ya importada en el
 *               mismo lote (`ya_importado`, idempotencia), o su cliente ya es un
 *               lead activo —ficha en etapa lead con origen y sin descartar, o
 *               con una oportunidad 'lead' heredada abierta— (`lead_abierto`).
 *  - `ligar`  : el cliente existe (teléfono, NIT o correo) y no es lead activo
 *               → se marca como lead: origen y responsable solo si faltan y
 *               `metadata.lead`; ni `do_not_call`, ni etiquetas, ni el resto de
 *               la metadata se tocan.
 *  - `crear`  : ficha de cliente nueva en etapa lead.
 *
 * Cumplimiento (Registro de Números Excluidos, CRC): TODA fila escrita queda con
 * `metadata.importacion.rne = 'pendiente'` (o `'excluido'` si el número ya está
 * en `crm_excluded_numbers`) y la etiqueta `rne:pendiente`. Ver IMPORTAR-LEADS.md.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createLeadWithCustomer } from './leadCreateService';
import { buscarCandidatos, clientesConLeadAbierto, monedasDeOrganizacion, numerosExcluidos, verticalesActivas } from './leadsImportLookup';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import { convertAmount, ConversionError } from '@/lib/ai/assistant/orgCurrency';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { todayInTz } from '@/lib/utils/dateDisplay';
import { indicativoDe } from '@/lib/utils/telefono';
import { clienteCoincidente } from '@/lib/crm/importacionLeads/dedupe';
import { altaConClienteExistente, altaConClienteNuevo, verticalParaSector, type ContextoAltaLead, type VerticalRef } from '@/lib/crm/importacionLeads/mapeo';
import { digitosDe } from '@/lib/crm/importacionLeads/normalizacion';
import { duplicadosEnArchivo, validarFilaLead } from '@/lib/crm/importacionLeads/validacion';
import type {
  ClienteExistenteRef,
  EstadoRneImportacion,
  FilaLeadEntrada,
  FilaLeadNormalizada,
  MensajeImportacion,
  OpcionesImportacionLeads,
  PoliticaMoneda,
  ResultadoFilaLead,
  ResumenImportacionLeads,
} from '@/lib/crm/importacionLeads/tipos';

export type { PoliticaMoneda } from '@/lib/crm/importacionLeads/tipos';

/**
 * Permiso de crear leads (`permissions.code`, módulo CRM; hoy concedido al rol 2
 * y asignable por cargo). La ruta lo resuelve en el servidor con
 * `hasOrgAdminOrPermission` (`check_user_permission` con usuario y organización
 * DE LA SESIÓN; super admin y roles 1/2 pasan sin consulta).
 */
export { LEADS_CREATE_PERMISSION } from './leadCreateService';

export interface LeadsImportContext {
  organizationId: number;
  userId: string;
  supabase: SupabaseClient;
}

/**
 * Moneda del valor: si la organización maneja la moneda del archivo (p. ej. USD)
 * se escribe tal cual; si no, se convierte a su moneda base con la tasa del día
 * (`currency_rates`, la misma política del GO Assistant) en la zona de la
 * organización. Sin tasa, importe 0 y el valor original en metadata.
 */
export async function resolverPoliticaMoneda(ctx: LeadsImportContext, monedaValor: string | null): Promise<PoliticaMoneda> {
  const origen = (monedaValor ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(origen)) return { moneda: null, tasa: 1, origen: null, fechaTasa: null, sinTasa: false };
  const [asignadas, base] = await Promise.all([monedasDeOrganizacion(ctx), resolveOrgCurrency(ctx.supabase, ctx.organizationId)]);
  if (asignadas.has(origen) || base.code === origen) return { moneda: origen, tasa: 1, origen: null, fechaTasa: null, sinTasa: false };
  try {
    const zona = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
    const c = await convertAmount(ctx.supabase, 1, origen, base.code, todayInTz(zona));
    return { moneda: base.code, tasa: c.rate, origen, fechaTasa: c.rateDate, sinTasa: false };
  } catch (e) {
    if (!(e instanceof ConversionError)) throw e;
    return { moneda: base.code, tasa: 0, origen, fechaTasa: null, sinTasa: true };
  }
}

interface FilaPlaneada {
  resultado: ResultadoFilaLead;
  datos: FilaLeadNormalizada | null;
  rne: EstadoRneImportacion;
}

interface Planificacion {
  filas: FilaPlaneada[];
  politica: PoliticaMoneda;
  verticales: VerticalRef[];
  zona: string | null;
}

const aviso = (codigo: string, params?: Record<string, string | number>): MensajeImportacion => (params ? { codigo, params } : { codigo });

/** Normaliza, valida y deduplica (archivo + base). No escribe nada. */
async function planificar(ctx: LeadsImportContext, entradas: readonly FilaLeadEntrada[], opciones: OpcionesImportacionLeads): Promise<Planificacion> {
  const validadas = entradas.map((e) => validarFilaLead(e, opciones));
  const duplicadas = duplicadosEnArchivo(validadas);
  const conDatos = validadas.filter((v) => v.datos && !duplicadas.has(v.fila)).map((v) => v.datos as FilaLeadNormalizada);

  const indicativo = indicativoDe(opciones.pais || 'CO').replace(/\D/g, '') || '57';
  const [candidatos, excluidos, politica, verticales, zona] = await Promise.all([
    buscarCandidatos(ctx, {
      telefonos: conDatos.flatMap((d) => (d.telefono ? [digitosDe(d.telefono)] : [])),
      nits: conDatos.flatMap((d) => (d.nit ? [d.nit] : [])),
      correos: conDatos.flatMap((d) => (d.correo ? [d.correo] : [])),
      idsExternos: conDatos.flatMap((d) => (d.idExterno ? [d.idExterno] : [])),
      lote: opciones.lote,
    }),
    numerosExcluidos(ctx, conDatos.flatMap((d) => (d.telefono ? [d.telefono] : []))),
    resolverPoliticaMoneda(ctx, opciones.monedaValor),
    verticalesActivas(ctx),
    getOrganizationTimezone(ctx.organizationId, ctx.supabase),
  ]);

  const coincidencias = new Map<number, ClienteExistenteRef>();
  for (const d of conDatos) {
    const c = clienteCoincidente(d, candidatos, opciones.lote, indicativo);
    if (c) coincidencias.set(d.fila, c);
  }
  const abiertos = await clientesConLeadAbierto(ctx, Array.from(coincidencias.values()).map((c) => c.id));

  const filas = validadas.map((v): FilaPlaneada => {
    const d = v.datos;
    const base: ResultadoFilaLead = { fila: v.fila, nombre: d?.nombre ?? '', telefono: d?.telefono ?? null, accion: 'error', errores: v.errores, avisos: [...v.avisos] };
    if (!d) return { resultado: base, datos: null, rne: 'pendiente' };

    const rne: EstadoRneImportacion = d.telefono && excluidos?.has(d.telefono) ? 'excluido' : 'pendiente';
    if (rne === 'excluido') base.avisos.push(aviso('rne_excluido'));
    if (d.valor !== null && politica.sinTasa) base.avisos.push(aviso('sin_tasa', { moneda: politica.origen ?? '' }));

    const previa = duplicadas.get(v.fila);
    if (previa !== undefined) return { resultado: { ...base, accion: 'omitir', motivo: 'duplicado_archivo', duplicadaDe: previa }, datos: d, rne };

    const cliente = coincidencias.get(v.fila);
    if (cliente?.por === 'id_externo') return { resultado: { ...base, accion: 'omitir', motivo: 'ya_importado', cliente }, datos: d, rne };
    if (cliente && abiertos.has(cliente.id)) return { resultado: { ...base, accion: 'omitir', motivo: 'lead_abierto', cliente }, datos: d, rne };
    if (cliente) return { resultado: { ...base, accion: 'ligar', cliente }, datos: d, rne };
    return { resultado: { ...base, accion: 'crear' }, datos: d, rne };
  });

  return { filas, politica, verticales, zona };
}

export function resumir(resultados: readonly ResultadoFilaLead[], rnes: readonly EstadoRneImportacion[] = []): ResumenImportacionLeads {
  const r: ResumenImportacionLeads = { total: resultados.length, crear: 0, ligar: 0, omitir: 0, error: 0, rnePendiente: 0, rneExcluido: 0 };
  resultados.forEach((x, i) => {
    r[x.accion] += 1;
    if (x.accion === 'crear' || x.accion === 'ligar') {
      if (rnes[i] === 'excluido') r.rneExcluido += 1;
      else r.rnePendiente += 1;
    }
  });
  return r;
}

/** Vista previa: qué pasaría con cada fila. No escribe nada. */
export async function validarImportacion(
  ctx: LeadsImportContext,
  entradas: readonly FilaLeadEntrada[],
  opciones: OpcionesImportacionLeads,
): Promise<{ resultados: ResultadoFilaLead[]; resumen: ResumenImportacionLeads; moneda: PoliticaMoneda }> {
  const plan = await planificar(ctx, entradas, opciones);
  const resultados = plan.filas.map((f) => f.resultado);
  return { resultados, resumen: resumir(resultados, plan.filas.map((f) => f.rne)), moneda: plan.politica };
}

function contextoAlta(d: FilaLeadNormalizada, rne: EstadoRneImportacion, plan: Planificacion, ctx: LeadsImportContext, opciones: OpcionesImportacionLeads, ahora: string): ContextoAltaLead {
  const p = plan.politica;
  const convertido = d.valor !== null && p.origen !== null;
  const amount = d.valor === null ? null : p.sinTasa ? 0 : Math.round(d.valor * p.tasa * 100) / 100;
  return {
    lote: opciones.lote,
    archivo: opciones.archivo ?? null,
    tipoCliente: opciones.tipoCliente,
    userId: ctx.userId,
    importadoEn: ahora,
    verticalId: verticalParaSector(d.sector, d.subsector, plan.verticales),
    amount,
    currency: d.valor === null ? null : p.moneda,
    valorOriginal: convertido
      ? { monto: d.valor as number, moneda: p.origen, ...(p.sinTasa ? {} : { tasa: p.tasa, fecha_tasa: p.fechaTasa ?? undefined }) }
      : d.valor !== null
        ? { monto: d.valor, moneda: p.moneda }
        : null,
    rne,
    zonaOrganizacion: plan.zona,
  };
}

/**
 * Importa un bloque de filas. Cada fila es independiente: el fallo de una no
 * deshace las demás (queda como `error` en el resultado). Idempotente: un
 * reintento del mismo bloque encuentra los clientes ya creados (id externo del
 * lote, teléfono, NIT o correo) y los omite.
 */
export async function importarBloque(
  ctx: LeadsImportContext,
  entradas: readonly FilaLeadEntrada[],
  opciones: OpcionesImportacionLeads,
): Promise<{ resultados: ResultadoFilaLead[]; resumen: ResumenImportacionLeads }> {
  const plan = await planificar(ctx, entradas, opciones);
  const ahora = new Date().toISOString();
  const resultados: ResultadoFilaLead[] = [];

  for (const f of plan.filas) {
    const r = f.resultado;
    if (!f.datos || (r.accion !== 'crear' && r.accion !== 'ligar')) {
      resultados.push(r);
      continue;
    }
    const alta = contextoAlta(f.datos, f.rne, plan, ctx, opciones, ahora);
    const { body, extras } = r.accion === 'ligar' && r.cliente ? altaConClienteExistente(f.datos, r.cliente.id, alta) : altaConClienteNuevo(f.datos, alta);
    try {
      const res = await createLeadWithCustomer({ organizationId: ctx.organizationId, userId: ctx.userId, supabase: ctx.supabase }, body, extras);
      if (res.status === 201) {
        // D2: el lead es la ficha; `leadId` = id del cliente (no hay oportunidad).
        resultados.push({ ...r, customerId: res.customer_id, leadId: res.customer_id });
      } else if (res.status === 409) {
        // Otra petición creó la ficha entre la lectura y el alta (correo único).
        resultados.push({ ...r, accion: 'omitir', motivo: 'duplicado_bd', avisos: [...r.avisos, aviso('conflicto', { detalle: res.error })] });
      } else {
        resultados.push({ ...r, accion: 'error', errores: [...r.errores, aviso('alta_rechazada', { detalle: res.error })] });
      }
    } catch (e) {
      const detalle = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
      console.error('[leadsImport] fila %s: %s', r.fila, detalle);
      resultados.push({ ...r, accion: 'error', errores: [...r.errores, aviso('error_bd', { detalle: detalle.slice(0, 200) })] });
    }
  }
  return { resultados, resumen: resumir(resultados, plan.filas.map((f) => f.rne)) };
}
