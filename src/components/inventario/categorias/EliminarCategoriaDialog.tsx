'use client';

import { useEffect, useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit';
import { TreeSelect, type OpcionArbol } from '@/components/kit/TreePicker';
import { iconoCategoria } from './iconoCategoria';
import type { CategoriaMovible } from './MoverCategoriaDialog';

/**
 * Eliminar una categoría (Figma: `ConfirmDialog` de eliminar, 440 px).
 *
 * - Nombra la categoría y dice qué pasa con lo que cuelga de ella.
 * - **Con productos no se puede eliminar a secas**: hay que elegir a qué
 *   categoría pasan. Así ningún producto queda sin categoría en silencio
 *   (`products.category_id` es ON DELETE SET NULL). El servidor lo exige
 *   igual (`eliminar_categoria` → `CATEGORIA_CON_PRODUCTOS`).
 * - Las subcategorías suben un nivel: al padre de la eliminada o a la raíz.
 */
export interface EliminarCategoriaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  categoria: (CategoriaMovible & { productos: number; hijas: number }) | null;
  /** Todas las de la organización, para elegir el destino de los productos. */
  categorias: readonly CategoriaMovible[];
  onEliminar: (destinoProductos: number | null) => Promise<void>;
}

export function EliminarCategoriaDialog({
  abierto,
  onAbiertoChange,
  categoria,
  categorias,
  onEliminar,
}: EliminarCategoriaDialogProps) {
  const [destino, setDestino] = useState<number | null | undefined>(undefined);
  const [eliminando, setEliminando] = useState(false);

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

  const deshabilitadas = useMemo(
    () => (categoria ? new Map([[categoria.id, 'Es la categoría que eliminas']]) : undefined),
    [categoria],
  );

  if (!categoria) return null;

  const padre = categoria.parent_id !== null ? categorias.find((c) => c.id === categoria.parent_id) : undefined;
  const conProductos = categoria.productos > 0;
  const destinoSubcategorias = padre ? `«${padre.name}»` : 'la raíz';

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={`¿Eliminar «${categoria.name}»?`}
      descripcion="Esta acción no se puede deshacer."
      ancho={440}
      primario={{
        etiqueta: conProductos ? 'Mover productos y eliminar' : 'Eliminar',
        destructiva: true,
        cargando: eliminando,
        deshabilitada: conProductos && (destino === undefined || destino === null),
        motivo: 'Elige a qué categoría pasan sus productos',
        onClick: async () => {
          setEliminando(true);
          try {
            await onEliminar(conProductos ? (destino ?? null) : null);
            onAbiertoChange(false);
          } finally {
            setEliminando(false);
          }
        },
      }}
    >
      <ul className="flex flex-col gap-1.5 text-sm leading-5 text-fg-secondary">
        <li>
          {conProductos
            ? `Tiene ${categoria.productos} ${categoria.productos === 1 ? 'producto' : 'productos'}. No quedarán sin categoría: elige a cuál pasan.`
            : 'No tiene productos asignados.'}
        </li>
        {categoria.hijas > 0 && (
          <li>
            {`Sus ${categoria.hijas} ${categoria.hijas === 1 ? 'subcategoría pasa' : 'subcategorías pasan'} a ${destinoSubcategorias}.`}
          </li>
        )}
        <li>Las reglas de asignación y la marca de favorita del POS se borran con ella.</li>
      </ul>

      {conProductos && (
        <FormField etiqueta="Mover sus productos a" obligatorio>
          {(campo) => (
            <TreeSelect
              id={campo.id}
              aria-labelledby={campo.idEtiqueta}
              opciones={opciones}
              valor={destino ?? undefined}
              onValorChange={(v) => setDestino(v)}
              deshabilitadas={deshabilitadas}
              placeholder="Elegir categoría de destino"
              etiquetaLista="Categoría de destino"
              placeholderBusqueda="Buscar categoría"
            />
          )}
        </FormField>
      )}

      {conProductos && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-[13px] leading-[18px] text-warning-text">
          <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.5} />
          Si prefieres conservarla, desactívala: deja de verse en el POS y en la tienda web y sus productos no cambian.
        </p>
      )}
    </Dialogo>
  );
}
