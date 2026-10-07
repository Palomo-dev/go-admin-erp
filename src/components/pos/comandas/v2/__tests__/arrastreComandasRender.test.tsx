/**
 * @jest-environment jsdom
 *
 * Comandas v2 · arrastrar entre columnas (Figma 2117:209496). Se renderiza el
 * tablero de arrastre con la tarjeta real y el proveedor real de next-intl; el
 * soltar se simula llamando los manejadores que la pantalla le pasa a
 * `DndContext` (jsdom no mide cajas, así que no hay arrastre físico).
 */
import * as React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { KitchenTicket } from '@/lib/services/kitchenService';
import { COLUMNAS, type ColumnaComanda } from '@/lib/pos/cocina/tableroComandas';
import { ArrastreComandas, ColumnaSoltable, ComandaArrastrable, estadoColumna } from '../ArrastreComandas';
import { ComandaTarjeta } from '../ComandaTarjeta';

type ManejadoresDnd = {
  onDragStart?: (e: DragStartEvent) => void;
  onDragEnd?: (e: DragEndEvent) => void;
  onDragCancel?: () => void;
};
let dnd: ManejadoresDnd = {};

jest.mock('@dnd-kit/core', () => {
  const real = jest.requireActual('@dnd-kit/core');
  const ReactReal = jest.requireActual('react');
  return {
    ...real,
    DndContext: (props: ManejadoresDnd & { children?: React.ReactNode }) => {
      dnd = props;
      return ReactReal.createElement(real.DndContext, props);
    },
  };
});

const AHORA = new Date('2026-10-07T16:54:00.000Z');

const comanda: KitchenTicket = {
  id: 277,
  organization_id: 140,
  branch_id: 115,
  status: 'new',
  printed_at: null,
  created_at: '2026-10-07T16:52:41.000Z',
  updated_at: '2026-10-07T16:52:41.000Z',
  ready_at: null,
  priority: 0,
  estimated_time: null,
  sale_id: null,
  table_session_id: null,
  source: 'web',
  ticket_type: 'order',
  web_order_id: 'pedido-web',
  pedido_web: { id: 'pedido-web', order_number: 'P-2150', tipo: 'dine_in', mesa: 'Mesa 3', customer_notes: null, payment_status: 'paid' },
  kitchen_ticket_items: [
    {
      id: 377,
      organization_id: 140,
      kitchen_ticket_id: 277,
      sale_item_id: null,
      station: null,
      notes: null,
      status: 'pending',
      created_at: '2026-10-07T16:52:41.000Z',
      updated_at: '2026-10-07T16:52:41.000Z',
      preparation_time: null,
      product_name: 'Bandeja paisa',
      quantity: 1,
    },
  ],
} as KitchenTicket;

const NOMBRES: Record<ColumnaComanda, string> = {
  new: 'Nuevas',
  preparing: 'En preparación',
  ready: 'Listas para servir',
  delivered: 'Entregadas',
};

function Tablero({
  onMover,
  onRechazo,
  onAccion,
  permisos = { operar: true, gestionar: false },
}: {
  onMover: jest.Mock;
  onRechazo: jest.Mock;
  onAccion: jest.Mock;
  permisos?: { operar: boolean; gestionar: boolean };
}) {
  return (
    <ArrastreComandas
      permisos={permisos}
      titulo={() => 'Web P-2150 · Mesa 3'}
      nombreColumna={(c) => NOMBRES[c]}
      onMover={onMover}
      onRechazo={onRechazo}
      renderLevantada={() => null}
    >
      {COLUMNAS.map((col) => (
        <ColumnaSoltable key={col} columna={col} nombre={NOMBRES[col]} cabecera={<h2>{NOMBRES[col]}</h2>}>
          {col === 'new' && (
            <ComandaArrastrable comanda={comanda} columna="new" titulo="Web P-2150 · Mesa 3">
              {(asa) => (
                <ComandaTarjeta
                  comanda={comanda}
                  columna="new"
                  estacion="todas"
                  densidad="tablero"
                  ahora={AHORA}
                  timezone="America/Bogota"
                  permisos={permisos}
                  asa={asa}
                  onAccion={onAccion}
                  onConfirmarAlergia={jest.fn()}
                  onItem={jest.fn()}
                />
              )}
            </ComandaArrastrable>
          )}
        </ColumnaSoltable>
      ))}
    </ArrastreComandas>
  );
}

