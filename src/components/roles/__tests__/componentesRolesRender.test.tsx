/**
 * @jest-environment jsdom
 *
 * Roles y permisos · componentes del Figma «Roles y permisos — componentes»
 * (ChipOrigen, CeldaPermiso, FilaPermiso, MatrizEncabezado + ModuloMatriz en
 * MatrizPermisos, RolFila, SelectorAlcanceSucursal, TarjetaRolCargo) y el
 * diálogo «Revisar cambios», en es, en, fr y pt con el proveedor real de
 * next-intl. Una clave que falte rompe la prueba.
 */
import type { ReactElement } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { clasificarCatalogo } from '@/lib/roles/matrizPermisos';
import { calcularCambios } from '@/lib/roles/cambios';
import type { RolResumen } from '@/lib/roles/tipos';
import { ChipOrigen } from '../ChipOrigen';
import { CeldaPermiso } from '../CeldaPermiso';
import { FilaPermiso } from '../FilaPermiso';
import { MatrizPermisos } from '../MatrizPermisos';
import { RolFila } from '../RolFila';
import { SelectorAlcanceSucursal } from '../SelectorAlcanceSucursal';
import { TarjetaRolCargo } from '../TarjetaRolCargo';
import { DialogoRevisarCambios } from '../DialogoRevisarCambios';

jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    timezone: 'America/Bogota',
    getToday: () => '2026-10-06',
    formatDate: (v: string) => v,
    formatDateTime: (v: string) => v,
    formatTime: (v: string) => v,
    formatPlain: (v: string) => v,
  }),
}));

const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const CATALOGO = clasificarCatalogo([
  { id: 1, code: 'pos.view', module: 'pos', name: 'View', description: 'Ver el punto de venta' },
  { id: 2, code: 'pos.create', module: 'pos', name: 'Create', description: 'Crear ventas' },
  { id: 3, code: 'pos.refund', module: 'pos', name: 'Refund', description: 'Devolver una venta' },
  { id: 5, code: 'inventory.view', module: 'inventory', name: 'View', description: 'Ver inventario' },
]);
const ROL: RolResumen = {
  id: 77,
  nombre: 'Cajero de turno',
  descripcion: 'Caja y devoluciones',
  sistema: false,
  basadoEn: 4,
  basadoEnNombre: 'Empleado',
  version: 3,
  actualizado: '2026-10-06T10:00:00Z',
  permisoIds: [1, 3],
  personas: 4,
  muestraPersonas: [
    { id: 1, nombre: 'Carla Ruiz' },
    { id: 2, nombre: 'Diego Pardo' },
  ],
  esAdmin: false,
  duplicable: true,
};

let errores: jest.SpyInstance;
beforeEach(() => {
  errores = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  const intl = errores.mock.calls
    .map((c) => String(c[0] instanceof Error ? `${c[0].name} ${c[0].message}` : c[0]))
    .filter((m) => /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE|INVALID_KEY/.test(m));
  errores.mockRestore();
  expect(intl).toEqual([]);
  expect(document.body.textContent ?? '').not.toMatch(/roles\.(origen|matriz|alcance|tarjeta|revisar|sensibilidad)\./);
});

