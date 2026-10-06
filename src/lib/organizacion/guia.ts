/**
 * Guía «Configura tu organización» de Organización › Información (Figma 08,
 * sección 4): cinco pasos con su estado. Función pura; la pantalla reúne los
 * datos (logo, sedes, equipo, método de pago, sitio web).
 */

export type ClavePasoGuia = 'logo' | 'sede' | 'equipo' | 'pago' | 'sitio';
/** `noDisponible`: la persona no puede hacerlo (p. ej. sin permiso de facturación) o no se pudo comprobar. */
export type EstadoPasoGuia = 'hecho' | 'pendiente' | 'noDisponible';

export interface DatosGuia {
  tieneLogo: boolean;
  /** Sedes activas con dirección. */
  sedesConDireccion: number;
  /** Miembros activos (incluida la persona). */
  miembrosActivos: number;
  invitacionesVigentes: number;
  /** `null` = no se pudo saber o no tiene permiso de facturación. */
  tieneMetodoPago: boolean | null;
  /** `null` = no se pudo saber. */
  sitioPublicado: boolean | null;
}

export interface PasoGuia {
  clave: ClavePasoGuia;
  estado: EstadoPasoGuia;
  href: string;
}

const RUTAS: Record<ClavePasoGuia, string> = {
  logo: '#logo',
  sede: '/app/organizacion/sucursales',
  equipo: '/app/organizacion/invitaciones?invitar=1',
  pago: '/app/organizacion/plan',
  sitio: '/app/sitio-web',
};

function bool(v: boolean | null): EstadoPasoGuia {
  if (v === null) return 'noDisponible';
  return v ? 'hecho' : 'pendiente';
}

export function pasosGuia(d: DatosGuia): PasoGuia[] {
  const estados: Record<ClavePasoGuia, EstadoPasoGuia> = {
    logo: d.tieneLogo ? 'hecho' : 'pendiente',
    sede: d.sedesConDireccion > 0 ? 'hecho' : 'pendiente',
    equipo: d.miembrosActivos > 1 || d.invitacionesVigentes > 0 ? 'hecho' : 'pendiente',
    pago: bool(d.tieneMetodoPago),
    sitio: bool(d.sitioPublicado),
  };
  return (Object.keys(RUTAS) as ClavePasoGuia[]).map((clave) => ({ clave, estado: estados[clave], href: RUTAS[clave] }));
}

export function progresoGuia(pasos: readonly PasoGuia[]): { hechos: number; total: number; completa: boolean } {
  const contables = pasos.filter((p) => p.estado !== 'noDisponible');
  const hechos = contables.filter((p) => p.estado === 'hecho').length;
  return { hechos, total: contables.length, completa: contables.length > 0 && hechos === contables.length };
}
