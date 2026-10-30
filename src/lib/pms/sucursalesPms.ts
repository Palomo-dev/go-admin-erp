/**
 * Qué sucursales cuentan para el PMS (hotelería).
 * Las sucursales con branch_type = 'restaurant' no tienen habitaciones: se ocultan
 * en Limpieza y Mantenimiento del PMS y, por defecto, en los reportes PMS consolidados.
 * El selector compartido solo cambia en las rutas de `RUTAS_PMS_SOLO_HOTEL`.
 */
export const RUTAS_PMS_SOLO_HOTEL = ['/app/pms/housekeeping', '/app/pms/mantenimiento'] as const;

type ConTipo = { branch_type?: string | null };

export const esSucursalRestaurante = (b: ConTipo | null | undefined) => b?.branch_type === 'restaurant';

/** Sucursal hotelera para los reportes PMS: tipo 'hotel' o sin tipo (null). */
export const esSucursalHotelera = (b: ConTipo | null | undefined) => !b?.branch_type || b.branch_type === 'hotel';

export function rutaPmsSoloHotel(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return RUTAS_PMS_SOLO_HOTEL.some((r) => pathname === r || pathname.startsWith(r + '/'));
}

/** Sucursales que ofrece el selector en la ruta actual (fuera de esas rutas, todas). */
export function sucursalesParaRuta<T extends ConTipo>(branches: T[], pathname: string | null | undefined): T[] {
  return rutaPmsSoloHotel(pathname) ? branches.filter((b) => !esSucursalRestaurante(b)) : branches;
}
