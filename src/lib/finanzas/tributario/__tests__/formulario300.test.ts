import {
  CASILLAS_300,
  PARES_300,
  casilla,
  clasificacionInicial,
  filasCsvFormulario300,
  leerFormulario300,
  leerLineasFiscales,
  redondearMiles,
  rutaOrigen,
  tipoDocumentoLineas,
  totalPendientes,
  validarClasificacion,
  validarDeclaracion,
  validarNaturaleza,
} from '../formulario300';

// Extracto de la respuesta real de la prueba en seco 10 (org 374, noviembre 2026).
const RESPUESTA = {
  version: 2,
  periodo: { desde: '2026-11-01', hasta: '2026-11-30', zona: 'America/Bogota' },
  estado: 'conciliado',
  aprobado_fiscalmente: false,
  liquidacion_completa: false,
  periodo_declarado: null,
  casillas: [
    { casilla: 52, tipo: 'base', par: 74, concepto: 'compras_servicios_5', lado: 'descontable', valor: '300300.00', valor_formulario: 300000, diferencia_redondeo: -300, total_origenes: 1, senalada: false, origenes: [] },
    {
      casilla: 79, tipo: 'iva', par: 42, concepto: 'devoluciones_ventas', lado: 'descontable', valor: 38000, valor_formulario: 38000, diferencia_redondeo: 0, total_origenes: 1, senalada: true,
      origenes: [
        { clase: 'nota_credito', documento_id: '11111111-1111-4111-8111-111111111111', numero: 'NC-1', fecha: '2026-11-07', tabla: 'invoice_items', linea_id: '22222222-2222-4222-8222-222222222222', base: 200000, iva: 38000, asiento: 1015, entre_periodos: true, de_otro_periodo: false, posterior_declaracion: false, factura_origen: { id: '33333333-3333-4333-8333-333333333333', numero: 'FV-OCT' } },
        { clase: 'desconocida', documento_id: 'x' },
      ],
    },
    { casilla: 99, tipo: 'iva', par: 98, valor: 1 },
  ],
  pendientes: [
    { motivo: 'descontable_por_evaluar', lado: 'descontable', base: 50000, iva: 9500, efecto_2408: -9500, total_origenes: 1, origenes: [] },
    { motivo: 'inventado', lado: 'generado', base: 1, iva: 1 },
  ],
  otros_movimientos: [
    { asiento: 1023, origen: 'bank_transactions', fecha: '2026-11-07', valor: -50000, naturaleza: 'pago_dian', declarada: false, destino: 'no_afecta', motivo: null },
    { asiento: 1022, origen: 'manual', fecha: '2026-11-07', valor: -10000, naturaleza: 'sin_soporte', declarada: false, destino: 'pendiente', motivo: 'sin_soporte' },
  ],
  por_diligenciar: [
    { clave: 'saldo_favor_anterior', valor: null },
    { clave: 'retenciones_iva_sufridas', valor: null },
    { clave: 'ajustes', valor: null, asientos: [] },
    { clave: 'sanciones', valor: null },
  ],
  resumen: { iva_generado: 119000, iva_generado_formulario: 119000, iva_descontable: 386015, iva_descontable_formulario: 386000, diferencia_preliminar: -267015, diferencia_preliminar_formulario: -267000, pendientes: 9, pendientes_iva: 59400 },
  conciliacion: { libro_2408: -353615, casillas: -267015, pendientes: -55600, otros_no_afectan_o_por_diligenciar: -31000, redondeo_lineas_libros: 0, diferencia: 0 },
  alertas: { documentos_entre_periodos: 1, descontable_de_otros_periodos: 1, grabados_despues_de_declarar: [{ asiento: 1009, origen: 'invoice_sales', documento_id: 'abc', fecha: '2026-10-15', periodo_declarado: { desde: '2026-10-01', hasta: '2026-10-31' } }] },
};

