'use client';

/**
 * Arrastrar y soltar en un menú (Figma A/04c y D/04-09) sobre `useArrastreArbol` del kit:
 * soltar un enlace sobre otro lo anida debajo; soltar en la franja lo deja en el primer nivel; y
 * soltar una categoría del Inventario (columna central) la añade como enlace. El kit trabaja con
 * ids numéricos: los enlaces se numeran por su posición y las categorías van en negativo.
 * La vía accesible (y la de móvil) es Subir / Bajar / «Mover a…».
 */
import { useCallback, useMemo } from 'react';
import { useArrastreArbol, type PropsNodoArrastre, type ZonaSoltarRaizProps } from '@/components/kit';
import type { ItemMenu } from '@/lib/website/contrato/documentoSitio';
import { aplanarItems, cabeHijo, moverItem, puedeAnidar } from './operacionesMenu';

export interface OpcionesArrastreMenu {
  items: readonly ItemMenu[];
  onCambiar: (items: ItemMenu[]) => void;
  /** Soltar una categoría del Inventario en `padreId` (`null` = primer nivel). */
  onSoltarCategoria?: (categoriaId: number, padreId: string | null) => void;
  deshabilitado?: boolean;
  ayuda?: string;
}

export interface ArrastreMenu {
  nodoItem: (id: string) => PropsNodoArrastre | undefined;
  nodoCategoria: (categoriaId: number) => PropsNodoArrastre | undefined;
  raiz: ZonaSoltarRaizProps;
  /** Se está arrastrando algo (enlace o categoría). */
  activo: boolean;
}

export function useArrastreMenu({ items, onCambiar, onSoltarCategoria, deshabilitado, ayuda }: OpcionesArrastreMenu): ArrastreMenu {
  const { numDe, idDe } = useMemo(() => {
    const plano = aplanarItems(items);
    return {
      numDe: new Map(plano.map((n, i) => [n.item.id, i + 1])),
      idDe: new Map(plano.map((n, i) => [i + 1, n.item.id])),
    };
  }, [items]);

  const puedeSoltar = useCallback(
    (origen: number, destino: number | null): true | string => {
      if (destino !== null && destino < 0) return 'categoria';
      const padre = destino === null ? null : idDe.get(destino) ?? null;
      if (destino !== null && padre === null) return 'no_existe';
      if (origen < 0) return onSoltarCategoria && cabeHijo(items, padre) ? true : 'profundidad';
      const id = idDe.get(origen);
      if (!id) return 'no_existe';
      return puedeAnidar(items, id, padre);
    },
    [idDe, items, onSoltarCategoria],
  );

  const onSoltar = useCallback(
    (origen: number, destino: number | null) => {
      const padre = destino === null ? null : idDe.get(destino) ?? null;
      if (origen < 0) {
        onSoltarCategoria?.(-origen, padre);
        return;
      }
      const id = idDe.get(origen);
      if (!id) return;
      const r = moverItem(items, id, padre);
      if (r.ok) onCambiar(r.items);
    },
    [idDe, items, onCambiar, onSoltarCategoria],
  );

  const arrastre = useArrastreArbol({ puedeSoltar, onSoltar, deshabilitado, ayuda });

  return {
    nodoItem: (id) => {
      const n = numDe.get(id);
      return n === undefined ? undefined : arrastre.nodo(n);
    },
    nodoCategoria: (categoriaId) => arrastre.nodo(-categoriaId),
    raiz: arrastre.raiz,
    activo: arrastre.arrastrando !== null,
  };
}
