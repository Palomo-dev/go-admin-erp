'use client';

/**
 * Ordenar filas arrastrando (Figma «07 Finanzas», propuesta 2026-11-21 «ordenar:
 * …»; aprobado por el dueño). Lo usa `DataTable` con su prop `arrastre`:
 *
 * - Escritorio: clic sostenido en el tirador ⠿ levanta la fila (sombra y borde de
 *   marca); en su lugar queda un hueco punteado y las demás filas se corren.
 * - Teclado: Espacio toma, ↑ ↓ mueven, Espacio suelta, Esc cancela; el lector de
 *   pantalla anuncia la posición.
 * - Celular: mantener presionada la tarjeta ~0,3 s (vibra) y arrastrar. Las
 *   acciones «Subir/Bajar» de cada pantalla siguen siendo la vía alternativa.
 *
 * Solo mueve en vertical. Quien guarda el orden es la pantalla (`onMover`).
 */
import * as React from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useKitTextos } from './useIdiomaKit';

export interface ArrastreTabla<T> {
  /** Filas que se pueden mover; las demás se quedan quietas y sin tirador. Por defecto, todas. */
  puedeMover?: (fila: T) => boolean;
  /** Se soltó la fila `id` en el lugar de `sobre` (ids de `obtenerId`). */
  onMover: (id: string, sobre: string) => void;
  deshabilitado?: boolean;
}

/** Solo en vertical: la fila no se sale de su columna. */
export const soloVertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

export function useTextosArrastre() {
  const tx = useKitTextos();
  return React.useMemo(
    () => ({
      columna: tx('tabla.arrastre.columna', 'Ordenar'),
      asa: (nombre: string) => tx('tabla.arrastre.asa', 'Mover {nombre}', { nombre }),
      ayuda: tx('tabla.arrastre.ayuda', 'Arrastra para cambiar el orden'),
      ayudaTeclado: tx('tabla.arrastre.ayudaTeclado', 'Teclado: Espacio para tomar · ↑ ↓ para mover · Espacio para soltar'),
      rol: tx('tabla.arrastre.rol', 'elemento ordenable'),
      instrucciones: tx(
        'tabla.arrastre.instrucciones',
        'Pulsa Espacio para tomar la fila, usa ↑ y ↓ para moverla y Espacio para soltarla. Esc cancela.',
      ),
      tomar: (nombre: string, pos: number, total: number) =>
        tx('tabla.arrastre.tomar', 'Tomaste {nombre}. Está en la posición {pos} de {total}.', { nombre, pos, total }),
      mover: (nombre: string, pos: number, total: number) =>
        tx('tabla.arrastre.mover', '{nombre} pasa a la posición {pos} de {total}.', { nombre, pos, total }),
      soltar: (nombre: string, pos: number, total: number) =>
        tx('tabla.arrastre.soltar', '{nombre} quedó en la posición {pos} de {total}.', { nombre, pos, total }),
      cancelar: (nombre: string, pos: number) =>
        tx('tabla.arrastre.cancelar', 'Cancelado. {nombre} volvió a la posición {pos}.', { nombre, pos }),
    }),
    [tx],
  );
}

export interface ZonaOrdenableProps {
  /** Ids que se pueden mover, en su orden actual. */
  ids: readonly string[];
  nombre: (id: string) => string;
  /** `tabla`: arrastra el tirador (mouse, dedo o teclado). `tarjetas`: mantener presionada la tarjeta. */
  modo: 'tabla' | 'tarjetas';
  deshabilitado?: boolean;
  onMover: (id: string, sobre: string) => void;
  /** Se empezó a arrastrar `id` (p. ej., para medir las columnas de la capa). */
  onInicio?: (id: string) => void;
  /** Lo que se ve levantado mientras se arrastra `id`. */
  capa: (id: string) => React.ReactNode;
  children: React.ReactNode;
}