describe('leerFormulario300', () => {
  const f = leerFormulario300(RESPUESTA);

  it('lee casillas oficiales y descarta las que no lo son', () => {
    expect(f.casillas.map((c) => c.casilla)).toEqual([52, 79]);
    expect(casilla(f, 52)?.valor).toBe(300300);
    expect(casilla(f, 52)?.valorFormulario).toBe(300000);
    expect(casilla(f, 52)?.diferenciaRedondeo).toBe(-300);
  });

  it('conserva el origen de cada casilla con la bandera «entre períodos» y descarta clases desconocidas', () => {
    const o = casilla(f, 79)!.origenes;
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ clase: 'nota_credito', entrePeriodos: true, asiento: 1015, facturaOrigen: { numero: 'FV-OCT' } });
  });

  it('nunca marca el borrador aprobado fiscalmente ni la liquidación completa', () => {
    const otro = leerFormulario300({ ...RESPUESTA, aprobado_fiscalmente: true, liquidacion_completa: true });
    expect(otro.aprobadoFiscalmente).toBe(false);
    expect(otro.liquidacionCompleta).toBe(false);
    expect(f.estado).toBe('conciliado');
    expect(leerFormulario300({ ...RESPUESTA, estado: 'raro' }).estado).toBe('no_conciliado');
  });

  it('pendientes con motivo conocido; otros movimientos y por diligenciar', () => {
    expect(f.pendientes.map((p) => p.motivo)).toEqual(['descontable_por_evaluar']);
    expect(f.otrosMovimientos.map((o) => o.destino)).toEqual(['no_afecta', 'pendiente']);
    expect(f.porDiligenciar.map((p) => p.clave)).toEqual(['saldo_favor_anterior', 'retenciones_iva_sufridas', 'ajustes', 'sanciones']);
    expect(totalPendientes(f)).toEqual({ grupos: 2, origenes: 2, iva: 59400 });
  });

  it('conciliación y alertas', () => {
    expect(f.conciliacion).toEqual({ libro2408: -353615, casillas: -267015, pendientes: -55600, otros: -31000, redondeoLineas: 0, diferencia: 0 });
    expect(f.conciliacion.casillas + f.conciliacion.pendientes + f.conciliacion.otros + f.conciliacion.redondeoLineas).toBe(f.conciliacion.libro2408);
    expect(f.alertas.grabadosDespuesDeDeclarar[0].periodo).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
  });

  it('tolera una respuesta vacía', () => {
    const v = leerFormulario300(null);
    expect(v.casillas).toEqual([]);
    expect(v.estado).toBe('no_conciliado');
  });
});

describe('catálogo de casillas (tabla del Contador)', () => {
  it('pares base → IVA', () => {
    const pares = Object.fromEntries(PARES_300.map((p) => [p.base, p.iva]));
    expect(pares).toEqual({ 27: 58, 28: 59, 50: 71, 51: 72, 52: 74, 53: 75, 42: 79, 56: 66 });
    expect([...CASILLAS_300].sort((a, b) => a - b)).toEqual([27, 28, 42, 50, 51, 52, 53, 56, 58, 59, 66, 71, 72, 74, 75, 79]);
  });
});

describe('redondearMiles', () => {
  it('como el formulario: a miles, la mitad hacia arriba', () => {
    expect(redondearMiles(15015)).toBe(15000);
    expect(redondearMiles(15500)).toBe(16000);
    expect(redondearMiles(-267015)).toBe(-267000);
    expect(redondearMiles(499)).toBe(0);
  });
});

describe('validarClasificacion', () => {
  it('gravada exige tarifa > 0; las demás quedan en 0', () => {
    expect(validarClasificacion({ tratamiento: 'gravada', tarifa: 0 }, { compra: false })).toEqual({ ok: false, error: 'tarifa_invalida' });
    expect(validarClasificacion({ tratamiento: 'exenta', tarifa: 19 }, { compra: false })).toEqual({ ok: false, error: 'tarifa_invalida' });
    const r = validarClasificacion({ tratamiento: 'excluida', tipo_operacion: 'bienes' }, { compra: false });
    expect(r).toEqual({ ok: true, datos: { tratamiento: 'excluida', tarifa: 0, tipo_operacion: 'bienes', fundamento: null } });
  });

  it('rechaza tratamiento y tipo desconocidos', () => {
    expect(validarClasificacion({ tratamiento: 'cero' }, { compra: false })).toEqual({ ok: false, error: 'tratamiento_invalido' });
    expect(validarClasificacion({ tratamiento: 'gravada', tarifa: 19, tipo_operacion: 'magia' }, { compra: false })).toEqual({ ok: false, error: 'tipo_operacion_invalido' });
  });

  it('procedencia del descontable: solo compras, con motivo, proporcional con porcentaje', () => {
    const base = { tratamiento: 'gravada', tarifa: 19, tipo_operacion: 'bienes' };
    expect(validarClasificacion({ ...base, descontable: 'descontable', descontable_motivo: 'x' }, { compra: false })).toEqual({ ok: false, error: 'descontable_solo_compras' });
    expect(validarClasificacion({ ...base, descontable: 'no_descontable' }, { compra: true })).toEqual({ ok: false, error: 'motivo_requerido' });
    expect(validarClasificacion({ ...base, descontable: 'proporcional', descontable_motivo: 'art. 490' }, { compra: true })).toEqual({ ok: false, error: 'porcentaje_invalido' });
    const ok = validarClasificacion({ ...base, descontable: 'proporcional', descontable_porcentaje: '60', descontable_motivo: 'art. 490', descontable_periodo: '2026-11-15' }, { compra: true });
    expect(ok.ok && ok.datos).toMatchObject({ descontable: 'proporcional', descontable_porcentaje: 60, descontable_periodo: '2026-11-15' });
    const pe = validarClasificacion({ ...base, descontable: 'por_evaluar', descontable_periodo: '2026-11-15' }, { compra: true });
    expect(pe.ok && pe.datos.descontable_periodo).toBeNull();
  });
});

