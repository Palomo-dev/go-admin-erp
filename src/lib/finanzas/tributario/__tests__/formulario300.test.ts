import {
  CASILLAS_300,
  FILAS_300,
  casilla,
  clasificacionInicial,
  filasCsvFormulario300,
  leerFormulario300,
  leerLineasFiscales,
  puenteOtrosMovimientos,
  redondearMiles,
  rutaOrigen,
  tipoDocumentoLineas,
  totalPendientes,
  validarClasificacion,
  validarDeclaracion,
  validarNaturaleza,
} from '../formulario300';

const UUID1 = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';

// Extracto de la respuesta de la prueba en seco 10 (ronda 2; org 374, noviembre 2026).
const RESPUESTA = {
  version: 3,
  periodo: { desde: '2026-11-01', hasta: '2026-11-30', zona: 'America/Bogota' },
  estado: 'conciliado',
  aprobado_fiscalmente: false,
  liquidacion_completa: false,
  periodo_declarado: null,
  casillas: [
    { casilla: 30, tipo: 'base', par: null, concepto: 'exportacion_bienes', lado: 'generado', valor: '300000.00', valor_formulario: 300000, diferencia_redondeo: 0, total_origenes: 1, senalada: false, origenes: [] },
    {
      casilla: 59, tipo: 'iva', par: 28, concepto: 'ventas_general', lado: 'generado', valor: 104500, valor_formulario: 105000, diferencia_redondeo: 500, total_origenes: 4, senalada: true,
      origenes: [
        { clase: 'nota_debito', documento_id: UUID1, numero: 'ND-1', fecha: '2026-11-07', fecha_contabilizacion: '2026-11-07', fecha_documento: '2026-11-07', tabla: 'invoice_items', linea_id: UUID2, base: 50000, iva: 9500, asiento: 1015, entre_periodos: false, corrige_otro_periodo: true, causado_periodo_anterior: false, posterior_declaracion: false, factura_origen: { id: UUID2, numero: 'FV-OCT' } },
        { clase: 'desconocida', documento_id: 'x' },
      ],
    },
    { casilla: 99, tipo: 'iva', par: 98, valor: 1 },
  ],
  pendientes: [
    { motivo: 'descontable_por_evaluar', lado: 'descontable', base: 0, iva: 9500, efecto_2408: -9500, total_origenes: 1, origenes: [] },
    { motivo: 'descontable_en_otro_periodo', lado: 'descontable', base: 1, iva: 1 },
  ],
  otros_movimientos: [
    { asiento: 1183, origen: 'bank_transactions', fecha: '2026-11-07', valor: -50000, naturaleza: 'sin_registro', declarada: false, sugerida: 'pago_dian', destino: 'pendiente', motivo: 'sugerido_por_confirmar' },
    { asiento: 1184, origen: 'bank_transactions', fecha: '2026-11-07', valor: -30000, naturaleza: 'pago_dian', declarada: true, sugerida: null, destino: 'no_afecta', motivo: null, soporte: 'Recibo 490', soporte_fecha: '2026-11-07' },
    { asiento: 1179, origen: 'manual', fecha: '2026-11-07', valor: 19000, naturaleza: 'devolucion_compra', declarada: true, destino: 'casilla', iva_recuperable: 19000, base: 100000 },
    { asiento: 1190, origen: 'manual', fecha: '2026-11-07', valor: -19000, naturaleza: 'correccion_error', declarada: true, destino: 'pendiente', motivo: 'correccion_incompleta',
      soporte_tipo: 'comprobante_interno', correccion: { completa: false, resolucion: null, referencia: null, fecha: null, corrige_declaracion_anterior: null } },
  ],
  por_diligenciar: [
    { clave: 'saldo_favor_anterior', valor: null },
    { clave: 'retenciones_iva_sufridas', valor: null },
    { clave: 'ajustes', valor: null, asientos: [] },
    { clave: 'sanciones', valor: null },
  ],
  resumen: { iva_no_descontable_al_costo: 19000, iva_generado: 128500, iva_generado_formulario: 129000, iva_descontable: 370815, iva_descontable_formulario: 371000, diferencia_preliminar: -242315, diferencia_preliminar_formulario: -242000, pendientes: 14, pendientes_iva: 141950 },
  conciliacion: { libro_2408: -411165, casillas: -242315, pendientes: -138850, otros_no_afectan_o_por_diligenciar: -30000, redondeo_lineas_libros: 0, diferencia: 0 },
  alertas: {
    documentos_entre_periodos: 1, notas_debito_otro_periodo: 1, compras_causadas_antes: 0,
    correcciones_declaracion_anterior: [{ asiento: 1190, venta_asiento: 1188, fecha_venta: '2026-10-20', completa: false, corrige_declaracion_anterior: null,
      periodo_declarado: { desde: '2026-10-01', hasta: '2026-10-31', numero_formulario: 'F-1' } }, { venta_asiento: 3 }],
    grabados_despues_de_declarar: [{ asiento: 1009, origen: 'invoice_sales', documento_id: 'abc', fecha: '2026-10-15', periodo_declarado: { desde: '2026-10-01', hasta: '2026-10-31' } }],
  },
};

