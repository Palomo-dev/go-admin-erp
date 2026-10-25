import { generarBorradoresTributarios, leerParametrosTributarios, type EntradaTributarios, type MovimientoTributario, type NominaTributaria } from '../tributarios';

const movimiento = (cuenta: string, debit: number, credit: number, extra: Partial<MovimientoTributario> = {}): MovimientoTributario => ({ entry_id: `${cuenta}-${debit}-${credit}`, entry_date: '2026-02-15', account_code: cuenta, debit, credit, posted: true, ...extra });
const entrada = (extra: Partial<EntradaTributarios> = {}): EntradaTributarios => ({ organizationId: 1, monedaBase: 'COP', desde: '2026-01-01', hasta: '2026-12-31', movimientos: [], lineasIva: [], retenciones: [], nomina: [], parametros: { anios: { '2026': { periodicidad_iva: 'bimestral', responsable_iva: true } } }, ...extra });
const nomina = (extra: Partial<NominaTributaria> = {}): NominaTributaria => ({ id: 'n1', fecha: '2026-02-15', empleadoId: 'e1', identificacion: '101', nombre: 'Empleado de prueba', empleado: true, contabilizada: true, devengado: 2000000, saludEmpleado: 80000, pensionEmpleado: 80000, solidaridad: 0, retencion: 10000, saludEmpleador: 170000, pensionEmpleador: 240000, arl: 10440, parafiscales: 80000, ...extra });

