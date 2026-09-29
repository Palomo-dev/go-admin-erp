/**
 * @jest-environment jsdom
 *
 * Kit de inventario (B0): render en los 4 idiomas con los mensajes reales.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { ORIGENES_MOVIMIENTO_STOCK } from '@/lib/inventario/origenesMovimientoStock';
import { ACCIONES_INVENTARIO, ERRORES_NUCLEO } from '@/lib/inventario/nucleo/tipos';
import type { AsignacionLote } from '@/lib/inventario/nucleo/lotes';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';
import { BadgeOrigenMovimiento } from '../BadgeOrigenMovimiento';
import { BadgeVencimiento } from '../BadgeVencimiento';
import { EnlaceDocumento } from '../EnlaceDocumento';
import { LotPicker } from '../LotPicker';
import { SaldoCorridoCell } from '../SaldoCorridoCell';

jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: jest.fn() } }));

type Arbol = Record<string, unknown>;
function claves(o: Arbol, prefijo = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? claves(v as Arbol, `${prefijo}${k}.`) : [`${prefijo}${k}`],
  );
}

describe('namespace inventario en los 4 idiomas', () => {
  const base = claves((es as Arbol).inventario as Arbol).sort();
  test.each([
    ['en', en],
    ['fr', fr],
    ['pt', pt],
  ])('%s tiene exactamente las claves de es', (_idioma, mensajes) => {
    expect(claves((mensajes as Arbol).inventario as Arbol).sort()).toEqual(base);
  });
  test('cada origen del CHECK y cada error del núcleo tiene texto', () => {
    for (const o of ORIGENES_MOVIMIENTO_STOCK) expect(base).toContain(`origenes.${o}`);
    for (const e of ERRORES_NUCLEO) expect(base).toContain(`errores.${e}`);
    expect(ACCIONES_INVENTARIO.length).toBe(11);
  });
});

describe('BadgeOrigenMovimiento', () => {
  test('etiqueta de Figma y tono del mapa único', () => {
    renderConIdioma(<BadgeOrigenMovimiento origen="purchase_order" />);
    const b = screen.getByText('Recepción de compra');
    expect(b.closest('[data-origen]')?.className).toContain('bg-brand-tint');
  });
  test('en inglés, y un origen ajeno cae en «Otro origen» neutro', () => {
    renderConIdioma(<BadgeOrigenMovimiento origen="transfer_in" />, { idioma: 'en' });
    expect(screen.getByText('Transfer in')).toBeTruthy();
    renderConIdioma(<BadgeOrigenMovimiento origen="waste" />);
    expect(screen.getByText('Otro origen').closest('[data-origen]')?.className).toContain('bg-subtle');
  });
});

describe('BadgeVencimiento', () => {
  test('por vencer, vencido y con días', () => {
    renderConIdioma(
      <>
        <BadgeVencimiento expiry="2026-10-24" hoy="2026-09-28" />
        <BadgeVencimiento expiry="2026-09-11" hoy="2026-09-28" />
        <BadgeVencimiento expiry="2026-10-24" hoy="2026-09-28" conDias />
      </>,
    );
    expect(screen.getByText('Por vencer')).toBeTruthy();
    expect(screen.getByText('Vencido')).toBeTruthy();
    expect(screen.getByText('Vence en 26 días')).toBeTruthy();
  });
});

describe('EnlaceDocumento', () => {
  test('con ruta: enlace con tipo y número; sin ruta: texto', () => {
    renderConIdioma(
      <>
        <EnlaceDocumento documento={{ source: 'adjustment', source_id: '147', product_id: 1, tipo: 'ajuste', numero: 'AJ-147', ruta: '/app/inventario/ajustes/147' }} />
        <EnlaceDocumento documento={{ source: 'sale', source_id: 'x', product_id: 1, tipo: 'venta', numero: null, ruta: null }} />
      </>,
    );
    const enlace = screen.getByRole('link', { name: 'Abrir Ajuste AJ-147' });
    expect(enlace.getAttribute('href')).toBe('/app/inventario/ajustes/147');
    expect(screen.getByText('Venta')).toBeTruthy();
  });
});

describe('SaldoCorridoCell', () => {
  test('salida en negativo con decimales', () => {
    renderConIdioma(<SaldoCorridoCell direccion="out" cantidad={2.5} saldo={-1.25} unidad="KG" />);
    expect(screen.getByLabelText('Salida 2,5 KG')).toBeTruthy();
    expect(screen.getByText('Saldo tras el movimiento: -1,25 KG')).toBeTruthy();
  });
});

describe('LotPicker', () => {
  const lotes = [
    { lot_id: 1, lot_code: 'L-2026-007', expiry_date: '2026-09-11', qty_on_hand: 14 },
    { lot_id: 2, lot_code: 'L-2026-011', expiry_date: '2026-10-24', qty_on_hand: 36 },
    { lot_id: 3, lot_code: 'L-2026-014', expiry_date: '2027-03-18', qty_on_hand: 240 },
  ];

  test('ordena por vencimiento, bloquea vencidos y reparte al marcar', () => {
    let valor: AsignacionLote[] = [];
    const onChange = jest.fn((v: AsignacionLote[]) => {
      valor = v;
    });
    const { rerender } = renderConIdioma(
      <LotPicker lotes={lotes} hoy="2026-09-28" cantidad={40} valor={valor} onChange={onChange} noVenderVencidos />,
    );
    const casillas = screen.getAllByRole('checkbox');
    expect(casillas).toHaveLength(3);
    expect((casillas[0] as HTMLButtonElement).disabled).toBe(true); // el vencido, primero y bloqueado
    fireEvent.click(casillas[1]);
    expect(onChange).toHaveBeenLastCalledWith([{ lot_id: 2, qty: 36 }]);
    rerender(<LotPicker lotes={lotes} hoy="2026-09-28" cantidad={40} valor={valor} onChange={onChange} noVenderVencidos />);
    fireEvent.click(screen.getAllByRole('checkbox')[2]);
    expect(onChange).toHaveBeenLastCalledWith([{ lot_id: 2, qty: 36 }, { lot_id: 3, qty: 4 }]);
    expect(screen.getByText(/Reparto: 36 de 40 uds asignadas/)).toBeTruthy();
  });

  test('sin lotes: aviso', () => {
    renderConIdioma(<LotPicker lotes={[]} hoy="2026-09-28" valor={[]} onChange={jest.fn()} />, { idioma: 'pt' });
    expect(screen.getByText('Este produto não tem lotes com estoque nesta filial.')).toBeTruthy();
  });
});