describe('leerFormulario300 (ronda 2)', () => {
  const f = leerFormulario300(RESPUESTA);

  it('lee casillas oficiales, incluidas las de solo base (B1), y descarta las que no lo son', () => {
    expect(f.casillas.map((c) => c.casilla)).toEqual([30, 59]);
    expect(casilla(f, 30)?.par).toBeNull();
    expect(casilla(f, 59)?.valorFormulario).toBe(105000);
  });

  it('origen con fechas de contabilización y de documento, y la señal de nota débito de otro período (B2)', () => {
    const o = casilla(f, 59)!.origenes;
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ clase: 'nota_debito', corrigeOtroPeriodo: true, fecha: '2026-11-07', fechaDocumento: '2026-11-07', facturaOrigen: { numero: 'FV-OCT' } });
  });

  it('nunca aprobado fiscalmente ni liquidación completa', () => {
    const otro = leerFormulario300({ ...RESPUESTA, aprobado_fiscalmente: true, liquidacion_completa: true });
    expect(otro.aprobadoFiscalmente).toBe(false);
    expect(otro.liquidacionCompleta).toBe(false);
    expect(leerFormulario300({ ...RESPUESTA, estado: 'raro' }).estado).toBe('no_conciliado');
  });

  it('el motivo «se descuenta en otro período» ya no existe (corrección b)', () => {
    expect(f.pendientes.map((p) => p.motivo)).toEqual(['descontable_por_evaluar']);
  });

  it('otros movimientos: la señal es «sugerida», no clasificación; puente componente por componente', () => {
    expect(f.otrosMovimientos[0]).toMatchObject({ naturaleza: 'sin_registro', sugerida: 'pago_dian', destino: 'pendiente', motivo: 'sugerido_por_confirmar' });
    expect(f.otrosMovimientos[1]).toMatchObject({ naturaleza: 'pago_dian', declarada: true, soporte: 'Recibo 490', soporteFecha: '2026-11-07' });
    const puente = puenteOtrosMovimientos(f);
    expect(puente.map((p) => p.valor)).toEqual([-50000, -30000, 19000, -19000]);
    expect(totalPendientes(f)).toEqual({ grupos: 2, origenes: 3, iva: 141950 });
  });

  it('alertas de la ronda 2 y conciliación', () => {
    expect(f.alertas).toMatchObject({ documentosEntrePeriodos: 1, notasDebitoOtroPeriodo: 1, comprasCausadasAntes: 0 });
    expect(f.conciliacion.casillas + f.conciliacion.pendientes + f.conciliacion.otros + f.conciliacion.redondeoLineas).toBe(f.conciliacion.libro2408);
  });

  it('tolera una respuesta vacía', () => {
    const v = leerFormulario300(null);
    expect(v.casillas).toEqual([]);
    expect(v.estado).toBe('no_conciliado');
  });
});

