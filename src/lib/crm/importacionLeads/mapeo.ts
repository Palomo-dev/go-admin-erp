/**
 * Fila normalizada → alta de `createLeadWithCustomer` (cuerpo + extras de servidor).
 *
 * Mapeo recomendado (documentado en docs/crm-revenue-os/IMPORTAR-LEADS.md):
 *
 *  customers (ficha NUEVA; una existente no se toca)
 *    customer_type   'company' (o 'person' si se eligió), CHECK person|company
 *    company_name    razón social si viene; si no, el nombre comercial
 *    trade_name      nombre comercial
 *    first/last_name el contacto, si viene (son NULL-ables: no se inventan)
 *    identification  'NIT' + número sin DV + `dv` solo si cuadra con el módulo 11
 *    phone           E.164 · email en minúsculas · address (+ barrio) · city
 *    tags            sector, subsector, prioridad:X, zona:X, lote:X, rne:pendiente + las del archivo
 *    vertical_id     la vertical ACTIVA de la organización que case con el sector
 *    timezone        +57 → America/Bogota (Colombia tiene una sola zona); si no, la de la organización
 *    lifecycle_stage 'lead' (lo pone `resolveLeadCustomer`)
 *    metadata.importacion { lote, id_externo, fila, archivo, importado_en, importado_por, fuentes,
 *                           verificacion, fecha_verificacion, tipo_telefono, web, plan_probable,
 *                           departamento, zona, barrio, horario_contacto, rne, rne_archivo, valor_original }
 *  opportunities (record_type 'lead', status 'open': los fija el servicio)
 *    name            «nombre comercial · ciudad»
 *    amount/currency el valor en su moneda si la organización la maneja; si no, convertido a la base
 *    source          'importacion' (sin CHECK en la base)
 *    icp_band        A/B/C desde la prioridad · vertical_id igual que el cliente
 *    temperature     sin valor: nadie ha hablado aún con el prospecto
 *    metadata.importacion { lote, id_externo, fila, plan_probable, rne }
 */

import type { CreateLeadBody, LeadCreateExtras } from '@/lib/services/crm/leadCreateService';
import { normalizarNombre } from '@/lib/inventario/importacion/texto';
import type { EstadoRneImportacion, FilaLeadNormalizada, TipoClienteImportacion } from './tipos';

/** `opportunities.source` de todo lead importado. */
export const FUENTE_IMPORTACION = 'importacion';

export interface ContextoAltaLead {
  lote: string;
  archivo: string | null;
  tipoCliente: TipoClienteImportacion;
  userId: string;
  /** ISO 8601 del momento de la importación (instante, no día calendario). */
  importadoEn: string;
  verticalId: string | null;
  /** Importe y moneda ya resueltos para la organización (ver `leadsImportService`). */
  amount: number | null;
  currency: string | null;
  valorOriginal: { monto: number; moneda: string | null; tasa?: number; fecha_tasa?: string } | null;
  rne: EstadoRneImportacion;
  /** Zona de la organización (respaldo cuando el teléfono no es colombiano). */
  zonaOrganizacion: string | null;
}

export function nombreDelLead(d: Pick<FilaLeadNormalizada, 'nombre' | 'ciudad'>): string {
  return (d.ciudad ? `${d.nombre} · ${d.ciudad}` : d.nombre).slice(0, 200);
}

export function direccionCompleta(d: Pick<FilaLeadNormalizada, 'direccion' | 'barrio'>): string | null {
  if (d.direccion && d.barrio) return `${d.direccion}, ${d.barrio}`;
  return d.direccion ?? (d.barrio ? d.barrio : null);
}

/** Zona del cliente: Colombia tiene una sola (`America/Bogota`); otro país → la de la organización. */
export function zonaDelCliente(telefono: string | null, zonaOrganizacion: string | null): string | null {
  if (telefono?.startsWith('+57')) return 'America/Bogota';
  return zonaOrganizacion;
}

export function etiquetasDelCliente(d: FilaLeadNormalizada, lote: string, rne: EstadoRneImportacion): string[] {
  const base = [
    d.sector,
    d.subsector,
    d.prioridad ? `prioridad:${d.prioridad}` : null,
    d.zona ? `zona:${d.zona}` : null,
    `lote:${lote}`,
    `rne:${rne}`,
    ...d.etiquetas,
  ];
  const vistas = new Set<string>();
  return base.filter((t): t is string => {
    if (!t) return false;
    const k = t.toLowerCase();
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

const sinVacios = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)));

