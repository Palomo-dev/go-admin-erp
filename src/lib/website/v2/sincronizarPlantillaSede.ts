'use client';

/**
 * Enganche de la plantilla del sitio de sede en el GUARDADO de la sucursal (`branchService`).
 *
 * Contrato (para el formulario de sucursal o cualquier otra UI que cree o edite sucursales):
 * 1. Tras crear una sucursal con `branch_type`, o cambiarle el `branch_type`, se llama
 *    `sincronizarPlantillaSede(id)`. `branchService.createBranch`/`updateBranch` ya lo hacen.
 * 2. Nunca lanza ni bloquea el guardado: si falla, la sucursal queda guardada y el sitio nace con
 *    la plantilla la primera vez que se abra en el editor (`crearSitio`).
 * 3. Emite `window` → `EVENTO_PLANTILLA_SEDE` con el `ResultadoPlantillaSede`. Si la `accion` es
 *    `pendiente_confirmacion` (el sitio de la sede ya tiene contenido propio), la UI ofrece
 *    «Aplicar plantilla de <tipo>» con `DialogoAplicarPlantillaSede`.
 */
import { clienteSitiosV2 } from './clienteSitiosV2';
import type { ResultadoPlantillaSede } from './plantillaSede';

export const EVENTO_PLANTILLA_SEDE = 'go:plantilla-sede';

export async function sincronizarPlantillaSede(branchId: number | null | undefined): Promise<ResultadoPlantillaSede | null> {
  if (typeof branchId !== 'number' || !Number.isInteger(branchId) || branchId <= 0) return null;
  try {
    const resultado = await clienteSitiosV2.aplicarPlantillaSede(branchId, 'auto');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<ResultadoPlantillaSede>(EVENTO_PLANTILLA_SEDE, { detail: resultado }));
    }
    return resultado;
  } catch (error) {
    // Sin permiso de sitio web, sin red o cualquier otro fallo: la sucursal ya quedó guardada.
    console.warn('[plantillaSede] no se pudo preparar el sitio de la sede', {
      branchId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
