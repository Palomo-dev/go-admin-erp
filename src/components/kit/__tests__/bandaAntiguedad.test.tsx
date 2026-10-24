/**
 * @jest-environment jsdom
 *
 * La banda de antigüedad se comparte entre cuentas por pagar y por cobrar.
 * En el celular deja la cuadrícula de dos columnas y la barra, y el listado
 * pone el buscador antes que la banda. En escritorio el orden no cambia.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fireEvent, screen } from '@testing-library/react';
import { BandaAntiguedad } from '../documento/BandaAntiguedad';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

const tramos = [
  { tramo: 'al_dia' as const, saldo: 10, cuentas: 1 },
  { tramo: 'd1_30' as const, saldo: 20, cuentas: 2 },
  { tramo: 'd31_60' as const, saldo: 30, cuentas: 3 },
  { tramo: 'd61_90' as const, saldo: 40, cuentas: 4 },
  { tramo: 'd90_mas' as const, saldo: 50, cuentas: 5 },
];

describe('BandaAntiguedad', () => {
  test('en el celular los tramos van en una fila que se desliza y la barra no se ve', () => {
    renderConIdioma(<BandaAntiguedad tramos={tramos} formatear={(n) => `$${n}`} onSeleccionar={() => undefined} />);
    const grupo = screen.getByRole('group', { name: 'Filtrar por antigüedad' });
    expect(grupo.className).toContain('overflow-x-auto');
    expect(grupo.className).toContain('snap-x');
    expect(grupo.className).toContain('scrollbar-hide');
    expect(grupo.className).not.toContain('grid-cols-2');
    expect(grupo.className).toContain('md:grid-cols-5');
    const barra = document.querySelector('[aria-hidden="true"]');
    expect(barra?.className).toContain('hidden');
    expect(barra?.className).toContain('md:flex');
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getByText('$10')).toBeTruthy();
  });

  test('tocar el tramo elegido lo quita y conserva el resalte neutro', () => {
    const onSeleccionar = jest.fn();
    renderConIdioma(
      <BandaAntiguedad tramos={tramos} formatear={(n) => `$${n}`} seleccionado="d1_30" onSeleccionar={onSeleccionar} />,
    );
    const elegido = screen.getByRole('button', { name: /1–30 días/ });
    expect(elegido.getAttribute('aria-pressed')).toBe('true');
    expect(elegido.className).toContain('border-line-brand');
    expect(elegido.className).toContain('bg-brand-tint');
    expect(elegido.className).not.toContain('bg-warning');
    fireEvent.click(elegido);
    expect(onSeleccionar).toHaveBeenCalledWith(null);
  });
});

function bloqueBanda(src: string, desde: number): string {
  const fin = src.indexOf('/>', desde);
  return src.slice(desde, fin);
}

describe('orden de la banda en los listados', () => {
  test.each([
    'src/components/finanzas/cuentas-por-pagar/listado/CuentasPorPagarListado.tsx',
    'src/components/finanzas/cuentas-por-cobrar/listado/ListadoCartera.tsx',
  ])('%s deja la banda arriba en escritorio y debajo de los chips en el celular', (rel) => {
    const src = readFileSync(path.join(process.cwd(), rel), 'utf8');
    const buscador = src.indexOf('<ListToolbar');
    const escritorio = src.indexOf('<BandaAntiguedad');
    const movil = src.indexOf('<BandaAntiguedad', escritorio + 1);
    expect(buscador).toBeGreaterThan(-1);
    expect(escritorio).toBeGreaterThan(-1);
    expect(escritorio).toBeLessThan(buscador);
    expect(movil).toBeGreaterThan(buscador);
    expect(bloqueBanda(src, escritorio)).toContain('hidden md:flex');
    expect(bloqueBanda(src, movil)).toContain('md:hidden');
  });
});