const datosActivos = { current: { comanda, columna: 'new' as ColumnaComanda } };
const levantar = () =>
  act(() => {
    dnd.onDragStart?.({ active: { id: 'comanda:277', data: datosActivos, rect: { current: { initial: null, translated: null } } }, activatorEvent: new MouseEvent('mousedown') } as unknown as DragStartEvent);
  });
const soltarEn = (col: ColumnaComanda) =>
  act(() => {
    dnd.onDragEnd?.({
      active: { id: 'comanda:277', data: datosActivos, rect: { current: { initial: null, translated: null } } },
      over: { id: `columna:${col}`, data: { current: { columna: col } }, rect: null, disabled: false },
      activatorEvent: new MouseEvent('mousedown'),
      collisions: null,
      delta: { x: 0, y: 0 },
    } as unknown as DragEndEvent);
  });

describe('Comandas v2 — arrastrar entre columnas', () => {
  beforeEach(() => {
    dnd = {};
  });

  it('la tarjeta lleva el asa y la flecha de un paso; tocar el ítem en «Nuevas» no hace nada', () => {
    const onAccion = jest.fn();
    renderConIdioma(<Tablero onMover={jest.fn()} onRechazo={jest.fn()} onAccion={onAccion} />);
    expect(screen.getByRole('button', { name: 'Mover la comanda Web P-2150 · Mesa 3' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pasar Web P-2150 · Mesa 3 a «En preparación»' }));
    expect(onAccion).toHaveBeenCalledTimes(1);
    expect(onAccion).toHaveBeenCalledWith(comanda, 'preparing');
    // El ítem pendiente ya no es un botón «marcar hecho» (era la causa del salto a «Listas»).
    expect(screen.queryByRole('button', { name: /Bandeja paisa/ })).toBeNull();
  });

  it('mientras se arrastra, solo «En preparación» acepta la tarjeta', () => {
    renderConIdioma(<Tablero onMover={jest.fn()} onRechazo={jest.fn()} onAccion={jest.fn()} />);
    levantar();
    const columna = (n: string) => screen.getByRole('region', { name: n });
    expect(columna('Nuevas').getAttribute('data-estado-arrastre')).toBe('origen');
    expect(columna('En preparación').getAttribute('data-estado-arrastre')).toBe('valida');
    expect(within(columna('En preparación')).getByText('Soltar para pasar a En preparación')).toBeTruthy();
    expect(columna('Listas para servir').getAttribute('data-estado-arrastre')).toBe('no-valida');
    expect(within(columna('Listas para servir')).getByText('Un paso a la vez')).toBeTruthy();
    expect(columna('Entregadas').getAttribute('data-estado-arrastre')).toBe('no-valida');
  });

  it('soltar en «En preparación» llama la acción de avanzar un paso', () => {
    const onMover = jest.fn();
    const onRechazo = jest.fn();
    renderConIdioma(<Tablero onMover={onMover} onRechazo={onRechazo} onAccion={jest.fn()} />);
    levantar();
    soltarEn('preparing');
    expect(onMover).toHaveBeenCalledWith(comanda, { ok: true, sentido: 'avanzar', estado: 'preparing' }, 'new');
    expect(onRechazo).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'En preparación' }).getAttribute('data-estado-arrastre')).toBe('reposo');
  });

  it('soltar en «Listas para servir» se rechaza con su motivo y no llama la base', () => {
    const onMover = jest.fn();
    const onRechazo = jest.fn();
    renderConIdioma(<Tablero onMover={onMover} onRechazo={onRechazo} onAccion={jest.fn()} />);
    levantar();
    soltarEn('ready');
    expect(onMover).not.toHaveBeenCalled();
    expect(onRechazo).toHaveBeenCalledWith(comanda, 'new', 'ready', 'un_paso');
  });

  it('soltar en su propia columna no hace nada', () => {
    const onMover = jest.fn();
    const onRechazo = jest.fn();
    renderConIdioma(<Tablero onMover={onMover} onRechazo={onRechazo} onAccion={jest.fn()} />);
    levantar();
    soltarEn('new');
    expect(onMover).not.toHaveBeenCalled();
    expect(onRechazo).not.toHaveBeenCalled();
  });

  it('el estado de columna sigue la misma regla de un paso', () => {
    const p = { operar: true, gestionar: true };
    expect(estadoColumna('preparing', null, p)).toBe('reposo');
    expect(estadoColumna('new', { desde: 'preparing' }, p)).toBe('valida');
    expect(estadoColumna('new', { desde: 'preparing' }, { operar: true, gestionar: false })).toBe('no-valida');
    expect(estadoColumna('delivered', { desde: 'preparing' }, p)).toBe('no-valida');
  });
});