describe('validarNaturaleza y validarDeclaracion', () => {
  it('devolución de compra exige factura (uuid) y base; ajuste exige soporte; null quita', () => {
    expect(validarNaturaleza({ asiento: 5, naturaleza: 'devolucion_compra', base: 100 })).toEqual({ ok: false, error: 'devolucion_sin_factura' });
    expect(validarNaturaleza({ asiento: 5, naturaleza: 'ajuste_procedente' })).toEqual({ ok: false, error: 'soporte_requerido' });
    expect(validarNaturaleza({ asiento: 0, naturaleza: 'pago_dian' })).toEqual({ ok: false, error: 'asiento_invalido' });
    expect(validarNaturaleza({ asiento: 5, naturaleza: null })).toEqual({ ok: true, asiento: 5, datos: null });
    const r = validarNaturaleza({ asiento: 5, naturaleza: 'devolucion_compra', invoice_purchase_id: '11111111-1111-4111-8111-111111111111', base: '100000', soporte: ' NC-1 ' });
    expect(r).toEqual({ ok: true, asiento: 5, datos: { naturaleza: 'devolucion_compra', invoice_purchase_id: '11111111-1111-4111-8111-111111111111', base: 100000, soporte: 'NC-1', nota: null } });
  });

  it('la fecha de presentación no puede ser anterior al fin del período', () => {
    expect(validarDeclaracion({ desde: '2026-10-01', hasta: '2026-10-31', presentada_en: '2026-10-30' })).toEqual({ ok: false, error: 'fecha_presentacion_invalida' });
    expect(validarDeclaracion({ desde: '2026-10-31', hasta: '2026-10-01', presentada_en: '2026-11-05' })).toEqual({ ok: false, error: 'periodo_invalido' });
    expect(validarDeclaracion({ desde: '2026-10-01', hasta: '2026-10-31', presentada_en: '2026-11-05', numero_formulario: 'F-1' })).toEqual({
      ok: true, desde: '2026-10-01', hasta: '2026-10-31', datos: { numero_formulario: 'F-1', presentada_en: '2026-11-05', nota: null },
    });
  });
});

describe('líneas fiscales', () => {
  const lineas = leerLineasFiscales({
    lineas: [
      { tabla: 'invoice_items', id: 'a', descripcion: 'Bien 19', cantidad: 1, base: 100, iva: 19, compra: true,
        clasificacion: { tratamiento: null, tarifa: null, tipo_operacion: 'bienes', origen: null },
        descontable: { estado: 'por_evaluar' }, sugerencia: { tratamiento: 'gravada', tarifa: 19, tipo_operacion: 'bienes' } },
      { tabla: 'otra', id: 'b' },
    ],
  });

  it('lee y descarta tablas desconocidas', () => {
    expect(lineas).toHaveLength(1);
    expect(lineas[0].descontable?.estado).toBe('por_evaluar');
  });

  it('sin clasificación guardada, el diálogo parte de la sugerencia (no la guarda)', () => {
    expect(clasificacionInicial(lineas[0])).toMatchObject({ tratamiento: 'gravada', tarifa: 19, tipoOperacion: 'bienes', origen: null });
    expect(lineas[0].clasificacion.tratamiento).toBeNull();
  });
});

describe('enlaces y CSV', () => {
  it('ruta del documento de origen y tipo de documento de sus líneas', () => {
    expect(rutaOrigen({ clase: 'nota_credito', documentoId: 'x' })).toBe('/app/finanzas/facturas-venta/x');
    expect(rutaOrigen({ clase: 'venta_pos', documentoId: 'y' })).toBe('/app/pos/ventas/y');
    expect(rutaOrigen({ clase: 'asiento', documentoId: '9' })).toBeNull();
    expect(tipoDocumentoLineas('documento_soporte')).toBe('documento_soporte');
    expect(tipoDocumentoLineas('asiento')).toBeNull();
  });

  it('CSV con casilla, valor exacto, valor a miles y diferencia', () => {
    const f = leerFormulario300(RESPUESTA);
    const filas = filasCsvFormulario300(f, {
      encabezado: ['c', 'k', 'v', 'f', 'd', 'n'],
      concepto: (c) => c.concepto,
      pendiente: (p) => p.motivo,
      otro: (o) => o.naturaleza,
    });
    expect(filas[1]).toEqual([52, 'compras_servicios_5', 300300, 300000, -300, 1]);
    expect(filas.some((r) => r[1] === 'descontable_por_evaluar')).toBe(true);
    expect(filas).toHaveLength(1 + 2 + 1 + 2);
  });
});
