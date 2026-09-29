'use client';

/**
 * Vista Calendario de Clases (antes la página Horarios): semana de lunes a
 * domingo en la zona de la organización. Escritorio: rejilla por horas, con
 * arrastrar para mover (dnd-kit) y clic en un hueco para crear. Móvil: agenda
 * por día. Con teclado, cada clase es un botón que abre su edición (donde se
 * cambian día y hora) y «Nueva clase» está en la cabecera.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge, Tarjeta } from '@/components/kit';
import type { GymClass } from '@/lib/services/gymService';
import { cn } from '@/utils/Utils';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import { TONO_ESTADO_CLASE, diasDeSemana, estadoClase, minutosDelDia } from '../logica';
import type { FechasOrg } from '../useFechasOrg';

const HORA_INICIO = 6;
const HORA_FIN = 22;
const ALTO_HORA = 56;
const HORAS = Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => HORA_INICIO + i);

interface Props {
  clases: readonly GymClass[];
  ocupacion: ReadonlyMap<number, number>;
  lunes: string;
  onSemana: (lunes: string) => void;
  onAbrir: (clase: GymClass) => void;
  onNuevo?: (dia: string, hora: string) => void;
  onMover?: (clase: GymClass, dia: string, hora: string) => void;
  nombreTipo: (tipo: string) => string;
  fechas: FechasOrg;
}

interface Bloque {
  clase: GymClass;
  top: number;
  alto: number;
  carril: number;
  carriles: number;
}

/** Posición y carriles (clases que se solapan van lado a lado). */
function bloquesDelDia(clases: readonly GymClass[], zona: string): Bloque[] {
  const ordenadas = [...clases].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const bloques: Bloque[] = [];
  let grupo: Array<Bloque & { fin: number }> = [];
  let finGrupo = -1;
  const cerrar = () => {
    const n = Math.max(1, ...grupo.map((b) => b.carril + 1));
    grupo.forEach((b) => (b.carriles = n));
    grupo = [];
  };
  for (const c of ordenadas) {
    // Fuera de la rejilla (antes de las 06:00 o después de las 22:00) se pega al borde.
    const ini = Math.min(Math.max(minutosDelDia(c.start_at, zona), HORA_INICIO * 60), HORA_FIN * 60 - 30);
    const durac = Math.max(20, Math.round((new Date(c.end_at).getTime() - new Date(c.start_at).getTime()) / 60_000));
    const fin = Math.min(ini + durac, HORA_FIN * 60);
    if (ini >= finGrupo) cerrar();
    const ocupados = new Set(grupo.filter((b) => b.fin > ini).map((b) => b.carril));
    let carril = 0;
    while (ocupados.has(carril)) carril++;
    const b = {
      clase: c,
      top: ((ini - HORA_INICIO * 60) / 60) * ALTO_HORA,
      alto: Math.max(28, ((fin - ini) / 60) * ALTO_HORA),
      carril,
      carriles: 1,
      fin,
    };
    grupo.push(b);
    bloques.push(b);
    finGrupo = Math.max(finGrupo, fin);
  }
  cerrar();
  return bloques;
}

