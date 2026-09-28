/**
 * Textos del dominio de proveedores (listado, tarjeta móvil, detalle y
 * formulario). Funciones puras: se prueban en
 * `src/__tests__/inventario/proveedoresFormato.test.ts`.
 *
 * Idioma: las que devuelven texto aceptan un `t` opcional del namespace
 * `proveedores.formato` (`useTranslations('proveedores.formato')`). Sin `t`
 * devuelven el español de siempre (lo que verifican los tests).
 */
import { formatMonedaSinDecimales } from '@/lib/hooks/useOrgCurrency';

/** Traductor de `proveedores.formato` (el `t` de next-intl encaja aquí). */
export type Traductor = (clave: string, valores?: Record<string, string | number>) => string;

/** «$ 12.480.000» en la moneda base de la organización. */
export function formatoMoneda(valor: number | string | null | undefined, moneda: string): string {
  return formatMonedaSinDecimales(Number(valor) || 0, moneda);
}

/** «$ 12,5 M» para la tarjeta móvil (Figma «Móvil · Proveedores — listo»). */
export function formatoMonedaCompacta(valor: number | string | null | undefined, moneda: string): string {
  const numero = Number(valor) || 0;
  if (Math.abs(numero) < 1_000_000) return formatoMoneda(numero, moneda);
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: moneda,
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    })
      .format(numero)
      .replace(/\s*mill\.?/i, ' M');
  } catch {
    return formatoMoneda(numero, moneda);
  }
}

/** `clave`: la del mensaje en `proveedores.formato.condiciones`. */
export const CONDICIONES_PAGO = [
  { valor: 'contado', clave: 'contado', etiqueta: 'Contado', dias: 0 },
  { valor: 'credito_15', clave: 'credito15', etiqueta: 'Crédito 15 días', dias: 15 },
  { valor: 'credito_30', clave: 'credito30', etiqueta: 'Crédito 30 días', dias: 30 },
  { valor: 'credito_60', clave: 'credito60', etiqueta: 'Crédito 60 días', dias: 60 },
  { valor: 'credito_90', clave: 'credito90', etiqueta: 'Crédito 90 días', dias: 90 },
] as const;

/**
 * «Crédito 30 días» · «Contado». Mandan los días de crédito (lo que se usa al
 * comprar); si no hay, la condición guardada. Antes el listado pintaba
 * `credit_days || 30` y un proveedor de contado salía con 30 días.
 */
export function condicionPago(
  paymentTerms: string | null | undefined,
  creditDays: number | null | undefined,
  t?: Traductor,
): string {
  if (creditDays !== null && creditDays !== undefined) {
    if (creditDays <= 0) return t ? t('contado') : 'Contado';
    return t ? t('creditoDias', { count: creditDays }) : `Crédito ${creditDays} ${creditDays === 1 ? 'día' : 'días'}`;
  }
  const conocida = CONDICIONES_PAGO.find((c) => c.valor === paymentTerms);
  if (conocida) return etiquetaCondicion(conocida.valor, t);
  if (paymentTerms) return paymentTerms;
  return t ? t('sinDefinir') : 'Sin definir';
}

/** Etiqueta de una condición de pago conocida («Crédito 30 días»). */
export function etiquetaCondicion(valor: string, t?: Traductor): string {
  const c = CONDICIONES_PAGO.find((x) => x.valor === valor);
  if (!c) return valor;
  return t ? t(`condiciones.${c.clave}`) : c.etiqueta;
}

/** Tipo de documento DIAN → sigla corta. */
const SIGLA_DIAN: Record<string, string> = {
  '31': 'NIT',
  '13': 'CC',
  '22': 'CE',
  '12': 'TI',
  '41': 'Pasaporte',
  '42': 'Doc. extranjero',
  '91': 'NUIP',
};