describe('ronda 3', () => {
  const f = leerFormulario300(RESPUESTA);

  it('corrección de error incompleta: la reversa queda pendiente con su estado', () => {
    const o = f.otrosMovimientos.find((x) => x.asiento === 1190)!;
    expect(o).toMatchObject({ destino: 'pendiente', motivo: 'correccion_incompleta', soporteTipo: 'comprobante_interno' });
    expect(o.correccion).toEqual({
      completa: false,
      resolucion: null,
      referencia: null,
      fecha: null,
      corrigeDeclaracionAnterior: null,
      faltantes: [],
      decision: null,
      ventaEnOtroPeriodo: false,
    });
    expect(f.otrosMovimientos.find((x) => x.asiento === 1184)!.correccion).toBeNull();
  });

  it('alerta de corrección sobre un período declarado y el IVA no descontable llevado al costo (B5)', () => {
    expect(f.alertas.correccionesDeclaracionAnterior).toEqual([
      { asiento: 1190, ventaAsiento: 1188, fechaVenta: '2026-10-20', completa: false, corrigeDeclaracionAnterior: null,
        periodoDeclarado: { desde: '2026-10-01', hasta: '2026-10-31', numeroFormulario: 'F-1' } },
    ]);
    expect(f.resumen.ivaNoDescontableAlCosto).toBe(19000);
  });

  it('validarNaturaleza: la corrección de error exige el tipo de soporte y valida la resolución; se puede guardar a medias', () => {
    const base = { asiento: 9, naturaleza: 'correccion_error', soporte: 'Acta 1', soporte_fecha: '2026-11-07' };
    expect(validarNaturaleza(base)).toEqual({ ok: false, error: 'soporte_requerido' });
    expect(validarNaturaleza({ ...base, soporte_tipo: 'comprobante_interno', doc_electronico_resolucion: 'borrada' })).toEqual({ ok: false, error: 'resolucion_invalida' });
    const parcial = validarNaturaleza({ ...base, soporte_tipo: 'comprobante_interno' });
    expect(parcial.ok && parcial.datos).toMatchObject({ doc_electronico_resolucion: null, corrige_declaracion_anterior: null });
    const completa = validarNaturaleza({ ...base, soporte_tipo: 'comprobante_interno', doc_electronico_resolucion: 'anulacion_dian',
      doc_electronico_referencia: ' CUFE-1 ', doc_electronico_fecha: '2026-11-08', corrige_declaracion_anterior: false });
    expect(completa.ok && completa.datos).toMatchObject({ doc_electronico_resolucion: 'anulacion_dian', doc_electronico_referencia: 'CUFE-1',
      doc_electronico_fecha: '2026-11-08', corrige_declaracion_anterior: false });
    // Otras naturalezas no arrastran los campos de la corrección.
    const pago = validarNaturaleza({ asiento: 9, naturaleza: 'pago_dian', soporte: 'R', soporte_fecha: '2026-11-07', doc_electronico_resolucion: 'anulacion_dian' });
    expect(pago.ok && pago.datos?.doc_electronico_resolucion).toBeNull();
  });
});

