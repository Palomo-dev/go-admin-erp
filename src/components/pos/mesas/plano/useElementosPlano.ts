'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBranch } from '@/lib/context/BranchContext';
import type { ElementoEnPlano } from './planoMesasLogica';
import { obtenerElementosPlano } from './planoService';

/**
 * Elementos fijos del plano de la sede (columna, jardinera, barra…). Se cargan
 * al entrar y al cambiar de sede; `recargar` después de guardar. Con «Todas
 * las sucursales» no hay plano de una sede: lista vacía.
 */
export function useElementosPlano(): { elementos: ElementoEnPlano[]; recargar: () => Promise<void> } {
  const { branchFilter } = useBranch();
  const [elementos, setElementos] = useState<ElementoEnPlano[]>([]);
  const vigente = useRef(0);

  const recargar = useCallback(async () => {
    const turno = ++vigente.current;
    const lista = branchFilter ? await obtenerElementosPlano() : [];
    // Si cambió la sede mientras cargaba, gana la carga más reciente.
    if (turno === vigente.current) setElementos(lista);
  }, [branchFilter]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { elementos, recargar };
}