describe('Borradores tributarios con fuentes contabilizadas', () => {
  it.each(['USD', null])('no presenta importes base %p como pesos tributarios ni inventa cambio histórico', (monedaBase) => {
    const documentos = generarBorradoresTributarios(entrada({ monedaBase, movimientos: [movimiento('240805', 0, 190)] }));
    expect(Object.values(documentos)).toHaveLength(10);
    for (const doc of Object.values(documentos)) {
      expect(doc.tablas).toEqual([]);
      expect(doc.avisos?.join(' ')).toMatch(/moneda.*(tributaria|verificada)/i);
    }
  });
  it('usa tarifas de línea y resta IVA y base de las devoluciones, no ingresos 41', () => {
    const docs = generarBorradoresTributarios(entrada({ movimientos: [movimiento('4135', 0, 9000000), movimiento('240805', 0, 152)], lineasIva: [
      { factura: 'f1', fecha: '2026-02-15', tipo: 'venta', devolucion: false, tercero: '900', base: 1000, iva: 190, tarifa: 19, tratamiento: 'gravado', contabilizada: true },
      { factura: 'nc1', fecha: '2026-02-16', tipo: 'venta', devolucion: true, tercero: '900', base: 200, iva: 38, tarifa: 19, tratamiento: 'gravado', contabilizada: true },
    ] }));
    expect(docs['formulario-300'].tablas[0].filas[0]).toMatchObject({ base: 800, iva: 152, devoluciones: 38, tarifa: 19 });
    expect(docs['formulario-300'].tablas[1].filas.find((f) => f.concepto === 'Diferencia generado vs 240805')?.valor).toBe(0);
  });

  it('no presume exento cuando el snapshot no diferencia una tarifa cero', () => {
    const doc = generarBorradoresTributarios(entrada({ lineasIva: [{ factura: 'f1', fecha: '2026-02-15', tipo: 'venta', devolucion: false, tercero: '900', base: 1000, iva: 0, tarifa: 0, tratamiento: 'sin_clasificar', contabilizada: true }] }))['formulario-300'];
    expect(doc.avisos?.join(' ')).toContain('sin distinción histórica');
    expect(doc.tablas[0].filas[0].tratamiento).toBe('sin_clasificar');
  });

  it('excluye borradores, anulados y líneas sin contabilizar', () => {
    const doc = generarBorradoresTributarios(entrada({ movimientos: [movimiento('240805', 0, 100, { posted: false }), movimiento('240805', 0, 300, { voided: true })], lineasIva: [{ factura: 'f1', fecha: '2026-02-15', tipo: 'venta', devolucion: false, tercero: '900', base: 1000, iva: 190, tarifa: 19, tratamiento: 'gravado', contabilizada: false }] }))['formulario-300'];
    expect(doc.tablas[0].filas).toHaveLength(0);
    expect(doc.tablas[1].filas.find((f) => f.concepto === 'Movimiento neto 240805')?.valor).toBe(0);
  });

  it('350 conserva autorretención separada y excluye reteICA', () => {
    const docs = generarBorradoresTributarios(entrada({ retenciones: ['236505', '236575', '2367', '2368'].map((cuenta) => ({ documento: cuenta, fecha: '2026-02-15', tercero: '900', cuenta, concepto: 'Compra', base: 1000, tarifa: 2.5, valor: 25, contabilizada: true, autorretencion: cuenta === '236575' })) }));
    expect(docs['formulario-350'].tablas[0].filas.map((f) => f.cuenta)).toEqual(['236505', '236575', '2367']);
    expect(docs['formulario-350'].tablas[0].filas[1].concepto).toBe('Autorretención · Compra');
    expect(docs.reteica.tablas[0].filas[0].cuenta).toBe('2368');
  });

  it('no usa todo 1355 como reteIVA o reteICA recibido', () => {
    const docs = generarBorradoresTributarios(entrada({ movimientos: [movimiento('135515', 500, 0)] }));
    expect(docs['formulario-300'].tablas[1].filas.find((f) => String(f.concepto).startsWith('ReteIVA'))?.valor).toBeNull();
  });

  it('liquida ICA por actividad configurada y advierte ingresos sin municipio', () => {
    const docs = generarBorradoresTributarios(entrada({ movimientos: [movimiento('413501', 0, 100000), movimiento('417501', 5000, 0), movimiento('4140', 0, 9000)], parametros: { anios: { '2026': { municipios_ica: [{ codigo: '05001', nombre: 'Municipio de prueba', actividades: [{ codigo: '4711', tarifa_por_mil: 7, cuentas: ['413501', '417501'] }] }] } } } }));
    expect(docs['ica-municipal'].tablas[0].filas[0]).toMatchObject({ base: 95000, impuesto: 665 });
    expect(docs['ica-municipal'].avisos?.join(' ')).toContain('no tienen actividad/municipio');
  });

  it('exógena usa topes del año por tercero sin eliminar silenciosamente filas', () => {
    const docs = generarBorradoresTributarios(entrada({ movimientos: [movimiento('5135', 600, 0, { tercero_nit: '900', concepto_exogena: '5016' }), movimiento('5195', 500, 0, { tercero_nit: '900', concepto_exogena: '5016' })], parametros: { anios: { '2026': { topes_exogena: { '1001': 1000 } } } } }));
    expect(docs.exogena.tablas[0].filas).toHaveLength(2);
    expect(docs.exogena.tablas[0].filas.every((f) => f.supera === 'Sí')).toBe(true);
    expect(docs.exogena.avisos?.join(' ')).toContain('configure el tope del año');
  });

  it('1008 y1009 muestran saldo al corte incluyendo saldo anterior al rango', () => {
    const docs = generarBorradoresTributarios(entrada({ movimientos: [movimiento('130505', 1000, 0, { entry_date: '2025-08-01', tercero_nit: '900' }), movimiento('130505', 0, 100, { tercero_nit: '900' }), movimiento('220505', 0, 800, { tercero_nit: '901' })] }));
    expect(docs.exogena.tablas.find((t) => t.titulo === 'Formato 1008')?.filas[0].valor).toBe(900);
    expect(docs.exogena.tablas.find((t) => t.titulo === 'Formato 1009')?.filas[0].valor).toBe(800);
  });

  it('220 incluye empleados y excluye proveedores, contratistas y nómina no contabilizada', () => {
    const docs = generarBorradoresTributarios(entrada({ nomina: [nomina(), nomina({ id: 'n2', empleadoId: 'contratista', empleado: false }), nomina({ id: 'n3', contabilizada: false })] }));
    expect(docs['certificado-220'].tablas[0].filas).toHaveLength(1);
    expect(docs['certificado-220'].tablas[0].filas[0]).toMatchObject({ devengado: 2000000, retencion: 10000 });
    expect(docs.pila.avisos?.join(' ')).toContain('no está listo');
  });

  it('conciliación fiscal no copia el saldo contable cuando falta saldo fiscal revisado', () => {
    const docs = generarBorradoresTributarios(entrada({ movimientos: [movimiento('1105', 1000, 0)] }));
    expect(docs['conciliacion-fiscal'].tablas[0].filas[0]).toMatchObject({ contable: 1000, fiscal: null, diferencia: null });
    expect(docs['registro-accionistas'].tablas[0].filas).toHaveLength(0);
  });

  it('marca todos como borrador y propaga fuentes incompletas', () => {
    const docs = generarBorradoresTributarios(entrada({ pendientesFuente: ['Falta snapshot histórico'] }));
    expect(Object.keys(docs)).toHaveLength(10);
    expect(docs).not.toHaveProperty('retenciones-proveedores');
    for (const doc of Object.values(docs)) {
      expect(doc.textos?.[0]).toContain('Borrador precalculado');
      expect(doc.avisos).toContain('Falta snapshot histórico');
    }
  });

  it('rechaza parámetros inválidos y no usa topes fijos para reemplazarlos', () => {
    const r = leerParametrosTributarios({ anios: { '2026': { topes_exogena: { '1001': -100 } } } });
    expect(r.parametros).toEqual({});
    expect(r.avisos).toHaveLength(1);
  });
});