describe('ronda 4', () => {
  it('expediente de la corrección de error: valores conocidos y textos acotados; rechazo comercial ≠ rechazo de la DIAN', () => {
    const base = { asiento: 9, naturaleza: 'correccion_error', soporte: 'Acta 1', soporte_fecha: '2026-11-07', soporte_tipo: 'comprobante_interno' };
    expect(validarNaturaleza({ ...base, estado_electronico: 'borrada' })).toEqual({ ok: false, error: 'expediente_invalido' });
    expect(validarNaturaleza({ ...base, cobro: 'quizas' })).toEqual({ ok: false, error: 'expediente_invalido' });
    const ok = validarNaturaleza({
      ...base,
      expediente_explicacion: ' Venta digitada dos veces por la misma caja ',
      factura_referencia: 'POS-1',
      estado_electronico: 'nunca_transmitida',
      contingencia_verificada: true,
      contingencia_nota: 'Sin facturas de contingencia ese día',
      entrega_prestacion: 'no_hubo',
      entrega_soporte: 'Kárdex sin salida',
      cobro: 'no_hubo',
      cobro_soporte: 'Arqueo de caja',
    });
    expect(ok.ok && ok.datos).toMatchObject({
      expediente_explicacion: 'Venta digitada dos veces por la misma caja',
      estado_electronico: 'nunca_transmitida',
      contingencia_verificada: true,
      entrega_prestacion: 'no_hubo',
      cobro: 'no_hubo',
    });
  });

  it('lee la decisión, lo que falta del expediente, la tarifa inferida del POS y el cierre como señal', () => {
    const f = leerFormulario300({
      ...RESPUESTA,
      otros_movimientos: [
        { asiento: 77, origen: 'cierre_ejercicio', valor: -5000, naturaleza: 'sin_registro', sugerida: 'cierre', destino: 'pendiente', motivo: 'sugerido_por_confirmar' },
        { asiento: 78, valor: -19000, naturaleza: 'correccion_error', declarada: true, destino: 'pendiente', motivo: 'correccion_sin_decision',
          correccion: { completa: true, faltantes: [], decision: null, venta_en_otro_periodo: true } },
        { asiento: 79, valor: -19000, naturaleza: 'correccion_error', declarada: true, destino: 'no_afecta',
          correccion: { completa: true, faltantes: [], decision: { tratamiento: 'retirar_venta', periodo_desde: '2026-11-01', periodo_hasta: '2026-12-31' } } },
      ],
      alertas: { ...((RESPUESTA as Record<string, unknown>).alertas as object), tarifas_inferidas: { lineas: 2, base: 200000, iva: 38000 } },
      pendientes: [{ motivo: 'importacion_sin_soporte_aduanero', lado: 'descontable', base: 50000, iva: 0, total_origenes: 1, origenes: [] }],
    });
    expect(f.otrosMovimientos.find((o) => o.asiento === 77)).toMatchObject({ sugerida: 'cierre', destino: 'pendiente' });
    expect(f.otrosMovimientos.find((o) => o.asiento === 78)).toMatchObject({ motivo: 'correccion_sin_decision', correccion: { completa: true, decision: null, ventaEnOtroPeriodo: true } });
    expect(f.otrosMovimientos.find((o) => o.asiento === 79)!.correccion!.decision).toEqual({ tratamiento: 'retirar_venta', periodoDesde: '2026-11-01', periodoHasta: '2026-12-31' });
    expect(f.alertas.tarifasInferidas).toEqual({ lineas: 2, base: 200000, iva: 38000 });
    expect(f.pendientes.map((p) => p.motivo)).toEqual(['importacion_sin_soporte_aduanero']);
  });
});

describe('catálogo de casillas (tablas del Contador, rondas 1 y 2)', () => {
  it('filas base → IVA y casillas sin IVA', () => {
    const filas = Object.fromEntries(FILAS_300.map((p) => [p.base, p.iva]));
    expect(filas).toEqual({ 27: 58, 28: 59, 30: null, 31: null, 35: null, 39: null, 40: null, 56: 66, 47: null, 50: 71, 51: 72, 52: 74, 53: 75, 54: null, 42: 79 });
    expect([...CASILLAS_300].sort((a, b) => a - b)).toEqual([27, 28, 30, 31, 35, 39, 40, 42, 47, 50, 51, 52, 53, 54, 56, 58, 59, 66, 71, 72, 74, 75, 79]);
  });
});

describe('redondearMiles', () => {
  it('como el formulario: a miles, la mitad hacia arriba', () => {
    expect(redondearMiles(15015)).toBe(15000);
    expect(redondearMiles(104500)).toBe(105000);
    expect(redondearMiles(-267015)).toBe(-267000);
    expect(redondearMiles(499)).toBe(0);
  });
});

