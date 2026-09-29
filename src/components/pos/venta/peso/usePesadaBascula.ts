'use client';

/**
 * Estado de una pesada con báscula dentro de «Pesar»: tara del POS (la
 * lectura actual, la recordada en la sesión para ese producto o la
 * predefinida del producto), cero y la vista (estable, inestable, fuera de
 * rango, error) con si se puede agregar (docs/design/PRODUCTOS-POR-PESO-BASCULA.md
 * §2.6, §2.9 y §11). El lector llega de fuera: el del POS (siempre abierto
 * mientras la caja está en pantalla) o uno propio del diálogo.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Product } from '@/components/pos/types';
import { codigoUnidad } from '@/lib/pos/peso';
import type { Pesaje } from '@/lib/pos/peso/pesada';
import { convertirPeso, entradaParaProducto, pesajeBascula, vistaLectura, type VistaLectura } from '@/lib/pos/bascula/pesada';
import { recordarTara, taraInicial } from '@/lib/pos/bascula/taraSesion';
import type { ConfigBascula } from '@/lib/pos/bascula/tipos';
import type { LectorEnVivo } from '@/lib/pos/bascula/useLectorBascula';

export interface PesadaBascula {
  lector: LectorEnVivo;
  vista: VistaLectura;
  /** Tara aplicada en el POS (unidad del producto); 0 sin tara. */
  tara: number;
  /** Tara predefinida del producto (`default_tare_qty`) o null. */
  taraProducto: number | null;
  tomarTara: () => void;
  usarTaraProducto: () => void;
  quitarTara: () => void;
  /** `notes.pesaje` de la lectura actual (solo si `vista.puedeAgregar`). */
  pesaje: () => Pesaje | null;
}

export function usePesadaBascula(params: {
  config: ConfigBascula | null;
  lector: LectorEnVivo;
  activo: boolean;
  producto: Product | null;
}): PesadaBascula {
  const { config, lector, activo, producto } = params;
  const [tara, setTaraEstado] = useState(0);

  const unidadProducto = codigoUnidad(producto?.unit_code) || 'KG';
  const tp = Number(producto?.default_tare_qty);
  const taraProducto = Number.isFinite(tp) && tp > 0 ? tp : null;

  // Al abrir: la tara recordada en la sesión para el producto o la predefinida.
  useEffect(() => {
    if (activo) setTaraEstado(taraInicial(producto));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, producto?.id]);

  const setTara = useCallback(
    (valor: number) => {
      setTaraEstado(valor);
      recordarTara(producto?.id, valor);
    },
    [producto?.id],
  );

  const vista = useMemo(
    () => vistaLectura(entradaParaProducto({ lector: lector.estado, producto, config, tara })),
    [lector.estado, producto, config, tara],
  );

  const tomarTara = useCallback(() => {
    const e = lector.estado;
    if (!e || e.peso === null || e.lectura?.netoDeBascula) return;
    const enProducto = convertirPeso(e.peso, e.unidad, unidadProducto);
    if (enProducto !== null && enProducto > 0) setTara(enProducto);
  }, [lector.estado, unidadProducto, setTara]);

  const usarTaraProducto = useCallback(() => setTara(taraProducto ?? 0), [taraProducto, setTara]);
  const quitarTara = useCallback(() => setTara(0), [setTara]);

  const pesaje = useCallback((): Pesaje | null => {
    if (!config || !vista.puedeAgregar || vista.neto === null) return null;
    return pesajeBascula({ basculaId: config.id, vista, unidadProducto });
  }, [config, vista, unidadProducto]);

  return { lector, vista, tara, taraProducto, tomarTara, usarTaraProducto, quitarTara, pesaje };
}
