/**
 * Datos de facturación electrónica del cliente (Figma «06 Clientes», sección 3192-19436; decisiones
 * del dueño 2026-11-25). Puro: sin React ni Supabase, lo usan la ficha, el diálogo «Editar datos de
 * facturación», «Editar cliente» (ClientForm), el detalle del pedido online y el payload de Factus.
 *
 * Reglas que viven SOLO aquí:
 * - Correo de factura: una sola validación (`validarCorreoFactura`), la misma expresión que usa la
 *   base en `fn_web_order_documento_cliente`.
 * - DV: siempre calculado (`calcularDv` de `nitDv`, módulo 11 DIAN), nunca escrito a mano.
 * - Responsabilidad de IVA: se guarda el CÓDIGO del RUT (casilla 53) en
 *   `customers.fiscal_responsibilities`: O-48 = responsable, O-49 = no responsable (los mismos
 *   códigos de `dian_fiscal_responsibilities` y del perfil tributario de la organización). Con eso
 *   el perfil cuadra con el RUT y `tribute_id` se deriva (48 → IVA, 49 → no aplica).
 * - Hacia la DIAN, la responsabilidad de IVA viaja como TRIBUTO del adquiriente (01 IVA / ZZ no
 *   aplica), no como responsabilidad: el anexo técnico de la factura electrónica (tabla 13.2.6.1)
 *   solo admite O-13, O-15, O-23, O-47 y R-99-PN. `tributoDianCliente` y
 *   `responsabilidadesParaDian` hacen esa traducción en un solo sitio.
 */
import { calcularDv } from '@/lib/utils/nitDv';
import { RESPONSABILIDAD } from '@/lib/finanzas/tributario/perfil';

// ─── Responsabilidad de IVA (48 / 49) ─────────────────────────────────────────

export type CodigoIva = '48' | '49';

/** Código del RUT → código de `dian_fiscal_responsibilities`. */
const RESPONSABILIDAD_IVA: Record<CodigoIva, string> = {
  '48': RESPONSABILIDAD.responsableIva,
  '49': RESPONSABILIDAD.noResponsableIva,
};

/**
 * `tribute_id` del cliente (ids de tributo del adquiriente de Factus, los que ya usa la base: 21
 * por defecto). `mapTribute` (factusService) los traduce: 18 → «01» IVA, 21 → «ZZ» no aplica.
 */
export const TRIBUTO_ID_IVA = 18;
export const TRIBUTO_ID_NO_APLICA = 21;

const limpias = (resps: readonly unknown[] | null | undefined): string[] =>
  (resps ?? []).filter((r): r is string => typeof r === 'string' && r.trim().length > 0).map((r) => r.trim());

/** ¿Qué dice la ficha sobre el IVA? `null` si no tiene ni 48 ni 49 (el usuario aún no escogió). */
export function responsabilidadIvaDe(resps: readonly unknown[] | null | undefined): CodigoIva | null {
  const lista = limpias(resps);
  if (lista.includes(RESPONSABILIDAD_IVA['48'])) return '48';
  if (lista.includes(RESPONSABILIDAD_IVA['49'])) return '49';
  return null;
}

/**
 * Responsabilidades con la respuesta de IVA aplicada: quita 48 y 49 y pone la escogida. Con 48 se
 * quita además R-99-PN («no responsable»), que contradiría al responsable de IVA. El resto (O-13,
 * O-15, O-23, O-47) se conserva tal cual.
 */
export function conResponsabilidadIva(resps: readonly unknown[] | null | undefined, codigo: CodigoIva): string[] {
  const fuera = new Set<string>([RESPONSABILIDAD_IVA['48'], RESPONSABILIDAD_IVA['49']]);
  if (codigo === '48') fuera.add(RESPONSABILIDAD.noAplica);
  const resto = limpias(resps).filter((r) => !fuera.has(r));
  return Array.from(new Set([...resto, RESPONSABILIDAD_IVA[codigo]]));
}

