/**
 * Reglas puras de «Comprar dominio» (Figma B/07-13…07-18): qué direcciones se
 * consultan al buscar, cuál se recomienda, cuándo hay «Oferta primer año» y
 * cómo se arma el contacto que exige el registrador. Sin red: la consulta la
 * hace `/api/domains/check`, el único punto de búsqueda.
 */
import { esHostValido, nombreBaseBusqueda, normalizarHost } from './nombreDns';
import type { TitularDominio } from './tiposDominios';
import { aE164, esTelefonoValido } from '@/lib/utils/telefono';

/** Extensiones que se sugieren, en orden (B/07-13: .com, .co, .com.co, .shop…). */
export const EXTENSIONES_SUGERIDAS: readonly string[] = ['com', 'co', 'com.co', 'shop', 'store'];
export const MAX_SUGERENCIAS = 5;

/**
 * Direcciones a consultar: si la persona escribió un dominio completo, ese
 * primero; luego el mismo nombre con las extensiones sugeridas. Sin repetidos.
 */
export function candidatosBusqueda(entrada: string): string[] {
  const host = normalizarHost(entrada);
  const base = nombreBaseBusqueda(entrada);
  if (base.length < 2) return [];
  const lista: string[] = [];
  if (host.includes('.') && esHostValido(host)) lista.push(host);
  for (const ext of EXTENSIONES_SUGERIDAS) {
    const c = `${base}.${ext}`;
    if (!lista.includes(c)) lista.push(c);
  }
  return lista.slice(0, MAX_SUGERENCIAS);
}

export interface OpcionDominio {
  dominio: string;
  disponible: boolean;
  precio: number | null;
  renovacion: number | null;
  moneda: string;
}

/** La primera disponible con precio es la recomendada. */
export function recomendada(opciones: readonly OpcionDominio[]): string | null {
  return opciones.find((o) => o.disponible && o.precio !== null)?.dominio ?? null;
}

/** «Oferta primer año»: el primer año cuesta menos que la renovación. */
export function esOferta(o: OpcionDominio): boolean {
  return o.disponible && o.precio !== null && o.renovacion !== null && o.precio < o.renovacion;
}

/** Alternativas cuando la elegida se acaba de registrar (B/07-18): disponibles y distintas. */
export function alternativas(opciones: readonly OpcionDominio[], sin: string): OpcionDominio[] {
  return opciones.filter((o) => o.dominio !== sin && o.disponible && o.precio !== null);
}

export type CampoTitular = keyof TitularDominio;
export type ErroresTitular = Partial<Record<CampoTitular, 'obligatorio' | 'correoInvalido' | 'telefonoInvalido'>>;

/** Validación del titular (la regla real la repite el servidor). Puro. */
export function validarTitular(t: TitularDominio): ErroresTitular {
  const e: ErroresTitular = {};
  const obligatorios: CampoTitular[] = ['nombre', 'correo', 'telefono', 'direccion', 'ciudad', 'departamento', 'codigoPostal', 'pais'];
  for (const c of obligatorios) if (!t[c]?.trim()) e[c] = 'obligatorio';
  if (!e.correo && !/^\S+@\S+\.\S+$/.test(t.correo.trim())) e.correo = 'correoInvalido';
  // Con indicativo explícito y válido para su país (libphonenumber): el
  // registrador rechaza un número incompleto con INVALID_PHONE.
  if (!e.telefono && (!t.telefono.trim().startsWith('+') || !esTelefonoValido(t.telefono))) e.telefono = 'telefonoInvalido';
  if (!e.pais && !/^[A-Z]{2}$/.test(t.pais)) e.pais = 'obligatorio';
  return e;
}

/**
 * Contacto en el formato del registrador (`/api/domains/purchase`). El
 * registrador pide nombre y apellido: la razón social va entera en el nombre
 * y, si es una sola palabra, se repite como apellido.
 */
export function contactoRegistrador(t: TitularDominio) {
  const partes = t.nombre.trim().split(/\s+/);
  const firstName = partes[0] ?? '';
  const lastName = partes.slice(1).join(' ') || firstName;
  return {
    firstName,
    lastName,
    email: t.correo.trim(),
    // E.164 («+573005550100»): el registrador no acepta espacios.
    phone: aE164(t.telefono) ?? t.telefono.trim(),
    address1: t.direccion.trim(),
    city: t.ciudad.trim(),
    state: t.departamento.trim(),
    zip: t.codigoPostal.trim(),
    country: t.pais.trim().toUpperCase(),
  };
}

/** Países del selector del titular (ISO 3166-1); el nombre lo da `Intl.DisplayNames` en el idioma activo. */
export const PAISES_TITULAR: readonly string[] = ['CO', 'MX', 'PE', 'EC', 'CL', 'AR', 'VE', 'PA', 'CR', 'GT', 'DO', 'BO', 'PY', 'UY', 'SV', 'HN', 'NI', 'US', 'ES', 'BR', 'CA', 'FR', 'PT'];

export type FalloCompra =
  | { tipo: 'no_disponible' }
  | { tipo: 'rechazado'; codigo: string | null; mensaje: string | null }
  | { tipo: 'registrador'; reembolsado: boolean }
  | { tipo: 'telefono' }
  | { tipo: 'sin_servicio' }
  | { tipo: 'general'; mensaje: string | null };

/** Traduce la respuesta de error de `/api/domains/purchase` a la pantalla que toca (B/07-18…07-20). Puro. */
export function falloDeCompra(estado: number, codigo: string | null, mensaje: string | null): FalloCompra {
  if (codigo === 'DOMAIN_ALREADY_REGISTERED') return { tipo: 'no_disponible' };
  if (codigo === 'DOMAIN_REGISTRATION_FAILED') return { tipo: 'registrador', reembolsado: true };
  if (codigo === 'REFUND_PENDING') return { tipo: 'registrador', reembolsado: false };
  if (codigo === 'INVALID_PHONE') return { tipo: 'telefono' };
  if (estado === 503) return { tipo: 'sin_servicio' };
  if (estado === 400 && mensaje && /pago/i.test(mensaje)) return { tipo: 'rechazado', codigo: null, mensaje: null };
  return { tipo: 'general', mensaje };
}
