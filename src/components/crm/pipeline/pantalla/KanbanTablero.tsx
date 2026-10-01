'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useTranslations } from 'next-intl';
import { StageColumn } from '@/components/crm/kit/StageColumn';
import { OpportunityCard } from '@/components/crm/kit/OpportunityCard';
import { OpportunityRowMenu } from '@/components/crm/kit/OpportunityRowMenu';
import { CargarMas } from '@/components/crm/kit/CargarMas';
import { estadoAccionesRapidas } from '@/components/crm/kit/quickActionLogica';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import { useOrgDefaultCountry } from '@/components/crm/shared/useOrgDefaultCountry';
import { aTarjeta, permisosFila, totalDeEtapa, type EtapaApi, type OportunidadApi, type PermisosPantalla, type ResumenApi, type Tablero } from '@/components/crm/oportunidad/oportunidadLogica';
import type { useAccionesOportunidad } from '@/components/crm/oportunidad/useAccionesOportunidad';
import { POR_COLUMNA } from './useTableroPipeline';
import { PASO_AVANCE, esBarraHorizontal, esControlDeTarjeta, esZonaDeTarjeta, scrollTrasArrastre, sentidoAvance } from './kanbanDesplazamiento';

/**
 * Kanban del Pipeline (Figma 768:454428 listo, 768:456094 arrastrando,
 * 768:457615 menú, 812:53241 acciones de la tarjeta). Arrastrar y soltar con
 * @dnd-kit (puntero); la alternativa de teclado es «Mover de etapa» del menú
 * «⋯» de cada tarjeta (`MoveStageDialog`). El lienzo se agarra en el vacío
 * para ver las etapas que no caben. Al arrastrar una tarjeta contra el borde,
 * el mismo lienzo avanza: el auto-scroll de dnd-kit también correría la
 * página. Soltar en una columna abierta
 * mueve YA (optimista) y revierte si el servidor rechaza; soltar en Ganada o
 * Perdida abre `WinDialog`/`LoseDialog` sin mover hasta confirmar. Cada
 * columna pagina sus tarjetas («Cargar más»).
 */
export interface KanbanTableroProps {
  etapas: readonly EtapaApi[];
  tablero: Tablero;
  resumen: ResumenApi | null;
  hoy: string;
  moneda: ContextoMoneda & { paraDocumento: (m?: string | null) => ContextoMoneda };
  usuarios: readonly OpcionUsuario[];
  usuarioId: string | null;
  permisos: PermisosPantalla;
  acciones: ReturnType<typeof useAccionesOportunidad>;
  mover: (id: string, destino: string) => void;
  onAbrir: (id: string) => void;
  onCrear?: (etapaId: string) => void;
  onConfigurarEtapa?: (etapaId: string) => void;
  onCargarMas: (etapaId: string) => void;
  onReintentarColumna: (etapaId: string) => void;
}

function Arrastrable({ id, children }: { id: string; children: (arrastrando: boolean) => ReactNode }) {
  const { setNodeRef, transform, isDragging, listeners } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      data-kanban-tarjeta=""
      className="cursor-grab"
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : undefined }}
      onPointerDown={(e) => {
        if (esControlDeTarjeta(e.target as Element)) return;
        listeners?.onPointerDown?.(e);
      }}
    >
      {children(isDragging)}
    </div>
  );
}

function Soltable({ id, children }: { id: string; children: (encima: boolean) => ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef}>{children(isOver)}</div>;
}