describe('validarClasificacion (ronda 2)', () => {
  it('gravada exige tarifa > 0; las demás quedan en 0', () => {
    expect(validarClasificacion({ tratamiento: 'gravada', tarifa: 0 }, { compra: false })).toEqual({ ok: false, error: 'tarifa_invalida' });
    expect(validarClasificacion({ tratamiento: 'exenta', tarifa: 19 }, { compra: false })).toEqual({ ok: false, error: 'tarifa_invalida' });
    const r = validarClasificacion({ tratamiento: 'excluida', tipo_operacion: 'bienes', fundamento: 'Art. 424' }, { compra: false });
    expect(r).toEqual({ ok: true, datos: { tratamiento: 'excluida', tarifa: 0, tipo_operacion: 'bienes', fundamento: 'Art. 424', soporte_tipo: null, soporte_numero: null, soporte_fecha: null } });
  });

  it('B1: una exportación es exenta y lleva soporte estructurado', () => {
    expect(validarClasificacion({ tratamiento: 'gravada', tarifa: 19, tipo_operacion: 'exportacion_bienes' }, { compra: false })).toEqual({ ok: false, error: 'exportacion_debe_ser_exenta' });
    expect(validarClasificacion({ tratamiento: 'exenta', tipo_operacion: 'exportacion_bienes', soporte_tipo: 'carta' }, { compra: false })).toEqual({ ok: false, error: 'soporte_invalido' });
    const ok = validarClasificacion(
      { tratamiento: 'exenta', tipo_operacion: 'exportacion_bienes', soporte_tipo: 'declaracion_exportacion', soporte_numero: ' DEX-1 ', soporte_fecha: '2026-11-06' },
      { compra: false },
    );
    expect(ok.ok && ok.datos).toMatchObject({ soporte_tipo: 'declaracion_exportacion', soporte_numero: 'DEX-1', soporte_fecha: '2026-11-06' });
  });

  it('procedencia del descontable: solo compras, con motivo, proporcional con %; ya no hay período', () => {
    const base = { tratamiento: 'gravada', tarifa: 19, tipo_operacion: 'bienes' };
    expect(validarClasificacion({ ...base, descontable: 'descontable', descontable_motivo: 'x' }, { compra: false })).toEqual({ ok: false, error: 'descontable_solo_compras' });
    expect(validarClasificacion({ ...base, descontable: 'no_descontable' }, { compra: true })).toEqual({ ok: false, error: 'motivo_requerido' });
    expect(validarClasificacion({ ...base, descontable: 'proporcional', descontable_motivo: 'art. 490' }, { compra: true })).toEqual({ ok: false, error: 'porcentaje_invalido' });
    const ok = validarClasificacion({ ...base, descontable: 'proporcional', descontable_porcentaje: '60', descontable_motivo: 'art. 490', descontable_periodo: '2026-12-01' }, { compra: true });
    expect(ok.ok && ok.datos).toMatchObject({ descontable: 'proporcional', descontable_porcentaje: 60 });
    expect(ok.ok && 'descontable_periodo' in ok.datos).toBe(false);
  });

  it('corrección (c): documento soporte no queda «descontable» por una marca manual', () => {
    const datos = { tratamiento: 'gravada', tarifa: 19, tipo_operacion: 'servicios', descontable: 'descontable', descontable_motivo: 'x' };
    expect(validarClasificacion(datos, { compra: true, soporteDoc: true })).toEqual({ ok: false, error: 'soporte_no_descontable' });
    expect(validarClasificacion({ ...datos, tipo_operacion: 'otra_especial', fundamento: 'Servicio del exterior (art. 437-2)' }, { compra: true, soporteDoc: true }).ok).toBe(true);
  });
});

