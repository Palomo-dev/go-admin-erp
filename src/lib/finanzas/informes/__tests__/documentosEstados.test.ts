import { documentosEstados } from '../documentosEstados';
import type { EntradaEstados } from '../estados';

const entrada: EntradaEstados = {
  desde: '2025-01-01', hasta: '2025-12-31', grupoNiif: 2,
  cuentas: [{ account_code: '1105', name: 'Caja' }, { account_code: '3105', name: 'Capital' }, { account_code: '4135', name: 'Comercio' }],
  movimientos: [
    { entry_id: 1, entry_date: '2024-01-01', account_code: '1105', debit: 1000, credit: 0, posted: true },
    { entry_id: 1, entry_date: '2024-01-01', account_code: '3105', debit: 0, credit: 1000, posted: true },
    { entry_id: 2, entry_date: '2025-02-01', account_code: '1105', debit: 250, credit: 0, posted: true },
    { entry_id: 2, entry_date: '2025-02-01', account_code: '4135', debit: 0, credit: 250, posted: true },
  ],
};
const opciones = { nivel: 4 as const, patrimonioOpcional: false, certificacion: {
  entidad: 'Entidad de prueba', nit: '900000000', representante: { nombre: 'Representante', cedula: '100' },
  contador: { nombre: 'Contador', cedula: '200', tarjetaProfesional: '123-T' },
} };

describe('Paquete financiero ensamblado', () => {
  test('incluye seis documentos requeridos grupo2 y usa mismos valores para estados y notas', () => {
    const { documentos, estados } = documentosEstados(entrada, opciones);
    expect(Object.keys(documentos)).toEqual(expect.arrayContaining(['situacion-financiera', 'resultados-integral', 'cambios-patrimonio', 'flujo-indirecto', 'notas-estados', 'certificacion']));
    expect(documentos['resultados-integral'].tablas[0].filas.find((fila) => fila.codigo === 'utilidad_neta')?.actual).toBe(250);
    const nota = documentos['notas-estados'].tablas.find((tabla) => tabla.titulo === 'Utilidad del paquete')!;
    expect(nota.filas[0].actual).toBe(estados.actual.utilidadNeta);
    expect(documentos['situacion-financiera'].tablas[1].filas.find((fila) => fila.codigo === '1105')).toMatchObject({ actual: 1250, anterior: 1000, variacion: 250, variacionPorcentaje: 25 });
    expect(documentos.certificacion.textos?.join(' ')).toContain('TP: 123-T');
    expect(documentos['cambios-patrimonio'].tablas[0].columnas.filter((columna) => columna.clave === 'total')).toHaveLength(1);
  });

  test('grupo3 limita paquete sin ORI y permite patrimonio opcional', () => {
    const { documentos } = documentosEstados({ ...entrada, grupoNiif: 3 }, opciones);
    expect(Object.keys(documentos)).toHaveLength(4);
    expect(documentos['resultados-integral'].titulo).toBe('Estado de resultados');
    expect(documentos['resultados-integral'].tablas[0].filas.some((fila) => fila.codigo === 'ori')).toBe(false);
    expect(documentos['notas-estados'].textos?.join(' ')).toContain('anexo 3');
    expect(documentosEstados({ ...entrada, grupoNiif: 3 }, { ...opciones, patrimonioOpcional: true }).documentos['cambios-patrimonio']).toBeDefined();
  });

  test('conserva notas editadas y datos faltantes visibles para exportación', () => {
    const { documentos } = documentosEstados(entrada, { ...opciones, notas: { politicas: 'Política propia', entidad: '' }, certificacion: { ...opciones.certificacion, contador: { nombre: 'Contador', cedula: '200' } } });
    expect(documentos['notas-estados'].textos).toContain('Política propia');
    expect(documentos['notas-estados'].textos?.[0]).toBe('');
    expect(documentos.certificacion.avisos).toContain('Borrador: falta tarjeta profesional del contador.');
  });
});
