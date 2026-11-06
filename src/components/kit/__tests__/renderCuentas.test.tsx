/**
 * @jest-environment jsdom
 *
 * Kit de cuentas (Figma sección 2317:39697): cada estado dice qué cuenta se usa
 * y de dónde sale. Las cuentas llegan de la base: aquí no se resuelve ninguna.
 */
import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { CuentaEfectiva } from '@/lib/finanzas/contabilidad/cuentaEfectiva';
import { CampoCuentaAutomatica } from '../CampoCuentaAutomatica';
import { ChipCuenta } from '../ChipCuenta';
import { ResumenCuentas } from '../ResumenCuentas';

const base: CuentaEfectiva = {
  clave: 'ingreso',
  rol: 'ingreso',
  cuenta: '41359501',
  nombre: 'Venta de mercancías',
  origen: 'regla',
  estado: 'automatica',
  claveContable: null,
  configurada: '41359501',
  fallo: null,
  asentable: true,
  prevista: false,
  categoriaId: null,
  categoriaNombre: null,
  categoriaOrigen: null,
};

const buscar = jest.fn(async () => ({ items: [], total: 0 }));

function campo(efectiva: CuentaEfectiva | null, extra: { propia?: boolean; onCambiar?: (c: string | null) => void } = {}) {
  renderConIdioma(<CampoCuentaAutomatica etiqueta="Cuenta de ingreso" efectiva={efectiva} onCambiar={extra.onCambiar ?? jest.fn()} buscar={buscar} propia={extra.propia} />);
}

describe('CampoCuentaAutomatica', () => {
  test('automática: la cuenta, su origen y «Cambiar», nunca «Sin cuenta propia»', () => {
    campo(base);
    expect(screen.getByText('41359501')).toBeTruthy();
    expect(screen.getByText('Viene de la regla contable')).toBeTruthy();
    expect(screen.getByText('Automática')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeTruthy();
    expect(screen.queryByText(/Sin cuenta propia/)).toBeNull();
    expect(screen.queryByRole('combobox', { name: /nativo/ })).toBeNull();
  });

  test('de la categoría: nombra la categoría', () => {
    campo({ ...base, origen: 'categoria', estado: 'categoria', categoriaOrigen: 'Calzado' });
    expect(screen.getByText('Viene de la categoría Calzado')).toBeTruthy();
    expect(screen.getByText('De la categoría')).toBeTruthy();
  });

  test('sede y empresa: nombran la clave', () => {
    campo({ ...base, origen: 'empresa', claveContable: 'ventas_productos' });
    expect(screen.getByText('Viene de la configuración contable · Ventas de productos')).toBeTruthy();
  });

  test('propia: ofrece volver a automática y lo avisa', () => {
    const onCambiar = jest.fn();
    campo({ ...base, origen: 'linea', estado: 'propia' }, { propia: true, onCambiar });
    fireEvent.click(screen.getByRole('button', { name: 'Volver a automática' }));
    expect(onCambiar).toHaveBeenCalledWith(null);
  });

  test('título con auxiliar: dice cuál se eligió y cuál recibe el movimiento', () => {
    campo({ ...base, estado: 'titulo', configurada: '4135', cuenta: '41359501', asentable: true, fallo: 'x' });
    expect(screen.getByText('4135 es de título. El asiento usará 41359501')).toBeTruthy();
    expect(screen.getByText('Revisar')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Elegir auxiliar' })).toBeTruthy();
  });

  test('título sin auxiliar', () => {
    campo({ ...base, estado: 'titulo', configurada: '4135', cuenta: '4135', asentable: false });
    expect(screen.getByText('4135 es de título y no recibe movimientos')).toBeTruthy();
  });

  test('sin cuenta: muestra el motivo de la base y pide elegir', () => {
    campo({ ...base, estado: 'sin_cuenta', cuenta: null, origen: 'ninguno', fallo: 'No hay regla contable activa para este documento', asentable: false });
    expect(screen.getByText('No hay regla contable activa para este documento')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Elegir cuenta' })).toBeTruthy();
  });

  test('cuenta prevista: no se presenta como un error', () => {
    campo({ ...base, cuenta: '14350101', nombre: 'Inventario Centro', origen: 'sede', prevista: true });
    expect(screen.getByText('Auxiliar de la sede. Se crea al confirmar el documento')).toBeTruthy();
    expect(screen.getByText('Automática')).toBeTruthy();
  });
});

describe('ChipCuenta', () => {
  test.each([
    ['automatica', 'Automática'],
    ['categoria', 'De la categoría'],
    ['propia', 'Cuenta propia'],
    ['titulo', 'Revisar'],
  ] as const)('%s', (estado, texto) => {
    renderConIdioma(<ChipCuenta cuenta="41359501" estado={estado} />);
    expect(screen.getByRole('button').textContent).toContain('41359501');
    expect(screen.getByRole('button').textContent).toContain(texto);
  });

  test('sin cuenta: lo dice, sin un código vacío', () => {
    renderConIdioma(<ChipCuenta cuenta={null} estado="sin_cuenta" />);
    expect(screen.getByRole('button').textContent).toContain('Sin cuenta');
  });

  test('abre el selector', () => {
    const onClick = jest.fn();
    renderConIdioma(<ChipCuenta cuenta="41359501" estado="automatica" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('ResumenCuentas', () => {
  function Resumen({ cuentas }: { cuentas: CuentaEfectiva[] }) {
    const [abierto, setAbierto] = useState(false);
    return (
      <ResumenCuentas cuentas={cuentas} abierto={abierto} onAbiertoChange={setAbierto} sujeto="producto">
        <p>Los cuatro campos</p>
      </ResumenCuentas>
    );
  }

  test('cerrado por defecto: una frase, sin los campos', () => {
    renderConIdioma(<Resumen cuentas={[base]} />);
    expect(screen.getByText('Contabilidad automática')).toBeTruthy();
    expect(screen.queryByText('Los cuatro campos')).toBeNull();
  });

  test('abre al pedirlo y vuelve a cerrar', () => {
    renderConIdioma(<Resumen cuentas={[base]} />);
    const boton = screen.getByRole('button', { name: 'Ver o cambiar cuentas' });
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(boton);
    expect(screen.getByText('Los cuatro campos')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar cuentas' }));
    expect(screen.queryByText('Los cuatro campos')).toBeNull();
  });

  test('una cuenta propia', () => {
    renderConIdioma(<Resumen cuentas={[{ ...base, origen: 'producto', estado: 'propia', cuenta: '41352099' }, { ...base, rol: 'costo' }]} />);
    expect(screen.getByText('1 cuenta propia')).toBeTruthy();
    expect(screen.getByText(/Propias: 41352099/)).toBeTruthy();
  });

  test('lo que hay que revisar se ve sin abrir', () => {
    renderConIdioma(<Resumen cuentas={[{ ...base, rol: 'inventario', estado: 'titulo' }]} />);
    expect(screen.getByText('Falta revisar 1 cuenta')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Corregir' })).toBeTruthy();
  });
});
