'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { Product } from '@/components/pos/types';
import { getPosDisplayEmitter } from '@/lib/pos/display/posDisplay';
import { buildDisplayWeighing } from '@/lib/pos/display/weighing';
import { decimalesCantidad, simboloUnidad } from '@/lib/pos/peso';

/**
 * Pesada en la pantalla del cliente (docs/design/PRODUCTOS-POR-PESO-BASCULA.md
 * §2.6): mientras «Pesar» está abierto en la caja, el cliente ve
 * «Pesando: 0,735 kg × $ 18.900 / kg = $ 13.892».
 *
 * Solo si la regla de la organización `pos_pesaje.peso_en_pantalla_cliente`
 * lo permite (activa por defecto; la resuelve `pos_pesaje_contexto`). Si el
 * interruptor de la pantalla está apagado, el emisor no publica nada: no hay
 * que comprobarlo aquí. Al cerrar el diálogo o desmontar, la pesada se retira.
 */
export function usePesadaEnPantalla(activa: boolean): {
  publicar: (producto: Product, precioPorUnidad: number, cantidad: number | null) => void;
  retirar: () => void;
} {
  const publicada = useRef(false);
  const { decimals } = useMonedaOrganizacion();

  const retirar = useCallback(() => {
    if (!publicada.current) return;
    publicada.current = false;
    getPosDisplayEmitter().setWeighing(null);
  }, []);

  const publicar = useCallback(
    (producto: Product, precioPorUnidad: number, cantidad: number | null) => {
      if (!activa) return;
      const pesada = buildDisplayWeighing({
        name: producto.name,
        qty: cantidad,
        unit: simboloUnidad(producto.unit_code) || (producto.unit_code ?? '').trim(),
        decimals: decimalesCantidad(producto),
        unitPrice: precioPorUnidad,
        moneyDecimals: decimals,
      });
      if (!pesada) return;
      publicada.current = true;
      getPosDisplayEmitter().setWeighing(pesada);
    },
    [activa, decimals],
  );

  // La regla se apagó con el diálogo abierto, o la caja se desmonta: se retira.
  useEffect(() => {
    if (!activa) retirar();
  }, [activa, retirar]);
  useEffect(() => retirar, [retirar]);

  return { publicar, retirar };
}
