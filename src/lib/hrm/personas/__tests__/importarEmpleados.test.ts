import { COLUMNAS_IMPORTAR, leerCsv, partirLinea, prepararFilas } from '../importar';

const cat = {
  sedes: [{ id: 110, name: 'Sede Centro' }],
  areas: [{ id: 'a1', name: 'Cocina' }],
  cargos: [{ id: 'c1', name: 'Cocinero/a' }],
};

describe('importar empleados', () => {
  it('la plantilla no tiene banco ni seguridad social', () => {
    expect(COLUMNAS_IMPORTAR.join(',')).not.toMatch(/bank|banco|eps|afp|arl|cesant/);
  });

  it('respeta comillas y el separador «;»', () => {
    expect(partirLinea('"Calle 45, apto 3";x', ';')).toEqual(['Calle 45, apto 3', 'x']);
    const filas = leerCsv('tipo_documento;numero_documento;nombres\nCC;1.036.654.321;Andrés');
    expect(filas[0].numero_documento).toBe('1.036.654.321');
  });

  it('arma el cuerpo del alta y valida sede, área y cargo por nombre', () => {
    const [ok, mal] = prepararFilas(
      [
        { tipo_documento: 'cc', numero_documento: '1.036.654.321', nombres: 'Andrés Felipe', apellidos: 'Morales Rincón', sede: 'sede centro', area: 'Cocina', cargo: 'Cocinero/a', fecha_ingreso: '2026-12-01', salario_mensual: '2.250.000' },
        { tipo_documento: 'XX', numero_documento: '1', nombres: '', apellidos: '', sede: 'Otra', fecha_ingreso: '01/12/2026' },
      ],
      cat,
      false
    );
    expect(ok.errores).toEqual([]);
    expect(ok.cuerpo).toMatchObject({ doc_type: 'CC', doc_number: '1036654321', first_name: 'Andrés', second_name: 'Felipe', branch_id: 110, department_id: 'a1', position_id: 'c1' });
    expect(ok.cuerpo?.salario).toBeUndefined(); // sin permiso de salario no viaja
    expect(mal.errores).toEqual(expect.arrayContaining(['tipoDocumento', 'numeroDocumento', 'nombre', 'fechaIngreso', 'sede']));
    expect(mal.cuerpo).toBeNull();
  });

  it('con permiso de salario, el salario sí viaja', () => {
    const [f] = prepararFilas(
      [{ tipo_documento: 'CC', numero_documento: '123456', nombres: 'Ana', apellidos: 'Ruiz', sede: '110', fecha_ingreso: '2026-12-01', salario_mensual: '2250000' }],
      cat,
      true
    );
    expect(f.cuerpo?.salario).toBe(2250000);
  });
});
