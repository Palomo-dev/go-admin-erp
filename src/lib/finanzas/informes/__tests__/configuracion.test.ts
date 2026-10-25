import { configuracionPredeterminada, guardarConfiguracionSchema } from '../configuracion';

function cambios() { return { ...configuracionPredeterminada('Entidad de prueba', '000000000'), cuentas: [] }; }

describe('Configuración de informes por organización', () => {
  test('predetermina grupo 2 sin reemplazar textos vaciados por el usuario', () => {
    const base = cambios();
    expect(base.grupo_niif).toBe(2);
    expect(base.version).toBe(0);
    expect(base.presenta_cambios_patrimonio).toBe(true);
    base.notas.entidad = '';
    expect(guardarConfiguracionSchema.parse(base).notas.entidad).toBe('');
  });
  test('solo la 38 puede ser ORI y los equivalentes requieren inversión <= 3 meses', () => {
    const cuenta = { account_code: '380505', name: 'Cuenta', clasificacion_corriente: null, costo_comportamiento: null, es_ori: true, equivalente_efectivo: false, plazo_meses: null };
    expect(guardarConfiguracionSchema.safeParse({ ...cambios(), cuentas: [cuenta] }).success).toBe(true);
    expect(guardarConfiguracionSchema.safeParse({ ...cambios(), cuentas: [{ ...cuenta, account_code: '150505' }] }).success).toBe(false);
    expect(guardarConfiguracionSchema.safeParse({ ...cambios(), cuentas: [{ ...cuenta, account_code: '120505', es_ori: false, equivalente_efectivo: true, plazo_meses: null }] }).success).toBe(false);
    expect(guardarConfiguracionSchema.safeParse({ ...cambios(), cuentas: [{ ...cuenta, account_code: '120505', es_ori: false, equivalente_efectivo: true, plazo_meses: 3 }] }).success).toBe(true);
    expect(guardarConfiguracionSchema.safeParse({ ...cambios(), cuentas: [{ ...cuenta, account_code: '120505', es_ori: false, equivalente_efectivo: true, plazo_meses: 4 }] }).success).toBe(false);
  });
  test('admite clasificación explícita compatible con el motor y parámetros por año sin topes fijos', () => {
    const guardada = guardarConfiguracionSchema.parse({ ...cambios(), parametros_fiscales: { anios: { '2026': { topes_exogena: { '1001': 42 }, periodicidad_iva: 'bimestral' } } }, anotaciones_asientos: { '123': { concepto_patrimonio: 'traslado_resultados', cash_flow_activity: 'inversion', provision_sin_caja: false } } });
    expect(guardada.anotaciones_asientos?.['123'].concepto_patrimonio).toBe('traslado_resultados');
    expect(guardarConfiguracionSchema.safeParse({ ...cambios(), anotaciones_asientos: { '123': { concepto_patrimonio: 'traslado_resultado' } } }).success).toBe(false);
  });
  test('rechaza cuentas repetidas, campos de organización y clasificaciones arbitrarias', () => {
    const cuenta = { account_code: '5105', clasificacion_corriente: null, costo_comportamiento: 'fijo', es_ori: false, equivalente_efectivo: false, plazo_meses: null };
    expect(guardarConfiguracionSchema.safeParse({ ...cambios(), cuentas: [cuenta, cuenta] }).success).toBe(false);
    expect(guardarConfiguracionSchema.safeParse({ ...cambios(), organization_id: 999 }).success).toBe(false);
    expect(guardarConfiguracionSchema.safeParse({ ...cambios(), anotaciones_asientos: { '123': { cash_flow_activity: 'inventado' } } }).success).toBe(false);
  });
  test('reutiliza presentación NIIF del PUC y conserva códigos históricos con guion', () => {
    const cuenta = { account_code: '1435-01', clasificacion_corriente: 'segun_plazo', costo_comportamiento: null, es_ori: false, equivalente_efectivo: false, plazo_meses: null };
    const config = guardarConfiguracionSchema.parse({ ...cambios(), cuentas: [cuenta] });
    expect(config.cuentas[0].account_code).toBe('1435-01');
    expect(config.cuentas[0].clasificacion_corriente).toBe('segun_plazo');
    const { clasificacion_corriente: _clasificacion, ...sinEditarClasificacion } = cuenta;
    expect(_clasificacion).toBe('segun_plazo');
    const soloMetadatos = guardarConfiguracionSchema.parse({ ...cambios(), cuentas: [sinEditarClasificacion] });
    expect(soloMetadatos.cuentas[0]).not.toHaveProperty('clasificacion_corriente');
  });
});
