/**
 * Facturación electrónica como servicio de GO Admin, lado del cliente (Figma
 * `1018:89805` pendiente de activación, `1018:90636` activo, `1019:90757`
 * móvil). Lógica pura: qué le falta al emisor y en qué paso de la activación
 * va la organización. El cliente nunca ve credenciales ni ambientes: el paso 3
 * solo dice si GO Admin ya habilitó la cuenta.
 */

export type EstadoServicio = 'active' | 'pending_activation' | 'suspended';

export type CampoEmisor = 'nit' | 'dv' | 'razonSocial' | 'responsabilidades' | 'municipio' | 'correo';

export interface OrganizacionEmisor {
  nit?: string | null;
  tax_id?: string | null;
  dv?: number | string | null;
  legal_name?: string | null;
  name?: string | null;
  fiscal_responsibilities?: readonly string[] | null;
  municipality_id?: string | null;
  email?: string | null;
}

function lleno(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim().length > 0;
}

/** Datos del emisor que exige la DIAN y que la organización aún no tiene. */
export function faltantesEmisor(o: OrganizacionEmisor | null | undefined): CampoEmisor[] {
  if (!o) return ['nit', 'dv', 'razonSocial', 'responsabilidades', 'municipio', 'correo'];
  const faltan: CampoEmisor[] = [];
  if (!lleno(o.nit) && !lleno(o.tax_id)) faltan.push('nit');
  if (!lleno(o.dv)) faltan.push('dv');
  if (!lleno(o.legal_name)) faltan.push('razonSocial');
  if (!o.fiscal_responsibilities || o.fiscal_responsibilities.length === 0) faltan.push('responsabilidades');
  if (!lleno(o.municipality_id)) faltan.push('municipio');
  if (!lleno(o.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(o.email))) faltan.push('correo');
  return faltan;
}

export type PasoActivacion = 'emisor' | 'resolucion' | 'cuenta' | 'primerDocumento';
export type QuienHace = 'tu' | 'goAdmin' | 'automatico';
export type EstadoPaso = 'listo' | 'actual' | 'pendiente';

export interface Paso {
  id: PasoActivacion;
  quien: QuienHace;
  estado: EstadoPaso;
}

export interface EntradaPasos {
  faltanEmisor: readonly CampoEmisor[];
  /** Hay un rango de factura activo con número de resolución. */
  tieneResolucionFactura: boolean;
  /** GO Admin cargó la cuenta del proveedor (sin exponerla). */
  cuentaHabilitada: boolean;
  aceptados: number;
}

const QUIEN: Readonly<Record<PasoActivacion, QuienHace>> = {
  emisor: 'tu',
  resolucion: 'tu',
  cuenta: 'goAdmin',
  primerDocumento: 'automatico',
};

export function pasosActivacion(e: EntradaPasos): Paso[] {
  const hecho: Record<PasoActivacion, boolean> = {
    emisor: e.faltanEmisor.length === 0,
    resolucion: e.tieneResolucionFactura,
    cuenta: e.cuentaHabilitada,
    primerDocumento: e.aceptados > 0,
  };
  const orden: PasoActivacion[] = ['emisor', 'resolucion', 'cuenta', 'primerDocumento'];
  const primeroPendiente = orden.find((p) => !hecho[p]) ?? null;
  return orden.map((id) => ({ id, quien: QUIEN[id], estado: hecho[id] ? 'listo' : id === primeroPendiente ? 'actual' : 'pendiente' }));
}

/** «Solicitar activación» se habilita con los pasos del cliente (1 y 2) listos. */
export function puedeSolicitarActivacion(pasos: readonly Paso[]): boolean {
  return pasos.filter((p) => p.quien === 'tu').every((p) => p.estado === 'listo');
}

export function pasosListos(pasos: readonly Paso[]): number {
  return pasos.filter((p) => p.estado === 'listo').length;
}
