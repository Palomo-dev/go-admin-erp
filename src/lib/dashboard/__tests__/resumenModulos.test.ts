/**
 * Regla pura del resumen por módulo (filas `FilaModulo` y panel del «Dashboard
 * por módulo») y de la tarjeta «Ventas del periodo». Lo que no puede fallar:
 * nunca sumar monedas distintas, un solo badge sólido (el más grave), el error
 * de un módulo no se pinta como cero, y el desglose de ventas por canal o por
 * sucursal según el alcance. Cifras ficticias.
 */
import { badgeSolido, resumirModulo, variacion, type CifraModulo } from '../resumenModulos';
import { desgloseVentas, monedaUnica } from '../ventasInicio';

const cifras = (r: ReturnType<typeof resumirModulo>) =>
  (r?.resumen ?? []).map((s) => ('cifra' in s ? (s.cifra as CifraModulo) : null)).filter(Boolean);

describe('resumirModulo', () => {
  test('finanzas con una moneda: importe de cartera vencida y tono peligro', () => {
    const r = resumirModulo(
      { codigo: 'finance', cartera_vencida: '3480000', cuentas_vencidas: 7, por_cobrar: 8920000, monedas_cartera: ['COP'], dias_mas_vieja: 42, por_pagar_7d: { total: 2150000, cuentas: 4, monedas: ['COP'] } },
      'COP',
    )!;
    expect(r.tono).toBe('peligro');
    expect(r.badge).toEqual({ clave: 'badges.vencidas', params: { n: 7 } });
    expect(cifras(r)[0]).toEqual({ tipo: 'moneda', valor: 3480000, moneda: 'COP' });
    expect(r.kpis[0].detalle).toEqual({ clave: 'detalles.cuentasDias', params: { n: 7, dias: 42 } });
  });

  test('finanzas con varias monedas en cartera: no hay importe, hay cuentas', () => {
    const r = resumirModulo(
      { codigo: 'finance', cartera_vencida: 100, cuentas_vencidas: 2, por_cobrar: 200, monedas_cartera: ['COP', 'USD'], por_pagar_7d: { total: 0, cuentas: 0, monedas: [] } },
      'COP',
    )!;
    expect(cifras(r).some((c) => c?.tipo === 'moneda' && c.valor === 100)).toBe(false);
    expect(r.kpis[0].cifra).toEqual({ tipo: 'numero', valor: 2 });
    expect(r.kpis[1].cifra).toEqual({ tipo: 'texto', texto: { clave: 'detalles.variasMonedas' } });
  });

  test('ventas: variación contra el anterior, y sin variación si hay varias monedas', () => {
    const una = resumirModulo({ codigo: 'pos', neto: 110, neto_anterior: 100, ventas_cobradas: 5, ticket_promedio: 22, monedas: ['COP'], cajas_abiertas: 1, cajas_de_dias_anteriores: 0 }, 'COP')!;
    expect(una.kpis[0].delta).toBeCloseTo(10);
    expect(una.badge).toEqual({ clave: 'badges.cajasAbiertas', params: { n: 1 } });
    const varias = resumirModulo({ codigo: 'pos', neto: 110, neto_anterior: 100, ventas_cobradas: 5, monedas: ['COP', 'USD'], cajas_abiertas: 0, cajas_de_dias_anteriores: 2 }, 'COP')!;
    expect(varias.kpis[0].delta).toBeNull();
    expect(varias.tono).toBe('advertencia');
    expect(cifras(varias)).toHaveLength(0);
  });

  test('CRM: el pipeline va por moneda, nunca sumado', () => {
    const r = resumirModulo({ codigo: 'crm', abiertas: 23, sin_tocar_7d: 6, ganadas_periodo: 1, pipeline: { COP: 96000000, usd: 5000 }, clientes_nuevos: 86 }, 'COP')!;
    const monedas = cifras(r).map((c) => (c && c.tipo === 'moneda' ? c.moneda : null));
    expect(monedas).toEqual(['COP', 'USD']);
    expect(r.badge?.clave).toBe('badges.sinTocar');
  });

  test('el error de un módulo no se convierte en ceros', () => {
    const r = resumirModulo({ codigo: 'inventory', error: true }, 'COP')!;
    expect(r.error).toBe(true);
    expect(r.kpis).toHaveLength(0);
  });

  test('un módulo sin regla no tiene resumen', () => {
    expect(resumirModulo({ codigo: 'chat' }, 'COP')).toBeNull();
  });

  test('inventario sin permiso de costos: sin valor', () => {
    const r = resumirModulo({ codigo: 'inventory', productos: 10, agotados: 0, bajo_minimo: 0, valor: null, moneda: 'COP' }, 'COP')!;
    expect(r.kpis.map((k) => k.etiqueta)).toEqual(['productos', 'sinStock', 'bajoMinimo']);
    expect(r.tono).toBe('neutro');
    expect(r.badge).toBeNull();
  });
});

describe('badgeSolido', () => {
  test('uno solo: el de peligro gana a la advertencia; empate, el primero', () => {
    expect(
      badgeSolido([
        { codigo: 'hrm', tono: 'advertencia', badge: { clave: 'x' } },
        { codigo: 'finance', tono: 'peligro', badge: { clave: 'x' } },
        { codigo: 'inventory', tono: 'peligro', badge: { clave: 'x' } },
      ]),
    ).toBe('finance');
  });

  test('ningún badge sólido si solo hay información o éxito', () => {
    expect(badgeSolido([{ codigo: 'pms_hotel', tono: 'informacion', badge: { clave: 'x' } }])).toBeNull();
  });
});

describe('ventas del periodo', () => {
  test('variación sin base es null (no «∞ %»)', () => {
    expect(variacion(100, 0)).toBeNull();
    expect(variacion(50, 100)).toBe(-50);
  });

  test('una sucursal: por canal, solo con más de un canal; máximo tres y «otros»', () => {
    expect(desgloseVentas({ pos: 10 }, {}, true)).toBeNull();
    const d = desgloseVentas({ pos: 10, web: 40, factura: 5, mesa: 3, otro: 1 }, {}, true)!;
    expect(d.tipo).toBe('canal');
    expect(d.filas.map((f) => f.clave)).toEqual(['web', 'pos', 'factura', 'otros']);
    expect(d.filas[3].total).toBe(4);
  });

  test('todas las sucursales: por sucursal', () => {
    expect(desgloseVentas({ pos: 1, web: 2 }, { '7': 5, '9': 3 }, false)?.tipo).toBe('sucursal');
  });

  test('monedaUnica: nunca elige una entre varias', () => {
    expect(monedaUnica(['USD'], 'COP')).toBe('USD');
    expect(monedaUnica([], 'COP')).toBe('COP');
    expect(monedaUnica(['COP', 'USD'], 'COP')).toBeNull();
  });
});
