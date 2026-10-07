'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { ArrowRight, Ban, GripHorizontal } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { KitchenTicket } from '@/lib/services/kitchenService';
import {
  siguienteColumna,
  validarMovimiento,
  type ColumnaComanda,
  type Movimiento,
  type MotivoMovimiento,
} from '@/lib/pos/cocina/tableroComandas';

/**
 * Arrastrar comandas entre columnas (Figma «POS — Comandas v2 · Arrastrar
 * entre columnas», sección 2117:209496: D1–D5 en 1440, T1–T6 en 1024).
 *
 * - Ratón: la tarjeta entera se arrastra (cursor «grab») tras moverla 6 px,
 *   así los botones de la tarjeta siguen funcionando con un clic.
 * - Táctil: mantener presionado 250 ms (anillo azul) la levanta; si el dedo se
 *   mueve antes más de 8 px, es un desplazamiento normal del tablero.
 * - Teclado: el asa es el activador. Espacio/Enter levanta, ← → cambian de
 *   columna, Espacio/Enter suelta, Esc cancela; los anuncios van en español.
 *
 * Soltar NO tiene lógica propia: valida con `validarMovimiento` (la misma regla
 * de un paso que usan la flecha y el botón) y llama `onMover`, que la pantalla
 * conecta a la misma acción que el botón principal o «Devolver a Nuevas».
 */

export interface ArrastreActivo {
  comanda: KitchenTicket;
  desde: ColumnaComanda;
  porTeclado: boolean;
}

interface ContextoArrastre {
  activa: ArrastreActivo | null;
  sobre: ColumnaComanda | null;
  permisos: { operar: boolean; gestionar: boolean };
}

const Ctx = React.createContext<ContextoArrastre>({ activa: null, sobre: null, permisos: { operar: false, gestionar: false } });

const ID_COLUMNA = 'columna:';
const ID_COMANDA = 'comanda:';

const columnaDelId = (id: unknown): ColumnaComanda | null => {
  const s = String(id ?? '');
  return s.startsWith(ID_COLUMNA) ? (s.slice(ID_COLUMNA.length) as ColumnaComanda) : null;
};

/** Con el puntero manda lo que hay bajo el dedo o el cursor; con el teclado, el solape. */
const colision: CollisionDetection = (args) => {
  const bajoPuntero = pointerWithin(args);
  return bajoPuntero.length > 0 ? bajoPuntero : rectIntersection(args);
};

/** ← → saltan a la columna vecina (no 25 px como el teclado por defecto de dnd-kit). */
const saltoDeColumna: KeyboardCoordinateGetter = (event, { context }) => {
  if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return undefined;
  const actual = context.collisionRect;
  if (!actual) return undefined;
  event.preventDefault();
  const centro = actual.left + actual.width / 2;
  const columnas = Array.from(context.droppableRects.entries())
    .filter(([id]) => columnaDelId(id))
    .map(([, r]) => r)
    .sort((a, b) => a.left - b.left);
  const destino = event.code === 'ArrowRight'
    ? columnas.find((r) => r.left > centro)
    : [...columnas].reverse().find((r) => r.left + r.width < centro);
  if (!destino) return undefined;
  return { x: destino.left + (destino.width - actual.width) / 2, y: actual.top };
};

export interface ArrastreComandasProps {
  children: React.ReactNode;
  permisos: { operar: boolean; gestionar: boolean };
  titulo: (c: KitchenTicket) => string;
  nombreColumna: (c: ColumnaComanda) => string;
  /** Movimiento válido: la pantalla llama la misma acción que la flecha o «Devolver». */
  onMover: (c: KitchenTicket, movimiento: Extract<Movimiento, { ok: true }>, desde: ColumnaComanda) => void;
  /** Movimiento no válido: la tarjeta ya volvió a su sitio; solo falta avisar. */
  onRechazo: (c: KitchenTicket, desde: ColumnaComanda, hacia: ColumnaComanda, motivo: MotivoMovimiento) => void;
  /** Copia de la tarjeta que sigue al puntero (DragOverlay). */
  renderLevantada: (activa: ArrastreActivo) => React.ReactNode;
}

