import { generarCertificacion, generarNotasAutomaticas, resolverPlantillaNotas } from '../notasCertificacion';

describe('Notas y certificación contable', () => {
  it('conserva ediciones vacías y aplica bases de cada grupo solo en valores faltantes', () => {
    const grupo3 = resolverPlantillaNotas(3, { entidad: '', politicas: 'Política propia' });
    expect(grupo3.entidad).toBe('');
    expect(grupo3.politicas).toBe('Política propia');
    expect(grupo3.basesPreparacion).toContain('anexo 3');
    expect(grupo3.basesPreparacion).toContain('sin otro resultado integral');
    expect(resolverPlantillaNotas(2).basesPreparacion).toContain('anexo 2');
  });

  it('agrega auxiliares a cuatro o seis dígitos sin duplicar, conservando comparativo', () => {
    const saldos = [
      { account_code: '14350101', name: 'Inventario sede 1', actual: 120, anterior: 100 },
      { account_code: '14350201', name: 'Inventario sede 2', actual: 80, anterior: 0 },
      { account_code: '220501', name: 'Proveedores', actual: 50, anterior: 0 },
      { account_code: '9105', name: 'Orden', actual: 40, anterior: 20 },
    ];
    const notas = generarNotasAutomaticas(saldos, 4);
    expect(notas.map((n) => n.rubro)).toEqual(['14', '22']);
    expect(notas[0].detalle).toEqual([{ codigo: '1435', nombre: 'Cuenta 1435', actual: 200, anterior: 100, variacion: 100, variacionPorcentaje: 100 }]);
    expect(notas[1].detalle[0].variacionPorcentaje).toBeNull();
    expect(generarNotasAutomaticas(saldos, 6)[0].detalle).toHaveLength(2);
  });

  it('rechaza saldos corruptos en lugar de emitir un PDF aparentemente válido', () => {
    expect(() => generarNotasAutomaticas([{ account_code: '1105', name: 'Caja', actual: NaN, anterior: 0 }])).toThrow('no numérico');
    expect(() => generarNotasAutomaticas([
      { account_code: '110501', name: 'Caja 1', actual: Number.MAX_VALUE, anterior: 0 },
      { account_code: '110502', name: 'Caja 2', actual: Number.MAX_VALUE, anterior: 0 },
    ])).toThrow('no numérico');
  });

  it('emite texto art.37 con firmantes y dictamen art.38 únicamente cuando se suministra', () => {
    const config = {
      entidad: 'Entidad de prueba', nit: '900000000',
      representante: { nombre: 'Representante de prueba', cedula: '100' },
      contador: { nombre: 'Contador de prueba', cedula: '200', tarjetaProfesional: '123-T' },
    };
    const certificado = generarCertificacion(config, '2025-01-01', '2025-12-31');
    expect(certificado.faltantes).toEqual([]);
    expect(certificado.textos.join(' ')).toContain('artículo 37 de la Ley 222');
    expect(certificado.firmas[1].tarjetaProfesional).toBe('123-T');
    expect(certificado.dictamen).toBeNull();
    const conDictamen = generarCertificacion({ ...config, revisorFiscal: { nombre: 'Revisor de prueba', cedula: '300', tarjetaProfesional: '456-T' }, dictamen: 'Opinión revisada por su autor.' }, '2025-01-01', '2025-12-31');
    expect(conDictamen.dictamen?.titulo).toContain('artículo 38');
    expect(conDictamen.dictamen?.texto).toBe('Opinión revisada por su autor.');
  });

  it('identifica los datos obligatorios faltantes antes de certificar', () => {
    const certificado = generarCertificacion({ entidad: '', nit: '', representante: { nombre: '', cedula: '' }, contador: { nombre: '', cedula: '' } }, '2025-01-01', '2025-12-31');
    expect(certificado.faltantes).toHaveLength(7);
    expect(certificado.firmas).toHaveLength(2);
  });
});
