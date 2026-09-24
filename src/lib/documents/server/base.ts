/**
 * Piezas comunes de los cargadores del motor (solo servidor).
 *
 * Reglas que cumplen TODOS los cargadores:
 * - La organización es `sesion.organizationId` (de `getServerOrgContext`),
 *   nunca un valor de la petición. Cada consulta va con el cliente de la
 *   sesión (RLS) Y con `.eq('organization_id', …)` explícito: defensa en
 *   profundidad, no se depende solo de la política de la tabla.
 * - Un id mal formado, inexistente o de otra organización es el mismo 404: no
 *   se distingue «no existe» de «es de otro».
 * - Lo que se pinta sale de la base; los importes no se recalculan (el saldo,
 *   el total y el impuesto son los que mantienen los disparadores).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { resolveTimezoneCascade } from '@/lib/utils/branchTimezoneCascade';
import type { Traductor } from '../textos';
import type {
  Contraparte,
  Emisor,
  IdiomaDocumento,
  LineaDocumento,
  SeccionTabla,
  SucursalDocumento,
  TipoDocumento,
  Tono,
} from '../tipos';
import { colorHexSeguro } from '../escape';
import { logoComoDataUri } from './logo';

/** Lo que el motor necesita de la sesión (subconjunto de `ServerOrgContext`). */
export interface SesionDocumento {
  userId: string;
  organizationId: number;
  roleId: number;
  isSuperAdmin: boolean;
  supabase: SupabaseClient;
}

export interface OpcionesCarga {
  idioma: IdiomaDocumento;
  /** Estado de cuenta: rango de días calendario `YYYY-MM-DD` (filtros de presentación). */
  desde?: string | null;
  hasta?: string | null;
  ahora?: Date;
}

export interface BaseDocumento {
  emisor: Emisor;
  sucursal: SucursalDocumento | null;
  zonaHoraria: string;
  /** Textos legales configurados por la organización, por tipo de documento. */
  textosLegales: Partial<Record<TipoDocumento, string>>;
}

/** Clave de `organization_settings` con los textos legales de los documentos. */
export const CLAVE_TEXTOS_LEGALES = 'documentos_textos_legales';
const LARGO_MAXIMO_TEXTO_LEGAL = 2000;

export function noEncontrado(): OrgContextError {
  return new OrgContextError('Documento no encontrado', 404, 'NOT_FOUND');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function exigirUuid(id: string): string {
  if (!UUID_RE.test(id)) throw noEncontrado();
  return id.toLowerCase();
}

export function exigirEntero(id: string): number {
  if (!/^\d{1,12}$/.test(id)) throw noEncontrado();
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) throw noEncontrado();
  return n;
}

export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID_RE.test(valor);
}

/** Primera fila de una relación embebida de PostgREST (objeto o arreglo). */
export function uno<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