describe('validarNaturaleza (ronda 2) y validarDeclaracion', () => {
  it('toda naturaleza exige soporte y fecha; ronda 4: también el cierre, con su explicación', () => {
    expect(validarNaturaleza({ asiento: 5, naturaleza: 'pago_dian' })).toEqual({ ok: false, error: 'soporte_requerido' });
    expect(validarNaturaleza({ asiento: 5, naturaleza: 'pago_dian', soporte: 'Recibo 490', soporte_fecha: '2026-11-07' }).ok).toBe(true);
    expect(validarNaturaleza({ asiento: 5, naturaleza: 'cierre' })).toEqual({ ok: false, error: 'soporte_requerido' });
    expect(validarNaturaleza({ asiento: 5, naturaleza: 'cierre', soporte: 'Comprobante de cierre 12', soporte_fecha: '2026-12-31' })).toEqual({
      ok: false,
      error: 'cierre_requiere_explicacion',
    });
    expect(validarNaturaleza({ asiento: 5, naturaleza: 'cierre', soporte: 'Comprobante de cierre 12', soporte_fecha: '2026-12-31', nota: 'Traslado de saldos, no es ajuste fiscal' }).ok).toBe(true);
    expect(validarNaturaleza({ asiento: 0, naturaleza: 'pago_dian' })).toEqual({ ok: false, error: 'asiento_invalido' });
    expect(validarNaturaleza({ asiento: 5, naturaleza: null })).toEqual({ ok: true, asiento: 5, datos: null });
  });

  it('B4: la devolución de compra exige compra, líneas, base e IVA que sumen y tipo de soporte', () => {
    const base = { asiento: 5, naturaleza: 'devolucion_compra', soporte: 'NC-1', soporte_fecha: '2026-11-06', soporte_tipo: 'nota_credito_proveedor', invoice_purchase_id: UUID1 };
    expect(validarNaturaleza({ ...base, base: 100, iva: 19 })).toEqual({ ok: false, error: 'devolucion_incompleta' });
    expect(validarNaturaleza({ ...base, base: 100, iva: 19, lineas: [{ invoice_item_id: UUID2, base: 90, iva: 19 }] })).toEqual({ ok: false, error: 'devolucion_lineas_no_suman' });
    const ok = validarNaturaleza({ ...base, base: '100000', iva: 19000, lineas: [{ invoice_item_id: UUID2, base: 100000, iva: 19000 }] });
    expect(ok.ok && ok.datos).toMatchObject({ naturaleza: 'devolucion_compra', invoice_purchase_id: UUID1, base: 100000, iva: 19000, lineas: [{ invoice_item_id: UUID2 }] });
  });

  it('la fecha de presentación no puede ser anterior al fin del período', () => {
    expect(validarDeclaracion({ desde: '2026-10-01', hasta: '2026-10-31', presentada_en: '2026-10-30' })).toEqual({ ok: false, error: 'fecha_presentacion_invalida' });
    expect(validarDeclaracion({ desde: '2026-10-31', hasta: '2026-10-01', presentada_en: '2026-11-05' })).toEqual({ ok: false, error: 'periodo_invalido' });
    expect(validarDeclaracion({ desde: '2026-10-01', hasta: '2026-10-31', presentada_en: '2026-11-05', numero_formulario: 'F-1' })).toEqual({
      ok: true,
      desde: '2026-10-01',
      hasta: '2026-10-31',
      datos: { numero_formulario: 'F-1', presentada_en: '2026-11-05', nota: null },
    });
  });
});

describe('líneas fiscales', () => {
  const lineas = leerLineasFiscales({
    lineas: [
      {
        tabla: 'invoice_items', id: 'a', descripcion: 'Servicio de aseo', cantidad: 1, base: 100, iva: 19, compra: true, soporte_doc: true,
        clasificacion: { tratamiento: null, tarifa: null, tipo_operacion: 'servicios', origen: null, soporte_tipo: null },
        descontable: { estado: 'por_evaluar' }, sugerencia: { tratamiento: 'gravada', tarifa: 19, tipo_operacion: 'servicios' },
      },
      { tabla: 'otra', id: 'b' },
    ],
  });

  it('lee el indicador de documento soporte y descarta tablas desconocidas', () => {
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ soporteDoc: true, descontable: { estado: 'por_evaluar' } });
  });

  it('sin clasificación guardada, el diálogo parte de la sugerencia (no la guarda)', () => {
    expect(clasificacionInicial(lineas[0])).toMatchObject({ tratamiento: 'gravada', tarifa: 19, tipoOperacion: 'servicios', origen: null });
    expect(lineas[0].clasificacion.tratamiento).toBeNull();
  });
});

describe('enlaces y CSV', () => {
  it('ruta del documento de origen y tipo de documento de sus líneas', () => {
    expect(rutaOrigen({ clase: 'nota_debito', documentoId: 'x' })).toBe('/app/finanzas/facturas-venta/x');
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
    expect(filas[1]).toEqual([30, 'exportacion_bienes', 300000, 300000, 0, 1]);
    expect(filas[2]).toEqual([59, 'ventas_general', 104500, 105000, 500, 4]);
    expect(filas).toHaveLength(1 + 2 + 1 + 4);
  });
});