describe.each(IDIOMAS)('componentes de Roles y permisos en %s', (idioma) => {
  const r = (ui: ReactElement) => renderConIdioma(ui, { idioma });

  test('ChipOrigen: rol, cargo, sucursal y admin', () => {
    const { container } = r(
      <>
        <ChipOrigen origen="rol" />
        <ChipOrigen origen="cargo" etiqueta="Cajera" />
        <ChipOrigen origen="sucursal" />
        <ChipOrigen origen="admin" />
      </>,
    );
    expect([...container.querySelectorAll('[data-origen]')].map((e) => e.getAttribute('data-origen'))).toEqual(['rol', 'cargo', 'sucursal', 'admin']);
    expect(screen.getByText('Cajera')).toBeTruthy();
  });

  test('CeldaPermiso: marcada, parcial, bloqueada y «—»', () => {
    const alternar = jest.fn();
    r(
      <>
        <CeldaPermiso estado="todo" etiqueta="Ver en POS" onAlternar={alternar} />
        <CeldaPermiso estado="parcial" etiqueta="Crear en POS" onAlternar={alternar} sensible />
        <CeldaPermiso estado="bloqueado" etiqueta="Editar en POS" onAlternar={alternar} />
        <CeldaPermiso estado="vacio" etiqueta="Aprobar en POS" />
      </>,
    );
    const casillas = screen.getAllByRole('checkbox');
    expect(casillas).toHaveLength(3);
    expect(casillas[0].getAttribute('aria-checked')).toBe('true');
    expect(casillas[1].getAttribute('aria-checked')).toBe('mixed');
    expect((casillas[2] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(casillas[1]);
    expect(alternar).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-sensible]')).toBeTruthy();
  });

  test('FilaPermiso: sensible, «ya lo da el rol» y cambio sin guardar', () => {
    const refund = CATALOGO.find((p) => p.codigo === 'pos.refund')!;
    const { container } = r(
      <>
        <FilaPermiso permiso={refund} marcado onAlternar={() => undefined} delta="anadido" />
        <FilaPermiso permiso={refund} marcado={false} yaLoDaElRol delta={null} />
      </>,
    );
    expect(container.querySelector('[data-delta="anadido"]')).toBeTruthy();
    expect(screen.getAllByText('Devolver una venta')).toHaveLength(2);
    expect((screen.getAllByRole('checkbox')[1] as HTMLButtonElement).disabled).toBe(true);
  });

  test('MatrizPermisos: casilla de módulo con parcial, alternar el módulo y buscar', () => {
    const cambiar = jest.fn();
    const { container } = r(<MatrizPermisos catalogo={CATALOGO} seleccion={new Set([1])} original={new Set([1])} onCambiar={cambiar} />);
    const pos = container.querySelector('[data-modulo="pos"]') as HTMLElement;
    const casillaModulo = within(pos).getAllByRole('checkbox')[0];
    expect(casillaModulo.getAttribute('aria-checked')).toBe('mixed');
    fireEvent.click(casillaModulo);
    expect([...(cambiar.mock.calls[0][0] as Set<number>)].sort()).toEqual([1, 2, 3]);
    // Buscar abre los módulos con coincidencias y deja solo lo que coincide.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'devolver' } });
    expect(container.querySelectorAll('[data-permiso]')).toHaveLength(1);
    expect(container.querySelector('[data-modulo="inventory"]')).toBeNull();
  });

  test('MatrizPermisos de solo lectura (rol del sistema): sin casillas habilitadas', () => {
    r(<MatrizPermisos catalogo={CATALOGO} seleccion={new Set([1, 2])} />);
    const deMatriz = screen.getAllByRole('checkbox').filter((c) => c.closest('[data-modulo]'));
    expect(deMatriz.length).toBeGreaterThan(0);
    expect(deMatriz.every((c) => (c as HTMLButtonElement).disabled)).toBe(true);
  });

  test('RolFila: escritorio y móvil; abrir al pulsar el nombre', () => {
    const abrir = jest.fn();
    const { container } = r(
      <>
        <RolFila rol={ROL} totalPermisos={149} sensibles={1} acciones={[]} onAbrir={abrir} />
        <RolFila rol={{ ...ROL, id: 4, nombre: 'Empleado', sistema: true }} totalPermisos={149} sensibles={0} acciones={[]} onAbrir={abrir} layout="movil" />
      </>,
    );
    expect(container.querySelectorAll('[data-rol]')).toHaveLength(2);
    fireEvent.click(screen.getByText('Cajero de turno'));
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  test('SelectorAlcanceSucursal: «todas» y «solo algunas»', () => {
    const cambio = jest.fn();
    const sucursales = [
      { id: 1, nombre: 'Principal', detalle: null },
      { id: 2, nombre: 'Norte', detalle: 'Calle 140' },
    ];
    const { rerender } = r(<SelectorAlcanceSucursal sucursales={sucursales} modo="todas" seleccion={[]} onCambio={cambio} />);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    rerender(<SelectorAlcanceSucursal sucursales={sucursales} modo="algunas" seleccion={[2]} onCambio={cambio} />);
    const casillas = screen.getAllByRole('checkbox');
    expect(casillas).toHaveLength(2);
    fireEvent.click(casillas[0]);
    expect(cambio).toHaveBeenLastCalledWith('algunas', [1, 2]);
    rerender(<SelectorAlcanceSucursal sucursales={sucursales} modo="algunas" seleccion={[]} onCambio={cambio} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  test('TarjetaRolCargo: rol + cargo = lo que puede hacer, con y sin cargo', () => {
    const { container } = r(
      <>
        <TarjetaRolCargo rol={{ nombre: 'Empleado', total: 17 }} cargo={{ nombre: 'Cajera', suma: 4 }} resultado={{ nombre: 'Carla Ruiz', total: 21 }} />
        <TarjetaRolCargo rol={{ nombre: 'Empleado', total: 17 }} cargo={null} resultado={{ nombre: 'Carla Ruiz', total: 17 }} orientacion="vertical" />
      </>,
    );
    expect(container.querySelectorAll('[data-orientacion]')).toHaveLength(2);
    expect(container.textContent).toMatch(/21/);
  });

  test('DialogoRevisarCambios: añadidos, quitados y sensibles', () => {
    const guardar = jest.fn();
    const cambios = calcularCambios(new Set([1]), new Set([3, 5]), CATALOGO);
    r(
      <DialogoRevisarCambios
        abierto
        onAbiertoChange={() => undefined}
        nombre="Cajero de turno"
        cambios={cambios}
        personas={ROL.muestraPersonas}
        guardando={false}
        onGuardar={guardar}
      />,
    );
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('Devolver una venta')).toBeTruthy();
    expect(within(dialogo).getByText('Ver el punto de venta')).toBeTruthy();
  });
});