export function ZonaOrdenable({ ids, nombre, modo, deshabilitado, onMover, onInicio, capa, children }: ZonaOrdenableProps) {
  const textos = useTextosArrastre();
  const [activo, setActivo] = React.useState<string | null>(null);
  const esTabla = modo === 'tabla';
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: esTabla ? 4 : 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: esTabla ? 200 : 300, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const pos = (id: string | number) => ids.indexOf(String(id)) + 1;
  const total = ids.length;
  const anuncios: Announcements = {
    onDragStart: ({ active }) => textos.tomar(nombre(String(active.id)), pos(active.id), total),
    onDragOver: ({ active, over }) => (over ? textos.mover(nombre(String(active.id)), pos(over.id), total) : undefined),
    onDragEnd: ({ active, over }) => textos.soltar(nombre(String(active.id)), pos(over?.id ?? active.id), total),
    onDragCancel: ({ active }) => textos.cancelar(nombre(String(active.id)), pos(active.id)),
  };

  const alIniciar = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActivo(id);
    onInicio?.(id);
    // En el celular, una vibración corta confirma que la tarjeta se levantó.
    if (!esTabla && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(15);
  };
  const alSoltar = (e: DragEndEvent) => {
    setActivo(null);
    if (e.over && e.over.id !== e.active.id) onMover(String(e.active.id), String(e.over.id));
  };

  return (
    <DndContext
      sensors={sensores}
      collisionDetection={closestCenter}
      modifiers={[soloVertical]}
      accessibility={{ announcements: anuncios, screenReaderInstructions: { draggable: textos.instrucciones } }}
      onDragStart={alIniciar}
      onDragEnd={alSoltar}
      onDragCancel={() => setActivo(null)}
    >
      <SortableContext items={ids as string[]} strategy={verticalListSortingStrategy} disabled={deshabilitado}>
        {children}
      </SortableContext>
      <DragOverlay>{activo ? capa(activo) : null}</DragOverlay>
    </DndContext>
  );
}

export interface FilaOrdenable {
  ref: (nodo: HTMLElement | null) => void;
  estilo: React.CSSProperties;
  /** Props del tirador (escritorio): activa con mouse, dedo y teclado. */
  asa: React.HTMLAttributes<HTMLButtonElement> & { ref: (nodo: HTMLElement | null) => void };
  /** Props para que el nodo entero sea el activador (tarjetas: mantener presionado). */
  oyentes: React.HTMLAttributes<HTMLElement>;
  /** Esta fila es la que se arrastra: en su lugar se pinta el hueco. */
  arrastrando: boolean;
}

/** Render-prop: los hooks de dnd-kit van por fila. */
export function Ordenable({
  id,
  deshabilitada,
  children,
}: {
  id: string;
  deshabilitada?: boolean;
  children: (fila: FilaOrdenable) => React.ReactElement;
}) {
  const textos = useTextosArrastre();
  const s = useSortable({ id, disabled: deshabilitada, attributes: { roleDescription: textos.rol } });
  const oyentes = (s.listeners ?? {}) as React.HTMLAttributes<HTMLElement>;
  return children({
    ref: s.setNodeRef,
    estilo: { transform: CSS.Translate.toString(s.transform), transition: s.transition },
    asa: { ...(s.attributes as React.HTMLAttributes<HTMLButtonElement>), ...(oyentes as React.HTMLAttributes<HTMLButtonElement>), ref: s.setActivatorNodeRef },
    oyentes,
    arrastrando: s.isDragging,
  });
}

/** El hueco punteado que queda donde va a caer la fila. */
export const CLASES_HUECO = 'bg-brand-tint outline-dashed outline-1 -outline-offset-1 outline-brand [&>*]:invisible';

/** Tirador ⠿ con ayuda de mouse y teclado. */
export function AsaArrastre({ asa, nombre, deshabilitada }: { asa: FilaOrdenable['asa']; nombre: string; deshabilitada?: boolean }) {
  const textos = useTextosArrastre();
  const { ref, ...props } = asa;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            ref={ref}
            {...props}
            disabled={deshabilitada}
            aria-label={textos.asa(nombre)}
            className={cn(
              'flex size-8 touch-none items-center justify-center rounded-md text-fg-muted',
              'hover:bg-brand-tint hover:text-brand focus-visible:bg-brand-tint focus-visible:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              deshabilitada ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing',
            )}
          >
            <GripVertical aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-xs">
          <p className="text-xs font-medium text-fg">{textos.ayuda}</p>
          <p className="text-xs text-fg-secondary">{textos.ayudaTeclado}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** El tirador dibujado en la capa levantada (no recibe eventos). */
export function AsaEnCapa() {
  return (
    <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md bg-brand-tint text-brand">
      <GripVertical className="size-4" strokeWidth={1.5} />
    </span>
  );
}
