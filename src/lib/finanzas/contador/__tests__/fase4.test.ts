import {
  CATEGORIAS_TESORERIA,
  categoriaPorClave,
  cuentaSegunCentro,
  lineasDevolucionCliente,
  lineasImpuestoDeclarado,
  lineasNomina,
  lineasPagoPrestamo,
  lineasPrestamoRecibido,
  lineasProveedor,
  lineasSeguridadSocial,
  lineasSoftware,
  repartirPorcentaje,
  type LineaTesoreria,
} from '@/lib/finanzas/contador';

function cuadra(lineas: LineaTesoreria[]): boolean {
  const debito = lineas.filter((linea) => linea.lado === 'debito').reduce((s, l) => s + l.centavos, 0);
  const credito = lineas.filter((linea) => linea.lado === 'credito').reduce((s, l) => s + l.centavos, 0);
  return debito === credito && debito > 0;
}

describe('Fase 4 — tesorería con las correcciones de la hoja', () => {
  test('están las 37 categorías y las marcadas para corregir no usan la cuenta original', () => {
    expect(CATEGORIAS_TESORERIA).toHaveLength(37);
    expect(categoriaPorClave('comisiones_recibidas')).toMatchObject({ cuenta: '4225', cuentaOriginal: '4235', estado: 'corregir' });
    expect(() => cuentaSegunCentro('comisiones_recibidas', 'administracion', { alternativa: '4235' })).toThrow(/corregida/);
    expect(categoriaPorClave('gas')).toMatchObject({ cuenta: '513555', estado: 'nuevo' });
    expect(categoriaPorClave('ventas_productos').cuenta).toBe('4135');
    expect(categoriaPorClave('cobro_cartera')).toMatchObject({ cuenta: '1305', afectaResultados: 'no' });
    expect(categoriaPorClave('aportes_socios')).toMatchObject({ cuenta: '3105', afectaResultados: 'no' });
    expect(categoriaPorClave('anticipos_clientes').cuenta).toBe('2805');
    expect(categoriaPorClave('intereses_recibidos').cuenta).toBe('421005');
    expect(categoriaPorClave('recuperaciones').cuenta).toBe('4250');
    expect(categoriaPorClave('otros_ingresos').cuenta).toBe('42959501');
  });

  test('préstamos, proveedores, nómina y seguridad social van separados', () => {
    expect(lineasPrestamoRecibido('banco', 80)[0]).toMatchObject({ cuenta: '2105', lado: 'credito', afectaResultados: false });
    expect(lineasPrestamoRecibido('socio', 80)[0].cuenta).toBe('2355');
    expect(categoriaPorClave('prestamos_recibidos').prohibidas).toContain('2195');
    expect(categoriaPorClave('prestamos_recibidos').afectaResultados).toBe('no');

    expect(lineasProveedor(40)[0]).toMatchObject({ cuenta: '22050501', lado: 'debito', afectaResultados: false });
    expect(lineasProveedor(40, true)[0].cuenta).toBe('1435');

    const causacion = lineasNomina('causacion', 1000);
    const pago = lineasNomina('pago', 1000);
    expect(cuadra(causacion)).toBe(true);
    expect(causacion).toEqual([
      expect.objectContaining({ momento: 'causacion', lado: 'debito', cuenta: '5105', afectaResultados: true }),
      expect.objectContaining({ momento: 'causacion', lado: 'credito', cuenta: '25050501', afectaResultados: false }),
    ]);
    expect(causacion[0].cuenta).toHaveLength(4);
    expect(pago).toEqual([
      expect.objectContaining({ momento: 'pago', lado: 'debito', cuenta: '25050501', afectaResultados: false }),
    ]);
    expect(pago.some((linea) => linea.cuenta === '5105')).toBe(false);

    const social = lineasSeguridadSocial('causacion', 300);
    expect(social[0]).toMatchObject({ lado: 'debito', cuenta: null, grupo: '5105', exigeSubcuenta: true, afectaResultados: true });
    expect(social[1]).toMatchObject({ lado: 'credito', cuenta: '2370', afectaResultados: false });
    expect(social[0].centavos).toBe(social[1].centavos);
    expect(social.some((linea) => linea.cuenta != null && linea.cuenta.length > 4)).toBe(false);
    const conSubcuenta = lineasSeguridadSocial('causacion', 300, '510530');
    expect(cuadra(conSubcuenta)).toBe(true);
    expect(conSubcuenta[0].cuenta).toBe('510530');
    expect(() => lineasSeguridadSocial('causacion', 300, '520530')).toThrow(/5105/);
    const pagoSocial = lineasSeguridadSocial('pago', 300);
    expect(pagoSocial).toEqual([
      expect.objectContaining({ momento: 'pago', lado: 'debito', cuenta: '2370', afectaResultados: false }),
    ]);
    expect(pagoSocial.some((linea) => linea.grupo === '5105')).toBe(false);
  });

  test('internet, gas, transporte, impuestos, GMF, software, préstamos y devoluciones', () => {
    expect(cuentaSegunCentro('internet', 'administracion').cuenta).toBe('513535');
    expect(cuentaSegunCentro('internet', 'ventas').cuenta).toBe('523535');
    expect(cuentaSegunCentro('internet', 'administracion', { alternativa: '513595' }).cuenta).toBe('513595');
    expect(() => cuentaSegunCentro('internet', 'administracion', { alternativa: '513540' })).toThrow(/corregida/);
    expect(categoriaPorClave('internet').cuentaOriginal).toBe('513540');

    expect(cuentaSegunCentro('gas', 'administracion').cuenta).toBe('513555');
    expect(cuentaSegunCentro('transporte', 'administracion').cuenta).toBe('513550');
    expect(cuentaSegunCentro('transporte', 'ventas').cuenta).toBe('523550');

    expect(lineasImpuestoDeclarado('2408', 50)[0]).toMatchObject({ cuenta: '24080501', afectaResultados: false });
    expect(lineasImpuestoDeclarado('2365', 50)[0].cuenta).toBe('2365');
    expect(categoriaPorClave('impuestos_declarados').afectaResultados).toBe('no');
    expect(categoriaPorClave('impuestos_gasto').cuenta).toBe('5115');

    expect(cuentaSegunCentro('gmf', 'administracion').cuenta).toBe('511595');
    expect(cuentaSegunCentro('gmf', 'ventas').cuenta).toBe('521595');
    expect(cuentaSegunCentro('gmf', 'ventas', { alternativa: '530595' }).cuenta).toBe('530595');

    expect(lineasSoftware('saas', 20)[0]).toMatchObject({ cuenta: '513595', afectaResultados: true });
    expect(lineasSoftware('saas', 20, 'ventas')[0].cuenta).toBe('523595');
    expect(lineasSoftware('licencia', 20)[0]).toMatchObject({ cuenta: '16', afectaResultados: false });
    expect(lineasSoftware('amortizacion', 20)[0]).toMatchObject({ cuenta: '5165', afectaResultados: true });

    expect(lineasPagoPrestamo('capital', 70)[0]).toMatchObject({ cuenta: '2105', afectaResultados: false });
    expect(lineasPagoPrestamo('capital', 70, 'socio')[0].cuenta).toBe('2355');
    expect(lineasPagoPrestamo('intereses', 8)[0]).toMatchObject({ cuenta: '530520', afectaResultados: true });

    expect(lineasDevolucionCliente('nota_credito', 15)[0]).toMatchObject({ cuenta: '4175', afectaResultados: true });
    expect(lineasDevolucionCliente('anticipo', 15)[0]).toMatchObject({ cuenta: '2805', afectaResultados: false });
    expect(lineasDevolucionCliente('pago_cartera', 15)[0]).toMatchObject({ cuenta: '1305', afectaResultados: false });
    expect(lineasDevolucionCliente('anticipo', 15)[0].cuenta).not.toBe('4175');
  });

  test('el espejo 52 no se aplica a financieros ni a publicidad, y producción queda por definir', () => {
    const pares: [string, string, string][] = [
      ['arriendo', '5120', '5220'],
      ['energia', '513530', '523530'],
      ['agua', '513525', '523525'],
      ['mantenimiento', '5145', '5245'],
      ['papeleria', '519530', '529530'],
      ['aseo', '519525', '529525'],
      ['honorarios', '5110', '5210'],
      ['seguros', '5130', '5230'],
      ['impuestos_gasto', '5115', '5215'],
      ['combustible', '519545', '529545'],
      ['viaticos', '5155', '5255'],
      ['otros_gastos', '5195', '5295'],
    ];
    for (const [clave, admin, ventas] of pares) {
      expect(cuentaSegunCentro(clave, 'administracion').cuenta).toBe(admin);
      expect(cuentaSegunCentro(clave, 'ventas').cuenta).toBe(ventas);
    }
    expect(cuentaSegunCentro('publicidad', 'administracion').cuenta).toBe('523560');
    expect(cuentaSegunCentro('publicidad', 'ventas').cuenta).toBe('523560');
    expect(cuentaSegunCentro('comisiones_bancarias', 'ventas').cuenta).toBe('53051501');
    expect(cuentaSegunCentro('intereses_pagados', 'administracion').cuenta).toBe('530520');

    expect(cuentaSegunCentro('arriendo', 'produccion')).toEqual({ cuenta: null, estado: 'por_definir' });
    expect(cuentaSegunCentro('arriendo', 'produccion', { cuentaProduccion: '6140' }).cuenta).toBe('6140');
    expect(cuentaSegunCentro('servicios', 'produccion').estado).toBe('por_definir');

    const partes = repartirPorcentaje('arriendo', 100, [
      { centro: 'administracion', porcentaje: 60 },
      { centro: 'ventas', porcentaje: 40 },
    ]);
    expect(partes).toEqual([
      { centro: 'administracion', cuenta: '5120', centavos: 6000 },
      { centro: 'ventas', cuenta: '5220', centavos: 4000 },
    ]);
    expect(partes.reduce((s, p) => s + p.centavos, 0)).toBe(10000);
  });
});
