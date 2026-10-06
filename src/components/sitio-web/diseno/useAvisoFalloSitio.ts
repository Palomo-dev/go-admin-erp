'use client';

/**
 * Motivo de un fallo de `useSitioV2().guardar` o `.publicar`, leído DESPUÉS de
 * que React pinte el estado nuevo.
 *
 * Por qué existe: `guardar` devuelve `Promise<boolean>` y `publicar`, `null` al
 * fallar; el motivo (`error`, `conflicto`) queda en el estado del hook. Leerlo
 * justo después del `await` (`sitio.conflicto`) devuelve el valor del render
 * ANTERIOR: un 409 se veía como «sin conflicto» y salía un toast de error vacío
 * además del diálogo de conflicto. Aquí el aviso se encola y se resuelve en un
 * efecto, cuando el estado ya refleja el fallo y no hay otra operación en curso.
 *
 * No cambia `useSitioV2` (hook compartido del módulo): solo lee lo que expone.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SitioV2 } from '../useSitioV2';

export interface MotivoFalloSitio {
  /** 409: otra persona guardó o publicó antes. Lo atiende `DialogoConflicto`. */
  conflicto: boolean;
  /** Mensaje del error (vacío si no hubo error, p. ej. sin borrador). */
  mensaje: string;
}

export type AvisoFalloSitio = (motivo: MotivoFalloSitio) => void;

type EstadoFallo = Pick<SitioV2, 'error' | 'conflicto' | 'guardando' | 'publicando'>;

/** Motivo a partir del estado ya pintado del hook. Puro: lo prueban los tests. */
export function motivoFallo(sitio: Pick<SitioV2, 'error' | 'conflicto'>): MotivoFalloSitio {
  return { conflicto: sitio.conflicto || !!sitio.error?.esConflicto, mensaje: sitio.error?.message ?? '' };
}

/**
 * Devuelve `alFallar(aviso)`: llámalo cuando `guardar`/`publicar` falle y
 * `aviso` recibirá el motivo real en cuanto el estado lo refleje.
 */
export function useAvisoFalloSitio(sitio: EstadoFallo): (aviso: AvisoFalloSitio) => void {
  const pendiente = useRef<AvisoFalloSitio | null>(null);
  const [pedido, setPedido] = useState(0);
  const { error, conflicto, guardando, publicando } = sitio;

  useEffect(() => {
    const aviso = pendiente.current;
    if (!aviso || guardando || publicando) return;
    pendiente.current = null;
    aviso(motivoFallo({ error, conflicto }));
  }, [pedido, error, conflicto, guardando, publicando]);

  return useCallback((aviso: AvisoFalloSitio) => {
    pendiente.current = aviso;
    setPedido((n) => n + 1);
  }, []);
}
