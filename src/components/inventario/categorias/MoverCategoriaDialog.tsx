'use client';

import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { TreeList, type OpcionArbol } from '@/components/kit/TreePicker';
import { descendientesDe } from '@/components/kit/arbol';
import { iconoCategoria } from './iconoCategoria';

/**
 * Diálogo «Mover a…» (Figma `586:312245`, 520 px). Elige la nueva categoría
 * padre sobre el árbol real. Las categorías que se mueven y **todas sus
 * descendientes** aparecen deshabilitadas con el motivo: elegirlas crearía un
 * ciclo. El servidor lo vuelve a comprobar (`mover_categorias` y el
 * disparador `trg_categories_sin_ciclos`).
 */
export interface CategoriaMovible {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
}

export interface MoverCategoriaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Todas las categorías de la organización (el árbol completo). */
  categorias: readonly CategoriaMovible[];
  /** Las que se mueven. */
  ids: readonly number[];
  onMover: (padreId: number | null) => Promise<void>;
}

export function MoverCategoriaDialog({ abierto, onAbiertoChange, categorias, ids, onMover }: MoverCategoriaDialogProps) {
  const [destino, setDestino] = useState<number | null | undefined>(undefined);
  const [moviendo, setMoviendo] = useState(false);

  const porId = useMemo(() => new Map(categorias.map((c) => [c.id, c] as const)), [categorias]);
  const moviendoUna = ids.length === 1 ? porId.get(ids[0]) : undefined;
  const padreActual = moviendoUna ? moviendoUna.parent_id : undefined;

  useEffect(() => {
    if (abierto) setDestino(undefined);
  }, [abierto]);

  const opciones: OpcionArbol[] = useMemo(
    () =>
      categorias.map((c) => ({
        id: c.id,
        parentId: c.parent_id,
        etiqueta: c.name,
        detalle: `/${c.slug}`,
        icono: iconoCategoria(c.icon),
        color: c.color,
      })),
    [categorias],
  );

  const deshabilitadas = useMemo(() => {
    const mapa = new Map<number, string>();
    for (const id of ids) mapa.set(id, ids.length === 1 ? 'Es la categoría que mueves' : 'Está entre las que mueves');
    const desc = descendientesDe(categorias.map((c) => ({ id: c.id, parentId: c.parent_id })), ids);
    for (const d of desc) {
      if (mapa.has(d)) continue;
      // El ancestro que se mueve y la contiene.
      let actual = porId.get(d)?.parent_id ?? null;
      while (actual !== null && !ids.includes(actual)) actual = porId.get(actual)?.parent_id ?? null;
      const origen = actual !== null ? porId.get(actual)?.name : undefined;
      mapa.set(d, origen ? `Es subcategoría de «${origen}»: crearía un ciclo` : 'Crearía un ciclo');
    }
    return mapa;
  }, [ids, categorias, porId]);

  const numHijas = useMemo(
    () => (moviendoUna ? categorias.filter((c) => c.parent_id === moviendoUna.id).length : 0),
    [moviendoUna, categorias],
  );

  const titulo = moviendoUna ? `Mover «${moviendoUna.name}»` : `Mover ${ids.length} categorías`;
  const descripcion = moviendoUna
    ? numHijas > 0
      ? `Elige la nueva categoría padre. Sus ${numHijas} ${numHijas === 1 ? 'subcategoría se mueve' : 'subcategorías se mueven'} con ella.`
      : 'Elige la nueva categoría padre.'
    : 'Elige la nueva categoría padre. Sus subcategorías se mueven con ellas.';

  const sinCambio = destino === undefined || (moviendoUna !== undefined && destino === padreActual);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      descripcion={descripcion}
      ancho={520}
      primario={{
        etiqueta: 'Mover aquí',
        cargando: moviendo,
        deshabilitada: sinCambio,
        motivo: destino === undefined ? 'Elige una categoría de destino' : 'Ya está en esa categoría',
        onClick: async () => {
          if (destino === undefined) return;
          setMoviendo(true);
          try {
            await onMover(destino);
            onAbiertoChange(false);
          } finally {
            setMoviendo(false);
          }
        },
      }}
    >
      <TreeList
        etiqueta="Nueva categoría padre"
        opciones={opciones}
        valor={destino}
        onValorChange={setDestino}
        opcionRaiz={{ etiqueta: 'Sin categoría padre', detalle: 'Queda como categoría principal' }}
        deshabilitadas={deshabilitadas}
        actual={padreActual}
        placeholderBusqueda="Buscar categoría de destino"
        altoMaximo={262}
        autoFocus
      />
      <p className="flex items-start gap-2 rounded-lg bg-info-subtle px-3 py-2.5 text-[13px] leading-[18px] text-info-text">
        <Info aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.5} />
        El slug no cambia al mover: los enlaces de la tienda web siguen funcionando.
      </p>
    </Dialogo>
  );
}
