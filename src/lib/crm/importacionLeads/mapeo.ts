/**
 * Fila normalizada → alta de `createLeadWithCustomer` (cuerpo + extras de servidor).
 *
 * Mapeo recomendado (documentado en docs/crm-revenue-os/IMPORTAR-LEADS.md):
 *
 *  customers (ficha NUEVA)
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
 *                           fuentes_texto, verificacion, fecha_verificacion, tipo_telefono,
 *                           telefonos_adicionales, correos_adicionales, web, plan_probable,
 *                           departamento, pais, zona, barrio, cargo, etapa, fecha_archivo,
 *                           horario_contacto, rne, rne_archivo, valor_original,
 *                           adicionales { <encabezado>: valor } (columnas sin campo),
 *                           valores_descartados { telefono|correo|nit|web|valor: texto crudo } }
 *    (customers no tiene departamento, país, web ni cargo: verificado por MCP 2026-10-06)
 *    lead_source     'import' (CRM ola 1, D2: el lead ES el cliente; no se crea oportunidad)
 *    owner_id        asignación automática (la del alta de leads)
 *    lead_score      calculado por el servidor desde el ICP (D3); icp_band de
 *                    respaldo = la prioridad A/B/C del archivo
 *    metadata.lead   { titulo «nombre comercial · ciudad», valor_estimado { monto, moneda }
 *                      (el valor anual en su moneda si la organización la maneja;
 *                      si no, convertido a la base), importacion { lote, id_externo,
 *                      fila, plan_probable, rne, valor_original } }
 *  Cliente EXISTENTE («ligar»): solo se completan origen y responsable si faltan
 *  y se fusiona `metadata.lead`; etiquetas, `do_not_call` y el resto de la
 *  ficha no se tocan. La fila completa (ciudad, dirección, NIT, notas… y todo
 *  lo de arriba) queda en `metadata.lead.importacion` y la ficha la muestra.
 */

import type { CreateLeadBody, LeadCreateExtras } from '@/lib/services/crm/leadCreateService';
import { normalizarNombre } from '@/lib/inventario/importacion/texto';
import type { EstadoRneImportacion, FilaLeadNormalizada, TipoClienteImportacion } from './tipos';

/** `customers.lead_source` de todo lead importado (catálogo `LEAD_SOURCES`). */
export const FUENTE_IMPORTACION = 'import';

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

/** Columnas «Dato adicional» → objeto `{ encabezado: valor }` (encabezados ya únicos por fila). */
export function adicionalesComoObjeto(d: Pick<FilaLeadNormalizada, 'adicionales'>): Record<string, string> | null {
  if (d.adicionales.length === 0) return null;
  return Object.fromEntries(d.adicionales.map((a) => [a.columna, a.valor]));
}

/**
 * Lo que la fila trae y NO tiene columna propia en `customers` (no existen
 * `department`, `country`, `website`, `position`…): va a
 * `metadata.importacion`, que la ficha y el detalle del lead muestran
 * (`datosImportadosDe`). Ver la tabla completa en IMPORTAR-LEADS.md.
 */
function datosSinColumna(d: FilaLeadNormalizada): Record<string, unknown> {
  return {
    fuentes: d.fuentes,
    fuentes_texto: d.fuentesTexto,
    verificacion: d.verificacion,
    fecha_verificacion: d.fechaVerificacion,
    tipo_telefono: d.tipoTelefono,
    telefonos_adicionales: d.telefonosAdicionales,
    correos_adicionales: d.correosAdicionales,
    web: d.web,
    plan_probable: d.plan,
    departamento: d.departamento,
    pais: d.pais,
    zona: d.zona,
    barrio: d.barrio,
    cargo: d.cargo,
    etapa: d.etapa,
    fecha_archivo: d.fecha,
    horario_contacto: d.horario,
    rne_archivo: d.rneArchivo,
    adicionales: adicionalesComoObjeto(d),
    valores_descartados: Object.keys(d.descartados).length ? d.descartados : null,
  };
}

