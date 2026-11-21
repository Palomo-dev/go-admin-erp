'use client';

import { useEffect, useState } from 'react';
import { PromotionsService } from './promotionsService';

/**
 * `pos.promociones.gestionar` de la sesión, resuelto en el servidor
 * (`fn_tiene_permiso`). Mientras responde, `false`: no se ofrecen acciones que
 * luego la base rechazaría.
 */
export function usePuedeGestionarPromociones(organizationId: number | null | undefined): boolean {
  const [puede, setPuede] = useState(false);
  useEffect(() => {
    if (!organizationId) return;
    let vigente = true;
    PromotionsService.puedeGestionar()
      .then((p) => vigente && setPuede(p))
      .catch(() => vigente && setPuede(false));
    return () => {
      vigente = false;
    };
  }, [organizationId]);
  return puede;
}
