'use client';

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Lista vertical que se reordena arrastrando el asa de cada fila (etapas del
 * pipeline: asistente «Nuevo pipeline» y hoja «Etapas»). Solo el asa inicia el
 * arrastre: los campos y botones de la fila siguen funcionando con el clic. El
 * teclado lo resuelve cada fila (Alt+↑/↓ o subir/bajar).
 */
export interface AsaOrdenable {
  /** Se esparcen en el botón del asa. */
  propsAsa: HTMLAttributes<HTMLButtonElement>;
  arrastrando: boolean;
}

export interface ListaOrdenableProps<T> {
  items: readonly T[];
  clave: (item: T) => string;
  onOrdenar: (desde: number, hasta: number) => void;
  deshabilitada?: boolean;
  className?: string;
  children: (item: T, indice: number, asa: AsaOrdenable) => ReactNode;
}

function Fila({ id, deshabilitada, children }: { id: string; deshabilitada?: boolean; children: (asa: AsaOrdenable) => ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled: deshabilitada });
  const estilo: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };
  const propsAsa: HTMLAttributes<HTMLButtonElement> = {
    ...(attributes as HTMLAttributes<HTMLButtonElement>),
    ...(listeners as HTMLAttributes<HTMLButtonElement>),
    // El asa no desplaza la página en pantallas táctiles: arrastra.
    style: { touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab' },
  };
  return (
    <li ref={setNodeRef} style={estilo} className="list-none">
      {children({ propsAsa, arrastrando: isDragging })}
    </li>
  );
}

export function ListaOrdenable<T>({ items, clave, onOrdenar, deshabilitada, className, children }: ListaOrdenableProps<T>) {
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const ids = items.map(clave);
  const alSoltar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const desde = ids.indexOf(String(e.active.id));
    const hasta = ids.indexOf(String(e.over.id));
    if (desde >= 0 && hasta >= 0) onOrdenar(desde, hasta);
  };
  return (
    <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={deshabilitada}>
        <ol className={className}>
          {items.map((item, i) => (
            <Fila key={ids[i]} id={ids[i]} deshabilitada={deshabilitada}>
              {(asa) => children(item, i, asa)}
            </Fila>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