/** `tribute_id` que corresponde a la respuesta de IVA. */
export function tributoIdDeIva(codigo: CodigoIva): number {
  return codigo === '48' ? TRIBUTO_ID_IVA : TRIBUTO_ID_NO_APLICA;
}

/**
 * Tributo del adquiriente para la DIAN según su RUT: 48 → «01» (IVA), 49 → «ZZ» (no aplica). `null`
 * si la ficha no dice nada de IVA: entonces manda `tribute_id` (`mapTribute`), como siempre.
 */
export function tributoDianCliente(resps: readonly unknown[] | null | undefined): '01' | 'ZZ' | null {
  const iva = responsabilidadIvaDe(resps);
  if (iva === '48') return '01';
  if (iva === '49') return 'ZZ';
  return null;
}

/**
 * Responsabilidades que admite el documento electrónico (Anexo técnico 1.9, Res. DIAN 000165 de
 * 2023, tabla 13.2.6.1). Confirmado por el Contador el 2026-11-25: O-13, O-15, O-23, O-47 y
 * R-99-PN. O-48 / O-49 NUNCA viajan como responsabilidad: van como tributo (01 / ZZ).
 */
export const RESPONSABILIDADES_DIAN_FE: readonly string[] = [
  RESPONSABILIDAD.granContribuyente,
  RESPONSABILIDAD.autorretenedor,
  RESPONSABILIDAD.agenteRetencionIva,
  RESPONSABILIDAD.simple,
  RESPONSABILIDAD.noAplica,
];

/**
 * Responsabilidades que viajan en el documento electrónico: solo las de la tabla 13.2.6.1 (sin
 * O-48 / O-49, que van como tributo, ni códigos viejos que la DIAN rechaza) y, si no queda
 * ninguna, R-99-PN, como exige la DIAN. El perfil del cliente sigue guardando y mostrando 48/49.
 */
export function responsabilidadesParaDian(resps: readonly unknown[] | null | undefined): string[] {
  const lista = limpias(resps).filter((r) => RESPONSABILIDADES_DIAN_FE.includes(r));
  return lista.length > 0 ? Array.from(new Set(lista)) : [RESPONSABILIDAD.noAplica];
}

/**
 * La EMPRESA que factura (la organización) está marcada 49 (no responsable de IVA) en su RUT pero el
 * documento lleva IVA: la DIAN espera que actualice el RUT a 48. Aviso, nunca bloqueo.
 */
export function rutNoResponsableConIva(
  responsabilidadesOrganizacion: readonly unknown[] | null | undefined,
  lineas: ReadonlyArray<{ tax_rate?: number | string | null; tax_code?: string | null; is_excluded?: number | null }>,
): boolean {
  if (responsabilidadIvaDe(responsabilidadesOrganizacion) !== '49') return false;
  return lineas.some((l) => {
    const tasa = Number(l.tax_rate ?? 0);
    return esCodigoIva(l.tax_code) && Number.isFinite(tasa) && tasa > 0 && l.is_excluded !== 1;
  });
}

/** Código de impuesto de una línea que es IVA: «01» (DIAN), «IVA_19»… o sin código (el impuesto por defecto). */
function esCodigoIva(codigo: string | null | undefined): boolean {
  const c = (codigo ?? '').trim().toUpperCase();
  return c === '' || c === '01' || c.startsWith('IVA');
}

// ─── Correo de factura ────────────────────────────────────────────────────────

/** La misma expresión que `fn_web_order_documento_cliente` (base) y el checkout de la tienda. */
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type ValidacionCorreo = 'vacio' | 'valido' | 'invalido';

/** Única validación del correo de factura (diálogo de facturación y «Editar cliente»). */
export function validarCorreoFactura(valor: string | null | undefined): ValidacionCorreo {
  const v = (valor ?? '').trim();
  if (!v) return 'vacio';
  return RE_CORREO.test(v) ? 'valido' : 'invalido';
}

/** Correo normalizado para guardar: minúsculas, sin espacios; `null` si está vacío. */
export function correoFacturaParaGuardar(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim().toLowerCase();
  return v ? v : null;
}

