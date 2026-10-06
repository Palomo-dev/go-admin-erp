/**
 * Cupo del plan (usuarios, sucursales, créditos de IA): una sola regla para
 * todas las pantallas de Organización.
 *
 * Antes el «8/10 usuarios» se calculaba en cinco sitios y no coincidía
 * (auditoría 2026-10, P1-8 y P3-1): Miembros contaba también a los inactivos,
 * Invitaciones sumaba las pendientes vencidas y Sucursales contaba las
 * inactivas. Ahora los números salen de `GET /api/me/plan` (miembros activos,
 * sucursales activas, complementos comprados e invitaciones VIGENTES) y aquí
 * solo se deciden el porcentaje, el color y si queda sitio.
 */

/** Umbrales del medidor (Figma 08 · «Uso del plan»): amarillo desde 80 %, rojo desde 95 %. */
export const UMBRAL_ADVERTENCIA = 80;
export const UMBRAL_PELIGRO = 95;

export type NivelUso = 'normal' | 'advertencia' | 'peligro' | 'ilimitado';

/** Porcentaje usado, acotado a 0…100. `null` si no hay tope (plan a medida). */
export function porcentajeUso(actual: number, maximo: number | null | undefined): number | null {
  if (maximo == null) return null;
  if (maximo <= 0) return actual > 0 ? 100 : 0;
  const p = (Math.max(0, actual) / maximo) * 100;
  return Math.min(100, Math.max(0, p));
}

export function nivelUso(actual: number, maximo: number | null | undefined): NivelUso {
  const p = porcentajeUso(actual, maximo);
  if (p === null) return 'ilimitado';
  if (p >= UMBRAL_PELIGRO) return 'peligro';
  if (p >= UMBRAL_ADVERTENCIA) return 'advertencia';
  return 'normal';
}

export interface Cupo {
  /** Lo que ya ocupa el cupo (miembros activos + invitaciones vigentes, o sucursales activas). */
  usados: number;
  /** `null` = ilimitado. */
  maximo: number | null;
  /** Cuántos caben todavía (`null` = sin tope). */
  restantes: number | null;
  /** No cabe ni uno más. */
  lleno: boolean;
  nivel: NivelUso;
}

function cupo(usados: number, maximo: number | null): Cupo {
  const u = Math.max(0, usados);
  const restantes = maximo == null ? null : Math.max(0, maximo - u);
  return { usados: u, maximo, restantes, lleno: restantes === 0, nivel: nivelUso(u, maximo) };
}

/**
 * Cupo de usuarios: los miembros activos más las invitaciones que todavía se
 * pueden aceptar. Una invitación vencida no ocupa sitio (P1-5).
 */
export function cupoUsuarios(miembrosActivos: number, invitacionesVigentes: number, maximo: number | null): Cupo {
  return cupo(miembrosActivos + Math.max(0, invitacionesVigentes), maximo);
}

/** Cupo de sucursales: solo las activas (las inactivas conservan datos, pero no cuentan). */
export function cupoSucursales(sucursalesActivas: number, maximo: number | null): Cupo {
  return cupo(sucursalesActivas, maximo);
}