/** Las «siglas» que en realidad son palabras y cambian con el idioma. */
const CLAVE_SIGLA: Record<string, string> = {
  Pasaporte: 'pasaporte',
  'Doc. extranjero': 'docExtranjero',
};

function siglaEn(sigla: string, t?: Traductor): string {
  const clave = CLAVE_SIGLA[sigla];
  return t && clave ? t(`siglas.${clave}`) : sigla;
}

/** «900123456» → «900.123.456». Si no es solo dígitos, se deja como vino. */
function agruparMiles(numero: string): string {
  const limpio = numero.trim();
  if (!/^\d+$/.test(limpio)) return limpio;
  return limpio.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export interface DocumentoProveedor {
  nit?: string | null;
  dv?: string | null;
  identification_document_code?: string | null;
  supplier_type?: string | null;
}

/** «NIT 900.123.456-7» · «CC 1.020.345.678» · «Sin NIT». */
export function documentoProveedor(p: DocumentoProveedor, t?: Traductor): string {
  const numero = (p.nit ?? '').trim();
  const sigla =
    SIGLA_DIAN[(p.identification_document_code ?? '').trim()] ?? (p.supplier_type === 'person' ? 'CC' : 'NIT');
  if (!numero) {
    if (t) return t('sinDocumento', { sigla: siglaEn(sigla, t) });
    return sigla === 'NIT' ? 'Sin NIT' : `Sin ${sigla}`;
  }
  // El NIT a veces ya trae el DV («900123456-7»): no se duplica.
  const yaTraeDv = numero.includes('-');
  const dv = (p.dv ?? '').trim();
  return `${siglaEn(sigla, t)} ${agruparMiles(numero)}${dv && !yaTraeDv && sigla === 'NIT' ? `-${dv}` : ''}`;
}

export function tipoProveedor(supplierType: string | null | undefined, t?: Traductor): string {
  const persona = supplierType === 'person';
  if (t) return t(persona ? 'tipo.person' : 'tipo.company');
  return persona ? 'Persona' : 'Empresa';
}

export interface CarteraProveedor {
  facturas_abiertas: number;
  facturas_vencidas: number;
  saldo: number;
}

/**
 * Línea bajo el saldo: «4 facturas · 1 vencida», «3 facturas vencidas»,
 * «Al día». `peligro` si hay algo vencido.
 */
export function lineaCartera(c: CarteraProveedor, t?: Traductor): { texto: string; peligro: boolean } {
  const abiertas = c.facturas_abiertas;
  const vencidas = c.facturas_vencidas;
  if (abiertas <= 0 || c.saldo <= 0) return { texto: t ? t('cartera.alDia') : 'Al día', peligro: false };
  const facturas = `${abiertas} ${abiertas === 1 ? 'factura' : 'facturas'}`;
  if (vencidas <= 0) return { texto: t ? t('cartera.facturas', { count: abiertas }) : facturas, peligro: false };
  if (vencidas >= abiertas) {
    return {
      texto: t ? t('cartera.todasVencidas', { count: abiertas }) : `${facturas} ${abiertas === 1 ? 'vencida' : 'vencidas'}`,
      peligro: true,
    };
  }
  return {
    texto: t
      ? t('cartera.parteVencida', { count: abiertas, vencidas })
      : `${facturas} · ${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}`,
    peligro: true,
  };
}

/**
 * Estado de cartera para el badge de la tarjeta móvil: «Inactivo» si el
 * proveedor está desactivado, «Vencido» si tiene facturas vencidas y
 * «Activo» si no. Los tonos salen de la tabla única (kit/estadoTono).
 */
export function estadoCartera(p: { is_active: boolean; facturas_vencidas: number }): 'inactivo' | 'vencido' | 'activo' {
  if (!p.is_active) return 'inactivo';
  if (p.facturas_vencidas > 0) return 'vencido';
  return 'activo';
}

export const REGIMENES_TRIBUTARIOS = [
  { valor: 'comun', clave: 'comun', etiqueta: 'Responsable de IVA' },
  { valor: 'simple', clave: 'simple', etiqueta: 'Régimen simple' },
  { valor: 'gran_contribuyente', clave: 'granContribuyente', etiqueta: 'Gran contribuyente' },
  { valor: 'no_responsable', clave: 'noResponsable', etiqueta: 'No responsable de IVA' },
] as const;

export function etiquetaRegimen(valor: string | null | undefined, t?: Traductor): string {
  const r = REGIMENES_TRIBUTARIOS.find((x) => x.valor === valor);
  if (r) return t ? t(`regimenes.${r.clave}`) : r.etiqueta;
  if (valor) return valor;
  return t ? t('sinDefinir') : 'Sin definir';
}

export const TIPOS_CUENTA = [
  { valor: 'savings', etiqueta: 'Ahorros' },
  { valor: 'checking', etiqueta: 'Corriente' },
  { valor: 'other', etiqueta: 'Otro' },
] as const;

export function etiquetaTipoCuenta(valor: string | null | undefined, t?: Traductor): string {
  const c = TIPOS_CUENTA.find((x) => x.valor === valor);
  if (c) return t ? t(`cuentas.${c.valor}`) : c.etiqueta;
  return valor || '';
}

/** Responsabilidades fiscales DIAN más comunes (RUT, casilla 53). */
export const RESPONSABILIDADES_FISCALES = [
  { valor: 'O-13', clave: 'o13', etiqueta: 'O-13 · Gran contribuyente' },
  { valor: 'O-15', clave: 'o15', etiqueta: 'O-15 · Autorretenedor' },
  { valor: 'O-23', clave: 'o23', etiqueta: 'O-23 · Agente de retención IVA' },
  { valor: 'O-47', clave: 'o47', etiqueta: 'O-47 · Régimen simple' },
  { valor: 'R-99-PN', clave: 'r99pn', etiqueta: 'R-99-PN · No aplica, otros' },
] as const;

/** «O-13 · Gran contribuyente» en el idioma activo. */
export function etiquetaResponsabilidad(valor: string, t?: Traductor): string {
  const r = RESPONSABILIDADES_FISCALES.find((x) => x.valor === valor);
  if (!r) return valor;
  return t ? t(`responsabilidades.${r.clave}`) : r.etiqueta;
}

export const TIPOS_DOCUMENTO_DIAN = [
  { valor: '31', clave: 'nit', etiqueta: '31 · NIT' },
  { valor: '13', clave: 'cc', etiqueta: '13 · Cédula de ciudadanía' },
  { valor: '22', clave: 'ce', etiqueta: '22 · Cédula de extranjería' },
  { valor: '42', clave: 'docExtranjero', etiqueta: '42 · Doc. identificación extranjero' },
  { valor: '12', clave: 'ti', etiqueta: '12 · Tarjeta de identidad' },
  { valor: '41', clave: 'pasaporte', etiqueta: '41 · Pasaporte' },
  { valor: '91', clave: 'nuip', etiqueta: '91 · NUIP' },
] as const;

/** «13 · Cédula de ciudadanía» en el idioma activo; `undefined` si el código no es conocido. */
export function etiquetaDocumentoDian(valor: string | null | undefined, t?: Traductor): string | undefined {
  const d = TIPOS_DOCUMENTO_DIAN.find((x) => x.valor === valor);
  if (!d) return undefined;
  return t ? t(`documentosDian.${d.clave}`) : d.etiqueta;
}

/** «•••• 4521»: la cuenta bancaria nunca se pinta completa en el detalle. */
export function cuentaEnmascarada(cuenta: string | null | undefined): string {
  const limpia = (cuenta ?? '').replace(/\s+/g, '');
  if (!limpia) return '';
  if (limpia.length <= 4) return limpia;
  return `•••• ${limpia.slice(-4)}`;
}