// ─── Documento y DV ──────────────────────────────────────────────────────────

/** Códigos de documento que son un NIT (con DV): los de `country_identification_types` y los viejos. */
const TIPOS_NIT = new Set(['nit', 'tax_id', 'rut', '31']);

export function esTipoNit(tipo: string | null | undefined): boolean {
  return TIPOS_NIT.has((tipo ?? '').trim().toLowerCase());
}

/** DV automático: solo para NIT; `null` para cualquier otro documento o sin número. */
export function dvAutomatico(tipo: string | null | undefined, numero: string | null | undefined): number | null {
  if (!esTipoNit(tipo)) return null;
  const digitos = (numero ?? '').replace(/\D/g, '');
  return digitos ? calcularDv(digitos) : null;
}

/** Sigla que se muestra: «NIT», «CC», «CE», «PA»… */
export function siglaDocumento(tipo: string | null | undefined): string {
  const t = (tipo ?? '').trim().toLowerCase();
  if (!t) return '';
  if (TIPOS_NIT.has(t)) return 'NIT';
  if (t === 'national_id' || t === '13') return 'CC';
  if (t === 'passport' || t === '41') return 'PA';
  if (t === 'foreign_id' || t === '22') return 'CE';
  return t.toUpperCase();
}

/** «1020456789» → «1.020.456.789». Documentos con letras quedan como están. */
export function formatearNumeroDocumento(numero: string | null | undefined): string {
  const n = (numero ?? '').trim();
  if (!/^\d+$/.test(n)) return n;
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** «NIT 901.334.221-3», «CC 1.020.456.789». Vacío si no hay número. */
export function etiquetaDocumento(c: { identification_type?: string | null; identification_number?: string | null; dv?: number | string | null }): string {
  const numero = formatearNumeroDocumento(c.identification_number);
  if (!numero) return '';
  const sigla = siglaDocumento(c.identification_type);
  const dv = esTipoNit(c.identification_type) && c.dv !== null && c.dv !== undefined && String(c.dv) !== '' ? `-${c.dv}` : '';
  return [sigla, `${numero}${dv}`].filter(Boolean).join(' ');
}

/** Clave para comparar documentos: solo letras y números (la misma que usa la base). */
export function claveDocumento(numero: string | null | undefined): string {
  return (numero ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ─── Estado de la tarjeta ─────────────────────────────────────────────────────

export interface ClienteFacturacion {
  customer_type?: string | null;
  identification_type?: string | null;
  identification_number?: string | null;
  dv?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  billing_email?: string | null;
  email?: string | null;
  fiscal_municipality_id?: string | null;
  fiscal_responsibilities?: string[] | null;
}

export type EstadoFacturacion = 'vacia' | 'incompleta' | 'faltaCorreo' | 'completa';
export type FaltaFacturacion = 'nombre' | 'dv' | 'municipio' | 'iva';

export function faltantesFacturacion(c: ClienteFacturacion): FaltaFacturacion[] {
  const faltan: FaltaFacturacion[] = [];
  const empresa = c.customer_type === 'company';
  const nombre = empresa ? (c.company_name || c.first_name || '').trim() : `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
  if (!nombre) faltan.push('nombre');
  if (esTipoNit(c.identification_type) && (c.dv === null || c.dv === undefined)) faltan.push('dv');
  if (!c.fiscal_municipality_id) faltan.push('municipio');
  if (empresa && responsabilidadIvaDe(c.fiscal_responsibilities) === null) faltan.push('iva');
  return faltan;
}

/**
 * Estado de la tarjeta «Facturación electrónica»: sin documento la factura sale a «Consumidor
 * final» (vacía); con datos incompletos, «Incompleta»; sin correo de factura propio (irá al de
 * contacto), «Falta correo»; si no, «Completa».
 */
export function estadoFacturacion(c: ClienteFacturacion): EstadoFacturacion {
  if (!claveDocumento(c.identification_number)) return 'vacia';
  if (faltantesFacturacion(c).length > 0) return 'incompleta';
  if (validarCorreoFactura(c.billing_email) !== 'valido') return 'faltaCorreo';
  return 'completa';
}

// ─── Validación del diálogo «Editar datos de facturación» ────────────────────

export type CampoFacturacion = 'tipoDocumento' | 'numero' | 'razonSocial' | 'nombres' | 'apellidos' | 'correo' | 'municipio' | 'iva';

export interface FormularioFacturacionValidable {
  tipoPersona: 'person' | 'company';
  tipoDocumento: string;
  numero: string;
  razonSocial: string;
  nombres: string;
  apellidos: string;
  correoFactura: string;
  municipioId: string;
  iva: CodigoIva | null;
}

/**
 * Campos con error. La respuesta de IVA es obligatoria y no viene marcada: el usuario escoge 48 o
 * 49 mirando su RUT. El correo de factura es opcional, pero si se escribe debe ser válido.
 */
export function erroresFacturacion(d: FormularioFacturacionValidable): CampoFacturacion[] {
  const e: CampoFacturacion[] = [];
  if (!d.tipoDocumento.trim()) e.push('tipoDocumento');
  const clave = claveDocumento(d.numero);
  if (!clave || (esTipoNit(d.tipoDocumento) && !/^\d{6,15}$/.test(clave))) e.push('numero');
  if (d.tipoPersona === 'company') {
    if (!d.razonSocial.trim()) e.push('razonSocial');
  } else {
    if (!d.nombres.trim()) e.push('nombres');
    if (!d.apellidos.trim()) e.push('apellidos');
  }
  if (validarCorreoFactura(d.correoFactura) === 'invalido') e.push('correo');
  if (!d.municipioId) e.push('municipio');
  if (!d.iva) e.push('iva');
  return e;
}

// ─── Revisión del documento de un pedido web ──────────────────────────────────

export type DecisionRevision = 'usar' | 'mantener' | 'ligar';
export const DECISIONES_REVISION: readonly DecisionRevision[] = ['usar', 'mantener', 'ligar'];

export interface RevisionFactura {
  decision: DecisionRevision;
  por: string | null;
  porNombre: string | null;
  en: string | null;
  documentoFichaAntes: string | null;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** `billing_data.revision` (la escribe `fn_web_order_revisar_factura`); `null` si no se ha revisado. */
export function leerRevision(billingData: unknown): RevisionFactura | null {
  if (!billingData || typeof billingData !== 'object' || Array.isArray(billingData)) return null;
  const r = (billingData as Record<string, unknown>).revision;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const v = r as Record<string, unknown>;
  const decision = texto(v.decision) as DecisionRevision;
  if (!DECISIONES_REVISION.includes(decision)) return null;
  return {
    decision,
    por: texto(v.por) || null,
    porNombre: texto(v.por_nombre) || null,
    en: texto(v.en) || null,
    documentoFichaAntes: texto(v.documento_ficha_antes) || null,
  };
}

/** `billing_data.perfil`: cómo quedó el documento del pedido frente a la ficha. */
export function perfilFactura(billingData: unknown): string | null {
  if (!billingData || typeof billingData !== 'object' || Array.isArray(billingData)) return null;
  return texto((billingData as Record<string, unknown>).perfil) || null;
}

/** El pedido pidió factura con otro documento (o uno de otra ficha) y nadie lo ha revisado. */
export function pedidoPorRevisar(billingData: unknown): boolean {
  const perfil = perfilFactura(billingData);
  return (perfil === 'distinto' || perfil === 'duplicado') && leerRevision(billingData) === null;
}

/** Comparación de CRM › Identidades para unificar dos fichas (solo viajan ids). */
export function urlUnificarFichas(principal: string, otra: string): string {
  return `/app/crm/identidades/comparar?ids=${[principal, otra].filter(Boolean).join(',')}`;
}

/** Códigos que la API de revisión devuelve; el resto es error. */
export type ResultadoRevision = 'ok' | 'ya_revisado' | 'no_aplica' | 'duplicado';
