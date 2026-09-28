/**
 * @jest-environment jsdom
 *
 * POS · cabecera de escritorio, hoja «Caja y dispositivo» del celular y mapa
 * de atajos F1 (paso 3 y 14 de POS-PLAN). El indicador de la pantalla del
 * cliente y los pendientes sin conexión tienen sus propias pruebas: aquí se
 * sustituyen por marcadores.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

jest.mock('@/components/pos/display/CustomerDisplayIndicator', () => ({
  CustomerDisplayIndicator: () => <button type="button">indicador-pantalla</button>,
}));
jest.mock('@/components/pos/PendientesSinConexionDialog', () => ({
  PendientesSinConexionDialog: () => null,
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useOrgTimezone: () => ({ timezone: 'America/Bogota' }),
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ branchFilter: 3, branches: [{ id: 3, name: 'Centro' }], isLoading: false, selectedBranchId: 3 }),
}));

import { CabeceraPos, abrirMenuPantallaCliente } from '@/components/pos/venta/CabeceraPos';
import { HojaCajaDispositivo } from '@/components/pos/venta/HojaCajaDispositivo';
import { MapaAtajos } from '@/components/pos/venta/MapaAtajos';
import { ATAJOS_POS } from '@/lib/pos/venta/atajos';

describe('CabeceraPos', () => {
  test('sin caja: «Abrir caja» con F9 anunciado; contadores con los carritos de la sucursal', () => {
    const onCaja = jest.fn();
    renderConIdioma(
      <CabeceraPos organizacionNombre="Org 120" cajaAbierta={false} cierreBloqueado={false} onCaja={onCaja} carritosActivos={2} carritosEnEspera={1} />,
    );
    const boton = screen.getByRole('button', { name: /Abrir caja/ });
    expect(boton.getAttribute('aria-keyshortcuts')).toBe('F9');
    fireEvent.click(boton);
    expect(onCaja).toHaveBeenCalledTimes(1);
    const contadores = screen.getByRole('group', { name: 'Carritos de esta sucursal' });
    expect(within(contadores).getByText('2 activos')).toBeTruthy();
    expect(within(contadores).getByText('1 en espera')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Punto de venta');
  });

  test('caja de otro cajero: «Cerrar caja» deshabilitado con el motivo', () => {
    renderConIdioma(
      <CabeceraPos cajaAbierta cierreBloqueado onCaja={jest.fn()} carritosActivos={1} carritosEnEspera={0} />,
    );
    const boton = screen.getByRole('button', { name: /Cerrar caja/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.title).toMatch(/Solo el cajero que abrió la caja/);
  });

  test('en inglés los textos cambian (1 activo en singular del idioma)', () => {
    renderConIdioma(<CabeceraPos cajaAbierta={false} cierreBloqueado={false} onCaja={jest.fn()} carritosActivos={1} carritosEnEspera={0} />, {
      idioma: 'en',
    });
    expect(screen.getByRole('button', { name: /Open register/ })).toBeTruthy();
    expect(screen.getByText('1 active')).toBeTruthy();
  });

  test('F10: abre el menú del indicador con Enter sobre su disparador', () => {
    renderConIdioma(<CabeceraPos cajaAbierta={false} cierreBloqueado={false} onCaja={jest.fn()} carritosActivos={0} carritosEnEspera={0} />);
    const disparador = screen.getByRole('button', { name: 'indicador-pantalla' });
    const teclas: string[] = [];
    disparador.addEventListener('keydown', (e) => teclas.push((e as KeyboardEvent).key));
    expect(abrirMenuPantallaCliente()).toBe(true);
    expect(document.activeElement).toBe(disparador);
    expect(teclas).toEqual(['Enter']);
  });
});

describe('HojaCajaDispositivo (celular)', () => {
  test('sin caja ofrece «Abrir caja» y cierra la hoja antes de abrir el diálogo', () => {
    const onCaja = jest.fn();
    const onAbierta = jest.fn();
    renderConIdioma(
      <HojaCajaDispositivo
        abierta
        onAbiertaChange={onAbierta}
        cajaAbierta={false}
        estadoCaja="Caja cerrada"
        cierreBloqueado={false}
        onCaja={onCaja}
        onAtajos={jest.fn()}
        carritosActivos={1}
        carritosEnEspera={0}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Abrir caja/ }));
    expect(onAbierta).toHaveBeenCalledWith(false);
    expect(onCaja).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Caja cerrada')).toBeTruthy();
  });
});

describe('MapaAtajos (F1)', () => {
  test('dibuja todos los atajos del mapa canónico agrupados', () => {
    renderConIdioma(<MapaAtajos abierto onAbiertoChange={jest.fn()} />);
    expect(screen.getByText('Atajos de teclado')).toBeTruthy();
    for (const grupo of ['Venta', 'Carrito', 'Cobro', 'Después de la venta']) {
      expect(screen.getByRole('heading', { name: grupo })).toBeTruthy();
    }
    expect(screen.getAllByRole('term')).toHaveLength(ATAJOS_POS.length);
    expect(screen.getByText('Cobrar')).toBeTruthy();
  });
});