function Hueco({ dia, hora, onNuevo, etiqueta }: { dia: string; hora: number; onNuevo?: (dia: string, hora: string) => void; etiqueta: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${dia}|${hora}`, data: { dia, hora } });
  return (
    <div
      ref={setNodeRef}
      style={{ height: ALTO_HORA }}
      className={cn('border-b border-line', isOver && 'bg-brand-tint')}
    >
      {onNuevo && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={etiqueta}
          title={etiqueta}
          onClick={() => onNuevo(dia, `${String(hora).padStart(2, '0')}:00`)}
          className="size-full hover:bg-hover"
        />
      )}
    </div>
  );
}

function BloqueClase({
  bloque,
  onAbrir,
  arrastrable,
  texto,
  etiqueta,
}: {
  bloque: Bloque;
  onAbrir: (c: GymClass) => void;
  arrastrable: boolean;
  texto: React.ReactNode;
  etiqueta: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `clase-${bloque.clase.id}`,
    data: { clase: bloque.clase },
    disabled: !arrastrable,
  });
  const estado = estadoClase(bloque.clase.status);
  const ancho = 100 / bloque.carriles;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...(arrastrable ? listeners : {})}
      {...attributes}
      aria-label={etiqueta}
      onClick={() => onAbrir(bloque.clase)}
      style={{ top: bloque.top, height: bloque.alto, left: `calc(${bloque.carril * ancho}% + 2px)`, width: `calc(${ancho}% - 4px)` }}
      className={cn(
        'absolute overflow-hidden rounded-md border px-2 py-1 text-left text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        estado === 'cancelled'
          ? 'border-line bg-subtle text-fg-muted line-through'
          : estado === 'completed'
            ? 'border-line-success bg-success-subtle text-success-text'
            : 'border-line-brand bg-brand-tint text-brand-deep',
        isDragging && 'opacity-40',
        arrastrable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      {texto}
    </button>
  );
}

export function CalendarioSemanal({ clases, ocupacion, lunes, onSemana, onAbrir, onNuevo, onMover, nombreTipo, fechas }: Props) {
  const t = useTranslations('membresias.clases');
  const dias = useMemo(() => diasDeSemana(lunes), [lunes]);
  const [arrastrando, setArrastrando] = useState<GymClass | null>(null);
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const porDia = useMemo(() => {
    const m = new Map<string, GymClass[]>();
    for (const d of dias) m.set(d, []);
    for (const c of clases) {
      const d = fechas.dia(c.start_at);
      m.get(d)?.push(c);
    }
    return m;
  }, [clases, dias, fechas]);

  const textoClase = (c: GymClass) => {
    const ocupadas = ocupacion.get(c.id) ?? 0;
    return (
      <>
        <span className="block truncate font-medium">{c.title}</span>
        <span className="block truncate opacity-80">
          {fechas.hora(c.start_at)}–{fechas.hora(c.end_at)} · {ocupadas}/{c.capacity}
        </span>
      </>
    );
  };
  const etiquetaClase = (c: GymClass) =>
    t('calendario.etiquetaClase', {
      titulo: c.title,
      dia: fechas.fechaCorta(c.start_at),
      desde: fechas.hora(c.start_at),
      hasta: fechas.hora(c.end_at),
      ocupadas: ocupacion.get(c.id) ?? 0,
      capacidad: c.capacity,
    });

  const alSoltar = (e: DragEndEvent) => {
    setArrastrando(null);
    const clase = e.active.data.current?.clase as GymClass | undefined;
    const destino = e.over?.data.current as { dia: string; hora: number } | undefined;
    if (!clase || !destino || !onMover) return;
    const minutos = minutosDelDia(clase.start_at, fechas.zona) % 60;
    const hora = `${String(destino.hora).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
    if (fechas.dia(clase.start_at) === destino.dia && fechas.hora(clase.start_at) === hora) return;
    onMover(clase, destino.dia, hora);
  };

  const rango = `${fechas.diaPlano(dias[0], { day: 'numeric', month: 'short' })} – ${fechas.diaPlano(dias[6], { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <Tarjeta sinRelleno>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-9" onClick={() => onSemana(addPlainDays(lunes, -7))} aria-label={t('calendario.anterior')}>
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="size-9" onClick={() => onSemana(addPlainDays(lunes, 7))} aria-label={t('calendario.siguiente')}>
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onSemana('')}>
            {t('calendario.hoy')}
          </Button>
        </div>
        <h2 className="text-sm font-semibold text-fg" aria-live="polite">
          {rango}
        </h2>
      </div>

      {/* Móvil: agenda por día */}
      <ol className="divide-y divide-line md:hidden" aria-label={t('calendario.agenda')}>
        {dias.map((d) => {
          const lista = [...(porDia.get(d) ?? [])].sort((a, b) => a.start_at.localeCompare(b.start_at));
          return (
            <li key={d} className="px-4 py-3">
              <p className={cn('mb-2 text-xs font-semibold uppercase', d === fechas.hoy ? 'text-brand' : 'text-fg-secondary')}>
                {fechas.diaPlano(d, { weekday: 'long', day: 'numeric', month: 'short' })}
              </p>
              {lista.length === 0 ? (
                <p className="text-sm text-fg-muted">{t('calendario.sinClases')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {lista.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onAbrir(c)}
                        className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-3 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <span className="w-12 shrink-0 text-sm font-medium tabular-nums text-fg">{fechas.hora(c.start_at)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-fg">{c.title}</span>
                          <span className="flex items-center gap-1 text-xs text-fg-secondary">
                            {nombreTipo(c.class_type)} · <Users aria-hidden="true" className="size-3" /> {ocupacion.get(c.id) ?? 0}/{c.capacity}
                          </span>
                        </span>
                        <StatusBadge
                          estado={estadoClase(c.status)}
                          etiqueta={t(`estados.${estadoClase(c.status)}`)}
                          tono={TONO_ESTADO_CLASE[estadoClase(c.status)]}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {/* Escritorio: rejilla */}
      <DndContext
        sensors={sensores}
        collisionDetection={pointerWithin}
        onDragStart={(e: DragStartEvent) => setArrastrando((e.active.data.current?.clase as GymClass | undefined) ?? null)}
        onDragEnd={alSoltar}
        onDragCancel={() => setArrastrando(null)}
      >
        <div className="hidden overflow-x-auto md:block">
          <div className="grid min-w-[760px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
            <div className="border-b border-line" />
            {dias.map((d) => (
              <div
                key={d}
                className={cn(
                  'border-b border-l border-line px-2 py-2 text-center text-xs font-semibold capitalize',
                  d === fechas.hoy ? 'bg-brand-tint text-brand-deep' : 'text-fg-secondary',
                )}
              >
                {fechas.diaPlano(d, { weekday: 'short', day: 'numeric' })}
              </div>
            ))}

            <div>
              {HORAS.map((h) => (
                <div key={h} style={{ height: ALTO_HORA }} className="border-b border-line pr-2 pt-1 text-right text-xs tabular-nums text-fg-muted">
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            {dias.map((d) => (
              <div key={d} className="relative border-l border-line">
                {HORAS.map((h) => (
                  <Hueco
                    key={h}
                    dia={d}
                    hora={h}
                    onNuevo={onNuevo}
                    etiqueta={t('calendario.nuevaEn', { dia: fechas.diaPlano(d), hora: `${String(h).padStart(2, '0')}:00` })}
                  />
                ))}
                {bloquesDelDia(porDia.get(d) ?? [], fechas.zona).map((b) => (
                  <BloqueClase
                    key={b.clase.id}
                    bloque={b}
                    onAbrir={onAbrir}
                    arrastrable={!!onMover && estadoClase(b.clase.status) === 'active'}
                    texto={textoClase(b.clase)}
                    etiqueta={etiquetaClase(b.clase)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <DragOverlay>
          {arrastrando ? (
            <div className="rounded-md border border-line-brand bg-brand-tint px-2 py-1 text-xs text-brand-deep shadow-lg">{textoClase(arrastrando)}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <p className="hidden border-t border-line px-4 py-2 text-xs text-fg-muted md:block">
        {t('calendario.ayuda', { desde: `${String(HORA_INICIO).padStart(2, '0')}:00`, hasta: `${String(HORA_FIN).padStart(2, '0')}:00` })}
      </p>
    </Tarjeta>
  );
}
