/** @jest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { DataTable, type AtributosDatosFila, type EstadoTabla } from '../DataTable';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

const fila = { id: 'llamada-fixture', nombre: 'Contacto fixture', telefono: '555' };
const columnas = [{ id: 'nombre', encabezado: 'Nombre', celda: (registro: typeof fila) => registro.nombre }];

describe('DataTable: datos de fila para el shell', () => {
  test('conserva atributos y la apertura por clic, Enter y Espacio', () => {
    const onFilaClick = jest.fn();
    renderConIdioma(<DataTable columnas={columnas} filas={[fila]} obtenerId={r => r.id} etiqueta="Llamadas" onFilaClick={onFilaClick}
      atributosFila={r => ({ 'data-phone': r.telefono, 'data-display-name': r.nombre, 'data-customer-id': 'cliente-fixture' })} />);
    const row = screen.getByText(fila.nombre).closest('tr')!;
    expect(row.getAttribute('data-phone')).toBe('555');
    expect(row.getAttribute('data-display-name')).toBe(fila.nombre);
    expect(row.getAttribute('data-customer-id')).toBe('cliente-fixture');
    expect(row.tabIndex).toBe(0);
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onFilaClick.mock.calls).toEqual([[fila], [fila], [fila]]);
  });

  test('un caller sin tipos no sustituye handlers, foco, roles ni selección', () => {
    const onFilaClick = jest.fn();
    const infiltrado = jest.fn();
    const atributos = { 'data-phone': '555', onClick: infiltrado, onKeyDown: infiltrado, tabIndex: -1, role: 'button', 'aria-selected': 'true' } as unknown as AtributosDatosFila;
    renderConIdioma(<DataTable columnas={columnas} filas={[fila]} obtenerId={r => r.id} etiqueta="Llamadas" onFilaClick={onFilaClick}
      seleccion={new Set()} onSeleccionChange={jest.fn()} atributosFila={() => atributos} />);
    const row = screen.getByText(fila.nombre).closest('tr')!;
    expect(row.tabIndex).toBe(0);
    expect(row.getAttribute('role')).toBeNull();
    expect(row.getAttribute('aria-selected')).toBe('false');
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onFilaClick).toHaveBeenCalledTimes(2);
    expect(infiltrado).not.toHaveBeenCalled();
  });

  test('las acciones internas y su teclado no abren también el detalle', () => {
    const onFilaClick = jest.fn();
    const onAccion = jest.fn();
    renderConIdioma(<DataTable columnas={columnas} filas={[fila]} obtenerId={r => r.id} etiqueta="Llamadas" onFilaClick={onFilaClick}
      atributosFila={() => ({ 'data-phone': '555' })} accionesRapidas={() => <button onClick={onAccion}>Llamar</button>} />);
    const boton = screen.getByRole('button', { name: 'Llamar' });
    fireEvent.keyDown(boton, { key: 'Enter' });
    fireEvent.click(boton);
    expect(onAccion).toHaveBeenCalledTimes(1);
    expect(onFilaClick).not.toHaveBeenCalled();
  });

  test('el esqueleto opt-in oculta cabecera y conserva las columnas del caller', () => {
    renderConIdioma(<DataTable columnas={columnas} filas={[]} obtenerId={r => r.id} etiqueta="Llamadas" estado="cargando"
      mostrarCabeceraCargando={false} altoFilaEsqueleto={48} filasEsqueleto={7} varianteEsqueleto="figma" />);
    const tabla = screen.getByRole('table');
    expect(tabla.getAttribute('aria-busy')).toBe('true');
    expect(tabla.querySelector('thead')).toBeNull();
    const filas = tabla.querySelectorAll<HTMLTableRowElement>('tbody tr');
    expect(filas).toHaveLength(7);
    expect(filas[0].style.height).toBe('48px');
    expect(filas[0].querySelectorAll('td')).toHaveLength(columnas.length);
    expect(filas[0].querySelector('td div')!.className).toContain('bg-pressed');
  });

  test.each<EstadoTabla>(['listo', 'cargando'])('el pie externo es único y queda fuera del panel en %s', estado => {
    renderConIdioma(<DataTable columnas={columnas} filas={[fila]} obtenerId={r => r.id} etiqueta="Llamadas" estado={estado}
      pieFuera pie={<span>Pie fixture</span>} tarjetaMovil={r => <span>{r.nombre}</span>} />);
    const tabla = screen.getByRole('table');
    const panel = tabla.parentElement!.parentElement!;
    const pies = screen.getAllByText('Pie fixture');
    expect(pies).toHaveLength(1);
    expect(panel.contains(pies[0])).toBe(false);
    expect(panel.parentElement!.contains(pies[0])).toBe(true);
  });

  test.each<EstadoTabla>(['vacio', 'sinResultados', 'error', 'sinPermiso'])('el pie externo se oculta en %s', estado => {
    renderConIdioma(<DataTable columnas={columnas} filas={[]} obtenerId={r => r.id} etiqueta="Llamadas" estado={estado}
      pieFuera pie={<span>Pie fixture</span>} tarjetaMovil={r => <span>{r.nombre}</span>} />);
    expect(screen.queryByText('Pie fixture')).toBeNull();
  });

  test('el marco integrado elimina sólo el panel duplicado y conserva tabla y filas', () => {
    renderConIdioma(<DataTable columnas={columnas} filas={[fila]} obtenerId={r => r.id} etiqueta="Llamadas" marco="integrado" />);
    const panel = screen.getByRole('table').parentElement!.parentElement!;
    expect(panel.className).not.toContain('rounded-xl');
    expect(panel.className).not.toContain('border');
    expect(screen.getByText(fila.nombre).closest('tr')).not.toBeNull();
  });
});
