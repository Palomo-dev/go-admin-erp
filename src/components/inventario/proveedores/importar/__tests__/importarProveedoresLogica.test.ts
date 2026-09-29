import {
  aRevision,
  autoMapear,
  faltantes,
  filaCabeceraProveedores,
  filasDesdeMatriz,
  filtrarRevision,
  reasignar,
  tipoCuenta,
  tipoProveedor,
} from '../importarProveedoresLogica';

describe('paso «Columnas»', () => {
  it('asigna cada cabecera a su campo por alias y no repite un campo', () => {
    expect(autoMapear(['Nombre', 'NIT', 'Teléfono', 'Correo', 'Días crédito', 'Otra cosa', 'Documento'])).toEqual([
      'name',
      'nit',
      'phone',
      'email',
      'credit_days',
      null,
      null,
    ]);
  });
  it('reasignar un campo lo quita de la columna que lo tenía', () => {
    expect(reasignar(['name', 'nit', null], 2, 'nit')).toEqual(['name', null, 'nit']);
    expect(reasignar(['name', 'nit'], 1, null)).toEqual(['name', null]);
  });
  it('nombre y documento son obligatorios', () => {
    expect(faltantes(['name', null])).toEqual(['nit']);
    expect(faltantes(['nit', 'name'])).toEqual([]);
  });
  it('encuentra la cabecera aunque el archivo traiga un título arriba', () => {
    expect(filaCabeceraProveedores([['Proveedores 2026'], [], ['Nombre', 'NIT', 'Email'], ['A', '1', 'a@b.co']])).toBe(2);
    expect(filaCabeceraProveedores([['x', 'y'], ['1', '2']])).toBe(0);
  });
});

describe('valores que la base entiende', () => {
  it('tipo y tipo de cuenta en los cuatro idiomas; lo desconocido viaja para que el servidor lo marque', () => {
    expect(tipoProveedor('Empresa')).toBe('company');
    expect(tipoProveedor('persona natural')).toBe('person');
    expect(tipoProveedor('Cooperativa')).toBe('cooperativa');
    expect(tipoCuenta('Ahorros')).toBe('savings');
    expect(tipoCuenta('Cuenta corriente')).toBe('checking');
    expect(tipoCuenta('')).toBeUndefined();
  });
  it('arma las filas con su número real, plazo entero y activo booleano', () => {
    const filas = filasDesdeMatriz(
      [
        ['Nombre', 'Tipo', 'NIT', 'Días crédito', 'Activo', 'Email'],
        ['Distribuidora de ejemplo S.A.S.', 'Empresa', '900.123.456-7', '30', 'Sí', 'compras@ejemplo.com'],
        [null, null, null, null, null, null],
        ['Carlos Ejemplo', 'Persona', '80123456', 'treinta', 'no', ''],
      ],
      0,
      ['name', 'supplier_type', 'nit', 'credit_days', 'is_active', 'email'],
    );
    expect(filas).toEqual([
      { fila: 2, name: 'Distribuidora de ejemplo S.A.S.', supplier_type: 'company', nit: '900.123.456-7', credit_days: '30', is_active: true, email: 'compras@ejemplo.com' },
      { fila: 4, name: 'Carlos Ejemplo', supplier_type: 'person', nit: '80123456', credit_days: 'treinta', is_active: false },
    ]);
  });
});

describe('paso «Revisar»', () => {
  it('lee la revisión del servidor', () => {
    const r = aRevision({
      total: 3,
      crear: 1,
      actualizar: 1,
      con_error: 1,
      filas: [
        { fila: 2, accion: 'crear', motivo: null },
        { fila: 3, accion: 'actualizar', existente_id: 9 },
        { fila: 4, accion: 'error', motivo: 'documento_repetido', fila_repetida: 2 },
      ],
    });
    expect(r).toMatchObject({ total: 3, crear: 1, actualizar: 1, con_error: 1, creados: 0 });
    expect(r.filas[1]).toMatchObject({ accion: 'actualizar', existente_id: 9 });
    expect(r.filas[2]).toMatchObject({ accion: 'error', motivo: 'documento_repetido', fila_repetida: 2 });
  });
  it('filtra por «Mostrar» y busca por nombre o documento sin tildes', () => {
    const filas = [
      { accion: 'crear' as const, nombre: 'Químicos Alfa', documento: '901777333' },
      { accion: 'actualizar' as const, nombre: 'Empaques', documento: '900987654' },
      { accion: 'error' as const, nombre: 'Insumos Norte', documento: '' },
    ];
    expect(filtrarRevision(filas, '', 'error').map((f) => f.nombre)).toEqual(['Insumos Norte']);
    expect(filtrarRevision(filas, 'quimicos', 'todas').map((f) => f.nombre)).toEqual(['Químicos Alfa']);
    expect(filtrarRevision(filas, '900987', 'todas').map((f) => f.nombre)).toEqual(['Empaques']);
  });
});
