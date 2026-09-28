'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { recipeService, type CostoReceta } from '@/lib/services/recipeService';
import { crearDebounce } from '../debounce';
import { recetaAPayload, type RecetaBorrador } from './recetaLogica';

/**
 * Costo en vivo de un borrador de receta (debounce de 400 ms): pide al servidor
 * `fn_receta_costo`, el mismo cálculo del reporte y de la venta. Las respuestas
 * viejas se descartan por turno. Sin ingredientes no llama.
 */
export interface EstadoCostoReceta {
  costo: CostoReceta | null;
  cargando: boolean;
  error: boolean;
  /** Vuelve a pedir el costo (tras crear una conversión, p. ej.). */
  recalcular: () => void;
}

export function useCostoReceta(
  organizacionId: number | null,
  sucursalId: number | null,
  borrador: RecetaBorrador | null,
  msDebounce = 400,
): EstadoCostoReceta {
  const [costo, setCosto] = useState<CostoReceta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const turno = useRef(0);

  const payload = useMemo(() => {
    if (!borrador) return null;
    const conProducto = borrador.ingredientes.filter((i) => i.ingredientProductId > 0);
    if (conProducto.length === 0) return null;
    return JSON.stringify(recetaAPayload(borrador));
  }, [borrador]);

  useEffect(() => {
    if (!organizacionId || !payload) {
      setCosto(null);
      setCargando(false);
      setError(false);
      return;
    }
    const mio = ++turno.current;
    setCargando(true);
    const d = crearDebounce(async () => {
      try {
        const r = await recipeService.costo(organizacionId, sucursalId, JSON.parse(payload));
        if (mio !== turno.current) return;
        setCosto(r);
        setError(false);
      } catch {
        if (mio !== turno.current) return;
        setError(true);
      } finally {
        if (mio === turno.current) setCargando(false);
      }
    }, msDebounce);
    d.llamar();
    return () => d.cancelar();
  }, [organizacionId, sucursalId, payload, msDebounce, intento]);

  return { costo, cargando, error, recalcular: () => setIntento((n) => n + 1) };
}
