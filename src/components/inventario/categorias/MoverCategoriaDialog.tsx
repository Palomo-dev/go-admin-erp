'use client';

import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialogo } from '@/components/kit/Dialogo';
import { TreeList, type OpcionArbol } from '@/components/kit/TreePicker';
import { descendientesDe } from '@/components/kit/arbol';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
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
  const t = useTranslations('categorias');
  const n = useFormatoEntero();
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
    for (const id of ids) mapa.set(id, ids.length === 1 ? t('mover.esLaQueMueves') : t('mover.estaEntreLasQueMueves'));
    const desc = descendientesDe(categorias.map((c) => ({ id: c.id, parentId: c.parent_id })), ids);
    for (const d of desc) {
      if (mapa.has(d)) continue;
      // El ancestro que se mueve y la contiene.
      let actual = porId.get(d)?.parent_id ?? null;
      while (actual !== null && !ids.includes(actual)) actual = porId.get(actual)?.parent_id ?? null;
      const origen = actual !== null ? porId.get(actual)?.name : undefined;
      mapa.set(d, origen ? t('mover.subcategoriaDe', { origen }) : t('listado.arrastre.ciclo'));
    }
    return mapa;
  }, [ids, categorias, porId, t]);

  const numHijas = useMemo(
    () => (moviendoUna ? categorias.filter((c) => c.parent_id === moviendoUna.id).length : 0),
    [moviendoUna, categorias],
  );

  const titulo = moviendoUna
    ? t('mover.tituloUna', { nombre: moviendoUna.name })
    : t('mover.tituloVarias', { n: n(ids.length) });
  const descripcion = moviendoUna
    ? numHijas > 0
      ? t('mover.descripcionConHijas', { count: numHijas, n: n(numHijas) })
      : t('mover.descripcion')
    : t('mover.descripcionVarias');

  const sinCambio = destino === undefined || (moviendoUna !== undefined && destino === padreActual);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      descripcion={descripcion}
      ancho={520}
      primario={{
        etiqueta: t('mover.moverAqui'),
        cargando: moviendo,
        deshabilitada: sinCambio,
        motivo: destino === undefined ? t('mover.eligeDestino') : t('mover.yaEstaAhi'),
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
        etiqueta={t('mover.nuevaPadre')}
        opciones={opciones}
        valor={destino}
        onValorChange={setDestino}
        opcionRaiz={{ etiqueta: t('mover.sinPadre'), detalle: t('mover.quedaPrincipal') }}
        deshabilitadas={deshabilitadas}
        actual={padreActual}
        placeholderBusqueda={t('mover.buscarDestino')}
        altoMaximo={262}
        autoFocus
      />
      <p className="flex items-start gap-2 rounded-lg bg-info-subtle px-3 py-2.5 text-[13px] leading-[18px] text-info-text">
        <Info aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.5} />
        {t('mover.avisoSlug')}
      </p>
    </Dialogo>
  );
}
