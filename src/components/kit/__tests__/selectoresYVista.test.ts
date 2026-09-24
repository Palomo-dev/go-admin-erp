/**
 * Kit · selectores de tercero y vista: estados de la lista del
 * `CustomerPicker` / `SupplierPicker`, cuándo se ofrece «Crear “…”», cómo se
 * muestran cliente y proveedor, y a qué vista lleva el botón que alterna del
 * `ViewToggle` en el celular (POS-UX-V2 §7.5).
 */
import { LayoutGrid, Rows3 } from 'lucide-react';
import {
  estadoListaEntidad,
  lineaSecundaria,
  ofrecerCrear,
  opcionCliente,
  opcionProveedor,
} from '../selectorEntidadLogica';
import { otraVista, type OpcionVista } from '../vistaLogica';

describe('selector de tercero: estado de la lista', () => {
  test('cargando solo si aún no hay resultados que mostrar', () => {
    expect(estadoListaEntidad({ cargando: true, error: false, total: 0, texto: '' })).toBe('cargando');
    expect(estadoListaEntidad({ cargando: true, error: false, total: 3, texto: 'an' })).toBe('resultados');
  });

  test('error manda; sin texto es el estado inicial, con texto «sin resultados»', () => {
    expect(estadoListaEntidad({ cargando: false, error: true, total: 3, texto: '' })).toBe('error');
    expect(estadoListaEntidad({ cargando: false, error: false, total: 0, texto: '  ' })).toBe('inicial');
    expect(estadoListaEntidad({ cargando: false, error: false, total: 0, texto: 'zz' })).toBe('sinResultados');
  });

  test('«Crear» solo si hay texto y nadie se llama exactamente así (sin tildes ni mayúsculas)', () => {
    const opciones = [{ titulo: 'María Pérez' }, { titulo: 'Mario Gómez' }];
    expect(ofrecerCrear('', opciones)).toBe(false);
    expect(ofrecerCrear('maria perez', opciones)).toBe(false);
    expect(ofrecerCrear('María', opciones)).toBe(true);
    expect(ofrecerCrear('Ana', [])).toBe(true);
  });
});

describe('cliente y proveedor en el selector', () => {
  test('cliente: documento como subtítulo y contacto en la meta', () => {
    expect(
      opcionCliente({ id: '7', nombre: 'Ana Ríos', documento: 'CC 1.020.304', correo: 'ana@correo.co', telefono: '300 000 0000' }),
    ).toEqual({ id: '7', titulo: 'Ana Ríos', subtitulo: 'CC 1.020.304', meta: 'ana@correo.co · 300 000 0000', pendienteSync: undefined });
    expect(opcionCliente({ id: 'off-1', nombre: 'Sin red', pendienteSync: true })).toMatchObject({ subtitulo: null, meta: null, pendienteSync: true });
  });

  test('proveedor: NIT y saldo por pagar ya formateado', () => {
    expect(opcionProveedor({ id: '3', nombre: 'Distribuidora', nit: 'NIT 900.1', contacto: 'Luis', saldoPorPagar: '$ 1.200.000' })).toMatchObject({
      subtitulo: 'NIT 900.1',
      meta: 'Luis · $ 1.200.000',
    });
  });

  test('línea secundaria sin huecos', () => {
    expect(lineaSecundaria(' a ', null, '', undefined, 'b')).toBe('a · b');
    expect(lineaSecundaria()).toBe('');
  });
});

describe('ViewToggle: el botón que alterna en el celular', () => {
  const opciones: readonly [OpcionVista<'tarjetas' | 'lista'>, OpcionVista<'tarjetas' | 'lista'>] = [
    { valor: 'tarjetas', etiqueta: 'Tarjetas', icono: LayoutGrid },
    { valor: 'lista', etiqueta: 'Lista', icono: Rows3 },
  ];

  test('en Tarjetas muestra rayitas («Ver como lista») y en Lista, cuadritos', () => {
    expect(otraVista(opciones, 'tarjetas')).toMatchObject({ valor: 'lista', icono: Rows3 });
    expect(otraVista(opciones, 'lista')).toMatchObject({ valor: 'tarjetas', icono: LayoutGrid });
  });
});
