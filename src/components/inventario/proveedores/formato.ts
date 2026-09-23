/**
 * Textos del dominio de proveedores (listado, tarjeta móvil, detalle y
 * formulario). Funciones puras: se prueban en
 * `src/__tests__/inventario/proveedoresFormato.test.ts`.
 */
import { formatMonedaSinDecimales } from '@/lib/hooks/useOrgCurrency';

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

export const CONDICIONES_PAGO = [
  { valor: 'contado', etiqueta: 'Contado', dias: 0 },
  { valor: 'credito_15', etiqueta: 'Crédito 15 días', dias: 15 },
  { valor: 'credito_30', etiqueta: 'Crédito 30 días', dias: 30 },
  { valor: 'credito_60', etiqueta: 'Crédito 60 días', dias: 60 },
  { valor: 'credito_90', etiqueta: 'Crédito 90 días', dias: 90 },
] as const;

/**
 * «Crédito 30 días» · «Contado». Mandan los días de crédito (lo que se usa al
 * comprar); si no hay, la condición guardada. Antes el listado pintaba
 * `credit_days || 30` y un proveedor de contado salía con 30 días.
 */
export function condicionPago(paymentTerms: string | null | undefined, creditDays: number | null | undefined): string {
  if (creditDays !== null && creditDays !== undefined) {
    return creditDays <= 0 ? 'Contado' : `Crédito ${creditDays} ${creditDays === 1 ? 'día' : 'días'}`;
  }
  const conocida = CONDICIONES_PAGO.find((c) => c.valor === paymentTerms);
  if (conocida) return conocida.etiqueta;
  return paymentTerms ? paymentTerms : 'Sin definir';
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
export function documentoProveedor(p: DocumentoProveedor): string {
  const numero = (p.nit ?? '').trim();
  const sigla =
    SIGLA_DIAN[(p.identification_document_code ?? '').trim()] ?? (p.supplier_type === 'person' ? 'CC' : 'NIT');
  if (!numero) return sigla === 'NIT' ? 'Sin NIT' : `Sin ${sigla}`;
  // El NIT a veces ya trae el DV («900123456-7»): no se duplica.
  const yaTraeDv = numero.includes('-');
  const dv = (p.dv ?? '').trim();
  return `${sigla} ${agruparMiles(numero)}${dv && !yaTraeDv && sigla === 'NIT' ? `-${dv}` : ''}`;
}

export function tipoProveedor(supplierType: string | null | undefined): string {
  return supplierType === 'person' ? 'Persona' : 'Empresa';
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
export function lineaCartera(c: CarteraProveedor): { texto: string; peligro: boolean } {
  const abiertas = c.facturas_abiertas;
  const vencidas = c.facturas_vencidas;
  if (abiertas <= 0 || c.saldo <= 0) return { texto: 'Al día', peligro: false };
  const facturas = `${abiertas} ${abiertas === 1 ? 'factura' : 'facturas'}`;
  if (vencidas <= 0) return { texto: facturas, peligro: false };
  if (vencidas >= abiertas) return { texto: `${facturas} ${abiertas === 1 ? 'vencida' : 'vencidas'}`, peligro: true };
  return { texto: `${facturas} · ${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}`, peligro: true };
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
  { valor: 'comun', etiqueta: 'Responsable de IVA' },
  { valor: 'simple', etiqueta: 'Régimen simple' },
  { valor: 'gran_contribuyente', etiqueta: 'Gran contribuyente' },
  { valor: 'no_responsable', etiqueta: 'No responsable de IVA' },
] as const;

export function etiquetaRegimen(valor: string | null | undefined): string {
  return REGIMENES_TRIBUTARIOS.find((r) => r.valor === valor)?.etiqueta ?? (valor || 'Sin definir');
}

export const TIPOS_CUENTA = [
  { valor: 'savings', etiqueta: 'Ahorros' },
  { valor: 'checking', etiqueta: 'Corriente' },
  { valor: 'other', etiqueta: 'Otro' },
] as const;

export function etiquetaTipoCuenta(valor: string | null | undefined): string {
  return TIPOS_CUENTA.find((t) => t.valor === valor)?.etiqueta ?? (valor || '');
}

/** Responsabilidades fiscales DIAN más comunes (RUT, casilla 53). */
export const RESPONSABILIDADES_FISCALES = [
  { valor: 'O-13', etiqueta: 'O-13 · Gran contribuyente' },
  { valor: 'O-15', etiqueta: 'O-15 · Autorretenedor' },
  { valor: 'O-23', etiqueta: 'O-23 · Agente de retención IVA' },
  { valor: 'O-47', etiqueta: 'O-47 · Régimen simple' },
  { valor: 'R-99-PN', etiqueta: 'R-99-PN · No aplica, otros' },
] as const;

export const TIPOS_DOCUMENTO_DIAN = [
  { valor: '31', etiqueta: '31 · NIT' },
  { valor: '13', etiqueta: '13 · Cédula de ciudadanía' },
  { valor: '22', etiqueta: '22 · Cédula de extranjería' },
  { valor: '42', etiqueta: '42 · Doc. identificación extranjero' },
  { valor: '12', etiqueta: '12 · Tarjeta de identidad' },
  { valor: '41', etiqueta: '41 · Pasaporte' },
  { valor: '91', etiqueta: '91 · NUIP' },
] as const;

/** «•••• 4521»: la cuenta bancaria nunca se pinta completa en el detalle. */
export function cuentaEnmascarada(cuenta: string | null | undefined): string {
  const limpia = (cuenta ?? '').replace(/\s+/g, '');
  if (!limpia) return '';
  if (limpia.length <= 4) return limpia;
  return `•••• ${limpia.slice(-4)}`;
}
