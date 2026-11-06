import {
  aCuentaEfectiva,
  cambioDeCuentaLinea,
  firmaConsultas,
  lineaAceptaSugerencia,
  resumirCuentas,
  ROLES_CUENTA,
  type CuentaEfectiva,
} from '../cuentaEfectiva';

const base: CuentaEfectiva = {
  clave: 'a',
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

describe('aCuentaEfectiva', () => {
  test('traduce la respuesta de la base', () => {
    const c = aCuentaEfectiva({
      clave: 'l1', rol: 'costo', cuenta: '51355001', nombre: 'Fletes', origen: 'linea', estado: 'propia',
      clave_contable: 'inventario', configurada: '51355001', fallo: null, asentable: true, prevista: false,
      categoria_id: 7, categoria_nombre: 'Calzado', categoria_origen: null,
    });
    expect(c).toMatchObject({ clave: 'l1', rol: 'costo', origen: 'linea', estado: 'propia', claveContable: 'inventario', categoriaId: 7, categoriaNombre: 'Calzado' });
  });

  test('un estado desconocido no se pinta como automático', () => {
    expect(aCuentaEfectiva({ estado: 'algo_nuevo', origen: 'otro' })).toMatchObject({ estado: 'sin_cuenta', origen: 'ninguno', asentable: false });
  });

  test('una cuenta prevista conserva la marca', () => {
    expect(aCuentaEfectiva({ estado: 'automatica', cuenta: '14350101', prevista: true, asentable: true }).prevista).toBe(true);
  });
});

describe('resumirCuentas', () => {
  const cuatro = ROLES_CUENTA.map((rol) => ({ ...base, rol }));

  test('todas automáticas', () => {
    expect(resumirCuentas(cuatro)).toEqual({ tipo: 'automatica' });
  });

  test('sin datos todavía: no inventa un problema', () => {
    expect(resumirCuentas([])).toEqual({ tipo: 'automatica' });
  });

  test('una propia y tres automáticas', () => {
    const lista = cuatro.map((c, i) => (i === 0 ? { ...c, origen: 'linea' as const, estado: 'propia' as const, cuenta: '41352099' } : c));
    expect(resumirCuentas(lista)).toEqual({ tipo: 'propias', n: 1, cuentas: ['41352099'], automaticas: 3 });
  });

  test('la de categoría cuenta como elegida', () => {
    const lista = cuatro.map((c, i) => (i === 0 ? { ...c, origen: 'categoria' as const, estado: 'categoria' as const } : c));
    expect(resumirCuentas(lista)).toMatchObject({ tipo: 'propias', n: 1 });
  });

  test('lo que falta manda sobre lo que está bien', () => {
    const lista = cuatro.map((c, i) => {
      if (i === 0) return { ...c, origen: 'linea' as const, estado: 'propia' as const };
      if (i === 2) return { ...c, estado: 'titulo' as const };
      return c;
    });
    expect(resumirCuentas(lista)).toEqual({ tipo: 'revisar', n: 1, rol: 'inventario' });
  });

  test('sin cuenta también se revisa', () => {
    expect(resumirCuentas([{ ...base, cuenta: null, estado: 'sin_cuenta' }])).toMatchObject({ tipo: 'revisar', n: 1 });
  });
});

describe('cambioDeCuentaLinea', () => {
  const opciones = { cuenta: '41352099', rol: 'ingreso' as const, productoId: 5, categoriaId: 9 };

  test('solo esta factura: queda en la línea y no toca el catálogo', () => {
    expect(cambioDeCuentaLinea({ ...opciones, alcance: 'documento' })).toEqual({ cuentaLinea: '41352099', catalogo: null });
  });

  test('siempre para este producto: limpia la línea para que el cambio tenga efecto', () => {
    expect(cambioDeCuentaLinea({ ...opciones, alcance: 'producto' })).toEqual({
      cuentaLinea: null,
      catalogo: { tipo: 'producto', id: 5, rol: 'ingreso', cuenta: '41352099' },
    });
  });

  test('toda la categoría', () => {
    expect(cambioDeCuentaLinea({ ...opciones, alcance: 'categoria' })).toEqual({
      cuentaLinea: null,
      catalogo: { tipo: 'categoria', id: 9, rol: 'ingreso', cuenta: '41352099' },
    });
  });

  test('volver a automática en cada alcance', () => {
    expect(cambioDeCuentaLinea({ ...opciones, cuenta: null, alcance: 'documento' })).toEqual({ cuentaLinea: null, catalogo: null });
    expect(cambioDeCuentaLinea({ ...opciones, cuenta: null, alcance: 'producto' }).catalogo).toEqual({ tipo: 'producto', id: 5, rol: 'ingreso', cuenta: null });
  });

  test('una línea manual nunca escribe en el catálogo', () => {
    expect(cambioDeCuentaLinea({ ...opciones, productoId: null, categoriaId: null, alcance: 'producto' })).toEqual({ cuentaLinea: '41352099', catalogo: null });
    expect(cambioDeCuentaLinea({ ...opciones, productoId: null, categoriaId: null, alcance: 'categoria' })).toEqual({ cuentaLinea: '41352099', catalogo: null });
  });

  test('conserva el rol de la línea: una compra no pisa la cuenta de ingreso', () => {
    expect(cambioDeCuentaLinea({ ...opciones, rol: 'inventario', alcance: 'producto' }).catalogo?.rol).toBe('inventario');
  });
});

describe('lineaAceptaSugerencia', () => {
  test('solo una línea manual sin cuenta', () => {
    expect(lineaAceptaSugerencia({ product_id: null })).toBe(true);
    expect(lineaAceptaSugerencia({ product_id: null, cuenta_contable: '  ' })).toBe(true);
    expect(lineaAceptaSugerencia({ product_id: null, cuenta_contable: '51355001' })).toBe(false);
    expect(lineaAceptaSugerencia({ product_id: 4 })).toBe(false);
  });
});

describe('firmaConsultas', () => {
  test('no cambia si lo que se pregunta es igual', () => {
    expect(firmaConsultas([{ clave: 'a', product_id: 1, cuenta_contable: ' ' }])).toBe(firmaConsultas([{ clave: 'a', product_id: 1, cuenta_contable: null }]));
  });
  test('cambia si cambia la cuenta o el producto', () => {
    const a = firmaConsultas([{ clave: 'a', product_id: 1 }]);
    expect(firmaConsultas([{ clave: 'a', product_id: 2 }])).not.toBe(a);
    expect(firmaConsultas([{ clave: 'a', product_id: 1, cuenta_contable: '4135' }])).not.toBe(a);
  });
});