export function metadataImportacionCliente(d: FilaLeadNormalizada, ctx: ContextoAltaLead): Record<string, unknown> {
  return sinVacios({
    lote: ctx.lote,
    id_externo: d.idExterno,
    fila: d.fila,
    archivo: ctx.archivo,
    importado_en: ctx.importadoEn,
    importado_por: ctx.userId,
    fuentes: d.fuentes,
    verificacion: d.verificacion,
    fecha_verificacion: d.fechaVerificacion,
    tipo_telefono: d.tipoTelefono,
    web: d.web,
    plan_probable: d.plan,
    departamento: d.departamento,
    zona: d.zona,
    barrio: d.barrio,
    horario_contacto: d.horario,
    rne: ctx.rne,
    rne_archivo: d.rneArchivo,
    valor_original: ctx.valorOriginal,
  });
}

export function metadataImportacionLead(d: FilaLeadNormalizada, ctx: ContextoAltaLead): Record<string, unknown> {
  return sinVacios({ lote: ctx.lote, id_externo: d.idExterno, fila: d.fila, plan_probable: d.plan, rne: ctx.rne, valor_original: ctx.valorOriginal });
}

function cuerpoLead(d: FilaLeadNormalizada, ctx: ContextoAltaLead): CreateLeadBody {
  const body: CreateLeadBody = { name: nombreDelLead(d), source: FUENTE_IMPORTACION };
  if (ctx.amount !== null) body.amount = ctx.amount;
  if (ctx.currency) body.currency = ctx.currency;
  return body;
}

function extrasLead(d: FilaLeadNormalizada, ctx: ContextoAltaLead): LeadCreateExtras['opportunity'] {
  return { metadata: { importacion: metadataImportacionLead(d, ctx) }, vertical_id: ctx.verticalId, icp_band: d.icpBand };
}

/** Alta de cliente NUEVO + lead. */
export function altaConClienteNuevo(d: FilaLeadNormalizada, ctx: ContextoAltaLead): { body: CreateLeadBody; extras: LeadCreateExtras } {
  const empresa = ctx.tipoCliente === 'company';
  const body = cuerpoLead(d, ctx);
  body.new_customer = empresa
    ? {
        customer_type: 'company',
        company_name: d.razonSocial ?? d.nombre,
        full_name: d.contacto ?? undefined,
        email: d.correo ?? undefined,
        phone: d.telefono ?? undefined,
      }
    : {
        customer_type: 'person',
        full_name: d.contacto ?? d.nombre,
        company_name: d.razonSocial ?? undefined,
        email: d.correo ?? undefined,
        phone: d.telefono ?? undefined,
      };
  const extras: LeadCreateExtras = {
    customer: {
      trade_name: empresa ? d.nombre : null,
      identification_type: d.nit ? 'NIT' : null,
      identification_number: d.nit,
      dv: d.nit ? d.dv : null,
      address: direccionCompleta(d),
      city: d.ciudad,
      notes: d.notas,
      tags: etiquetasDelCliente(d, ctx.lote, ctx.rne),
      vertical_id: ctx.verticalId,
      timezone: zonaDelCliente(d.telefono, ctx.zonaOrganizacion),
      metadata: { importacion: metadataImportacionCliente(d, ctx) },
    },
    opportunity: extrasLead(d, ctx),
  };
  return { body, extras };
}

/** Solo el lead, ligado a un cliente que ya existe (la ficha existente NO se modifica). */
export function altaConClienteExistente(d: FilaLeadNormalizada, customerId: string, ctx: ContextoAltaLead): { body: CreateLeadBody; extras: LeadCreateExtras } {
  const body = cuerpoLead(d, ctx);
  body.customer_id = customerId;
  return { body, extras: { opportunity: extrasLead(d, ctx) } };
}

export interface VerticalRef {
  id: string;
  name: string;
  slug: string | null;
}

const palabras = (s: string | null | undefined) => normalizarNombre(s).split(' ').filter((p) => p.length >= 4);

/**
 * Vertical de la organización que casa con el sector (o, si no, el subsector):
 * una palabra de ≥ 4 letras del sector y otra del nombre o slug de la vertical
 * donde una empieza por la otra («Restaurante/bar» ↔ «Restaurantes y bares»,
 * «Retail (tienda)» ↔ «Retail y comercio»). Sin coincidencia, o con «Otros», `null`.
 * `verticales` llega ordenada por `sort_order`: gana la primera que case.
 */
export function verticalParaSector(sector: string | null, subsector: string | null, verticales: readonly VerticalRef[]): string | null {
  for (const texto of [sector, subsector]) {
    const del = palabras(texto);
    if (del.length === 0) continue;
    for (const v of verticales) {
      const de = [...palabras(v.name), ...palabras(v.slug)];
      if (de.includes('otros') || de.includes('other')) continue;
      if (del.some((a) => de.some((b) => a.startsWith(b) || b.startsWith(a)))) return v.id;
    }
  }
  return null;
}
