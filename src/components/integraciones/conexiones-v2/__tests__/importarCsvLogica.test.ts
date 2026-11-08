import { MAX_FILAS_CSV, parsearCsvConexiones } from '../importarCsvLogica';

describe('parsearCsvConexiones', () => {
  it('lee las columnas en español o inglés, con BOM, CRLF y comillas', () => {
    const r = parsearCsvConexiones('﻿nombre;sucursal_id;pais;ambiente\r\n"Tienda; centro";3;CO;SANDBOX\r\nBodega;;;\r\n');
    expect(r).toEqual({
      filas: [
        { nombre: 'Tienda; centro', sucursalId: 3, pais: 'CO', ambiente: 'sandbox' },
        { nombre: 'Bodega', sucursalId: null, pais: null, ambiente: null },
      ],
    });
    expect(parsearCsvConexiones('name,branch_id,country_code,environment\nA,1,CO,production')).toEqual({
      filas: [{ nombre: 'A', sucursalId: 1, pais: 'CO', ambiente: 'production' }],
    });
  });

  it('errores claros: vacío, sin columna de nombre o demasiadas filas', () => {
    expect(parsearCsvConexiones('nombre\n')).toEqual({ error: 'vacio' });
    expect(parsearCsvConexiones('ambiente\nproduction')).toEqual({ error: 'sin_columna_nombre' });
    const muchas = ['nombre', ...Array.from({ length: MAX_FILAS_CSV + 1 }, (_, i) => `C${i}`)].join('\n');
    expect(parsearCsvConexiones(muchas)).toEqual({ error: 'demasiadas_filas' });
  });

  it('una sucursal no numérica no se inventa', () => {
    expect(parsearCsvConexiones('nombre,sucursal_id\nA,abc')).toEqual({ filas: [{ nombre: 'A', sucursalId: null, pais: null, ambiente: null }] });
  });
});
