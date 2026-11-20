/**
 * @jest-environment jsdom
 *
 * Kit · DataTable: la columna «⋯» es fija a la derecha. Cuando la tabla
 * desborda a lo ancho, las últimas columnas pasan por debajo de ella; sin una
 * marca parecía que la acción rápida «tapaba» el estado de la fila (listado de
 * Ventas del POS, 2026-11-20). La sombra solo se pinta mientras haya contenido
 * debajo: sin desborde, o con el scroll al final, la columna queda limpia.
 */
import { fireEvent, screen } from '@testing-library/react';
import { DataTable, type ColumnaTabla } from '../DataTable';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

type Fila = { id: string; nombre: string };
const COLUMNAS: ColumnaTabla<Fila>[] = [{ id: 'nombre', encabezado: 'Nombre', celda: (f) => f.nombre }];
const FILAS: Fila[] = [{ id: '1', nombre: 'Uno' }];

function medidas(el: HTMLElement, m: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: m.scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: m.clientWidth });
  Object.defineProperty(el, 'scrollLeft', { configurable: true, writable: true, value: m.scrollLeft });
}

function render() {
  renderConIdioma(
    <DataTable
      etiqueta="Prueba"
      columnas={COLUMNAS}
      filas={FILAS}
      obtenerId={(f) => f.id}
      accionesRapidas={() => <button type="button">Imprimir</button>}
    />,
  );
  const tabla = screen.getByRole('table', { name: 'Prueba' });
  const contenedor = tabla.parentElement as HTMLElement;
  const celdaAcciones = () => screen.getByRole('button', { name: 'Imprimir' }).closest('td') as HTMLElement;
  return { contenedor, celdaAcciones };
}

describe('DataTable · columna de acciones fija', () => {
  test('sin desborde no hay sombra', () => {
    const { contenedor, celdaAcciones } = render();
    medidas(contenedor, { scrollWidth: 800, clientWidth: 800, scrollLeft: 0 });
    fireEvent.scroll(contenedor);
    expect(celdaAcciones().className).not.toMatch(/shadow-\[/);
  });

  test('con columnas debajo de «⋯» se marca con sombra, y se quita al llegar al final', () => {
    const { contenedor, celdaAcciones } = render();
    medidas(contenedor, { scrollWidth: 1200, clientWidth: 800, scrollLeft: 0 });
    fireEvent.scroll(contenedor);
    expect(celdaAcciones().className).toMatch(/shadow-\[/);

    medidas(contenedor, { scrollWidth: 1200, clientWidth: 800, scrollLeft: 400 });
    fireEvent.scroll(contenedor);
    expect(celdaAcciones().className).not.toMatch(/shadow-\[/);
  });
});