/**
 * Para un cliente que YA existe la ficha no se pisa (decisión de IMPORTAR-LEADS):
 * los datos de columna que trae el archivo se conservan aquí, dentro de
 * `metadata.lead.importacion`, y la ficha los muestra como «del archivo».
 */
function datosDeColumnaDelArchivo(d: FilaLeadNormalizada): Record<string, unknown> {
  return {
    nombre: d.nombre,
    razon_social: d.razonSocial,
    contacto: d.contacto,
    nit: d.nit,
    dv: d.dv,
    telefono: d.telefono,
    correo: d.correo,
    direccion: direccionCompleta(d),
    ciudad: d.ciudad,
    sector: d.sector,
    subsector: d.subsector,
    prioridad: d.prioridad,
    notas: d.notas,
    etiquetas: d.etiquetas,
  };
}

export function metadataImportacionCliente(d: FilaLeadNormalizada, ctx: ContextoAltaLead): Record<string, unknown> {
  return sinVacios({
    lote: ctx.lote,
    id_externo: d.idExterno,
    fila: d.fila,
    archivo: ctx.archivo,
    importado_en: ctx.importadoEn,
    importado_por: ctx.userId,
    ...datosSinColumna(d),
    rne: ctx.rne,
    valor_original: ctx.valorOriginal,
  });
}

export function metadataImportacionLead(d: FilaLeadNormalizada, ctx: ContextoAltaLead): Record<string, unknown> {
  return sinVacios({ lote: ctx.lote, id_externo: d.idExterno, fila: d.fila, plan_probable: d.plan, rne: ctx.rne, valor_original: ctx.valorOriginal });
}

/** `metadata.lead.importacion` de un cliente existente: todo lo de la fila, sin tocar la ficha. */
export function metadataImportacionLeadExistente(d: FilaLeadNormalizada, ctx: ContextoAltaLead): Record<string, unknown> {
  return sinVacios({
    ...metadataImportacionLead(d, ctx),
    archivo: ctx.archivo,
    importado_en: ctx.importadoEn,
    importado_por: ctx.userId,
    ...datosDeColumnaDelArchivo(d),
    ...datosSinColumna(d),
  });
}

function cuerpoLead(d: FilaLeadNormalizada, ctx: ContextoAltaLead): CreateLeadBody {
  const body: CreateLeadBody = { name: nombreDelLead(d), source: FUENTE_IMPORTACION };
  if (ctx.amount !== null) body.amount = ctx.amount;
  if (ctx.currency) body.currency = ctx.currency;
  return body;
}

function extrasLead(d: FilaLeadNormalizada, ctx: ContextoAltaLead, existente = false): LeadCreateExtras['lead'] {
  return { metadata: { importacion: existente ? metadataImportacionLeadExistente(d, ctx) : metadataImportacionLead(d, ctx) }, icp_band: d.icpBand };
}

/**
 * Nombre comercial de la ficha. En una empresa siempre; en una persona solo si
 * el nombre del lead NO es ya el de la persona ni la razón social (antes, con
 * tipo «persona», el nombre comercial se perdía cuando venía un contacto).
 */
export function nombreComercialDeFicha(d: Pick<FilaLeadNormalizada, 'nombre' | 'razonSocial' | 'contacto'>, empresa: boolean): string | null {
  if (empresa) return d.nombre;
  return d.contacto && d.nombre !== d.contacto && d.nombre !== d.razonSocial ? d.nombre : null;
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
      trade_name: nombreComercialDeFicha(d, empresa),
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
    lead: extrasLead(d, ctx),
  };
  return { body, extras };
}

/**
 * Lead sobre un cliente que ya existe: solo origen/responsable si faltan y
 * `metadata.lead` (ver cabecera). La fila completa del archivo queda en
 * `metadata.lead.importacion` para que no se pierda sin pisar la ficha.
 */
export function altaConClienteExistente(d: FilaLeadNormalizada, customerId: string, ctx: ContextoAltaLead): { body: CreateLeadBody; extras: LeadCreateExtras } {
  const body = cuerpoLead(d, ctx);
  body.customer_id = customerId;
  return { body, extras: { lead: extrasLead(d, ctx, true) } };
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