export function KanbanTablero(p: KanbanTableroProps) {
  const t = useTranslations('crm.oportunidad.tablero');
  const pais = useOrgDefaultCountry() ?? undefined;
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activa, setActiva] = useState<OportunidadApi | null>(null);
  const [agarrado, setAgarrado] = useState(false);
  const lienzo = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; left: number } | null>(null);
  const movio = useRef(false);
  const borde = useRef<-1 | 0 | 1>(0);
  const marco = useRef<number | null>(null);
  const buscar = (id: string) => Object.values(p.tablero).flatMap((c) => c.filas).find((f) => f.id === id) ?? null;

  const pararAvance = () => {
    borde.current = 0;
    if (marco.current != null) cancelAnimationFrame(marco.current);
    marco.current = null;
  };

  const seguirBorde = (x: number) => {
    const el = lienzo.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sentido = sentidoAvance(x, rect.left, rect.right);
    borde.current = sentido;
    if (sentido !== 0 && marco.current == null) {
      const tick = () => {
        const nodo = lienzo.current;
        if (!nodo || borde.current === 0) {
          marco.current = null;
          return;
        }
        const antes = nodo.scrollLeft;
        nodo.scrollLeft = antes + borde.current * PASO_AVANCE;
        if (nodo.scrollLeft === antes) {
          marco.current = null;
          return;
        }
        marco.current = requestAnimationFrame(tick);
      };
      marco.current = requestAnimationFrame(tick);
    }
  };

  useEffect(() => () => {
    borde.current = 0;
    if (marco.current != null) cancelAnimationFrame(marco.current);
    marco.current = null;
  }, []);

  const alEmpezar = (e: DragStartEvent) => setActiva(buscar(String(e.active.id)));
  const alArrastrar = (e: DragMoveEvent) => {
    const origen = e.activatorEvent;
    if (!(origen instanceof MouseEvent)) return;
    seguirBorde(origen.clientX + e.delta.x);
  };
  const alSoltar = (e: DragEndEvent) => {
    pararAvance();
    setActiva(null);
    const op = buscar(String(e.active.id));
    const destino = e.over ? String(e.over.id) : null;
    if (!op || !destino || destino === op.stage_id) return;
    if (p.acciones.flujo.solicitar(op, destino, 'arrastre')) p.mover(op.id, destino);
  };

  const alPunteroAbajo = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || esZonaDeTarjeta(e.target as Element)) return;
    const el = lienzo.current;
    if (!el || (e.target === el && esBarraHorizontal(el, e.clientY))) return;
    pan.current = { x: e.clientX, left: el.scrollLeft };
    movio.current = false;
    if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId);
    setAgarrado(true);
  };
  const alPunteroMover = (e: ReactPointerEvent<HTMLDivElement>) => {
    const origen = pan.current;
    const el = lienzo.current;
    if (!origen || !el) return;
    if (Math.abs(e.clientX - origen.x) > 4) movio.current = true;
    el.scrollLeft = scrollTrasArrastre(origen.left, origen.x, e.clientX);
  };
  const alPunteroSoltar = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pan.current) return;
    pan.current = null;
    setAgarrado(false);
    const el = lienzo.current;
    if (el && typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  const tarjeta = (op: OportunidadApi, arrastrando?: boolean) => (
    <OpportunityCard
      oportunidad={aTarjeta(op, p.usuarios)}
      moneda={p.moneda.paraDocumento(op.currency)}
      arrastrando={arrastrando}
      onAbrir={p.onAbrir}
      estadosAcciones={estadoAccionesRapidas({ cliente: op.cliente ?? null, tieneDestino: true, paisPorDefecto: pais })}
      onAccion={(a) => p.acciones.alAccionRapida(op, a)}
      menu={<OpportunityRowMenu titulo={op.name} status={op.status} permisos={permisosFila(p.permisos, p.usuarioId, op)} onAccion={(a) => p.acciones.alMenu(op, a)} />}
    />
  );

  return (
    <DndContext sensors={sensores} autoScroll={false} onDragStart={alEmpezar} onDragMove={alArrastrar} onDragEnd={alSoltar} onDragCancel={() => { pararAvance(); setActiva(null); }}>
      <div
        ref={lienzo}
        role="region"
        aria-label={t('aria')}
        tabIndex={0}
        onPointerDown={alPunteroAbajo}
        onPointerMove={alPunteroMover}
        onPointerUp={alPunteroSoltar}
        onPointerCancel={alPunteroSoltar}
        onClickCapture={(e) => {
          if (!movio.current) return;
          movio.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        className={`flex w-full min-w-0 cursor-grab gap-4 overflow-x-auto overscroll-x-contain pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [&_button]:cursor-pointer ${agarrado ? 'cursor-grabbing select-none' : ''}`}
      >
        {p.etapas.map((etapa) => {
          const col = p.tablero[etapa.id];
          const total = totalDeEtapa(p.resumen, etapa.id, p.hoy);
          const cantidad = col?.total ?? total.cantidad;
          return (
            <Soltable key={etapa.id} id={etapa.id}>
              {(encima) => (
                <StageColumn
                  etapa={etapa}
                  cantidad={cantidad}
                  total={total}
                  monedaBase={p.moneda}
                  cargando={!col || (col.cargando && col.pagina === 0)}
                  destino={encima && !!activa && activa.stage_id !== etapa.id}
                  puedeCrear={p.permisos.crear && !etapa.is_won && !etapa.is_lost}
                  onCrear={p.onCrear}
                  onConfigurar={p.permisos.gestionarEtapas ? p.onConfigurarEtapa : undefined}
                >
                  {col?.filas.map((op) => (
                    <Arrastrable key={op.id} id={op.id}>
                      {(arrastrando) => tarjeta(op, arrastrando)}
                    </Arrastrable>
                  ))}
                  {col && (col.error || col.filas.length < col.total) && (
                    <CargarMas
                      mostrados={col.filas.length}
                      total={col.total}
                      tamanoPagina={POR_COLUMNA}
                      cargando={col.cargando}
                      error={col.error ? t('errorColumna') : null}
                      onCargar={() => (col.error && col.pagina === 0 ? p.onReintentarColumna(etapa.id) : p.onCargarMas(etapa.id))}
                      entidad="oportunidades"
                    />
                  )}
                </StageColumn>
              )}
            </Soltable>
          );
        })}
      </div>
      <DragOverlay>{activa ? <div className="w-[280px]">{tarjeta(activa, true)}</div> : null}</DragOverlay>
    </DndContext>
  );
}
