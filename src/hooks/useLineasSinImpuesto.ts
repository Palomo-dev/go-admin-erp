'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import {
  fetchTaxCoverage,
  lineaQuedaSinImpuesto,
  type LineaImpuesto,
  type TaxCoverage,
} from '@/lib/services/taxCoverage';

export interface LineaConNombre extends LineaImpuesto {
  nombre: string;
}

export interface LineaSinImpuesto {
  /** Posición de la línea en el arreglo recibido. */
  index: number;
  nombre: string;
  productId: number | null;
  productUuid: string | null;
}

/**
 * Advierte qué líneas se van a emitir con tarifa 0 por falta de configuración
 * de impuestos (ver `taxCoverage.ts`). Solo lee: no cambia cómo se calcula ni
 * se guarda nada.
 *
 * Si la consulta falla (p. ej. POS sin conexión) no advierte: la advertencia
 * nunca bloquea ni debe estorbar la venta.
 */
export function useLineasSinImpuesto(
  organizationId: number | null | undefined,
  lineas: LineaConNombre[],
  docTaxRate = 0,
) {
  const [coverage, setCoverage] = useState<TaxCoverage | null>(null);

  // Solo se vuelve a consultar si cambia el conjunto de productos, no con cada
  // edición de cantidad o precio.
  const productKey = useMemo(
    () =>
      Array.from(
        new Set(
          lineas
            .map((l) => Number(l.productId))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      )
        .sort((a, b) => a - b)
        .join(','),
    [lineas],
  );

  useEffect(() => {
    if (!organizationId) {
      setCoverage(null);
      return;
    }
    let cancelado = false;
    const ids = productKey ? productKey.split(',').map(Number) : [];
    fetchTaxCoverage(supabase, Number(organizationId), ids)
      .then((c) => {
        if (!cancelado) setCoverage(c);
      })
      .catch((err) => {
        console.warn('[useLineasSinImpuesto] No se pudo verificar la configuración de impuestos:', err);
        if (!cancelado) setCoverage(null);
      });
    return () => {
      cancelado = true;
    };
  }, [organizationId, productKey]);

  const sinImpuesto = useMemo<LineaSinImpuesto[]>(() => {
    if (!coverage) return [];
    const out: LineaSinImpuesto[] = [];
    lineas.forEach((linea, index) => {
      if (!lineaQuedaSinImpuesto(linea, coverage, { docTaxRate })) return;
      const productId = linea.productId != null ? Number(linea.productId) : null;
      out.push({
        index,
        nombre: linea.nombre,
        productId,
        productUuid: productId != null ? coverage.productUuids.get(productId) ?? null : null,
      });
    });
    return out;
  }, [coverage, lineas, docTaxRate]);

  const indices = useMemo(() => new Set(sinImpuesto.map((l) => l.index)), [sinImpuesto]);

  return { sinImpuesto, indices };
}
