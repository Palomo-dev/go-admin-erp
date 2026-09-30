// ============================================================
// ¿De qué sucursal sale la zona horaria? — regla única (2026-09-30).
//
// Decisión del dueño: la zona es la de la SUCURSAL si la tiene; si no, la de
// la ORGANIZACIÓN; el fallback del sistema (DEFAULT_TIMEZONE) solo como último recurso.
// No existe zona por persona: la zona nunca sale del perfil del usuario.
//
// Qué sucursal cuenta, en este orden:
//   1. La del DATO (`sale.branch_id`, `payment.branch_id`…), cuando el
//      llamador la pasa. `null` explícito significa «el dato no tiene
//      sucursal» → zona de la organización. (Fase A3, sin cambios.)
//   2. Si el llamador no pasa nada (`undefined`), la sucursal ACTIVA del
//      header. Con «Todas las sucursales» no hay sucursal activa → organización.
//
// La cascada en sí (sucursal → organización → fallback, y qué hacer con una
// zona ilegible) NO vive aquí: es `resolveTimezoneForBranch`, gemela de
// `fn_timezone_for` en la base. Este módulo solo decide QUÉ sucursal se le
// pasa. Puro: sin React ni red, para probarlo con TZ=UTC y TZ=America/Bogota.
// ============================================================

/** Selección del header tal como la expone `BranchContext`. */
export interface SeleccionSucursalHeader {
  selectedBranchId: number | null;
  isAllSelected: boolean;
}

function idValido(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

/** Sucursal activa del header, o `null` con «Todas» o sin selección. */
export function sucursalActivaDelHeader(
  seleccion: SeleccionSucursalHeader | null | undefined,
): number | null {
  if (!seleccion || seleccion.isAllSelected) return null;
  return idValido(seleccion.selectedBranchId) ? seleccion.selectedBranchId : null;
}

/**
 * Sucursal cuya zona se aplica.
 *
 * @param branchIdDelDato `undefined` = el llamador no la sabe (se usa la del
 *   header); `null` = el dato no tiene sucursal (organización); número = la
 *   sucursal del dato.
 * @param sucursalActiva la del header (`sucursalActivaDelHeader`).
 */
export function sucursalParaZona(
  branchIdDelDato: number | null | undefined,
  sucursalActiva: number | null | undefined,
): number | null {
  if (branchIdDelDato === undefined) {
    return idValido(sucursalActiva) ? sucursalActiva : null;
  }
  return idValido(branchIdDelDato) ? branchIdDelDato : null;
}