export function ArrastreComandas({ children, permisos, titulo, nombreColumna, onMover, onRechazo, renderLevantada }: ArrastreComandasProps) {
  const t = useTranslations('posComandasV2.arrastre');
  const [activa, setActiva] = React.useState<ArrastreActivo | null>(null);
  const [sobre, setSobre] = React.useState<ColumnaComanda | null>(null);

  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: saltoDeColumna }),
  );

  const datos = (data: unknown) => (data as { current?: { comanda?: KitchenTicket; columna?: ColumnaComanda } } | undefined)?.current;

  const alEmpezar = (e: DragStartEvent) => {
    const d = datos(e.active.data);
    if (!d?.comanda || !d.columna) return;
    const porTeclado = typeof KeyboardEvent !== 'undefined' && e.activatorEvent instanceof KeyboardEvent;
    setActiva({ comanda: d.comanda, desde: d.columna, porTeclado });
    setSobre(d.columna);
  };
  const alPasar = (e: DragOverEvent) => setSobre(columnaDelId(e.over?.id));
  const terminar = () => {
    setActiva(null);
    setSobre(null);
  };
  const alSoltar = (e: DragEndEvent) => {
    const d = datos(e.active.data);
    const hacia = columnaDelId(e.over?.id);
    terminar();
    if (!d?.comanda || !d.columna || !hacia || hacia === d.columna) return;
    const mov = validarMovimiento(d.columna, hacia, permisos);
    if (mov.ok) onMover(d.comanda, mov, d.columna);
    else onRechazo(d.comanda, d.columna, hacia, mov.motivo);
  };

  const anuncios: Announcements = {
    onDragStart: ({ active }) => {
      const d = datos(active.data);
      return d?.comanda && d.columna ? t('anuncioInicio', { titulo: titulo(d.comanda), columna: nombreColumna(d.columna) }) : undefined;
    },
    onDragOver: ({ active, over }) => {
      const d = datos(active.data);
      const hacia = columnaDelId(over?.id);
      if (!d?.comanda || !d.columna || !hacia) return undefined;
      if (hacia === d.columna) return t('anuncioOrigen', { columna: nombreColumna(hacia) });
      return validarMovimiento(d.columna, hacia, permisos).ok
        ? t('anuncioSobre', { columna: nombreColumna(hacia) })
        : t('anuncioSobreNoValida', { columna: nombreColumna(hacia) });
    },
    onDragEnd: ({ active, over }) => {
      const d = datos(active.data);
      const hacia = columnaDelId(over?.id);
      if (!d?.comanda || !d.columna) return undefined;
      if (!hacia || hacia === d.columna || !validarMovimiento(d.columna, hacia, permisos).ok) {
        return t('anuncioVuelve', { titulo: titulo(d.comanda), columna: nombreColumna(d.columna) });
      }
      return t('anuncioSoltada', { titulo: titulo(d.comanda), columna: nombreColumna(hacia) });
    },
    onDragCancel: ({ active }) => {
      const d = datos(active.data);
      return d?.comanda && d.columna ? t('anuncioVuelve', { titulo: titulo(d.comanda), columna: nombreColumna(d.columna) }) : undefined;
    },
  };

  return (
    <Ctx.Provider value={{ activa, sobre, permisos }}>
      <DndContext
        sensors={sensores}
        collisionDetection={colision}
        autoScroll={false}
        accessibility={{ announcements: anuncios, screenReaderInstructions: { draggable: t('instrucciones') } }}
        onDragStart={alEmpezar}
        onDragOver={alPasar}
        onDragEnd={alSoltar}
        onDragCancel={terminar}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activa ? (
            <div className={cn('cursor-grabbing rounded-xl shadow-2xl', !activa.porTeclado && '-rotate-2', activa.porTeclado && 'ring-2 ring-brand ring-offset-2 ring-offset-canvas')}>
              {renderLevantada(activa)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </Ctx.Provider>
  );
}

/** Estado de una columna mientras se arrastra (para pintar y para los tests). */
export function estadoColumna(
  columna: ColumnaComanda,
  activa: Pick<ArrastreActivo, 'desde'> | null,
  permisos: { operar: boolean; gestionar: boolean },
): 'reposo' | 'origen' | 'valida' | 'no-valida' {
  if (!activa) return 'reposo';
  if (activa.desde === columna) return 'origen';
  return validarMovimiento(activa.desde, columna, permisos).ok ? 'valida' : 'no-valida';
}

/**
 * Columna que acepta tarjetas. `cabecera` va arriba; debajo, mientras se
 * arrastra, el aviso «Soltar para pasar a …» (válida) o «Un paso a la vez»
 * (no válida, atenuada).
 */
export function ColumnaSoltable({
  columna,
  nombre,
  cabecera,
  className,
  children,
}: {
  columna: ColumnaComanda;
  nombre: string;
  cabecera: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('posComandasV2.arrastre');
  const { activa, permisos } = React.useContext(Ctx);
  const { setNodeRef } = useDroppable({ id: `${ID_COLUMNA}${columna}`, data: { columna } });
  const estado = estadoColumna(columna, activa, permisos);
  const motivo = activa && estado === 'no-valida' ? validarMovimiento(activa.desde, columna, permisos) : null;
  return (
    <section
      ref={setNodeRef}
      aria-label={nombre}
      data-estado-arrastre={estado}
      className={cn(
        'border-2 border-transparent transition-[opacity,background-color,border-color] duration-150',
        className,
        estado === 'valida' && 'border-dashed border-line-brand bg-brand-tint',
        estado === 'no-valida' && 'opacity-50',
      )}
    >
      {cabecera}
      {estado === 'valida' && (
        <p className="mx-0.5 mb-2 flex items-start gap-1.5 rounded-lg border-[1.5px] border-dashed border-line-brand bg-surface px-2.5 py-[7px] text-[13px] font-semibold leading-4 text-brand-deep">
          <ArrowRight aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={2} />
          {activa?.porTeclado ? t('espacioPara', { columna: nombre }) : t('soltarPara', { columna: nombre })}
        </p>
      )}
      {estado === 'no-valida' && (
        <p className="mx-0.5 mb-2 flex items-start gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-[7px] text-[13px] leading-4 text-fg-secondary">
          <Ban aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
          {motivo && !motivo.ok && motivo.motivo === 'sin_permiso' ? t('sinPermiso') : t('unPasoALaVez')}
        </p>
      )}
      {children}
    </section>
  );
}

/** Anillo de «mantén presionado» (T2) que se llena en el retraso del sensor táctil. */
function IndicadorPresion({ x, y }: { x: number; y: number }) {
  const t = useTranslations('posComandasV2.arrastre');
  const r = 28;
  const largo = 2 * Math.PI * r;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute z-20" style={{ left: x - 32, top: y - 32 }}>
      <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-tooltip px-2.5 py-1.5 text-xs font-medium text-white shadow-md">
        <span className="block">{t('mantenPresionado')}</span>
        <span className="block text-[11px] font-normal opacity-70">{t('mantenPresionadoDetalle')}</span>
      </span>
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="24" className="fill-fg opacity-[0.15]" />
        <circle cx="32" cy="32" r="10" className="fill-surface stroke-fg/60" strokeWidth="1.5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          className="stroke-brand"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={largo}
          strokeDashoffset={largo}
          transform="rotate(-90 32 32)"
        >
          <animate attributeName="stroke-dashoffset" from={String(largo)} to="0" dur="250ms" fill="freeze" />
        </circle>
      </svg>
    </span>
  );
}

/**
 * Tarjeta arrastrable. `children` recibe el asa (activador de teclado) para
 * pintarla dentro de la tarjeta. Mientras se arrastra, en su lugar queda un
 * hueco punteado del mismo alto; si el soltar no vale, la tarjeta vuelve ahí.
 */
export function ComandaArrastrable({
  comanda,
  columna,
  deshabilitada,
  titulo,
  children,
}: {
  comanda: KitchenTicket;
  columna: ColumnaComanda;
  deshabilitada?: boolean;
  titulo: string;
  children: (asa: React.ReactNode) => React.ReactNode;
}) {
  const t = useTranslations('posComandasV2.arrastre');
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: `${ID_COMANDA}${comanda.id}`,
    data: { comanda, columna },
    disabled: deshabilitada,
  });
  const { onKeyDown, onTouchStart, ...punteros } = (listeners ?? {}) as Record<string, ((e: React.SyntheticEvent) => void) | undefined>;

  const [presion, setPresion] = React.useState<{ x: number; y: number; x0: number; y0: number } | null>(null);
  const temporizador = React.useRef<number | null>(null);
  const soltarPresion = React.useCallback(() => {
    if (temporizador.current != null) window.clearTimeout(temporizador.current);
    temporizador.current = null;
    setPresion(null);
  }, []);
  React.useEffect(() => () => soltarPresion(), [soltarPresion]);
  React.useEffect(() => {
    if (isDragging) soltarPresion();
  }, [isDragging, soltarPresion]);

  const alTocar = (e: React.TouchEvent<HTMLDivElement>) => {
    onTouchStart?.(e);
    if (deshabilitada || e.touches.length !== 1) return;
    const caja = e.currentTarget.getBoundingClientRect();
    const toque = e.touches[0];
    setPresion({ x: toque.clientX - caja.left, y: toque.clientY - caja.top, x0: toque.clientX, y0: toque.clientY });
    temporizador.current = window.setTimeout(soltarPresion, 400);
  };
  const alMoverDedo = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!presion) return;
    const toque = e.touches[0];
    if (Math.hypot(toque.clientX - presion.x0, toque.clientY - presion.y0) > 8) soltarPresion();
  };

  const asa = deshabilitada ? null : (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      onKeyDown={onKeyDown as React.KeyboardEventHandler<HTMLButtonElement> | undefined}
      aria-label={t('asa', { titulo })}
      className="absolute left-1/2 top-0.5 z-10 flex h-4 w-10 -translate-x-1/2 items-center justify-center rounded-md text-fg-muted hover:text-fg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <GripHorizontal aria-hidden="true" className="size-4" strokeWidth={1.5} />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      {...(punteros as React.DOMAttributes<HTMLDivElement>)}
      onTouchStart={alTocar}
      onTouchMove={alMoverDedo}
      onTouchEnd={soltarPresion}
      onTouchCancel={soltarPresion}
      data-arrastrando={isDragging || undefined}
      className={cn(
        'relative touch-manipulation select-none [-webkit-touch-callout:none]',
        !deshabilitada && 'cursor-grab',
        isDragging && 'rounded-xl border-[1.5px] border-dashed border-line-strong bg-subtle',
        presion && 'rounded-xl shadow-md',
      )}
    >
      <div className={cn(isDragging && 'invisible')}>{children(asa)}</div>
      {presion && <IndicadorPresion x={presion.x} y={presion.y} />}
    </div>
  );
}

/** Asa sin función, para la copia que sigue al puntero. */
export function AsaEstatica() {
  return (
    <span aria-hidden="true" className="absolute left-1/2 top-0.5 z-10 flex h-4 w-10 -translate-x-1/2 items-center justify-center text-fg-muted">
      <GripHorizontal className="size-4" strokeWidth={1.5} />
    </span>
  );
}

/** Texto del aviso al rechazar un soltar (D4/T5). */
export function useAvisoRechazo() {
  const t = useTranslations('posComandasV2.arrastre');
  return React.useCallback(
    (desde: ColumnaComanda, motivo: MotivoMovimiento, nombreColumna: (c: ColumnaComanda) => string) => {
      if (motivo === 'sin_permiso') return t('motivoSinPermiso');
      const siguiente = siguienteColumna(desde);
      return siguiente
        ? t('motivoUnPaso', { desde: nombreColumna(desde), hacia: nombreColumna(siguiente) })
        : t('motivoUltimo', { desde: nombreColumna(desde) });
    },
    [t],
  );
}