export function num(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

export function numONull(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s === '' ? null : s;
}

/** Error de lectura: se registra (sin datos) y sale como 500 genérico. */
export function fallaLectura(tabla: string, error: { message?: string } | null): never {
  console.error('[documentos] lectura fallida', { tabla, mensaje: error?.message ?? 'sin detalle' });
  throw new Error(`No se pudo leer ${tabla}`);
}

interface FilaOrganizacion {
  name: string | null;
  legal_name: string | null;
  nit: string | null;
  tax_id: string | null;
  dv: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  primary_color: string | null;
  fiscal_responsibilities: string[] | null;
  economic_activity: string | null;
  timezone: string | null;
}

/** Emisor, sucursal, zona horaria y textos legales de la organización de la sesión. */
export async function cargarBase(sesion: SesionDocumento, branchId: number | null): Promise<BaseDocumento> {
  const db = sesion.supabase;
  const [{ data: org, error: errorOrg }, sucursalRes, ajustesRes] = await Promise.all([
    db
      .from('organizations')
      .select('name, legal_name, nit, tax_id, dv, address, city, state, phone, email, website, logo_url, primary_color, fiscal_responsibilities, economic_activity, timezone')
      .eq('id', sesion.organizationId)
      .maybeSingle(),
    branchId
      ? db.from('branches').select('name, address, city, phone, timezone').eq('id', branchId).eq('organization_id', sesion.organizationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from('organization_settings').select('settings').eq('organization_id', sesion.organizationId).eq('key', CLAVE_TEXTOS_LEGALES).maybeSingle(),
  ]);
  if (errorOrg) fallaLectura('organizations', errorOrg);
  if (!org) throw noEncontrado();
  const o = org as FilaOrganizacion;
  const s = (sucursalRes.data ?? null) as { name: string | null; address: string | null; city: string | null; phone: string | null; timezone: string | null } | null;

  const zona = resolveTimezoneCascade({ branchTimezone: s?.timezone ?? null, organizationTimezone: o.timezone }).timezone;
  const ciudad = [o.city, o.state].map(texto).filter(Boolean).join(', ') || null;

  const emisor: Emisor = {
    nombre: texto(o.name) ?? texto(o.legal_name) ?? '',
    razonSocial: texto(o.legal_name),
    nit: texto(o.nit) ?? texto(o.tax_id),
    dv: o.dv === null || o.dv === undefined ? null : String(o.dv),
    direccion: texto(o.address),
    ciudad,
    telefono: texto(o.phone),
    email: texto(o.email),
    web: texto(o.website),
    responsabilidades: (o.fiscal_responsibilities ?? []).map(texto).filter((x): x is string => !!x),
    actividadEconomica: texto(o.economic_activity),
    logoDataUri: await logoComoDataUri(o.logo_url),
    colorPrimario: colorHexSeguro(o.primary_color),
  };

  const sucursal: SucursalDocumento | null = s && texto(s.name)
    ? { nombre: texto(s.name) as string, direccion: texto(s.address), ciudad: texto(s.city), telefono: texto(s.phone) }
    : null;

  return { emisor, sucursal, zonaHoraria: zona, textosLegales: leerTextosLegales(ajustesRes.data) };
}

/** `organization_settings.settings` de `documentos_textos_legales` → texto por tipo (saneado). */
export function leerTextosLegales(fila: unknown): Partial<Record<TipoDocumento, string>> {
  const settings = (fila as { settings?: unknown } | null)?.settings;
  if (!settings || typeof settings !== 'object') return {};
  const resultado: Partial<Record<TipoDocumento, string>> = {};
  for (const [clave, valor] of Object.entries(settings as Record<string, unknown>)) {
    if (typeof valor !== 'string') continue;
    const limpio = valor.replace(/\r\n/g, '\n').trim().slice(0, LARGO_MAXIMO_TEXTO_LEGAL);
    if (limpio) resultado[clave as TipoDocumento] = limpio;
  }
  return resultado;
}

/** Texto legal del tipo: el configurado por la organización o el de `messages/` (`legal.porDefecto.<tipo>`). */
export function textoLegal(base: BaseDocumento, tipo: TipoDocumento, t: Traductor): string[] {
  const propio = base.textosLegales[tipo];
  if (propio) return [propio];
  const clave = `legal.porDefecto.${tipo}`;
  const porDefecto = t(clave);
  return porDefecto && porDefecto !== clave ? [porDefecto] : [];
}

export interface FilaCliente {
  full_name?: string | null;
  company_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  identification_type?: string | null;
  identification_number?: string | null;
  doc_type?: string | null;
  doc_number?: string | null;
  dv?: number | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  fiscal_responsibilities?: string[] | null;
}

export const SELECT_CLIENTE =
  'full_name, company_name, identification_type, identification_number, doc_type, doc_number, dv, address, city, phone, email, fiscal_responsibilities';

export function contraparteCliente(c: FilaCliente | null, rol: Contraparte['rol'] = 'cliente'): Contraparte | null {
  if (!c) return null;
  const nombre = texto(c.company_name) ?? texto(c.full_name) ?? [texto(c.first_name), texto(c.last_name)].filter(Boolean).join(' ');
  return {
    rol,
    nombre: nombre || '—',
    tipoDocumento: texto(c.doc_type) ?? texto(c.identification_type),
    numeroDocumento: texto(c.doc_number) ?? texto(c.identification_number),
    dv: c.dv === null || c.dv === undefined ? null : String(c.dv),
    direccion: texto(c.address),
    ciudad: texto(c.city),
    telefono: texto(c.phone),
    email: texto(c.email),
    responsabilidades: (c.fiscal_responsibilities ?? []).map(texto).filter((x): x is string => !!x),
  };
}

export interface FilaProveedor {
  name?: string | null;
  trade_name?: string | null;
  nit?: string | null;
  tax_id?: string | null;
  doc_type?: string | null;
  dv?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  fiscal_responsibilities?: string[] | null;
  bank_name?: string | null;
  bank_account?: string | null;
  account_type?: string | null;
  credit_days?: number | null;
}

export const SELECT_PROVEEDOR =
  'name, trade_name, nit, tax_id, doc_type, dv, address, city, country, phone, email, fiscal_responsibilities, bank_name, bank_account, account_type, credit_days';

export function contraparteProveedor(p: FilaProveedor | null): Contraparte | null {
  if (!p) return null;
  return {
    rol: 'proveedor',
    nombre: texto(p.name) ?? texto(p.trade_name) ?? '—',
    tipoDocumento: texto(p.doc_type) ?? (texto(p.nit) ? 'NIT' : null),
    numeroDocumento: texto(p.nit) ?? texto(p.tax_id),
    dv: texto(p.dv),
    direccion: texto(p.address),
    ciudad: [texto(p.city), texto(p.country)].filter(Boolean).join(', ') || null,
    telefono: texto(p.phone),
    email: texto(p.email),
    responsabilidades: (p.fiscal_responsibilities ?? []).map(texto).filter((x): x is string => !!x),
  };
}

/** Cuenta bancaria enmascarada: solo los 4 últimos dígitos. */
export function cuentaEnmascarada(cuenta: string | null | undefined): string | null {
  const limpia = texto(cuenta)?.replace(/\s+/g, '');
  if (!limpia) return null;
  return limpia.length <= 4 ? limpia : `•••• ${limpia.slice(-4)}`;
}

export interface FilaItem {
  code_reference?: string | null;
  description?: string | null;
  qty?: number | string | null;
  unit_price?: number | string | null;
  discount_amount?: number | string | null;
  tax_code?: string | null;
  tax_rate?: number | string | null;
  tax_included?: boolean | null;
  total_line?: number | string | null;
  note?: string | null;
  serial_numbers?: string[] | null;
  impuesto?: { name: string | null } | { name: string | null }[] | null;
  producto?: { sku: string | null } | { sku: string | null }[] | null;
}

export const SELECT_ITEM =
  'code_reference, description, qty, unit_price, discount_amount, tax_code, tax_rate, tax_included, total_line, note, serial_numbers, created_at, impuesto:tax_templates(name), producto:products(sku)';

/** Nombre del impuesto desde el dato: `tax_templates.name`, o el prefijo del código (`IVA_19` → `IVA`). */
export function nombreImpuesto(taxCode: string | null | undefined, nombrePlantilla: string | null | undefined): string | null {
  const plantilla = texto(nombrePlantilla);
  if (plantilla) return plantilla;
  const codigo = texto(taxCode);
  if (!codigo) return null;
  const prefijo = codigo.split(/[_\s-]/)[0];
  return prefijo && /^[A-Za-z]{2,10}$/.test(prefijo) ? prefijo.toUpperCase() : codigo;
}

export function lineaDeItem(item: FilaItem): LineaDocumento {
  const tasa = numONull(item.tax_rate);
  return {
    codigo: texto(item.code_reference) ?? texto(uno(item.producto)?.sku),
    descripcion: texto(item.description) ?? '—',
    nota: texto(item.note),
    seriales: (item.serial_numbers ?? []).map(texto).filter((x): x is string => !!x),
    cantidad: num(item.qty),
    precioUnitario: num(item.unit_price),
    descuento: num(item.discount_amount),
    impuesto: tasa !== null && tasa > 0
      ? { nombre: nombreImpuesto(item.tax_code, uno(item.impuesto)?.name), tasa, incluido: item.tax_included === true }
      : null,
    total: num(item.total_line),
  };
}

/** Nombre único de los impuestos de las líneas, o null si hay varios o ninguno. */
export function nombreImpuestoUnico(lineas: LineaDocumento[]): string | null {
  const nombres = new Set(lineas.map((l) => l.impuesto?.nombre).filter((x): x is string => !!x));
  return nombres.size === 1 ? [...nombres][0] : null;
}

/** Métodos de pago con rótulo traducido en `documentos.metodosPago`. */
const METODOS_CONOCIDOS = new Set(['cash', 'card', 'transfer', 'nequi', 'daviplata', 'pse', 'wompi', 'qr', 'credit', 'check', 'other']);

export function claveMetodo(metodo: string | null | undefined): string {
  const m = (texto(metodo) ?? 'other').toLowerCase();
  return METODOS_CONOCIDOS.has(m) ? `metodosPago.${m}` : '';
}

/** Rótulo del método: traducido si es conocido; si no, el código tal cual. */
export function rotuloMetodo(metodo: string | null | undefined, t: Traductor): string {
  const clave = claveMetodo(metodo);
  return clave ? t(clave) : texto(metodo) ?? '—';
}

export interface FilaPago {
  id?: string;
  method?: string | null;
  amount?: number | string | null;
  change_amount?: number | string | null;
  reference?: string | null;
  payment_date?: string | null;
  created_at?: string | null;
}

/** Valor aplicado de un pago: `amount - change_amount` (en el POS `amount` es lo recibido). */
export function valorAplicado(p: FilaPago): number {
  return num(p.amount) - num(p.change_amount);
}

export function seccionPagos(pagos: FilaPago[], t: Traductor): SeccionTabla {
  return {
    titulo: 'pagos',
    columnas: [
      { clave: 'fecha', tipo: 'instanteHora' },
      { clave: 'metodo', tipo: 'texto' },
      { clave: 'referencia', tipo: 'texto' },
      { clave: 'valor', tipo: 'dinero' },
    ],
    filas: pagos.map((p) => [p.payment_date ?? p.created_at ?? null, rotuloMetodo(p.method, t), texto(p.reference), valorAplicado(p)]),
  };
}

/** Tono del estado de un documento (venta, compra, cotización). */
export function tonoEstado(estado: string): Tono {
  switch (estado) {
    case 'paid':
    case 'accepted':
    case 'converted':
    case 'validated':
      return 'exito';
    case 'partial':
    case 'sent':
      return 'aviso';
    case 'void':
    case 'voided':
    case 'cancelled':
    case 'rejected':
    case 'expired':
      return 'peligro';
    case 'draft':
      return 'neutro';
    default:
      return 'marca';
  }
}

/** URL de verificación DIAN del documento electrónico (el QR de la representación gráfica). */
export function urlVerificacionDian(codigoUnico: string, entorno: 'produccion' | 'pruebas' = 'produccion'): string {
  const host = entorno === 'pruebas' ? 'catalogo-vpfe-hab.dian.gov.co' : 'catalogo-vpfe.dian.gov.co';
  return `https://${host}/document/searchqr?documentkey=${encodeURIComponent(codigoUnico)}`;
}

/** Entorno de facturación electrónica de la organización (solo la columna `environment`). */
export async function entornoFacturacion(sesion: SesionDocumento): Promise<'produccion' | 'pruebas'> {
  const { data } = await sesion.supabase
    .from('electronic_invoicing_config')
    .select('environment')
    .eq('organization_id', sesion.organizationId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  const entorno = String((data as { environment?: string } | null)?.environment ?? '').toLowerCase();
  return entorno === 'test' || entorno === 'sandbox' || entorno === 'pruebas' ? 'pruebas' : 'produccion';
}

/** Nombre de archivo base: `<Tipo>_<numero>`. */
export function nombreArchivoBase(t: Traductor, tituloClave: string, numero: string | null): string {
  return [t(`tipos.${tituloClave}`), numero].filter(Boolean).join('_');
}
